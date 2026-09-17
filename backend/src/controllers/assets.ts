import { Router, type Request, type Response } from "express";
import type { Asset, ErrorResponse } from "../dto/index.js";
import { NewAssetInputSchema } from "../dto/assets.js";
import { createAsset, listAssets } from "../repositories/assets.js";
import { requireAuth } from "./requireAuth.js";

export const assetsRouter = Router();

assetsRouter.use(requireAuth);

assetsRouter.get("/", async (_req: Request, res: Response<Asset[]>) => {
  const response: Asset[] = await listAssets();
  res.status(200).json(response);
});

assetsRouter.post("/", async (req: Request, res: Response<Asset | ErrorResponse>) => {
  const parsed = NewAssetInputSchema.safeParse(req.body);
  if (!parsed.success) {
    const response: ErrorResponse = { error: "invalid request" };
    res.status(400).json(response);
    return;
  }

  const response: Asset = await createAsset(parsed.data);
  res.status(201).json(response);
});
