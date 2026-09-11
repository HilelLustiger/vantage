import { Router } from "express";
import { z } from "zod";
import type { Institution } from "../dto/index.js";
import { createInstitution, findInstitutionById, listInstitutions } from "../db/institutions.js";
import { requireAuth } from "./requireAuth.js";

const createInstitutionSchema = z.object({
  name: z.string().min(1),
});

export const institutionsRouter = Router();

institutionsRouter.use(requireAuth);

institutionsRouter.post("/", async (req, res) => {
  const parsed = createInstitutionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }

  const institution = await createInstitution(parsed.data);
  res.status(201).json(institution satisfies Institution);
});

institutionsRouter.get("/", async (_req, res) => {
  res.status(200).json((await listInstitutions()) satisfies Institution[]);
});

institutionsRouter.get("/:id", async (req, res) => {
  const institution = await findInstitutionById(req.params.id);
  if (!institution) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.status(200).json(institution satisfies Institution);
});
