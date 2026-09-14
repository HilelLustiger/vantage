import { createHash } from "node:crypto";
import type {
  DocumentReview,
  DocumentResolution,
  DocumentSummary,
  ExtractedLine,
  NewAssetInput,
} from "../dto/index.js";
import { db, type DbExecutor } from "../db/client.js";
import type { DocumentRow } from "../db/schema.js";
import { saveDocumentFile } from "../infra/storage.js";
import {
  commitDocument,
  findDocumentByChecksum,
  findDocumentById,
  findDocumentRowById,
  insertDocument,
  saveDocumentReview,
  updateDocumentStatus,
} from "../repositories/documents.js";
import { createAsset, listAssets } from "../repositories/assets.js";
import { insertHolding } from "../repositories/holdings.js";
import { insertTransaction } from "../repositories/transactions.js";
import { parseDocument, type ParseDocumentResult } from "./parser.js";

function checksumOf(file: Buffer): string {
  return createHash("sha256").update(file).digest("hex");
}

export async function uploadDocument(accountId: string, file: Buffer): Promise<DocumentSummary> {
  const checksum = checksumOf(file);

  // Re-upload of a file already seen on this Account — no file save, no
  // parsing, just a row so it shows up in the Document list.
  const duplicate = await findDocumentByChecksum(accountId, checksum);
  if (duplicate) {
    const inserted = await insertDocument({ accountId, status: "duplicate", checksum });
    return (await findDocumentById(inserted.id))!;
  }

  const document = await insertDocument({ accountId, status: "uploaded", checksum });
  await saveDocumentFile(document.id, file);
  await updateDocumentStatus(document.id, "processing");

  try {
    const existingAssets = await listAssets();
    const result = await parseDocument({ file, existingAssets });
    await applyParseResult(document.id, document.accountId, result);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "parsing failed";
    await updateDocumentStatus(document.id, "failed", reason);
  }

  return (await findDocumentById(document.id))!;
}

async function applyParseResult(
  documentId: string,
  accountId: string,
  result: ParseDocumentResult,
): Promise<void> {
  if (result.outcome === "failed") {
    await updateDocumentStatus(documentId, "failed", result.reason);
    return;
  }

  if (result.outcome === "needs_review") {
    await saveDocumentReview(documentId, {
      asOfDate: result.asOfDate,
      ...reviewToColumns(result.review),
    });
    return;
  }

  await db.transaction(async (tx) => {
    for (const holding of result.holdings) {
      await insertHolding({ documentId, ...holding }, tx);
    }
    for (const transaction of result.transactions) {
      await insertTransaction({ accountId, ...transaction }, tx);
    }
  });
  await commitDocument(documentId, result.asOfDate);
}

function reviewToColumns(review: DocumentReview) {
  if (review.reason === "privacy_preflight_aborted") {
    return { locallyConfirmed: review.locallyConfirmed };
  }
  if (review.reason === "validity_failure") {
    return { parsedLines: review.lines, validityFailedChecks: review.failedChecks };
  }
  return { parsedLines: review.lines };
}

// The stored reason lives entirely in which columns are populated (see
// db/schema.ts's comment on `documents`) — this is the one place that
// reconstructs it back into the discriminated DocumentReview shape.
export async function getDocumentReview(documentId: string): Promise<DocumentReview | undefined> {
  const row = await findDocumentRowById(documentId);
  if (!row || row.status !== "needs_review") return undefined;

  if (row.locallyConfirmed) {
    return { reason: "privacy_preflight_aborted", locallyConfirmed: row.locallyConfirmed };
  }
  if (row.validityFailedChecks) {
    return {
      reason: "validity_failure",
      lines: row.parsedLines ?? [],
      failedChecks: row.validityFailedChecks,
    };
  }
  return { reason: "asset_resolution", lines: row.parsedLines ?? [] };
}

export class DocumentNotAwaitingReviewError extends Error {}

export async function resolveDocument(
  documentId: string,
  resolutions: DocumentResolution[],
): Promise<DocumentSummary> {
  const row = await findDocumentRowById(documentId);
  if (!row || row.status !== "needs_review") {
    throw new DocumentNotAwaitingReviewError("document is not waiting on review");
  }

  try {
    if (row.locallyConfirmed) {
      await resolvePrivacyPath(row, resolutions);
    } else {
      await resolveExtractedLines(row, resolutions);
    }
  } catch (err) {
    // Not retryable from here — the frontend's review page doesn't route
    // back into itself on failure, it shows failureReason and stops.
    const reason = err instanceof Error ? err.message : "resolve failed";
    await updateDocumentStatus(documentId, "failed", reason);
  }

  return (await findDocumentById(documentId))!;
}

async function resolveAssetId(
  input: { assetId?: string; newAsset?: NewAssetInput },
  tx: DbExecutor,
): Promise<string> {
  if (input.assetId) return input.assetId;
  if (input.newAsset) {
    const asset = await createAsset(input.newAsset, tx);
    return asset.id;
  }
  throw new Error("resolution has neither assetId nor newAsset");
}

async function resolvePrivacyPath(
  row: DocumentRow,
  resolutions: DocumentResolution[],
): Promise<void> {
  const manualHoldings = resolutions.filter(
    (r): r is Extract<DocumentResolution, { manualHolding: unknown }> => "manualHolding" in r,
  );
  if (manualHoldings.length === 0) {
    throw new Error("no holdings provided");
  }

  await db.transaction(async (tx) => {
    for (const { manualHolding } of manualHoldings) {
      const assetId = await resolveAssetId(manualHolding, tx);
      await insertHolding(
        {
          documentId: row.id,
          assetId,
          quantity: manualHolding.quantity,
          value: manualHolding.value,
          currency: manualHolding.currency,
        },
        tx,
      );
    }
  });
  await commitDocument(row.id, row.locallyConfirmed!.asOfDate);
}

type IndexedResolution = Exclude<DocumentResolution, { manualHolding: unknown }>;

function findResolutionFor(
  line: ExtractedLine,
  resolutions: DocumentResolution[],
): { assetId?: string; newAsset?: NewAssetInput } {
  const match = resolutions.find(
    (r): r is IndexedResolution => "index" in r && r.index === line.index && r.kind === line.kind,
  );
  if (!match) {
    throw new Error(`no resolution provided for line ${line.index}`);
  }
  return match;
}

async function resolveExtractedLines(
  row: DocumentRow,
  resolutions: DocumentResolution[],
): Promise<void> {
  const lines = row.parsedLines ?? [];
  if (!row.asOfDate) {
    throw new Error("document has no as-of date");
  }
  const asOfDate = row.asOfDate;

  await db.transaction(async (tx) => {
    for (const line of lines) {
      const assetId =
        line.resolvedAssetId ?? (await resolveAssetId(findResolutionFor(line, resolutions), tx));
      if (line.kind === "holding") {
        await insertHolding(
          {
            documentId: row.id,
            assetId,
            quantity: line.quantity,
            value: line.value,
            currency: line.currency,
          },
          tx,
        );
      } else {
        await insertTransaction(
          {
            accountId: row.accountId,
            assetId,
            occurredAt: line.occurredAt,
            quantityDelta: line.quantityDelta ?? "0",
            amount: line.amount,
            currency: line.currency,
            kind: line.transactionKind,
          },
          tx,
        );
      }
    }
  });
  await commitDocument(row.id, asOfDate);
}
