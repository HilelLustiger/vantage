import { Router } from "express";
import { z } from "zod";
import type { Portfolio } from "@vantage/shared-types";
import { getExchangeRate } from "../shared/exchangeRates.js";
import { listHoldingsForSnapshot } from "../shared/db/holdings.js";
import { aggregateHoldings, type ConvertedHolding } from "../shared/portfolioAggregation.js";
import { findLatestActiveSnapshotsForUser } from "../shared/db/snapshots.js";
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

  const snapshots = await findLatestActiveSnapshotsForUser(userId);

  const converted: ConvertedHolding[] = [];
  try {
    for (const snapshot of snapshots) {
      const holdings = await listHoldingsForSnapshot(snapshot.id);
      for (const holding of holdings) {
        const rate = await getExchangeRate(snapshot.asOfDate, holding.currency, displayCurrency);
        converted.push({
          assetId: holding.assetId,
          quantity: holding.quantity,
          value: holding.value,
          rate,
        });
      }
    }
  } catch (err) {
    // Exchange-rate lookup failed (Frankfurter unreachable, or no rate for
    // a needed date/pair) — a Portfolio total that silently excluded money
    // would be worse than an error.
    res
      .status(502)
      .json({ error: err instanceof Error ? err.message : "exchange rate lookup failed" });
    return;
  }

  const lines = aggregateHoldings(converted, displayCurrency);
  res.status(200).json({ userId, lines } satisfies Portfolio);
});
