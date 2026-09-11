import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@vantage/backend/dto";
import { apiClient } from "./apiClient";

type AuthedUser = Pick<User, "id" | "email">;

interface AuthContextValue {
  user: AuthedUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<AuthedUser>("/api/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const authedUser = await apiClient.post<AuthedUser>("/api/auth/login", {
      email,
      password,
    });
    setUser(authedUser);
  }

  async function logout() {
    await apiClient.post("/api/auth/logout");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook belongs with its provider
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
