import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewDocumentPage } from "../../pages/ReviewDocumentPage";

const documentId = "doc-1";
const asset = { id: "asset-1", type: "stock", name: "Existing Corp", ticker: "EX" };

const reviewPayload = {
  documentId,
  lines: [
    {
      index: 0,
      kind: "holding",
      assetName: "Already Matched Fund",
      quantity: "5",
      value: "500",
      currency: "ILS",
      resolvedAssetId: "asset-1",
    },
    {
      index: 1,
      kind: "holding",
      assetName: "Unrecognized Fund",
      quantity: "10",
      value: "1000",
      currency: "ILS",
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}

function mockApi({
  reviewStatus = 200,
  resolveResult,
}: {
  reviewStatus?: number;
  resolveResult?: { status: string; failureReason?: string };
} = {}) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (path === `/api/documents/${documentId}/review` && method === "GET") {
      return reviewStatus === 200
        ? jsonResponse(reviewPayload)
        : jsonResponse({ error: "not found" }, reviewStatus);
    }
    if (path === "/api/assets" && method === "GET") return jsonResponse([asset]);
    if (path === `/api/documents/${documentId}/resolve` && method === "POST") {
      if (!resolveResult) throw new Error("unexpected resolve call");
      return jsonResponse({
        id: documentId,
        accountId: "acc-1",
        status: resolveResult.status,
        checksum: "c1",
        format: "pdf",
        feature: "investments",
        uploadedAt: "2026-01-01T00:00:00.000Z",
        failureReason: resolveResult.failureReason,
      });
    }
    throw new Error(`unexpected fetch: ${method} ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/import/${documentId}/review`]}>
      <Routes>
        <Route path="/import" element={<div>import page</div>} />
        <Route path="/import/:documentId/review" element={<ReviewDocumentPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ReviewDocumentPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders matched lines read-only and unmatched lines as editable", async () => {
    mockApi();
    renderPage();

    await waitFor(() => expect(screen.getByText("Already Matched Fund")).toBeDefined());
    expect(screen.getByText(/Matched to Existing Corp/)).toBeDefined();
    expect(screen.getByText("Unrecognized Fund")).toBeDefined();
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("keeps Confirm disabled until the unmatched line is resolved", async () => {
    mockApi();
    renderPage();

    await waitFor(() => expect(screen.getByText("Unrecognized Fund")).toBeDefined());
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await userEvent.type(screen.getByRole("textbox"), "Existing Corp (EX)");
    await userEvent.click(await screen.findByRole("button", { name: "Existing Corp (EX)" }));

    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("submits a match resolution and navigates to /import on commit", async () => {
    const fetchMock = mockApi({ resolveResult: { status: "committed" } });
    renderPage();

    await waitFor(() => expect(screen.getByText("Unrecognized Fund")).toBeDefined());
    await userEvent.type(screen.getByRole("textbox"), "Existing Corp (EX)");
    await userEvent.click(await screen.findByRole("button", { name: "Existing Corp (EX)" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.getByText("import page")).toBeDefined());
    const resolveCall = fetchMock.mock.calls.find(
      ([path]) => path === `/api/documents/${documentId}/resolve`,
    )!;
    const body = JSON.parse((resolveCall[1] as RequestInit).body as string);
    expect(body.resolutions).toEqual([{ index: 1, kind: "holding", assetId: "asset-1" }]);
  });

  it("submits a create-new resolution and shows the failure reason if the commit fails", async () => {
    mockApi({
      resolveResult: { status: "failed", failureReason: "could not parse statement date" },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("Unrecognized Fund")).toBeDefined());
    await userEvent.type(screen.getByRole("textbox"), "Totally New Fund");
    await userEvent.click(await screen.findByRole("button", { name: 'Create "Totally New Fund"' }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.getByText(/could not parse statement date/)).toBeDefined());
  });

  it("shows a not-found message for a 404", async () => {
    mockApi({ reviewStatus: 404 });
    renderPage();

    await waitFor(() => expect(screen.getByText(/isn't waiting on review/)).toBeDefined());
  });
});
