import { Router, type Request, type Response } from "express";
import type { ErrorResponse, HoldingRow, NetWorthHistory } from "../dto/index.js";
import { HoldingsQuerySchema } from "../dto/holdings.js";
import { computeHoldingRows, computeNetWorthHistory } from "../services/holdings.js";
import { requireAuth } from "./requireAuth.js";

export const holdingsRouter = Router();

holdingsRouter.use(requireAuth);

holdingsRouter.get("/", async (req: Request, res: Response<HoldingRow[] | ErrorResponse>) => {
  const parsed = HoldingsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const error: ErrorResponse = { error: "invalid request" };
    res.status(400).json(error);
    return;
  }

  try {
    const response: HoldingRow[] = await computeHoldingRows(parsed.data.currency);
    res.status(200).json(response);
  } catch (err) {
    // Exchange-rate/live-price lookup failed — a total that silently
    // excluded money would be worse than an error.
    const error: ErrorResponse = { error: err instanceof Error ? err.message : "lookup failed" };
    res.status(502).json(error);
  }
});

holdingsRouter.get(
  "/history",
  async (req: Request, res: Response<NetWorthHistory | ErrorResponse>) => {
    const parsed = HoldingsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const error: ErrorResponse = { error: "invalid request" };
      res.status(400).json(error);
      return;
    }

    try {
      const response: NetWorthHistory = await computeNetWorthHistory(parsed.data.currency);
      res.status(200).json(response);
    } catch (err) {
      const error: ErrorResponse = { error: err instanceof Error ? err.message : "lookup failed" };
      res.status(502).json(error);
    }
  },
);
