// Cost-basis resolution + profit/tax-on-profit/XIRR computation — see
// ADR-0023 and #40/#41/#42. Pure computation module: no API route yet
// (#43 wires this bundle into an endpoint).
import type { CashFlow } from "@vantage/shared-types";
import { findCashFlowsForAsset } from "./db/cashFlows.js";
import { gatherLatestHoldingsForUser } from "./portfolioByAsset.js";
import { computeXirr } from "./xirr.js";

if (!process.env.TAX_RATE) {
  throw new Error("TAX_RATE is required");
}
const TAX_RATE = Number(process.env.TAX_RATE);
if (!Number.isFinite(TAX_RATE) || TAX_RATE < 0) {
  throw new Error(`TAX_RATE must be a non-negative number, got "${process.env.TAX_RATE}"`);
}

// Below this, an annualized rate is mostly extrapolation noise — #42's
// "de-emphasize/hide for very recently opened positions" (ADR-0023), same
// "not meaningful, don't show it as if it were" contract simpleReturnPct
// already uses for costBasis === 0, not a distinct error/reason field.
const XIRR_MIN_HOLDING_DAYS = 90;

export type CostBasisSource = "institution_stated" | "derived_from_cash_flows";

export interface AssetCostBasisMetrics {
  assetId: string;
  currency: string;
  currentValue: string;
  costBasis: string;
  costBasisSource: CostBasisSource;
  profit: string;
  /** profit / costBasis * 100 — see ADR-0023. `null` when costBasis is 0
   * (no cash-flow history at all, #40): a percentage return on zero
   * investment isn't meaningful, not 0%/Infinity/NaN. */
  simpleReturnPct: number | null;
  /** Money-weighted, annualized return — see ADR-0023/#42. `null` when
   * not computable (fewer than 2 dated flows, no sign change) or the
   * first flow is under XIRR_MIN_HOLDING_DAYS old. */
  xirr: number | null;
  taxOnProfit: string;
  netOfTax: string;
}

// Per (assetId, currency) — see ADR-0022: an Asset can legitimately be
// held in more than one currency across Accounts, and profit/cost-basis
// is meaningless mixing currencies without FX (which entity-level views
// deliberately never do).
export async function computeAssetCostBasisMetrics(
  userId: string,
): Promise<AssetCostBasisMetrics[]> {
  const holdings = await gatherLatestHoldingsForUser(userId);

  const groups = new Map<
    string,
    { assetId: string; currency: string; value: number; purchaseCosts: (string | undefined)[] }
  >();
  for (const holding of holdings) {
    const key = `${holding.assetId} ${holding.currency}`;
    const existing = groups.get(key) ?? {
      assetId: holding.assetId,
      currency: holding.currency,
      value: 0,
      purchaseCosts: [],
    };
    existing.value += Number(holding.value);
    existing.purchaseCosts.push(holding.purchaseCostIls);
    groups.set(key, existing);
  }

  const results: AssetCostBasisMetrics[] = [];
  for (const group of groups.values()) {
    // Fetched once, unconditionally — needed for XIRR regardless of which
    // cost-basis source wins below, not just the derived-fallback path.
    const flows = (await findCashFlowsForAsset(group.assetId)).filter(
      (flow) => flow.currency === group.currency,
    );

    const { costBasis, costBasisSource } = resolveCostBasis(group.purchaseCosts, flows);

    const profit = round2(group.value - costBasis);
    const simpleReturnPct = costBasis === 0 ? null : round2((profit / costBasis) * 100);
    const taxOnProfit = round2(Math.max(profit, 0) * TAX_RATE);
    const netOfTax = round2(group.value - taxOnProfit);
    const xirr = resolveXirr(flows, group.value);

    results.push({
      assetId: group.assetId,
      currency: group.currency,
      currentValue: String(round2(group.value)),
      costBasis: String(round2(costBasis)),
      costBasisSource,
      profit: String(profit),
      simpleReturnPct,
      xirr,
      taxOnProfit: String(taxOnProfit),
      netOfTax: String(netOfTax),
    });
  }
  return results;
}

// Money math on floats accumulates IEEE754 noise (e.g. 16720 - 16359.52 ->
// 360.47999999999956) — round to cents everywhere a value is produced,
// matching the parser's own `round(x, 2)` convention for the same reason.
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Prefer the institution's own directly-stated figure (Excellence's
// purchaseCostIls) when EVERY current holding in this (asset, currency)
// group has one; otherwise fall back to summing cash_flows entirely
// rather than mixing a partial institution-sum with a derived one.
function resolveCostBasis(
  purchaseCosts: (string | undefined)[],
  flows: CashFlow[],
): { costBasis: number; costBasisSource: CostBasisSource } {
  if (purchaseCosts.every((cost) => cost !== undefined)) {
    return {
      costBasis: purchaseCosts.reduce((sum, cost) => sum + Number(cost), 0),
      costBasisSource: "institution_stated",
    };
  }

  const costBasis = flows.reduce((sum, flow) => sum + Number(flow.amount), 0);
  return { costBasis, costBasisSource: "derived_from_cash_flows" };
}

// Finance convention is the opposite of how cash_flows.amount is stored
// (ADR-0023: positive = contributed) — contributions are cash out of
// pocket (negative), the final valuation is what you'd get back
// (positive). The valuation point is synthetic, in-memory only, never
// written back to cash_flows.
function resolveXirr(flows: CashFlow[], currentValue: number): number | null {
  if (flows.length === 0) {
    return null;
  }
  const earliestDate = flows.reduce((min, f) => (f.date < min ? f.date : min), flows[0].date);
  const holdingDays = (Date.now() - Date.parse(`${earliestDate}T00:00:00Z`)) / (1000 * 60 * 60 * 24);
  if (holdingDays < XIRR_MIN_HOLDING_DAYS) {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const series = [
    ...flows.map((flow) => ({ date: flow.date, amount: -Number(flow.amount) })),
    { date: today, amount: currentValue },
  ];
  return computeXirr(series);
}
