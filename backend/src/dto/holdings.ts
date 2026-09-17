import { z } from "zod";
import type { AssetType } from "./assets.js";

// Wire input (query params) for GET /api/holdings and /api/holdings/history
// — the single source of truth (see ADR 0009).
export const HoldingsQuerySchema = z.object({ currency: z.string().length(3) });
export type HoldingsQuery = z.infer<typeof HoldingsQuerySchema>;

export type FreshnessTier = "live" | "recent" | "aging" | "stale";

// The day-count -> tier grading is a business rule, decided server-side —
// the frontend only ever renders whichever tier it's given.
export type Freshness =
  | { tier: "live"; updatedSecondsAgo: number }
  | { tier: "recent" | "aging" | "stale"; asOfDate: string; daysAgo: number };

export interface HoldingChartPoint {
  date: string;
  value: string;
  costBasis: string;
}

export interface OpenHoldingDetail {
  status: "open";
  // Present only when a value-vs-cost-basis series is meaningful (not for
  // fixed-rate deposits — see the mockup's own rationale for omitting the
  // chart there).
  chart?: HoldingChartPoint[];
  costBasis: string;
  profit: string;
  /** null when costBasis is 0 — not meaningful, not 0%/Infinity/NaN. */
  returnPct: number | null;
  taxOnProfit: string;
  /** Money-weighted, annualized return. Absent for fixed-rate deposits, which show annualRatePct instead. */
  xirr?: number | null;
  /** Fixed-rate deposits only. */
  annualRatePct?: number;
}

export interface ClosedHoldingDetail {
  status: "closed";
  heldFrom: string;
  heldTo: string;
  costBasis: string;
  soldFor: string;
  realizedProfit: string;
  realizedReturnPct: number;
}

export type HoldingDetail = OpenHoldingDetail | ClosedHoldingDetail;

// One row of the Assets table, fully resolved — everything the row and its
// expanded detail need arrives in one response, no follow-up fetch per row.
// Also the sole source the Dashboard's aggregate cards (total value,
// live/statement split, real profit, allocation by type, by-currency
// breakdown) are computed from client-side — group-by/sum over these rows,
// not a separate portfolio-summary query. Hence both `value` (converted to
// whatever currency was requested) and `nativeValue`/`nativeCurrency`
// (unconverted, for the "By currency" split, which is meaningless once
// everything's already in one currency).
export interface HoldingRow {
  assetId: string;
  name: string;
  ticker?: string;
  type: AssetType;
  nativeCurrency: string;
  nativeValue: string | null;
  value: string | null;
  freshness: Freshness;
  quantity: string | null;
  closedOn?: string;
  detail: HoldingDetail;
}
