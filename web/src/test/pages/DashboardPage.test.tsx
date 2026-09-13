import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HoldingRow, NetWorthHistory } from "@vantage/backend/dto";
import { DashboardPage } from "../../pages/DashboardPage";

const defaultHoldings: HoldingRow[] = [
  {
    assetId: "asset-1",
    name: "Existing Corp",
    ticker: "EX",
    type: "stock",
    nativeCurrency: "ILS",
    nativeValue: "800",
    value: "800",
    freshness: { tier: "live", updatedSecondsAgo: 5 },
    quantity: "10",
    detail: { status: "open", costBasis: "500", profit: "300", returnPct: 60, taxOnProfit: "75" },
  },
  {
    assetId: "asset-2",
    name: "Cash ILS",
    type: "cash",
    nativeCurrency: "ILS",
    nativeValue: "200",
    value: "200",
    freshness: { tier: "recent", asOfDate: "2026-01-01", daysAgo: 3 },
    quantity: "200",
    detail: { status: "open", costBasis: "200", profit: "0", returnPct: 0, taxOnProfit: "0" },
  },
];

const defaultHistory: NetWorthHistory = [
  { date: "2026-01-01", portfolioValue: "900", costBasis: "700" },
  { date: "2026-02-01", portfolioValue: "1000", costBasis: "700" },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}

function mockApi({
  holdings = { ILS: { status: 200, body: defaultHoldings } },
  history = { ILS: { status: 200, body: defaultHistory } },
}: {
  holdings?: Record<string, { status: number; body: unknown }>;
  history?: Record<string, { status: number; body: unknown }>;
} = {}) {
  const fetchMock = vi.fn(async (path: string) => {
    let match = path.match(/^\/api\/holdings\?currency=(\w+)$/);
    if (match) {
      const entry = holdings[match[1]];
      if (!entry) throw new Error(`unexpected currency: ${match[1]}`);
      return jsonResponse(entry.body, entry.status);
    }

    match = path.match(/^\/api\/holdings\/history\?currency=(\w+)$/);
    if (match) {
      const entry = history[match[1]];
      if (!entry) throw new Error(`unexpected currency: ${match[1]}`);
      return jsonResponse(entry.body, entry.status);
    }

    throw new Error(`unexpected fetch: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders total net worth, the allocation legend, and the currency breakdown — all derived from holdings", async () => {
    mockApi();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Total net worth").nextSibling?.textContent).toMatch(/1,000/),
    );
    expect(screen.getAllByText(/stock/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/cash/).length).toBeGreaterThan(0);
    expect(screen.getByText("By currency")).toBeDefined();
    expect(screen.getAllByText(/ILS/).length).toBeGreaterThan(0);
    expect(screen.getByText("Net worth over time")).toBeDefined();
  });

  it("re-fetches holdings and history when the currency selector changes", async () => {
    const fetchMock = mockApi({
      holdings: {
        ILS: { status: 200, body: defaultHoldings },
        USD: { status: 200, body: [] },
      },
      history: {
        ILS: { status: 200, body: defaultHistory },
        USD: { status: 200, body: [] },
      },
    });
    renderPage();

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => path === "/api/holdings?currency=ILS")).toBe(
        true,
      ),
    );

    await userEvent.selectOptions(screen.getByLabelText("Display currency"), "USD");

    await waitFor(() => {
      const paths = fetchMock.mock.calls.map(([p]) => p as string);
      expect(paths).toContain("/api/holdings?currency=USD");
      expect(paths).toContain("/api/holdings/history?currency=USD");
    });
  });

  it("shows an empty state when there are no holdings", async () => {
    mockApi({
      holdings: { ILS: { status: 200, body: [] } },
      history: { ILS: { status: 200, body: [] } },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/No holdings yet/)).toBeDefined());
  });

  it("shows an error banner only on the affected card when one endpoint fails", async () => {
    mockApi({
      history: { ILS: { status: 502, body: { error: "exchange rate lookup failed" } } },
    });
    renderPage();

    // Total net worth (from the still-healthy /api/holdings) still renders.
    await waitFor(() =>
      expect(screen.getByText("Total net worth").nextSibling?.textContent).toMatch(/1,000/),
    );
    // The failing card shows its own error, without blanking the others.
    expect(screen.getByText("exchange rate lookup failed")).toBeDefined();
    expect(screen.getByText("By currency")).toBeDefined();
    expect(screen.queryByText(/No holdings yet/)).toBeNull();
  });
});
