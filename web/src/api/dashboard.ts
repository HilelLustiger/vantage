import type { SectorAllocation } from "@vantage/backend/dto";
import { apiClient } from "./client";

// FUTURE FEATURE — see the SectorAllocation comment in backend/src/dto/dashboard.ts.
// Not wired into any page yet; kept here so the contract exists once the
// data source is decided.
export const dashboardApi = {
  allocationBySector: (currency: string) =>
    apiClient.get<SectorAllocation>(
      `/api/dashboard/allocation-by-sector?currency=${encodeURIComponent(currency)}`,
    ),
};
