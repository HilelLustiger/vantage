import { afterEach, describe, expect, it, vi } from "vitest";
import { getExchangeRate } from "./exchangeRates.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

// The (date, from, to) cache is keyed in a real, persistent dev DB — a
// fixed date would collide with a previous test run's cached row. Picks a
// random date across a wide historical range instead of a small fixed set.
function uniqueDate(): string {
  return new Date(Date.now() - Math.floor(Math.random() * 1e12)).toISOString().slice(0, 10);
}

describe("getExchangeRate", () => {
  it("returns 1 for the same currency without a network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getExchangeRate("2026-03-31", "ILS", "ILS")).resolves.toBe(1);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches and caches on a cache miss", async () => {
    const date = uniqueDate();
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ amount: 1, base: "USD", date, rates: { ILS: 3.5 } })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rate = await getExchangeRate(date, "USD", "ILS");

    expect(rate).toBe(3.5);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.frankfurter.dev/v1/${date}?base=USD&symbols=ILS`,
    );
  });

  it("skips the network call on a cache hit", async () => {
    const date = uniqueDate();
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ amount: 1, base: "USD", date, rates: { ILS: 3.7 } })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await getExchangeRate(date, "USD", "ILS");
    fetchMock.mockClear();

    const rate = await getExchangeRate(date, "USD", "ILS");

    expect(rate).toBe(3.7);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad currency pair", { status: 404 })));

    await expect(getExchangeRate("2022-03-04", "USD", "XYZ")).rejects.toThrow("404");
  });

  it("throws when the response has no rate for the target currency", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ amount: 1, base: "USD", rates: {} }))),
    );

    await expect(getExchangeRate("2022-03-05", "USD", "ILS")).rejects.toThrow(
      "did not return a rate",
    );
  });
});
