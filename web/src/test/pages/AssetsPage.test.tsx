import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HoldingRow, OpenHoldingDetail } from "@vantage/backend/dto";
import { AssetsPage } from "../../pages/AssetsPage";

// Full HoldingRow shape with sane defaults — individual tests only override
// the fields they care about.
function holdingRow(overrides: Partial<HoldingRow> = {}): HoldingRow {
  const detail: OpenHoldingDetail = {
    status: "open",
    costBasis: "800",
    profit: "200",
    returnPct: 25,
    taxOnProfit: "50",
    xirr: 0.1,
  };
  return {
    assetId: "asset-1",
    name: "Example Corp",
    ticker: "EX",
    type: "stock",
    nativeCurrency: "ILS",
    nativeValue: "1000",
    value: "1000",
    freshness: { tier: "live", updatedSecondsAgo: 5 },
    quantity: "15",
    detail,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}

function mockApi({
  holdings = [holdingRow()],
}: {
  holdings?: HoldingRow[];
} = {}) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (path.startsWith("/api/holdings") && method === "GET") return jsonResponse(holdings);
    if (path === "/api/assets" && method === "GET") return jsonResponse([]);
    if (path === "/api/assets" && method === "POST") {
      const body = JSON.parse(init!.body as string);
      return jsonResponse({ id: "asset-new", ...body }, 201);
    }
    throw new Error(`unexpected fetch: ${method} ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("AssetsPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists holdings", async () => {
    mockApi();

    render(<AssetsPage />);

    await waitFor(() => expect(screen.getByText("Example Corp")).toBeDefined());
    expect(screen.getByText("(EX)")).toBeDefined();
  });

  it("shows an empty state when there are no holdings", async () => {
    mockApi({ holdings: [] });

    render(<AssetsPage />);

    await waitFor(() => expect(screen.getByText("No assets yet.")).toBeDefined());
  });

  it("creates a new asset", async () => {
    const fetchMock = mockApi();
    render(<AssetsPage />);
    await waitFor(() => expect(screen.getByText("Example Corp")).toBeDefined());

    await userEvent.click(screen.getByRole("button", { name: /add asset/i }));
    await userEvent.type(screen.getByLabelText("Name"), "New Fund");
    await userEvent.click(screen.getByRole("button", { name: "Create asset" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/assets",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("shows quantity and the (already converted) value", async () => {
    mockApi({ holdings: [holdingRow({ quantity: "15", value: "1000" })] });

    render(<AssetsPage />);

    await waitFor(() => expect(screen.getByText("15")).toBeDefined());
    expect(screen.getByText(/₪1,000/)).toBeDefined();
  });

  it("shows the freshness legend once holdings have loaded", async () => {
    mockApi();

    render(<AssetsPage />);

    await waitFor(() => expect(screen.getByText("Example Corp")).toBeDefined());
    expect(screen.getByText("Live market price")).toBeDefined();
    expect(screen.getByText("Closed, fully sold")).toBeDefined();
  });

  it("has no currency selector on this page", async () => {
    mockApi();

    render(<AssetsPage />);

    await waitFor(() => expect(screen.getByText("Example Corp")).toBeDefined());
    expect(screen.queryByLabelText("Display currency")).toBeNull();
  });

  it("expands a card to reveal profit/tax/return metrics, and collapses again", async () => {
    mockApi({
      holdings: [
        holdingRow({
          detail: {
            status: "open",
            costBasis: "800",
            profit: "200",
            returnPct: 25,
            taxOnProfit: "50",
            xirr: 0.1,
          },
        }),
      ],
    });

    render(<AssetsPage />);
    await waitFor(() => expect(screen.getByText("Example Corp")).toBeDefined());

    expect(screen.queryByText("Cost basis")).toBeNull();

    await userEvent.click(screen.getByText("Example Corp").closest("button")!);
    expect(screen.getByText("Cost basis")).toBeDefined();
    expect(screen.getByText(/₪800/)).toBeDefined(); // cost basis
    expect(screen.getByText("Tax on profit")).toBeDefined();

    await userEvent.click(screen.getByText("Example Corp").closest("button")!);
    expect(screen.queryByText("Cost basis")).toBeNull();
  });

  it("shows a Rate row instead of Tax on profit for a fixed-rate holding", async () => {
    mockApi({
      holdings: [
        holdingRow({
          assetId: "asset-3",
          name: "Bank Savings",
          type: "cash",
          quantity: null,
          detail: {
            status: "open",
            costBasis: "31200",
            profit: "700",
            returnPct: 2.2,
            taxOnProfit: "0",
            annualRatePct: 4.1,
          },
        }),
      ],
    });

    render(<AssetsPage />);
    await waitFor(() => expect(screen.getByText("Bank Savings")).toBeDefined());

    await userEvent.click(screen.getByText("Bank Savings").closest("button")!);
    expect(screen.getByText("Rate")).toBeDefined();
    expect(screen.queryByText("Tax on profit")).toBeNull();
  });

  it("shows no XIRR row when xirr is null (too new or uncomputable)", async () => {
    mockApi({
      holdings: [
        holdingRow({
          detail: {
            status: "open",
            costBasis: "800",
            profit: "200",
            returnPct: 25,
            taxOnProfit: "50",
            xirr: null,
          },
        }),
      ],
    });

    render(<AssetsPage />);
    await waitFor(() => expect(screen.getByText("Example Corp")).toBeDefined());
    await userEvent.click(screen.getByText("Example Corp").closest("button")!);

    expect(screen.queryByText("XIRR")).toBeNull();
  });

  it("formats returnPct and xirr with their independent conventions (returnPct already a %, xirr a fraction)", async () => {
    mockApi({
      holdings: [
        holdingRow({
          detail: {
            status: "open",
            costBasis: "800",
            profit: "200",
            returnPct: 25,
            taxOnProfit: "50",
            xirr: 0.1,
          },
        }),
      ],
    });

    render(<AssetsPage />);
    await waitFor(() => expect(screen.getByText("Example Corp")).toBeDefined());
    await userEvent.click(screen.getByText("Example Corp").closest("button")!);

    expect(screen.getByText("25.0%")).toBeDefined(); // returnPct: 25 -> "25.0%", not "2500.0%"
    expect(screen.getByText("10.0%")).toBeDefined(); // xirr: 0.1 -> "10.0%", not "0.1%"
  });

  it("shows a closed position's realized outcome instead of blending it into current totals", async () => {
    mockApi({
      holdings: [
        holdingRow({
          assetId: "asset-4",
          name: "Israeli TA-35 ETF",
          type: "etf",
          quantity: "0",
          value: null,
          nativeValue: null,
          closedOn: "2026-08-15",
          detail: {
            status: "closed",
            heldFrom: "2024-01",
            heldTo: "2026-08",
            costBasis: "22000",
            soldFor: "25400",
            realizedProfit: "3400",
            realizedReturnPct: 15.5,
          },
        }),
      ],
    });

    render(<AssetsPage />);
    await waitFor(() => expect(screen.getByText("Israeli TA-35 ETF")).toBeDefined());

    await userEvent.click(screen.getByText("Israeli TA-35 ETF").closest("button")!);
    expect(screen.getByText("Held")).toBeDefined();
    expect(screen.getByText("Sold for")).toBeDefined();
    expect(screen.getByText(/₪25,400/)).toBeDefined();
  });
});
