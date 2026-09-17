import type {
  AssetType,
  ClosedHoldingDetail,
  Freshness,
  HoldingChartPoint,
  HoldingDetail,
  HoldingRow,
  NetWorthHistoryPoint,
  OpenHoldingDetail,
} from "../dto/index.js";
import {
  listLatestHoldings,
  listHoldingHistoryForAsset,
  listCommittedDocuments,
  listHoldingsForDocument,
} from "../repositories/holdings.js";
import {
  listTransactionsForAssetAllAccounts,
  listAllTransactions,
} from "../repositories/transactions.js";
import { convert } from "../infra/exchangeRates.js";
import { getLivePrice } from "../infra/marketPrices.js";
import { xirr as computeXirr, type CashFlow } from "./xirr.js";

// Thresholds match the mockup's own examples (5d "recent", 16d "aging", 82d
// "stale") — a week feels current, a month feels dated, beyond that it's
// stale regardless of exactly how far. Grading happens here (server-side),
// not in the frontend, per the Freshness DTO's own contract.
const AGING_AFTER_DAYS = 7;
const STALE_AFTER_DAYS = 30;

// XIRR on a position held for only a few days is noise, not a return —
// collapses into the same "not computable" null the DTO already allows for.
const MIN_HOLDING_DAYS_FOR_XIRR = 30;

const LIVE_PRICEABLE_TYPES: AssetType[] = ["stock", "etf"];

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

function gradeFreshnessTier(daysAgo: number): "recent" | "aging" | "stale" {
  if (daysAgo < AGING_AFTER_DAYS) return "recent";
  if (daysAgo < STALE_AFTER_DAYS) return "aging";
  return "stale";
}

interface AggregatedAsset {
  assetId: string;
  name: string;
  ticker?: string;
  type: AssetType;
  quantity: number;
  // Native currency/value from the latest committed Documents that report
  // this Asset — assumes every Account holding the same Asset reports it in
  // the same currency (v1 limitation; a mixed-currency holding of one Asset
  // isn't supported yet).
  nativeCurrency: string;
  nativeValue: number;
  asOfDate: string | null;
}

function aggregateByAsset(rows: Awaited<ReturnType<typeof listLatestHoldings>>): AggregatedAsset[] {
  const byAsset = new Map<string, AggregatedAsset>();
  for (const row of rows) {
    const existing = byAsset.get(row.assetId);
    if (existing) {
      existing.quantity += Number(row.quantity);
      existing.nativeValue += Number(row.value);
      // Latest asOfDate across the contributing Accounts stands in for the
      // whole Asset's freshness.
      if (row.asOfDate && (!existing.asOfDate || row.asOfDate > existing.asOfDate)) {
        existing.asOfDate = row.asOfDate;
      }
    } else {
      byAsset.set(row.assetId, {
        assetId: row.assetId,
        name: row.assetName,
        ticker: row.assetTicker ?? undefined,
        type: row.assetType as AssetType,
        quantity: Number(row.quantity),
        nativeCurrency: row.currency,
        nativeValue: Number(row.value),
        asOfDate: row.asOfDate,
      });
    }
  }
  return [...byAsset.values()];
}

async function resolveFreshnessAndNativeValue(
  asset: AggregatedAsset,
): Promise<{ freshness: Freshness; nativeValue: number; nativeCurrency: string }> {
  if (LIVE_PRICEABLE_TYPES.includes(asset.type) && asset.ticker) {
    const live = await getLivePrice(asset.ticker);
    if (live) {
      return {
        freshness: { tier: "live", updatedSecondsAgo: 0 },
        nativeValue: live.price * asset.quantity,
        nativeCurrency: live.currency,
      };
    }
  }

  const asOfDate = asset.asOfDate ?? new Date(0).toISOString().slice(0, 10);
  const daysAgo = daysBetween(new Date(), new Date(asOfDate));
  return {
    freshness: { tier: gradeFreshnessTier(daysAgo), asOfDate, daysAgo },
    nativeValue: asset.nativeValue,
    nativeCurrency: asset.nativeCurrency,
  };
}

function toCashFlows(
  transactions: Awaited<ReturnType<typeof listTransactionsForAssetAllAccounts>>,
): CashFlow[] {
  return transactions.map((t) => ({
    date: new Date(t.occurredAt),
    // Money going in (buy/deposit) is a negative flow from the investor's
    // perspective; money coming out (sell/withdrawal) is positive.
    amount: t.kind === "buy" || t.kind === "deposit" ? -Number(t.amount) : Number(t.amount),
  }));
}

// A fixed-rate deposit moves predictably with a known rate — a chart
// wouldn't show anything the numbers don't already, so it's skipped for
// this Asset type (see the mockup's own reasoning for the same case).
function chartEligible(type: AssetType): boolean {
  return type !== "cash";
}

async function computeOpenDetail(
  assetId: string,
  assetType: AssetType,
  nativeValue: number,
  nativeCurrency: string,
  displayCurrency: string,
): Promise<OpenHoldingDetail> {
  const transactions = await listTransactionsForAssetAllAccounts(assetId);
  const chart = chartEligible(assetType)
    ? await computeHoldingChart(assetId, displayCurrency)
    : undefined;

  // v1: assumes every transaction for this Asset is in nativeCurrency —
  // same limitation as the holdings aggregation above.
  const invested = transactions
    .filter((t) => t.kind === "buy" || t.kind === "deposit")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const withdrawn = transactions
    .filter((t) => t.kind === "sell" || t.kind === "withdrawal")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const costBasisNative = Math.max(0, invested - withdrawn);
  const profitNative = nativeValue - costBasisNative;

  const taxRate = Number(process.env.TAX_RATE ?? 0);
  const taxOnProfitNative = Math.max(0, profitNative) * taxRate;

  const oldestTransaction = transactions[0];
  const heldDays = oldestTransaction
    ? daysBetween(new Date(), new Date(oldestTransaction.occurredAt))
    : 0;
  const xirrValue =
    heldDays >= MIN_HOLDING_DAYS_FOR_XIRR
      ? computeXirr([...toCashFlows(transactions), { date: new Date(), amount: nativeValue }])
      : null;

  const [costBasis, profit, taxOnProfit] = await Promise.all([
    convert(costBasisNative, nativeCurrency, displayCurrency),
    convert(profitNative, nativeCurrency, displayCurrency),
    convert(taxOnProfitNative, nativeCurrency, displayCurrency),
  ]);

  return {
    status: "open",
    chart,
    costBasis: costBasis.toFixed(2),
    profit: profit.toFixed(2),
    returnPct: costBasisNative > 0 ? (profitNative / costBasisNative) * 100 : null,
    taxOnProfit: taxOnProfit.toFixed(2),
    xirr: xirrValue,
    // No stored source for a fixed-rate deposit's rate yet — left absent
    // rather than guessed. See OpenHoldingDetail.annualRatePct.
  };
}

async function computeClosedDetail(
  assetId: string,
  displayCurrency: string,
): Promise<ClosedHoldingDetail> {
  const transactions = await listTransactionsForAssetAllAccounts(assetId);
  const currency = transactions[0]?.currency ?? displayCurrency;

  const invested = transactions
    .filter((t) => t.kind === "buy" || t.kind === "deposit")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const proceeds = transactions
    .filter((t) => t.kind === "sell" || t.kind === "withdrawal")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const realizedProfitNative = proceeds - invested;

  const [costBasis, soldFor, realizedProfit] = await Promise.all([
    convert(invested, currency, displayCurrency),
    convert(proceeds, currency, displayCurrency),
    convert(realizedProfitNative, currency, displayCurrency),
  ]);

  return {
    status: "closed",
    heldFrom: transactions[0]?.occurredAt ?? "",
    heldTo: transactions[transactions.length - 1]?.occurredAt ?? "",
    costBasis: costBasis.toFixed(2),
    soldFor: soldFor.toFixed(2),
    realizedProfit: realizedProfit.toFixed(2),
    realizedReturnPct: invested > 0 ? (realizedProfitNative / invested) * 100 : 0,
  };
}

// Every card on the Dashboard and every row of the Assets table — see the
// comment on HoldingRow in dto/holdings.ts for why there's no separate
// portfolio-summary endpoint; this is the one place that assembles it.
export async function computeHoldingRows(displayCurrency: string): Promise<HoldingRow[]> {
  const latest = await listLatestHoldings();
  const aggregated = aggregateByAsset(latest);

  return Promise.all(
    aggregated.map(async (asset): Promise<HoldingRow> => {
      const { freshness, nativeValue, nativeCurrency } =
        await resolveFreshnessAndNativeValue(asset);
      const isClosed = asset.quantity === 0;

      const value = await convert(nativeValue, nativeCurrency, displayCurrency);

      let detail: HoldingDetail;
      if (isClosed) {
        detail = await computeClosedDetail(asset.assetId, displayCurrency);
      } else {
        detail = await computeOpenDetail(
          asset.assetId,
          asset.type,
          nativeValue,
          nativeCurrency,
          displayCurrency,
        );
      }

      return {
        assetId: asset.assetId,
        name: asset.name,
        ticker: asset.ticker,
        type: asset.type,
        nativeCurrency,
        nativeValue: isClosed ? null : nativeValue.toFixed(2),
        value: isClosed ? null : value.toFixed(2),
        freshness,
        quantity: isClosed ? null : asset.quantity.toFixed(4),
        closedOn: isClosed ? (detail as ClosedHoldingDetail).heldTo : undefined,
        detail,
      };
    }),
  );
}

// Value-vs-cost-basis series for one Asset's expanded chart — a distinct,
// lazily-populated field of OpenHoldingDetail.chart, built from the same
// per-Document history used to detect "closed" (listHoldingHistoryForAsset).
export async function computeHoldingChart(
  assetId: string,
  displayCurrency: string,
): Promise<HoldingChartPoint[]> {
  const history = await listHoldingHistoryForAsset(assetId);
  const transactions = await listTransactionsForAssetAllAccounts(assetId);

  const points: HoldingChartPoint[] = [];
  let runningCostBasis = 0;
  for (const point of [...history].reverse()) {
    const asOf = point.asOfDate ?? point.uploadedAt.toISOString().slice(0, 10);
    runningCostBasis = transactions
      .filter((t) => t.occurredAt <= asOf && (t.kind === "buy" || t.kind === "deposit"))
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const [value, costBasis] = await Promise.all([
      convert(Number(point.value), point.currency, displayCurrency),
      convert(runningCostBasis, point.currency, displayCurrency),
    ]);
    points.push({ date: asOf, value: value.toFixed(2), costBasis: costBasis.toFixed(2) });
  }
  return points;
}

// One point per imported statement, across every Account — the Dashboard's
// "Net worth over time" chart. Each Document's own value is carried forward
// per-Account (a later Document from Account A doesn't affect what Account
// B last reported) and summed for the portfolio-wide total; cost basis is a
// running total over every Transaction dated up to that point.
export async function computeNetWorthHistory(
  displayCurrency: string,
): Promise<NetWorthHistoryPoint[]> {
  const [documentsList, transactions] = await Promise.all([
    listCommittedDocuments(),
    listAllTransactions(),
  ]);

  const latestValueByAccount = new Map<string, number>();
  let runningCostBasis = 0;
  let transactionIndex = 0;
  const points: NetWorthHistoryPoint[] = [];

  for (const document of documentsList) {
    const pointDate = document.asOfDate ?? document.uploadedAt.toISOString().slice(0, 10);

    const lines = await listHoldingsForDocument(document.documentId);
    let accountValue = 0;
    for (const line of lines) {
      accountValue += await convert(Number(line.value), line.currency, displayCurrency);
    }
    latestValueByAccount.set(document.accountId, accountValue);

    while (
      transactionIndex < transactions.length &&
      transactions[transactionIndex].occurredAt <= pointDate
    ) {
      const transaction = transactions[transactionIndex];
      const converted = await convert(
        Number(transaction.amount),
        transaction.currency,
        displayCurrency,
      );
      runningCostBasis +=
        transaction.kind === "buy" || transaction.kind === "deposit" ? converted : -converted;
      transactionIndex++;
    }

    const portfolioValue = [...latestValueByAccount.values()].reduce((sum, v) => sum + v, 0);

    points.push({
      date: pointDate,
      portfolioValue: portfolioValue.toFixed(2),
      costBasis: Math.max(0, runningCostBasis).toFixed(2),
      event: { kind: "statement_imported", institutionName: document.institutionName },
    });
  }

  return points;
}
