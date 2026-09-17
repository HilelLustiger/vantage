import type { Institution } from "@vantage/backend/dto";
import { apiClient } from "./client";

// Suggestions for the "Add account" institution combobox.
export const institutionsApi = {
  list: () => apiClient.get<Institution[]>("/api/institutions"),
};
