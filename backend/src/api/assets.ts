import { Router } from "express";
import { z } from "zod";
import type { Asset } from "../dto/index.js";
import { createAsset, findAssetById, listAssets } from "../shared/db/assets.js";
import { requireAuth } from "./requireAuth.js";

const createAssetSchema = z.object({
  type: z.enum(["stock", "etf", "mutual_fund", "bond", "cash"]),
  name: z.string().min(1),
  ticker: z.string().min(1).optional(),
  isin: z.string().min(1).optional(),
  securityNumber: z.string().min(1).optional(),
});

export const assetsRouter = Router();

assetsRouter.use(requireAuth);

assetsRouter.post("/", async (req, res) => {
  const parsed = createAssetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }

  const asset = await createAsset(parsed.data);
  res.status(201).json(asset satisfies Asset);
});

assetsRouter.get("/", async (_req, res) => {
  res.status(200).json((await listAssets()) satisfies Asset[]);
});

assetsRouter.get("/:id", async (req, res) => {
  const asset = await findAssetById(req.params.id);
  if (!asset) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.status(200).json(asset satisfies Asset);
});
