// Read-time currency conversion — see ADR-0012. Frankfurter needs no API
// key; every rate fetched is cached locally (fx_rates) so each
// (date, from, to) is looked up only once. Cached by the *requested* date,
// not whatever nearby trading day Frankfurter substitutes internally, so
// repeated lookups for the same date stay predictable and hit the cache.
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { fxRates } from "../db/schema.js";

export async function getExchangeRate(date: string, from: string, to: string): Promise<number> {
  if (from === to) return 1;

  const [cached] = await db
    .select()
    .from(fxRates)
    .where(and(eq(fxRates.date, date), eq(fxRates.fromCurrency, from), eq(fxRates.toCurrency, to)));
  if (cached) return Number(cached.rate);

  const response = await fetch(`https://api.frankfurter.dev/v1/${date}?base=${from}&symbols=${to}`);
  if (!response.ok) {
    throw new Error(`Frankfurter returned HTTP ${response.status} for ${from}->${to} on ${date}`);
  }
  const body = (await response.json()) as { rates?: Record<string, number> };
  const rate = body.rates?.[to];
  if (rate === undefined) {
    throw new Error(`Frankfurter did not return a rate for ${from}->${to} on ${date}`);
  }

  await db
    .insert(fxRates)
    .values({ date, fromCurrency: from, toCurrency: to, rate: String(rate) })
    .onConflictDoNothing();
  return rate;
}
