import { Router } from "express";
import { z } from "zod";
import type {
  CurrencyBreakdown,
  Portfolio,
  PortfolioByAsset,
  PortfolioHistory,
} from "../dto/index.js";
import { aggregateByCurrency, aggregateHoldings } from "../shared/portfolioAggregation.js";
import { gatherLatestConvertedHoldings } from "../shared/portfolioGathering.js";
import { computePortfolioByAsset } from "../shared/portfolioByAsset.js";
import { computePortfolioHistory } from "../shared/portfolioHistory.js";
import { computeAssetCostBasisMetrics } from "../shared/assetCostBasis.js";
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
    // TODO(#59): real portfolio-level cost basis/profit (aggregate
    // computeAssetCostBasisMetrics, converted to displayCurrency) and a
    // real live/document split once valuationKind/live pricing exist —
    // everything is treated as document-based for now.
    const total = lines.reduce((sum, line) => sum + Number(line.value), 0);
    res.status(200).json({
      userId,
      lines,
      costBasis: "0",
      profit: "0",
      simpleReturnPct: null,
      liveValue: "0",
      documentValue: String(total),
    } satisfies Portfolio);
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
  const [holdingsByAsset, costBasisMetrics] = await Promise.all([
    computePortfolioByAsset(userId),
    computeAssetCostBasisMetrics(userId),
  ]);
  const metricsByKey = new Map(costBasisMetrics.map((m) => [`${m.assetId} ${m.currency}`, m]));

  // TODO(#59): real per-currency freshness (live-priced vs. the Holding's
  // own Snapshot asOfDate) and closed-position detection/realized metrics
  // once valuationKind/live pricing and the cash_flows-vs-current-holdings
  // walk exist — every entry is reported as an open, just-reviewed
  // document-priced Holding for now.
  const today = new Date().toISOString().slice(0, 10);

  const assets = holdingsByAsset.map((breakdown) => ({
    ...breakdown,
    valuesByCurrency: breakdown.valuesByCurrency.map((v) => {
      // Both functions walk the same gatherLatestHoldingsForUser(userId)
      // result, so a match always exists (#43).
      const metrics = metricsByKey.get(`${breakdown.assetId} ${v.currency}`)!;
      return {
        currency: v.currency,
        value: v.value,
        costBasis: metrics.costBasis,
        costBasisSource: metrics.costBasisSource,
        profit: metrics.profit,
        simpleReturnPct: metrics.simpleReturnPct,
        xirr: metrics.xirr,
        taxOnProfit: metrics.taxOnProfit,
        netOfTax: metrics.netOfTax,
        freshness: { kind: "document" as const, asOfDate: today, daysSinceStatement: 0 },
        status: "open" as const,
      };
    }),
  }));

  res.status(200).json({ userId, assets } satisfies PortfolioByAsset);
});
