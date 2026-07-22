import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readDocumentFile, saveDocumentFile } from "./storage.js";

describe("saveDocumentFile / readDocumentFile", () => {
  it("round-trips the exact bytes written", async () => {
    const documentId = randomUUID();
    const original = Buffer.from("not a real pdf, just some bytes");

    await saveDocumentFile(documentId, original);

    await expect(readDocumentFile(documentId)).resolves.toEqual(original);
  });

  it("rejects for a document that was never saved", async () => {
    await expect(readDocumentFile(randomUUID())).rejects.toThrow();
  });
});
