import { Router } from "express";
import { z } from "zod";
import type { CurrencyBreakdown, Portfolio, PortfolioByAsset, PortfolioHistory } from "@vantage/shared-types";
import { aggregateByCurrency, aggregateHoldings } from "../shared/portfolioAggregation.js";
import { gatherLatestConvertedHoldings } from "../shared/portfolioGathering.js";
import { computePortfolioByAsset } from "../shared/portfolioByAsset.js";
import { computePortfolioHistory } from "../shared/portfolioHistory.js";
import { requireAuth } from "./requireAuth.js";

const querySchema = z.object({
  currency: z.string().length(3).optional(),
});

export const portfolioRouter = Router();

portfolioRouter.use(requireAuth);

portfolioRouter.get("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }
  const displayCurrency = parsed.data.currency ?? "ILS";
  const userId = req.session.userId!;

  try {
    const converted = await gatherLatestConvertedHoldings(userId, displayCurrency);
    const lines = aggregateHoldings(converted, displayCurrency);
    res.status(200).json({ userId, lines } satisfies Portfolio);
  } catch (err) {
    // Exchange-rate lookup failed (Frankfurter unreachable, or no rate for
    // a needed date/pair) — a Portfolio total that silently excluded money
    // would be worse than an error.
    res
      .status(502)
      .json({ error: err instanceof Error ? err.message : "exchange rate lookup failed" });
  }
});

portfolioRouter.get("/currency-breakdown", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }
  const displayCurrency = parsed.data.currency ?? "ILS";
  const userId = req.session.userId!;

  try {
    const converted = await gatherLatestConvertedHoldings(userId, displayCurrency);
    const lines = aggregateByCurrency(converted);
    res.status(200).json({ userId, lines } satisfies CurrencyBreakdown);
  } catch (err) {
    res
      .status(502)
      .json({ error: err instanceof Error ? err.message : "exchange rate lookup failed" });
  }
});

portfolioRouter.get("/history", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }
  const displayCurrency = parsed.data.currency ?? "ILS";
  const userId = req.session.userId!;

  try {
    const points = await computePortfolioHistory(userId, displayCurrency);
    res.status(200).json({ userId, points } satisfies PortfolioHistory);
  } catch (err) {
    res
      .status(502)
      .json({ error: err instanceof Error ? err.message : "exchange rate lookup failed" });
  }
});

// No currency param — native currency, never converted (ADR-0022), so no
// FX lookups and no 502-on-FX-failure path.
portfolioRouter.get("/by-asset", async (req, res) => {
  const userId = req.session.userId!;
  const assets = await computePortfolioByAsset(userId);
  res.status(200).json({ userId, assets } satisfies PortfolioByAsset);
});
