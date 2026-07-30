// The api <-> ingest contract — see ADR 0002 and ADR 0003.
import { findActiveDuplicate, findDocumentById } from "../shared/db/documents.js";
import { readDocumentFile } from "../shared/storage.js";
import { resolveAssets } from "./assetResolution.js";
import {
  storeParsedData,
  storeResolvedHoldings,
  transitionDocument,
  transitionDocumentToNeedsReview,
  transitionDocumentToNeedsReviewForValidityFailure,
  transitionDocumentWithFailure,
} from "./documents.js";
import { parseDocument } from "./parserClient.js";
import { commitSnapshot } from "./snapshotCreation.js";

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
      if ("needsReview" in result) {
        await transitionDocumentToNeedsReviewForValidityFailure(
          documentId,
          result.values,
          result.failedChecks,
        );
        return;
      }
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

    await storeResolvedHoldings(documentId, resolution.resolvedAssetIds);

    const commit = await commitSnapshot(
      documentId,
      document.accountId,
      result.data,
      resolution.resolvedAssetIds,
    );
    if (!commit.ok) {
      await transitionDocumentWithFailure(documentId, commit.reason);
    }
  },
};
