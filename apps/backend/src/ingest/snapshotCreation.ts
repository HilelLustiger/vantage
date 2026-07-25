// The last pipeline stage: turn a fully-resolved parse into a Snapshot +
// Holdings and/or cash_flows rows, and commit the Document. See ADR-0009
// (immutable, supersede rather than overwrite), ADR-0012 (store original
// currency), and ADR-0023/ADR-0024 (per-Asset cash flows, three commit
// shapes — holdings-only, transactions-only/flows-only, or both).
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { CashFlowSource } from "@vantage/shared-types";
import { db } from "../shared/db/client.js";
import { listHoldingsForSnapshot } from "../shared/db/holdings.js";
import { cashFlows, documents, holdings, snapshots } from "../shared/db/schema.js";
import { findPreviousActiveSnapshot } from "../shared/db/snapshots.js";
import { deriveFlowAmount, selectFlowTransactions } from "./cashFlowTransactions.js";

const parsedDataSchema = z
  .object({
    asOfDate: z.string().optional(),
    // Presence of the key (even []) means "create a Snapshot" — a
    // transactions-only Document (Hapoalim, #37) omits this key entirely,
    // meaning zero Snapshots, per ADR-0024.
    holdings: z
      .array(
        z
          .object({
            assetName: z.string(),
            quantity: z.string(),
            value: z.string(),
            currency: z.string(),
            // Excellence emits this as a raw JSON number (unlike the
            // string-typed quantity/value) — kept as the parser's own
            // native type rather than forcing an inconsistent cast.
            // ADR-0023/#39.
            purchaseCostIls: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
    transactions: z
      .array(
        z
          .object({
            assetName: z.string(),
            kind: z.string(),
            amount: z.string(),
            currency: z.string(),
            date: z.string(),
            runningBalanceAfter: z.string().optional(),
            balanceAfter: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    // Gemel period-aggregate figures (#39) — deposits stays nullish (no
    // such line on some statements); transfers/withdrawals/transfersOut
    // already default to "0.0" at the parser layer, a real explicit zero.
    deposits: z.string().nullish(),
    transfers: z.string().nullish(),
    withdrawals: z.string().nullish(),
    transfersOut: z.string().nullish(),
  })
  .passthrough();

// Real statement asOfDate formats confirmed against all 8 sandbox/samples/
// statements: both DD.MM.YYYY and DD/MM/YYYY appear. The fixed \d{2} for
// day/month also rejects the one known-corrupted real value
// ("130.06.2026", a documented Hapoalim extraction quirk from #24) — it
// can't match a 3-digit day, so this returns null rather than silently
// accepting nonsense.
export function parseStatementDate(raw: string): string | null {
  const match = raw.match(/^(\d{2})[./](\d{2})[./](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const dayNum = Number(day);
  const monthNum = Number(month);
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) return null;
  return `${year}-${month}-${day}`;
}

// resolvedAssetIds must have no nulls — guaranteed by the caller, which
// only reaches this from #20's "all matched" branch. Positionally aligned
// to [...holdings, ...flow-kind transactions] (ADR-0023/#38), same
// convention as assetResolution.ts/assetReviewFlow.ts.
export async function commitSnapshot(
  documentId: string,
  accountId: string,
  parsedData: unknown,
  resolvedAssetIds: (string | null)[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const parsed = parsedDataSchema.safeParse(parsedData);
  if (!parsed.success) {
    return { ok: false, reason: "parsed data was not in the expected shape" };
  }
  if (parsed.data.holdings === undefined && parsed.data.transactions === undefined) {
    return { ok: false, reason: "parsed data had neither holdings nor transactions" };
  }

  // Only a holdings-bearing Document needs a statement date — a
  // transactions-only Document (Hapoalim, #37) has no asOfDate key at all;
  // each flow row already carries its own exact date (ADR-0024).
  let asOfDate: string | null = null;
  if (parsed.data.holdings !== undefined) {
    if (!parsed.data.asOfDate) {
      return { ok: false, reason: "parsed data did not include a statement date" };
    }
    asOfDate = parseStatementDate(parsed.data.asOfDate);
    if (!asOfDate) {
      return { ok: false, reason: `could not parse statement date "${parsed.data.asOfDate}"` };
    }
  }

  const flowTransactions = selectFlowTransactions(parsed.data.transactions ?? []);
  const holdingIds = resolvedAssetIds.slice(0, parsed.data.holdings?.length ?? 0);
  const flowAssetIds = resolvedAssetIds.slice(parsed.data.holdings?.length ?? 0);

  await db.transaction(async (tx) => {
    // Shared by #38's real-transaction rows and #39's two derivations
    // below — the same dedup check (assetId, date, kind, amount,
    // runningBalanceAfter — ADR-0023) applies to all three sources.
    async function insertCashFlowIfNew(input: {
      assetId: string;
      date: string;
      amount: string;
      currency: string;
      kind: string;
      source: CashFlowSource;
      runningBalanceAfter?: string;
    }) {
      const existingMatches = await tx
        .select()
        .from(cashFlows)
        .where(and(eq(cashFlows.assetId, input.assetId), eq(cashFlows.date, input.date)));
      const isDuplicate = existingMatches.some(
        (row) =>
          row.kind === input.kind &&
          row.amount === input.amount &&
          (row.runningBalanceAfter ?? undefined) === input.runningBalanceAfter,
      );
      if (isDuplicate) {
        return;
      }

      await tx.insert(cashFlows).values({
        accountId,
        documentId,
        ...input,
      });
    }

    if (parsed.data.holdings !== undefined && asOfDate !== null) {
      const [existingActive] = await tx
        .select()
        .from(snapshots)
        .where(
          and(
            eq(snapshots.accountId, accountId),
            eq(snapshots.asOfDate, asOfDate),
            eq(snapshots.isActive, true),
          ),
        );

      const [snapshot] = await tx
        .insert(snapshots)
        .values({ accountId, documentId, asOfDate, isActive: true })
        .returning();

      if (existingActive) {
        await tx
          .update(snapshots)
          .set({ isActive: false, supersededBySnapshotId: snapshot.id })
          .where(eq(snapshots.id, existingActive.id));
      }

      if (parsed.data.holdings.length > 0) {
        await tx.insert(holdings).values(
          parsed.data.holdings.map((holding, i) => ({
            snapshotId: snapshot.id,
            // Non-null by the caller's contract — see the function doc above.
            assetId: holdingIds[i]!,
            quantity: holding.quantity,
            value: holding.value,
            currency: holding.currency,
            purchaseCostIls:
              holding.purchaseCostIls !== undefined ? String(holding.purchaseCostIls) : undefined,
          })),
        );
      }

      // Gemel period-aggregate derivation (ADR-0023/#39) — always exactly
      // 0 or 1 holding for this shape; ambiguous for anything else, so
      // skipped defensively rather than guessing which holding it's for.
      if (parsed.data.holdings.length === 1) {
        const assetId = holdingIds[0]!;
        const currency = parsed.data.holdings[0].currency;
        const periodFlows: { kind: string; amount: string | null | undefined }[] = [
          { kind: "deposit", amount: parsed.data.deposits },
          { kind: "transfer_in", amount: parsed.data.transfers },
          { kind: "withdrawal", amount: parsed.data.withdrawals },
          { kind: "transfer_out", amount: parsed.data.transfersOut },
        ];
        for (const flow of periodFlows) {
          if (!flow.amount || Number(flow.amount) === 0) {
            continue;
          }
          await insertCashFlowIfNew({
            assetId,
            date: asOfDate,
            amount: flow.amount,
            currency,
            kind: flow.kind,
            source: "derived_period_aggregate",
          });
        }
      }

      // Excellence cost-basis-delta derivation (ADR-0023/#39) — only the
      // fallback for periods with no real per-transaction data; #38 already
      // recorded real ingested_transaction flows when transactions exist,
      // and deriving this too would double-count the same activity.
      if (parsed.data.transactions === undefined || parsed.data.transactions.length === 0) {
        for (const [i, holding] of parsed.data.holdings.entries()) {
          if (holding.purchaseCostIls === undefined) {
            continue;
          }
          const assetId = holdingIds[i]!;
          const previousSnapshot = await findPreviousActiveSnapshot(accountId, asOfDate);
          if (!previousSnapshot) {
            continue;
          }
          const previousHoldings = await listHoldingsForSnapshot(previousSnapshot.id);
          const previousHolding = previousHoldings.find((h) => h.assetId === assetId);
          if (previousHolding?.purchaseCostIls === undefined) {
            continue;
          }
          const delta = holding.purchaseCostIls - Number(previousHolding.purchaseCostIls);
          if (delta === 0) {
            continue;
          }
          await insertCashFlowIfNew({
            assetId,
            date: asOfDate,
            amount: String(delta),
            currency: holding.currency,
            kind: "cost_basis_delta",
            source: "derived_cost_basis_delta",
          });
        }
      }
    }

    for (const [i, transaction] of flowTransactions.entries()) {
      const date = parseStatementDate(transaction.date);
      if (!date) {
        // Shouldn't happen for a validated real-parser row — but never
        // silently record a flow with an unparseable date either.
        continue;
      }
      const amount = deriveFlowAmount(transaction.kind, transaction.amount);
      const runningBalanceAfter = transaction.runningBalanceAfter ?? transaction.balanceAfter;
      // Non-null by the caller's contract, same as holdingIds above.
      const assetId = flowAssetIds[i]!;

      await insertCashFlowIfNew({
        assetId,
        date,
        amount,
        currency: transaction.currency,
        kind: transaction.kind,
        source: "ingested_transaction",
        runningBalanceAfter,
      });
    }

    await tx.update(documents).set({ status: "committed" }).where(eq(documents.id, documentId));
  });

  return { ok: true };
}
