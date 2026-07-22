// The api <-> ingest contract — see ADR 0002 and ADR 0003.
import { findActiveDuplicate, findDocumentById } from "../shared/db/documents.js";
import { transitionDocument } from "./documents.js";

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

    // Parsing itself (what actually happens during "processing") is #19
    // (parser dispatch registry) — this just makes the transition available.
    await transitionDocument(documentId, "processing");
  },
};
