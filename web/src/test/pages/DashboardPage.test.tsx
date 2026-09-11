import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

const assets = [
  { id: "asset-1", type: "stock", name: "Existing Corp", ticker: "EX" },
  { id: "asset-2", type: "cash", name: "Cash ILS" },
];

const defaultPortfolio = {
  userId: "u1",
  lines: [
    { assetId: "asset-1", quantity: "10", value: "800", currency: "ILS" },
    { assetId: "asset-2", quantity: "200", value: "200", currency: "ILS" },
  ],
};
const defaultBreakdown = {
  userId: "u1",
  lines: [{ currency: "ILS", value: "1000", percentageOfPortfolio: 100 }],
};
const defaultHistory = {
  userId: "u1",
  points: [
    { date: "2026-01-01", value: "900" },
    { date: "2026-02-01", value: "1000" },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}

function mockApi({
  portfolio = { ILS: { status: 200, body: defaultPortfolio } },
  breakdown = { ILS: { status: 200, body: defaultBreakdown } },
  history = { ILS: { status: 200, body: defaultHistory } },
}: {
  portfolio?: Record<string, { status: number; body: unknown }>;
  breakdown?: Record<string, { status: number; body: unknown }>;
  history?: Record<string, { status: number; body: unknown }>;
} = {}) {
  const fetchMock = vi.fn(async (path: string) => {
    if (path === "/api/assets") return jsonResponse(assets);

    let match = path.match(/^\/api\/portfolio\?currency=(\w+)$/);
    if (match) {
      const entry = portfolio[match[1]];
      if (!entry) throw new Error(`unexpected currency: ${match[1]}`);
      return jsonResponse(entry.body, entry.status);
    }

    match = path.match(/^\/api\/portfolio\/currency-breakdown\?currency=(\w+)$/);
    if (match) {
      const entry = breakdown[match[1]];
      if (!entry) throw new Error(`unexpected currency: ${match[1]}`);
      return jsonResponse(entry.body, entry.status);
    }

    match = path.match(/^\/api\/portfolio\/history\?currency=(\w+)$/);
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

  it("renders total net worth, the allocation legend, and the currency breakdown", async () => {
    mockApi();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Total net worth").nextSibling?.textContent).toMatch(/1,000/),
    );
    expect(screen.getAllByText(/stock/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/cash/).length).toBeGreaterThan(0);
    expect(screen.getByText("Currency breakdown")).toBeDefined();
    expect(screen.getAllByText(/ILS/).length).toBeGreaterThan(0);
    expect(screen.getByText("Net worth over time")).toBeDefined();
  });

  it("re-fetches all 3 endpoints when the currency selector changes", async () => {
    const fetchMock = mockApi({
      portfolio: {
        ILS: { status: 200, body: defaultPortfolio },
        USD: { status: 200, body: { userId: "u1", lines: [] } },
      },
      breakdown: {
        ILS: { status: 200, body: defaultBreakdown },
        USD: { status: 200, body: { userId: "u1", lines: [] } },
      },
      history: {
        ILS: { status: 200, body: defaultHistory },
        USD: { status: 200, body: { userId: "u1", points: [] } },
      },
    });
    renderPage();

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => path === "/api/portfolio?currency=ILS")).toBe(
        true,
      ),
    );

    await userEvent.selectOptions(screen.getByLabelText("Display currency"), "USD");

    await waitFor(() => {
      const paths = fetchMock.mock.calls.map(([p]) => p as string);
      expect(paths).toContain("/api/portfolio?currency=USD");
      expect(paths).toContain("/api/portfolio/currency-breakdown?currency=USD");
      expect(paths).toContain("/api/portfolio/history?currency=USD");
    });
  });

  it("shows an empty state when there are no holdings", async () => {
    mockApi({
      portfolio: { ILS: { status: 200, body: { userId: "u1", lines: [] } } },
      breakdown: { ILS: { status: 200, body: { userId: "u1", lines: [] } } },
      history: { ILS: { status: 200, body: { userId: "u1", points: [] } } },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/No holdings yet/)).toBeDefined());
  });

  it("shows an error banner only on the affected card when one endpoint fails", async () => {
    mockApi({
      history: { ILS: { status: 502, body: { error: "exchange rate lookup failed" } } },
    });
    renderPage();

    // Total net worth (from the still-healthy /api/portfolio) still renders.
    await waitFor(() =>
      expect(screen.getByText("Total net worth").nextSibling?.textContent).toMatch(/1,000/),
    );
    // The failing card shows its own error, without blanking the others.
    expect(screen.getByText("exchange rate lookup failed")).toBeDefined();
    expect(screen.getByText("Currency breakdown")).toBeDefined();
    expect(screen.queryByText(/No holdings yet/)).toBeNull();
  });
});
