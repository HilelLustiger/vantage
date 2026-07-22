// The api <-> ingest contract — see ADR 0002 and ADR 0003.
import { findActiveDuplicate, findDocumentById } from "../shared/db/documents.js";
import { readDocumentFile } from "../shared/storage.js";
import { storeParsedData, transitionDocument, transitionDocumentWithFailure } from "./documents.js";
import { parseDocument } from "./parserClient.js";

export interface IngestModule {
  startImport(documentId: string): Promise<void>;
}

export const ingest: IngestModule = {
  async startImport(documentId: string): Promise<void> {
    const document = await findDocumentById(documentId);
    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }
    if (document.status !== "uploaded") {
      throw new Error(
        `Document ${documentId} is "${document.status}", expected "uploaded"`,
      );
    }

    const duplicate = await findActiveDuplicate(
      document.accountId,
      document.checksum,
      document.id,
    );
    if (duplicate) {
      await transitionDocument(documentId, "duplicate");
      return;
    }

    await transitionDocument(documentId, "processing");

    const file = await readDocumentFile(documentId);
    const result = await parseDocument(file, document.format);
    if (!result.ok) {
      await transitionDocumentWithFailure(documentId, result.reason);
      return;
    }

    // Not driven any further than this: needs_review (#20 — Asset
    // resolution) and committed (#21 — Snapshot/Holding creation) both
    // require pipeline stages that don't exist yet. Document stays
    // "processing" with its parsed data stashed until they do.
    await storeParsedData(documentId, result.data);
  },
};
