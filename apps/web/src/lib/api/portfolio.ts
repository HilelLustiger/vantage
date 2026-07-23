import type { CurrencyBreakdown, Portfolio, PortfolioByAsset, PortfolioHistory } from "@vantage/shared-types";
import { apiClient } from "../apiClient";

export const portfolioApi = {
  get: (currency: string) =>
    apiClient.get<Portfolio>(`/api/portfolio?currency=${encodeURIComponent(currency)}`),
  currencyBreakdown: (currency: string) =>
    apiClient.get<CurrencyBreakdown>(
      `/api/portfolio/currency-breakdown?currency=${encodeURIComponent(currency)}`,
    ),
  history: (currency: string) =>
    apiClient.get<PortfolioHistory>(
      `/api/portfolio/history?currency=${encodeURIComponent(currency)}`,
    ),
  // Native currency, never converted (ADR-0022) — no currency param.
  byAsset: () => apiClient.get<PortfolioByAsset>("/api/portfolio/by-asset"),
};
