import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient, ApiError } from "./apiClient";

describe("apiClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves with the parsed JSON body on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "1", email: "a@b.com" }),
      }),
    );

    await expect(apiClient.get("/api/auth/me")).resolves.toEqual({
      id: "1",
      email: "a@b.com",
    });
  });

  it("throws an ApiError with the server's message on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "invalid credentials" }),
      }),
    );

    await expect(apiClient.post("/api/auth/login", {})).rejects.toMatchObject({
      message: "invalid credentials",
      status: 401,
    });
    await expect(apiClient.post("/api/auth/login", {})).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("postForm sends the FormData body without forcing a JSON content-type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "doc-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.set("accountId", "acc-1");

    await expect(apiClient.postForm("/api/documents", formData)).resolves.toEqual({
      id: "doc-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents",
      expect.objectContaining({ method: "POST", body: formData }),
    );
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers).toBeUndefined();
  });

  it("postForm throws an ApiError on a non-2xx response, same as post/get", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid request" }),
      }),
    );

    await expect(apiClient.postForm("/api/documents", new FormData())).rejects.toMatchObject({
      message: "invalid request",
      status: 400,
    });
  });
});
