import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetCurrencyValue } from "@vantage/backend/dto";
import { AssetsPage } from "./AssetsPage";

const asset = { id: "asset-1", type: "stock", name: "Example Corp", ticker: "EX" };
const unheldAsset = { id: "asset-2", type: "cash", name: "Unheld Fund" };

interface TestAsset {
  id: string;
  type: string;
  name: string;
  ticker?: string;
}

// Full AssetCurrencyValue shape (#43) with sane defaults — individual
// tests only override the fields they care about.
function currencyValue(overrides: Partial<AssetCurrencyValue> = {}): AssetCurrencyValue {
  return {
    currency: "ILS",
    value: "1000",
    costBasis: "800",
    costBasisSource: "institution_stated",
    profit: "200",
    simpleReturnPct: 25,
    xirr: 0.1,
    taxOnProfit: "50",
    netOfTax: "950",
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}

function mockApi({
  assets = [asset],
  byAsset = [],
}: {
  assets?: TestAsset[];
  byAsset?: { assetId: string; quantity: string; valuesByCurrency: AssetCurrencyValue[] }[];
} = {}) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (path === "/api/assets" && method === "GET") return jsonResponse(assets);
    if (path === "/api/assets" && method === "POST") {
      const body = JSON.parse(init!.body as string);
      return jsonResponse({ id: "asset-new", ...body }, 201);
    }
    if (path === "/api/portfolio/by-asset" && method === "GET") {
      return jsonResponse({ userId: "u1", assets: byAsset });
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

  it("lists assets", async () => {
    mockApi();

    render(<AssetsPage />);

    await waitFor(() => expect(screen.getByText("Example Corp")).toBeDefined());
    expect(screen.getByText("(EX)")).toBeDefined();
  });

  it("shows an empty state when there are no assets", async () => {
    mockApi({ assets: [] });

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

  it("shows quantity and a native-currency value chip per currency held, no conversion", async () => {
    mockApi({
      byAsset: [
        {
          assetId: "asset-1",
          quantity: "15",
          valuesByCurrency: [
            currencyValue({ currency: "ILS", value: "1000" }),
            currencyValue({ currency: "USD", value: "500" }),
          ],
        },
      ],
    });

    render(<AssetsPage />);

    await waitFor(() => expect(screen.getByText("15")).toBeDefined());
    expect(screen.getByText(/₪1,000/)).toBeDefined();
    expect(screen.getByText(/\$500/)).toBeDefined();
  });

  it("shows a placeholder and no expand affordance for an Asset that isn't currently held", async () => {
    mockApi({ assets: [asset, unheldAsset], byAsset: [] });

    render(<AssetsPage />);

    await waitFor(() => expect(screen.getByText("Unheld Fund")).toBeDefined());
    const card = screen.getByText("Unheld Fund").closest("button") as HTMLButtonElement;
    expect(card.textContent).toContain("—");
    expect(card.disabled).toBe(true);
  });

  it("has no currency selector on this page", async () => {
    mockApi();

    render(<AssetsPage />);

    await waitFor(() => expect(screen.getByText("Example Corp")).toBeDefined());
    expect(screen.queryByLabelText("Display currency")).toBeNull();
  });

  it("expands a card to reveal profit/tax/return metrics, and collapses again", async () => {
    mockApi({
      byAsset: [
        {
          assetId: "asset-1",
          quantity: "15",
          valuesByCurrency: [
            currencyValue({ costBasis: "800", profit: "200", taxOnProfit: "50", netOfTax: "950" }),
          ],
        },
      ],
    });

    render(<AssetsPage />);
    await waitFor(() => expect(screen.getByText("Example Corp")).toBeDefined());

    expect(screen.queryByText("Cost basis")).toBeNull();

    await userEvent.click(screen.getByText("Example Corp").closest("button")!);
    expect(screen.getByText("Cost basis")).toBeDefined();
    expect(screen.getByText(/₪800/)).toBeDefined(); // cost basis
    expect(screen.getByText("Tax on profit")).toBeDefined();
    expect(screen.getByText("Net of tax")).toBeDefined();

    await userEvent.click(screen.getByText("Example Corp").closest("button")!);
    expect(screen.queryByText("Cost basis")).toBeNull();
  });

  it("shows no XIRR row when xirr is null (too new or uncomputable)", async () => {
    mockApi({
      byAsset: [
        { assetId: "asset-1", quantity: "15", valuesByCurrency: [currencyValue({ xirr: null })] },
      ],
    });

    render(<AssetsPage />);
    await waitFor(() => expect(screen.getByText("Example Corp")).toBeDefined());
    await userEvent.click(screen.getByText("Example Corp").closest("button")!);

    expect(screen.queryByText("XIRR")).toBeNull();
  });

  it("formats simpleReturnPct and xirr with their independent conventions (simpleReturnPct already a %, xirr a fraction)", async () => {
    mockApi({
      byAsset: [
        {
          assetId: "asset-1",
          quantity: "15",
          valuesByCurrency: [currencyValue({ simpleReturnPct: 25, xirr: 0.1 })],
        },
      ],
    });

    render(<AssetsPage />);
    await waitFor(() => expect(screen.getByText("Example Corp")).toBeDefined());
    await userEvent.click(screen.getByText("Example Corp").closest("button")!);

    expect(screen.getByText("25.0%")).toBeDefined(); // simpleReturnPct: 25 -> "25.0%", not "2500.0%"
    expect(screen.getByText("10.0%")).toBeDefined(); // xirr: 0.1 -> "10.0%", not "0.1%"
  });
});
