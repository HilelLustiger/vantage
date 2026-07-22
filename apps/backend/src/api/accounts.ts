import { Router } from "express";
import { z } from "zod";
import type { Account } from "@vantage/shared-types";
import {
  createAccountWithOwners,
  findAccountVisibleToUser,
  listAccountsForUser,
} from "../shared/db/accounts.js";
import { findInstitutionById } from "../shared/db/institutions.js";
import { findUserById } from "../shared/db/users.js";
import { requireAuth } from "./requireAuth.js";

const createAccountSchema = z.object({
  institutionId: z.string().min(1),
  name: z.string().min(1),
  ownerUserIds: z.array(z.string().min(1)).optional(),
});

export const accountsRouter = Router();

accountsRouter.use(requireAuth);

accountsRouter.post("/", async (req, res) => {
  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }

  const institution = await findInstitutionById(parsed.data.institutionId);
  if (!institution) {
    res.status(400).json({ error: "institution not found" });
    return;
  }

  // Creator is always an owner, plus whichever other users were listed
  // (for a joint account) — see docs/PLAN.md's #13 design notes.
  const ownerUserIds = [
    ...new Set([req.session.userId!, ...(parsed.data.ownerUserIds ?? [])]),
  ];
  for (const userId of ownerUserIds) {
    if (!(await findUserById(userId))) {
      res.status(400).json({ error: `user not found: ${userId}` });
      return;
    }
  }

  const account = await createAccountWithOwners({
    institutionId: parsed.data.institutionId,
    name: parsed.data.name,
    ownerUserIds,
  });
  res.status(201).json(account satisfies Account);
});

accountsRouter.get("/", async (req, res) => {
  res
    .status(200)
    .json((await listAccountsForUser(req.session.userId!)) satisfies Account[]);
});

accountsRouter.get("/:id", async (req, res) => {
  const account = await findAccountVisibleToUser(req.params.id, req.session.userId!);
  if (!account) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.status(200).json(account satisfies Account);
});
