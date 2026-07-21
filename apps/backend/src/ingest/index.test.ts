import { describe, expect, it } from "vitest";
import { ingest } from "./index.js";

describe("ingest.startImport", () => {
  it("is not yet implemented (real logic lands in M3)", async () => {
    await expect(ingest.startImport("doc-1")).rejects.toThrow(
      "not implemented",
    );
  });
});
