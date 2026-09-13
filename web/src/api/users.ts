import type { HouseholdUser } from "@vantage/backend/dto";
import { apiClient } from "./client";

// The household's other members, for the "Add account" owners picker.
export const usersApi = {
  list: () => apiClient.get<HouseholdUser[]>("/api/users"),
};
