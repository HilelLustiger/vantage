import type { DocumentResolution, DocumentReview, DocumentSummary } from "@vantage/backend/dto";
import { apiClient, ApiError } from "./client";

export const documentsApi = {
  list: () => apiClient.get<DocumentSummary[]>("/api/documents"),
  // The raw PDF, for content_review's overlay — DocumentLine's bbox is
  // only meaningful against this exact file. Not JSON, so it can't go
  // through apiClient.get.
  file: async (documentId: string): Promise<ArrayBuffer> => {
    const res = await fetch(`/api/documents/${documentId}/file`, { credentials: "include" });
    if (!res.ok) {
      throw new ApiError("could not load the document file", res.status);
    }
    return res.arrayBuffer();
  },
  upload: (accountId: string, file: File) => {
    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set("file", file);
    return apiClient.postForm<DocumentSummary>("/api/documents", formData);
  },
  // Carries everything the review screen needs for whichever reason it's
  // for (including validity_failure's failedChecks) — no follow-up fetch.
  review: (documentId: string) =>
    apiClient.get<DocumentReview>(`/api/documents/${documentId}/review`),
  resolve: (documentId: string, resolutions: DocumentResolution[]) =>
    apiClient.post<DocumentSummary>(`/api/documents/${documentId}/resolve`, { resolutions }),
};
