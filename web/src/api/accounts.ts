import type { Account } from "@vantage/backend/dto";
import { apiClient } from "./client";

export const accountsApi = {
  list: () => apiClient.get<Account[]>("/api/accounts"),
  // Either institutionId (existing) or newInstitutionName (create inline) —
  // one round trip instead of create-institution-then-create-account.
  create: (input: {
    name: string;
    institutionId?: string;
    newInstitutionName?: string;
    ownerUserIds?: string[];
  }) => apiClient.post<Account>("/api/accounts", input),
};
