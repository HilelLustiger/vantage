import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDocument } from "./parserClient.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseDocument", () => {
  it("posts format and file as multipart form data, no institution field", async () => {
    let capturedBody: FormData | undefined;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      capturedBody = init.body as FormData;
      return new Response(JSON.stringify({ ok: true, data: { holdings: [] } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    process.env.PARSER_URL = "http://parser:8000";

    await parseDocument(Buffer.from("pdf bytes"), "pdf");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://parser:8000/parse",
      expect.objectContaining({ method: "POST" }),
    );
    expect(capturedBody).toBeInstanceOf(FormData);
    expect(capturedBody!.get("format")).toBe("pdf");
    expect(capturedBody!.get("file")).toBeInstanceOf(Blob);
    expect(capturedBody!.has("institution")).toBe(false);
  });

  it("passes through a successful parse result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, data: { holdings: [1] } }))),
    );

    await expect(parseDocument(Buffer.from("x"), "pdf")).resolves.toEqual({
      ok: true,
      data: { holdings: [1] },
    });
  });

  it("passes through a needs-review parse result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              ok: false,
              needsReview: true,
              values: { endingBalance: null },
              failedChecks: [
                { name: "endingBalance", computed: null, claimed: null, matched: false },
              ],
            }),
          ),
      ),
    );

    await expect(parseDocument(Buffer.from("x"), "pdf")).resolves.toEqual({
      ok: false,
      needsReview: true,
      values: { endingBalance: null },
      failedChecks: [{ name: "endingBalance", computed: null, claimed: null, matched: false }],
    });
  });

  it("passes through a failed parse result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ok: false, reason: "no matching parser" })),
      ),
    );

    await expect(parseDocument(Buffer.from("x"), "pdf")).resolves.toEqual({
      ok: false,
      reason: "no matching parser",
    });
  });

  it("resolves to ok:false, not a rejection, when the service is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );

    const result = await parseDocument(Buffer.from("x"), "pdf");

    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toContain("fetch failed");
  });

  it("resolves to ok:false on a non-2xx HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("internal error", { status: 500 })),
    );

    const result = await parseDocument(Buffer.from("x"), "pdf");

    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toContain("500");
  });
});
