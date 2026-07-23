import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetsPage } from "./AssetsPage";

const asset = { id: "asset-1", type: "stock", name: "Example Corp", ticker: "EX" };
const unheldAsset = { id: "asset-2", type: "cash", name: "Unheld Fund" };

interface TestAsset {
  id: string;
  type: string;
  name: string;
  ticker?: string;
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}

function mockApi({
  assets = [asset],
  byAsset = [],
}: {
  assets?: TestAsset[];
  byAsset?: { assetId: string; quantity: string; valuesByCurrency: { currency: string; value: string }[] }[];
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
    expect(screen.getByText("EX")).toBeDefined();
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
            { currency: "ILS", value: "1000" },
            { currency: "USD", value: "500" },
          ],
        },
      ],
    });

    render(<AssetsPage />);

    await waitFor(() => expect(screen.getByText("15")).toBeDefined());
    expect(screen.getByText(/₪1,000/)).toBeDefined();
    expect(screen.getByText(/\$500/)).toBeDefined();
  });

  it("shows dashes for an Asset that isn't currently held", async () => {
    mockApi({ assets: [asset, unheldAsset], byAsset: [] });

    render(<AssetsPage />);

    await waitFor(() => expect(screen.getByText("Unheld Fund")).toBeDefined());
    const row = screen.getByText("Unheld Fund").closest("tr")!;
    expect(row.textContent).toContain("—");
  });

  it("has no currency selector on this page", async () => {
    mockApi();

    render(<AssetsPage />);

    await waitFor(() => expect(screen.getByText("Example Corp")).toBeDefined());
    expect(screen.queryByLabelText("Display currency")).toBeNull();
  });
});
