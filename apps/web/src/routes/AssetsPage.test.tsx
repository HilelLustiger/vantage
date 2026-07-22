import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetsPage } from "./AssetsPage";

const asset = { id: "asset-1", type: "stock", name: "Example Corp", ticker: "EX" };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}

function mockApi({ assets = [asset] }: { assets?: (typeof asset)[] } = {}) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (path === "/api/assets" && method === "GET") return jsonResponse(assets);
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
});
