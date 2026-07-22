import type { User } from "@vantage/shared-types";
import { apiClient } from "../apiClient";

export const usersApi = {
  list: () => apiClient.get<Pick<User, "id" | "email">[]>("/api/users"),
};
