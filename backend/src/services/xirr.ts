export interface CashFlow {
  date: Date;
  amount: number;
}

const DAY_MS = 1000 * 60 * 60 * 24;
const YEAR_DAYS = 365;

function npv(rate: number, flows: CashFlow[], t0: Date): number {
  return flows.reduce((sum, cf) => {
    const years = (cf.date.getTime() - t0.getTime()) / DAY_MS / YEAR_DAYS;
    return sum + cf.amount / Math.pow(1 + rate, years);
  }, 0);
}

// Money-weighted, annualized return via Newton-Raphson on dated cash flows.
// Needs at least one negative (money in) and one positive (money out/
// current value) flow — otherwise there's no rate that could reconcile
// them. Returns null rather than throwing when it doesn't converge, per
// OpenHoldingDetail.xirr's contract ("null when not computable").
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return null;

  const t0 = flows[0].date;
  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const value = npv(rate, flows, t0);
    const derivative = (npv(rate + 1e-6, flows, t0) - value) / 1e-6;
    if (derivative === 0) return null;
    const nextRate = rate - value / derivative;
    if (!Number.isFinite(nextRate) || nextRate <= -1) return null;
    if (Math.abs(nextRate - rate) < 1e-7) return nextRate;
    rate = nextRate;
  }
  return null;
}
