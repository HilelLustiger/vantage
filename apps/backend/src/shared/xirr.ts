// Money-weighted, annualized return — ADR-0023/#42. Pure, DB-free: takes
// an already-finance-signed, dated flow series (contributions negative,
// payouts/valuation positive) and solves for the rate `r` where the net
// present value of the series is zero. No closed-form solution exists for
// an arbitrary flow series, so this is a real numerical root-finder —
// Newton-Raphson first (fast, precise), a bracket-search + bisection
// fallback when Newton doesn't converge (not every cash-flow shape
// guarantees Newton's convergence).
export interface XirrFlow {
  date: string; // YYYY-MM-DD
  amount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NEWTON_INITIAL_GUESS = 0.1;
const NEWTON_MAX_ITERATIONS = 100;
const NEWTON_TOLERANCE = 1e-7;
const BISECTION_MAX_ITERATIONS = 200;
const BISECTION_TOLERANCE = 1e-7;
// Geometrically-spread candidate rates to search for a sign change in NPV
// before bisecting — covers a near-total loss (-99%) up through a 100x
// annualized return, comfortably beyond anything a real household
// portfolio would produce.
const BRACKET_CANDIDATES = [
  -0.99, -0.9, -0.75, -0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100,
];

function daysBetween(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS;
}

export function computeXirr(flows: XirrFlow[]): number | null {
  if (flows.length < 2) {
    return null;
  }
  const hasPositive = flows.some((f) => f.amount > 0);
  const hasNegative = flows.some((f) => f.amount < 0);
  if (!hasPositive || !hasNegative) {
    // No sign change in the series — no real root exists (e.g. every
    // flow is a contribution, never a payout or valuation).
    return null;
  }

  const earliestDate = flows.reduce((min, f) => (f.date < min ? f.date : min), flows[0].date);
  const years = flows.map((f) => daysBetween(earliestDate, f.date) / 365);

  function npv(rate: number): number {
    let sum = 0;
    for (let i = 0; i < flows.length; i++) {
      sum += flows[i].amount * Math.pow(1 + rate, -years[i]);
    }
    return sum;
  }

  function npvDerivative(rate: number): number {
    let sum = 0;
    for (let i = 0; i < flows.length; i++) {
      sum += flows[i].amount * -years[i] * Math.pow(1 + rate, -years[i] - 1);
    }
    return sum;
  }

  return newtonRaphson(npv, npvDerivative) ?? bisection(npv);
}

function newtonRaphson(npv: (r: number) => number, npvDerivative: (r: number) => number): number | null {
  let rate = NEWTON_INITIAL_GUESS;
  for (let i = 0; i < NEWTON_MAX_ITERATIONS; i++) {
    const value = npv(rate);
    if (!Number.isFinite(value)) {
      return null;
    }
    if (Math.abs(value) < NEWTON_TOLERANCE) {
      return rate;
    }
    const derivative = npvDerivative(rate);
    if (!Number.isFinite(derivative) || derivative === 0) {
      return null;
    }
    const nextRate = rate - value / derivative;
    if (!Number.isFinite(nextRate) || nextRate <= -1) {
      // Left the valid domain (1+r must stay positive) — let bisection,
      // which never leaves the domain by construction, take over.
      return null;
    }
    rate = nextRate;
  }
  return null; // didn't converge within the iteration budget
}

function bisection(npv: (r: number) => number): number | null {
  let bracketLow: number | null = null;
  let valueAtLow = 0;
  let bracketHigh: number | null = null;
  for (const candidate of BRACKET_CANDIDATES) {
    const value = npv(candidate);
    if (!Number.isFinite(value)) {
      continue;
    }
    if (bracketLow === null) {
      bracketLow = candidate;
      valueAtLow = value;
      continue;
    }
    if ((valueAtLow < 0 && value > 0) || (valueAtLow > 0 && value < 0)) {
      bracketHigh = candidate;
      break;
    }
    bracketLow = candidate;
    valueAtLow = value;
  }
  if (bracketLow === null || bracketHigh === null) {
    return null; // no sign change found anywhere in the searched range
  }

  let low = bracketLow;
  let high = bracketHigh;
  let valueAtLowBound = npv(low);
  for (let i = 0; i < BISECTION_MAX_ITERATIONS; i++) {
    const mid = (low + high) / 2;
    const valueAtMid = npv(mid);
    if (Math.abs(valueAtMid) < BISECTION_TOLERANCE || (high - low) / 2 < BISECTION_TOLERANCE) {
      return mid;
    }
    if ((valueAtLowBound < 0 && valueAtMid > 0) || (valueAtLowBound > 0 && valueAtMid < 0)) {
      high = mid;
    } else {
      low = mid;
      valueAtLowBound = valueAtMid;
    }
  }
  return (low + high) / 2;
}
