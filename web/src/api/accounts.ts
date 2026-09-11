import type { Account } from "@vantage/backend/dto";
import { apiClient } from "../apiClient";

export const accountsApi = {
  list: () => apiClient.get<Account[]>("/api/accounts"),
  create: (input: { institutionId: string; name: string; ownerUserIds?: string[] }) =>
    apiClient.post<Account>("/api/accounts", input),
};
