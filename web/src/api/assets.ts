import type { Asset, AssetHistory, AssetType } from "@vantage/backend/dto";
import { apiClient } from "./client";

export const assetsApi = {
  list: () => apiClient.get<Asset[]>("/api/assets"),
  create: (input: { type: AssetType; name: string; ticker?: string; isin?: string }) =>
    apiClient.post<Asset>("/api/assets", input),
  // Value-vs-cost-basis series for one Asset's expanded chart — see ADR
  // 0006. Not implemented by `backend` yet (see docs/ADR/0005..., Phase 3
  // of the valuation-duality plan); the web is built against this target
  // shape ahead of that.
  history: (assetId: string) => apiClient.get<AssetHistory>(`/api/assets/${assetId}/history`),
};
