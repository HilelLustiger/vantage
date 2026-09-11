import type { Institution } from "@vantage/backend/dto";
import { apiClient } from "../apiClient";

export const institutionsApi = {
  list: () => apiClient.get<Institution[]>("/api/institutions"),
  create: (input: { name: string }) => apiClient.post<Institution>("/api/institutions", input),
};
