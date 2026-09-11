// The manual-confirmation flow for a needs_review Document — see
// ADR-0010: every unmatched line gets exactly one of two actions (match
// an existing Asset, or confirm as genuinely new), never a default/skip.
// Confirming every line drives the Document to committed via the same
// commitSnapshot() #21 built, deliberately reusable for exactly this.
import { z } from "zod";
import type { DocumentReviewLine, DocumentResolution } from "../dto/index.js";
import { createAsset, findAssetById } from "../db/assets.js";
import { deriveFlowAmount, selectFlowTransactions } from "./cashFlowTransactions.js";
import { commitSnapshot } from "./snapshotCreation.js";

// Same shape/rationale as assetResolution.ts's and snapshotCreation.ts's
// own local schemas — each pipeline-stage module validates independently
// rather than sharing one, an established precedent in this codebase.
const holdingSchema = z
  .object({
    assetName: z.string(),
    quantity: z.string(),
    value: z.string(),
    currency: z.string(),
  })
  .passthrough();

const transactionSchema = z
  .object({
    assetName: z.string(),
    kind: z.string(),
    amount: z.string(),
    currency: z.string(),
  })
  .passthrough();

const parsedDataSchema = z
  .object({
    holdings: z.array(holdingSchema).optional(),
    transactions: z.array(transactionSchema).optional(),
  })
  .passthrough();

// A flow-kind transaction has no natural quantity/value the way a holding
// does. Rather than redesigning DocumentReviewLine/the review UI for a
// second line shape, it's mapped onto the existing fields — quantity ←
// kind (e.g. "buy"), value ← the signed derived flow amount — so
// ReviewDocumentPage.tsx renders it ("buy · 250.64 ILS") with no changes.
export function buildReviewLines(
  parsedData: unknown,
  resolvedHoldings: (string | null)[] | null,
): DocumentReviewLine[] | null {
  const parsed = parsedDataSchema.safeParse(parsedData);
  if (!parsed.success) {
    return null;
  }
  if (parsed.data.holdings === undefined && parsed.data.transactions === undefined) {
    return null;
  }

  const holdingLines = (parsed.data.holdings ?? []).map((holding) => ({
    assetName: holding.assetName,
    quantity: holding.quantity,
    value: holding.value,
    currency: holding.currency,
  }));
  const flowLines = selectFlowTransactions(parsed.data.transactions ?? []).map((transaction) => ({
    assetName: transaction.assetName,
    quantity: transaction.kind,
    value: deriveFlowAmount(transaction.kind, transaction.amount),
    currency: transaction.currency,
  }));

  return [...holdingLines, ...flowLines].map((line, index) => {
    const resolvedAssetId = resolvedHoldings?.[index];
    return {
      index,
      ...line,
      ...(resolvedAssetId ? { resolvedAssetId } : {}),
    };
  });
}

export type ApplyResolutionsResult =
  | { ok: true }
  | { ok: false; kind: "invalid_request"; reason: string }
  | { ok: false; kind: "commit_failed"; reason: string };

// Two passes: (1) validate the whole batch structurally, zero writes; (2)
// only once the batch is known-valid, actually resolve/create Assets and
// commit. A rejected request must have zero side effects — no orphan
// Assets created for a batch that fails partway through.
export async function applyResolutions(
  documentId: string,
  accountId: string,
  parsedData: unknown,
  resolvedHoldings: (string | null)[] | null,
  resolutions: DocumentResolution[],
): Promise<ApplyResolutionsResult> {
  const parsed = parsedDataSchema.safeParse(parsedData);
  if (!parsed.success) {
    return {
      ok: false,
      kind: "invalid_request",
      reason: "parsed data was not in the expected shape",
    };
  }

  const lineCount =
    (parsed.data.holdings?.length ?? 0) +
    selectFlowTransactions(parsed.data.transactions ?? []).length;
  const current = [...(resolvedHoldings ?? [])];
  if (current.length !== lineCount) {
    return {
      ok: false,
      kind: "invalid_request",
      reason: "resolved holdings did not match the parsed holdings",
    };
  }

  const targetedIndexes = new Set<number>();
  for (const resolution of resolutions) {
    if (resolution.index < 0 || resolution.index >= current.length) {
      return {
        ok: false,
        kind: "invalid_request",
        reason: `line ${resolution.index} does not exist`,
      };
    }
    if (current[resolution.index] !== null) {
      return {
        ok: false,
        kind: "invalid_request",
        reason: `line ${resolution.index} is already resolved`,
      };
    }
    if (targetedIndexes.has(resolution.index)) {
      return {
        ok: false,
        kind: "invalid_request",
        reason: `line ${resolution.index} was resolved more than once`,
      };
    }
    targetedIndexes.add(resolution.index);

    if ("assetId" in resolution) {
      const asset = await findAssetById(resolution.assetId);
      if (!asset) {
        return {
          ok: false,
          kind: "invalid_request",
          reason: `asset ${resolution.assetId} not found`,
        };
      }
    }
  }

  const stillUnresolved = current
    .map((assetId, index) => (assetId === null ? index : null))
    .filter((index): index is number => index !== null && !targetedIndexes.has(index));
  if (stillUnresolved.length > 0) {
    return {
      ok: false,
      kind: "invalid_request",
      reason: `every unmatched line must be resolved (missing: ${stillUnresolved.join(", ")})`,
    };
  }

  // Batch is fully valid — now perform the actual writes.
  for (const resolution of resolutions) {
    if ("assetId" in resolution) {
      current[resolution.index] = resolution.assetId;
    } else {
      const asset = await createAsset(resolution.newAsset);
      current[resolution.index] = asset.id;
    }
  }

  const commitResult = await commitSnapshot(documentId, accountId, parsedData, current);
  if (!commitResult.ok) {
    return { ok: false, kind: "commit_failed", reason: commitResult.reason };
  }
  return { ok: true };
}
