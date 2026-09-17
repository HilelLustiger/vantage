import { Router, type Request, type Response } from "express";
import type { Institution } from "../dto/index.js";
import { listInstitutions } from "../repositories/institutions.js";
import { requireAuth } from "./requireAuth.js";

// Read-only from the wire — institutions are only ever created inline via
// POST /api/accounts { newInstitutionName }, see controllers/accounts.ts.
// web/src/api/institutions.ts exposes no create() call.
export const institutionsRouter = Router();

institutionsRouter.use(requireAuth);

institutionsRouter.get("/", async (_req: Request, res: Response<Institution[]>) => {
  const response: Institution[] = await listInstitutions();
  res.status(200).json(response);
});
