import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewDocumentPage } from "../../pages/ReviewDocumentPage";

const documentId = "doc-1";
const asset = { id: "asset-1", type: "stock", name: "Existing Corp", ticker: "EX" };

const reviewPayload = {
  reason: "extraction_review",
  failedChecks: [],
  asOfDate: "2026-01-01",
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

const bbox = { x0: 0, top: 0, x1: 100, bottom: 10 };

const contentReviewPayload = {
  reason: "content_review",
  pageWidth: 600,
  pageHeight: 800,
  lines: [
    { index: 0, status: "redacted", text: null, flagReason: null, bbox },
    { index: 1, status: "included", text: "Fund ABC 10 1500.00", flagReason: null, bbox },
    {
      index: 2,
      status: "flagged",
      text: "Jane Doe 123 456 789",
      flagReason: "looks like a name",
      bbox,
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}

// documentsApi.file() reads arrayBuffer(), not json() — the content_review
// screen loads this to render the page preview, but nothing in these tests
// depends on it actually parsing as a PDF (pdfjs-dist failing is caught and
// only affects the preview image, not the overlay buttons under test).
function fileResponse() {
  return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
}

function mockApi({
  reviewStatus = 200,
  review = reviewPayload,
  resolveResult,
}: {
  reviewStatus?: number;
  review?: unknown;
  resolveResult?: { status: string; failureReason?: string };
} = {}) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (path === `/api/documents/${documentId}/review` && method === "GET") {
      return reviewStatus === 200
        ? jsonResponse(review)
        : jsonResponse({ error: "not found" }, reviewStatus);
    }
    if (path === `/api/documents/${documentId}/file` && method === "GET") {
      return fileResponse();
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
    expect(screen.getByPlaceholderText("Search assets, or create a new one")).toBeDefined();
  });

  it("keeps Confirm disabled until every line is matched and its figures confirmed", async () => {
    mockApi();
    renderPage();

    await waitFor(() => expect(screen.getByText("Unrecognized Fund")).toBeDefined());
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await userEvent.type(
      screen.getByPlaceholderText("Search assets, or create a new one"),
      "Existing Corp (EX)",
    );
    await userEvent.click(await screen.findByRole("button", { name: "Existing Corp (EX)" }));
    // Matched now, but neither line's figures have been confirmed yet.
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    await userEvent.click(screen.getByRole("button", { name: "Confirm figures for line 0" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm figures for line 1" }));

    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("submits a match resolution and navigates to /import on commit", async () => {
    const fetchMock = mockApi({ resolveResult: { status: "committed" } });
    renderPage();

    await waitFor(() => expect(screen.getByText("Unrecognized Fund")).toBeDefined());
    await userEvent.type(
      screen.getByPlaceholderText("Search assets, or create a new one"),
      "Existing Corp (EX)",
    );
    await userEvent.click(await screen.findByRole("button", { name: "Existing Corp (EX)" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm figures for line 0" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm figures for line 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.getByText("import page")).toBeDefined());
    const resolveCall = fetchMock.mock.calls.find(
      ([path]) => path === `/api/documents/${documentId}/resolve`,
    )!;
    const body = JSON.parse((resolveCall[1] as RequestInit).body as string);
    expect(body.resolutions).toEqual([
      { index: 0, kind: "holding", value: "500", quantity: "5", currency: "ILS" },
      {
        index: 1,
        kind: "holding",
        assetId: "asset-1",
        value: "1000",
        quantity: "10",
        currency: "ILS",
      },
    ]);
  });

  it("submits a create-new resolution and shows the failure reason if the commit fails", async () => {
    mockApi({
      resolveResult: { status: "failed", failureReason: "could not parse statement date" },
    });
    renderPage();

    await waitFor(() => expect(screen.getByText("Unrecognized Fund")).toBeDefined());
    await userEvent.type(
      screen.getByPlaceholderText("Search assets, or create a new one"),
      "Totally New Fund",
    );
    await userEvent.click(await screen.findByRole("button", { name: 'Create "Totally New Fund"' }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm figures for line 0" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm figures for line 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.getByText(/could not parse statement date/)).toBeDefined());
  });

  it("shows a not-found message for a 404", async () => {
    mockApi({ reviewStatus: 404 });
    renderPage();

    await waitFor(() => expect(screen.getByText(/isn't waiting on review/)).toBeDefined());
  });

  describe("content_review", () => {
    it("defaults included lines to selected and flagged lines to unselected, and skips redacted lines entirely", async () => {
      mockApi({ review: contentReviewPayload });
      renderPage();

      // Line 0 is redacted (not selectable), line 1 defaults selected
      // ("included"), line 2 defaults unselected ("flagged").
      await waitFor(() => expect(screen.getByText(/1 of 2 regions will be sent/)).toBeDefined());
      expect(screen.queryByRole("button", { name: /Region 0/ })).toBeNull();
      expect(screen.getByRole("button", { name: /Region 1 \(send\)/ })).toBeDefined();
      expect(screen.getByRole("button", { name: /Region 2:.*\(attention\)/ })).toBeDefined();
    });

    it("toggles a flagged region in when clicked", async () => {
      mockApi({ review: contentReviewPayload });
      renderPage();

      await waitFor(() => expect(screen.getByRole("button", { name: /Region 2/ })).toBeDefined());
      await userEvent.click(screen.getByRole("button", { name: /Region 2/ }));

      expect(screen.getByText(/2 of 2 regions will be sent/)).toBeDefined();
      expect(screen.getByRole("button", { name: /Region 2:.*\(send\)/ })).toBeDefined();
    });

    it("confirms with the currently-selected indices", async () => {
      const fetchMock = mockApi({
        review: contentReviewPayload,
        resolveResult: { status: "committed" },
      });
      renderPage();

      await waitFor(() => expect(screen.getByRole("button", { name: /Region 1/ })).toBeDefined());
      // Only region 1 defaults selected; include the flagged region 2 too.
      await userEvent.click(screen.getByRole("button", { name: /Region 2/ }));
      await userEvent.click(screen.getByRole("button", { name: /Confirm and send 2 regions/ }));

      await waitFor(() => expect(screen.getByText("import page")).toBeDefined());
      const resolveCall = fetchMock.mock.calls.find(
        ([path]) => path === `/api/documents/${documentId}/resolve`,
      )!;
      const body = JSON.parse((resolveCall[1] as RequestInit).body as string);
      expect(body.resolutions).toEqual([{ approveContentReview: { includedIndices: [1, 2] } }]);
    });

    it("moves into extraction_review after a content_review approval that needs further review", async () => {
      // First GET /review returns content_review; after resolve reports
      // "needs_review", the page re-fetches and gets extraction_review.
      let reviewCallCount = 0;
      const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (path === `/api/documents/${documentId}/review` && method === "GET") {
          reviewCallCount += 1;
          return jsonResponse(reviewCallCount === 1 ? contentReviewPayload : reviewPayload);
        }
        if (path === `/api/documents/${documentId}/file` && method === "GET") {
          return fileResponse();
        }
        if (path === "/api/assets" && method === "GET") return jsonResponse([asset]);
        if (path === `/api/documents/${documentId}/resolve` && method === "POST") {
          return jsonResponse({
            id: documentId,
            accountId: "acc-1",
            status: "needs_review",
            checksum: "c1",
            uploadedAt: "2026-01-01T00:00:00.000Z",
          });
        }
        throw new Error(`unexpected fetch: ${method} ${path}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      renderPage();

      await waitFor(() => expect(screen.getByRole("button", { name: /Region 1/ })).toBeDefined());
      await userEvent.click(screen.getByRole("button", { name: /Confirm and send 1 regions/ }));

      await waitFor(() => expect(screen.getByText("Unrecognized Fund")).toBeDefined());
      expect(screen.getByText(/Matched to Existing Corp/)).toBeDefined();
    });
  });
});
