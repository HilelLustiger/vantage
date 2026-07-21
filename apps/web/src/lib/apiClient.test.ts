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
});
