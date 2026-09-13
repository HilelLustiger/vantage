import { z } from "zod";

export interface AuthedUser {
  id: string;
  email: string;
}

// Wire input for POST /api/auth/login — the single source of truth (see
// ADR 0009).
export const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;
