import { createHash } from "node:crypto";
import type {
  DocumentReview,
  DocumentResolution,
  DocumentSummary,
  ExtractedLine,
} from "../dto/index.js";
import { db, type DbExecutor } from "../db/client.js";
import type { PendingReview } from "../db/schema.js";
import { saveDocumentFile } from "../infra/storage.js";
import {
  commitDocument,
  failDocument,
  findDocumentById,
  findDocumentByChecksum,
  findDocumentRowById,
  findPendingReview,
  insertDocument,
  savePendingReview,
  updateDocumentStatus,
} from "../repositories/documents.js";
import { createAsset, listAssets } from "../repositories/assets.js";
import { insertHolding } from "../repositories/holdings.js";
import { insertTransaction } from "../repositories/transactions.js";
import { extractFromBuffer, segmentDocument, type ParseDocumentResult } from "./parser.js";

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
    const result = await segmentDocument(file);
    if (result.outcome === "failed") {
      await updateDocumentStatus(document.id, "failed", result.reason);
    } else {
      await savePendingReview(document.id, result.asOfDate, {
        reason: "content_review",
        lines: result.review.lines,
        pageWidth: result.review.pageWidth,
        pageHeight: result.review.pageHeight,
        identityValues: result.review.identityValues,
      });
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "segmentation failed";
    await updateDocumentStatus(document.id, "failed", reason);
  }

  return (await findDocumentById(document.id))!;
}

// The stored PendingReview already carries `reason` explicitly — no
// inference needed. This just strips identityValues (backend-internal, see
// services/parser.ts's SegmentResult) before handing content_review to web.
export async function getDocumentReview(documentId: string): Promise<DocumentReview | undefined> {
  const row = await findDocumentRowById(documentId);
  if (!row || row.status !== "needs_review") return undefined;

  const pending = await findPendingReview(documentId);
  if (!pending) return undefined;

  if (pending.reason === "content_review") {
    return {
      reason: "content_review",
      lines: pending.lines,
      pageWidth: pending.pageWidth,
      pageHeight: pending.pageHeight,
    };
  }
  // Already required by resolveExtractionReview to commit — set on this
  // row back when the pending review was first saved (see uploadDocument/
  // applyExtractionResult), never null by the time we're here.
  return {
    reason: "extraction_review",
    lines: pending.lines,
    failedChecks: pending.failedChecks,
    asOfDate: row.asOfDate!,
  };
}

export class DocumentNotAwaitingReviewError extends Error {}

export async function resolveDocument(
  documentId: string,
  resolutions: DocumentResolution[],
): Promise<DocumentSummary> {
  const row = await findDocumentRowById(documentId);
  const pending =
    row && row.status === "needs_review" ? await findPendingReview(documentId) : undefined;
  if (!row || row.status !== "needs_review" || !pending) {
    throw new DocumentNotAwaitingReviewError("document is not waiting on review");
  }

  try {
    if (pending.reason === "content_review") {
      await resolveContentReview(documentId, pending, resolutions);
    } else {
      await resolveExtractionReview(row.accountId, documentId, pending, resolutions);
    }
  } catch (err) {
    // Not retryable from here — the frontend's review page doesn't route
    // back into itself on failure, it shows failureReason and stops.
    const reason = err instanceof Error ? err.message : "resolve failed";
    await failDocument(documentId, reason);
  }

  return (await findDocumentById(documentId))!;
}

async function resolveContentReview(
  documentId: string,
  pending: Extract<PendingReview, { reason: "content_review" }>,
  resolutions: DocumentResolution[],
): Promise<void> {
  const approval = resolutions.find(
    (r): r is Extract<DocumentResolution, { approveContentReview: unknown }> =>
      "approveContentReview" in r,
  );
  if (!approval) {
    throw new Error("no content approved for extraction");
  }
  const included = new Set(approval.approveContentReview.includedIndices);

  const buffer = pending.lines
    // Redacted lines can never be included, no matter what the resolution
    // says — the text isn't even available here to include.
    .filter((line) => line.status !== "redacted" && included.has(line.index))
    .map((line) => line.text)
    .join("\n");

  const existingAssets = await listAssets();
  const result = await extractFromBuffer(buffer, pending.identityValues, existingAssets);
  await applyExtractionResult(documentId, result);
}

async function applyExtractionResult(
  documentId: string,
  result: ParseDocumentResult,
): Promise<void> {
  if (result.outcome === "failed") {
    throw new Error(result.reason);
  }
  if (result.outcome === "needs_review") {
    await savePendingReview(documentId, result.asOfDate, {
      reason: "extraction_review",
      lines: result.review.lines,
      failedChecks: result.review.failedChecks,
    });
    return;
  }

  const row = (await findDocumentRowById(documentId))!;
  await db.transaction(async (tx) => {
    for (const holding of result.holdings) {
      await insertHolding({ documentId, ...holding }, tx);
    }
    for (const transaction of result.transactions) {
      await insertTransaction({ accountId: row.accountId, ...transaction }, tx);
    }
  });
  await commitDocument(documentId, result.asOfDate);
}

type IndexedResolution = Exclude<DocumentResolution, { approveContentReview: unknown }>;

async function resolveAssetId(
  input: IndexedResolution | undefined,
  tx: DbExecutor,
): Promise<string> {
  if (input && "assetId" in input) return input.assetId;
  if (input && "newAsset" in input) {
    const asset = await createAsset(input.newAsset, tx);
    return asset.id;
  }
  throw new Error("resolution has neither assetId nor newAsset");
}

// No throw on a miss — a line parser already auto-matched needs no
// resolution at all unless the human is also correcting its figures.
function findResolutionFor(
  line: ExtractedLine,
  resolutions: DocumentResolution[],
): IndexedResolution | undefined {
  return resolutions.find(
    (r): r is IndexedResolution => "index" in r && r.index === line.index && r.kind === line.kind,
  );
}

async function resolveExtractionReview(
  accountId: string,
  documentId: string,
  pending: Extract<PendingReview, { reason: "extraction_review" }>,
  resolutions: DocumentResolution[],
): Promise<void> {
  const asOfDate = (await findDocumentRowById(documentId))!.asOfDate;
  if (!asOfDate) {
    throw new Error("document has no as-of date");
  }

  await db.transaction(async (tx) => {
    for (const line of pending.lines) {
      const resolution = findResolutionFor(line, resolutions);
      const assetId = line.resolvedAssetId ?? (await resolveAssetId(resolution, tx));
      if (line.kind === "holding") {
        const override = resolution && "value" in resolution ? resolution : undefined;
        await insertHolding(
          {
            documentId,
            assetId,
            quantity: override?.quantity ?? line.quantity,
            value: override?.value ?? line.value,
            currency: override?.currency ?? line.currency,
          },
          tx,
        );
      } else {
        const override = resolution && "amount" in resolution ? resolution : undefined;
        await insertTransaction(
          {
            accountId,
            assetId,
            occurredAt: override?.occurredAt ?? line.occurredAt,
            quantityDelta: override?.quantityDelta ?? line.quantityDelta ?? "0",
            amount: override?.amount ?? line.amount,
            currency: override?.currency ?? line.currency,
            kind: line.transactionKind,
          },
          tx,
        );
      }
    }
  });
  await commitDocument(documentId, asOfDate);
}
