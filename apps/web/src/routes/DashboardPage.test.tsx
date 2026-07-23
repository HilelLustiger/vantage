import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

const assets = [
  { id: "asset-1", type: "stock", name: "Existing Corp", ticker: "EX" },
  { id: "asset-2", type: "cash", name: "Cash ILS" },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}

function mockApi({
  portfolioByCurrency,
}: {
  portfolioByCurrency: Record<string, { status: number; body: unknown }>;
}) {
  const fetchMock = vi.fn(async (path: string) => {
    if (path === "/api/assets") return jsonResponse(assets);
    const match = path.match(/^\/api\/portfolio\?currency=(\w+)$/);
    if (match) {
      const entry = portfolioByCurrency[match[1]];
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

describe("DashboardPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders total net worth, allocation by type, and the per-asset table", async () => {
    mockApi({
      portfolioByCurrency: {
        ILS: {
          status: 200,
          body: {
            userId: "u1",
            lines: [
              { assetId: "asset-1", quantity: "10", value: "800", currency: "ILS" },
              { assetId: "asset-2", quantity: "200", value: "200", currency: "ILS" },
            ],
          },
        },
      },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("Existing Corp")).toBeDefined());
    expect(screen.getByText(/1,000/)).toBeDefined();
    expect(screen.getAllByText("stock").length).toBeGreaterThan(0);
    expect(screen.getAllByText("cash").length).toBeGreaterThan(0);
  });

  it("re-fetches the portfolio when the currency selector changes", async () => {
    const fetchMock = mockApi({
      portfolioByCurrency: {
        ILS: { status: 200, body: { userId: "u1", lines: [] } },
        USD: { status: 200, body: { userId: "u1", lines: [] } },
      },
    });
    renderPage();

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => path === "/api/portfolio?currency=ILS")).toBe(
        true,
      ),
    );

    await userEvent.selectOptions(screen.getByLabelText("Display currency"), "USD");

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([path]) => path === "/api/portfolio?currency=USD")).toBe(
        true,
      ),
    );
  });

  it("shows an empty state when there are no holdings", async () => {
    mockApi({
      portfolioByCurrency: { ILS: { status: 200, body: { userId: "u1", lines: [] } } },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/No holdings yet/)).toBeDefined());
  });

  it("shows an error banner when the portfolio endpoint fails", async () => {
    mockApi({
      portfolioByCurrency: {
        ILS: { status: 502, body: { error: "exchange rate lookup failed" } },
      },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("exchange rate lookup failed")).toBeDefined());
    expect(screen.queryByText(/No holdings yet/)).toBeNull();
  });
});
