import type { Asset, AssetType } from "@vantage/backend/dto";
import { apiClient } from "../apiClient";

export const assetsApi = {
  list: () => apiClient.get<Asset[]>("/api/assets"),
  create: (input: { type: AssetType; name: string; ticker?: string; isin?: string }) =>
    apiClient.post<Asset>("/api/assets", input),
};
