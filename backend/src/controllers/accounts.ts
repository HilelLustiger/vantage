import { Router, type Request, type Response } from "express";
import type { Account, ErrorResponse } from "../dto/index.js";
import { CreateAccountInputSchema } from "../dto/accounts.js";
import { createAccount, listAccounts } from "../repositories/accounts.js";
import { findInstitutionById } from "../repositories/institutions.js";
import { requireAuth } from "./requireAuth.js";

export const accountsRouter = Router();

accountsRouter.use(requireAuth);

accountsRouter.get("/", async (_req: Request, res: Response<Account[]>) => {
  const response: Account[] = await listAccounts();
  res.status(200).json(response);
});

accountsRouter.post("/", async (req: Request, res: Response<Account | ErrorResponse>) => {
  const parsed = CreateAccountInputSchema.safeParse(req.body);
  if (!parsed.success) {
    const error: ErrorResponse = { error: "invalid request" };
    res.status(400).json(error);
    return;
  }

  if (parsed.data.institutionId && !(await findInstitutionById(parsed.data.institutionId))) {
    const error: ErrorResponse = { error: "institution not found" };
    res.status(400).json(error);
    return;
  }

  const response: Account = await createAccount(parsed.data);
  res.status(201).json(response);
});
