import type { Portfolio } from "@vantage/shared-types";
import { apiClient } from "../apiClient";

export const portfolioApi = {
  get: (currency: string) =>
    apiClient.get<Portfolio>(`/api/portfolio?currency=${encodeURIComponent(currency)}`),
};
