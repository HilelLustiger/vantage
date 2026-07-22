import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportPage } from "./ImportPage";

const account = { id: "acc-1", institutionId: "inst-1", name: "Brokerage", ownerUserIds: ["u1"] };

const existingDocuments = [
  {
    id: "doc-1",
    accountId: "acc-1",
    status: "committed",
    checksum: "c1",
    format: "pdf",
    feature: "investments",
    uploadedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "doc-2",
    accountId: "acc-1",
    status: "failed",
    checksum: "c2",
    format: "pdf",
    feature: "investments",
    uploadedAt: "2026-02-01T00:00:00.000Z",
    failureReason: "no matching parser (unrecognized institution)",
  },
];

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 300, status, json: async () => body };
}

function mockApi({
  documents = existingDocuments,
  uploadResult,
}: {
  documents?: typeof existingDocuments;
  uploadResult?: { ok: true; body: unknown } | { ok: false; status: number; body: unknown };
} = {}) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (path === "/api/accounts" && method === "GET") return jsonResponse([account]);
    if (path === "/api/documents" && method === "GET") return jsonResponse(documents);
    if (path === "/api/documents" && method === "POST") {
      if (!uploadResult) throw new Error("unexpected upload");
      return uploadResult.ok
        ? jsonResponse(uploadResult.body, 201)
        : jsonResponse(uploadResult.body, uploadResult.status);
    }
    throw new Error(`unexpected fetch: ${method} ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function pdfFile(name: string) {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

describe("ImportPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the status list with all statuses and the failure reason for failed rows", async () => {
    mockApi();

    render(<ImportPage />);

    await waitFor(() => expect(screen.getByText("committed")).toBeDefined());
    expect(screen.getByText("failed")).toBeDefined();
    expect(screen.getAllByText("Brokerage").length).toBeGreaterThan(0);
    expect(
      screen.getByText("no matching parser (unrecognized institution)"),
    ).toBeDefined();
  });

  it("shows an empty state when there are no documents", async () => {
    mockApi({ documents: [] });

    render(<ImportPage />);

    await waitFor(() => expect(screen.getByText("No documents yet.")).toBeDefined());
  });

  it("uploads a selected file against the selected account", async () => {
    const fetchMock = mockApi({
      uploadResult: {
        ok: true,
        body: { id: "doc-3", accountId: "acc-1", status: "committed", checksum: "c3", format: "pdf", feature: "investments", uploadedAt: "2026-03-01T00:00:00.000Z" },
      },
    });

    render(<ImportPage />);
    await waitFor(() => expect(screen.getByText("committed")).toBeDefined());

    const file = pdfFile("statement.pdf");
    await userEvent.upload(screen.getByLabelText("Upload statements"), file);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/documents",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const uploadCall = fetchMock.mock.calls.find(
      ([path, init]) => path === "/api/documents" && (init as RequestInit)?.method === "POST",
    )!;
    const body = (uploadCall[1] as RequestInit).body as FormData;
    expect(body.get("accountId")).toBe("acc-1");
    expect((body.get("file") as File).name).toBe("statement.pdf");

    await waitFor(() => expect(screen.getByText("statement.pdf")).toBeDefined());
  });

  it("shows an error message for a file that fails to upload", async () => {
    mockApi({
      uploadResult: { ok: false, status: 400, body: { error: "a PDF file is required" } },
    });

    render(<ImportPage />);
    await waitFor(() => expect(screen.getByText("committed")).toBeDefined());

    await userEvent.upload(screen.getByLabelText("Upload statements"), pdfFile("bad.pdf"));

    await waitFor(() => expect(screen.getByText("a PDF file is required")).toBeDefined());
  });
});
