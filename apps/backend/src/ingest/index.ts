// The api <-> ingest contract — see ADR 0002 and ADR 0003.
import { findActiveDuplicate, findDocumentById } from "../shared/db/documents.js";
import { readDocumentFile } from "../shared/storage.js";
import { resolveAssets } from "./assetResolution.js";
import {
  storeParsedData,
  storeResolvedHoldings,
  transitionDocument,
  transitionDocumentToNeedsReview,
  transitionDocumentWithFailure,
} from "./documents.js";
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

    await storeParsedData(documentId, result.data);

    const resolution = await resolveAssets(result.data);
    if (resolution === null) {
      // Recognized institution, but ingest couldn't understand the shape —
      // a real integration failure, not a "nothing matched" outcome.
      await transitionDocumentWithFailure(documentId, "parsed data was not in the expected shape");
      return;
    }
    if (resolution.hasUnmatched) {
      await transitionDocumentToNeedsReview(documentId, resolution.resolvedAssetIds);
      return;
    }

    // Not driven any further than this: committed (#21 — Snapshot/Holding
    // creation) requires a pipeline stage that doesn't exist yet. Document
    // stays "processing" with its resolved holdings stashed until it does.
    await storeResolvedHoldings(documentId, resolution.resolvedAssetIds);
  },
};
