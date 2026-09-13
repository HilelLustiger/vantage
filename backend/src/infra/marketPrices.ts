// Alpha Vantage GLOBAL_QUOTE — https://www.alphavantage.co/documentation/#latestprice
// Requires ALPHA_VANTAGE_API_KEY. Only stock/etf Assets with a ticker are
// ever looked up here (see services/holdings.ts) — mutual funds, bonds, and
// cash are always document-priced regardless of this API's availability.
export async function getLivePrice(
  ticker: string,
): Promise<{ price: number; currency: string } | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;

  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const body = (await res.json()) as { "Global Quote"?: { "05. price"?: string } };
  const price = body["Global Quote"]?.["05. price"];
  if (!price) return null;

  // Alpha Vantage's GLOBAL_QUOTE doesn't report the listing currency —
  // assumed USD, true for the tickers this app deals with today. Revisit
  // if a non-USD-listed ticker needs live pricing.
  return { price: Number(price), currency: "USD" };
}
