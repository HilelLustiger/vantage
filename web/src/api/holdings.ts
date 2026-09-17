import type { HoldingRow, NetWorthHistory } from "@vantage/backend/dto";
import { apiClient } from "./client";

// This user's valuation of each Asset they hold — the Assets table's row
// and expanded-detail data, fully resolved in one response (ADR: the
// mockup's expand affordance is a UI reveal, not a lazy fetch boundary).
// Also what the Dashboard's aggregate cards are computed from — see the
// comment on HoldingRow in backend/src/dto/holdings.ts.
export const holdingsApi = {
  list: (currency: string) =>
    apiClient.get<HoldingRow[]>(`/api/holdings?currency=${encodeURIComponent(currency)}`),
  // Net worth over time — the one thing a snapshot of current holdings
  // can't answer, since it's a time series, not "now".
  history: (currency: string) =>
    apiClient.get<NetWorthHistory>(
      `/api/holdings/history?currency=${encodeURIComponent(currency)}`,
    ),
};
