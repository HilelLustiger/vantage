import type { User } from "@vantage/backend/dto";
import { apiClient } from "./client";

export const usersApi = {
  list: () => apiClient.get<Pick<User, "id" | "email">[]>("/api/users"),
};
