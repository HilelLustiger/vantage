import type { Asset, NewAssetInput } from "@vantage/backend/dto";
import { apiClient } from "./client";

// Asset identity only (name/ticker/type) — used by the asset picker on the
// Review page and by "create a new asset" flows. Valuation lives in
// holdingsApi, not here.
export const assetsApi = {
  list: () => apiClient.get<Asset[]>("/api/assets"),
  create: (input: NewAssetInput) => apiClient.post<Asset>("/api/assets", input),
};
