import { z } from "zod";

export interface Institution {
  id: string;
  name: string;
}

export interface HouseholdUser {
  id: string;
  email: string;
}

export interface Account {
  id: string;
  name: string;
  institutionId: string;
  // Denormalized so the Accounts page never has to join institutions/users
  // client-side just to render a row.
  institutionName: string;
  ownerUserIds: string[];
  ownerEmails: string[];
}

// Wire input for POST /api/accounts — the single source of truth (see ADR
// 0009). Exactly one of institutionId (existing) or newInstitutionName
// (create inline) — one round trip instead of create-institution-then-
// create-account.
export const CreateAccountInputSchema = z
  .object({
    name: z.string().min(1),
    institutionId: z.string().min(1).optional(),
    newInstitutionName: z.string().min(1).optional(),
    ownerUserIds: z.array(z.string().min(1)).optional(),
  })
  .refine((v) => Boolean(v.institutionId) !== Boolean(v.newInstitutionName), {
    message: "exactly one of institutionId or newInstitutionName is required",
  });
export type CreateAccountInput = z.infer<typeof CreateAccountInputSchema>;
