// Frankfurter (https://frankfurter.dev) — free, no API key, backed by ECB
// reference rates. Latest rate only; no historical lookups yet.
export async function getExchangeRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;

  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`exchange rate lookup failed: ${from}->${to} (${res.status})`);
  }
  const body = (await res.json()) as { rates?: Record<string, number> };
  const rate = body.rates?.[to];
  if (rate === undefined) {
    throw new Error(`no exchange rate for ${from}->${to}`);
  }
  return rate;
}

export async function convert(amount: number, from: string, to: string): Promise<number> {
  const rate = await getExchangeRate(from, to);
  return amount * rate;
}
