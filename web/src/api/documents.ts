import type { DocumentResolution, DocumentReview, DocumentSummary } from "@vantage/backend/dto";
import { apiClient } from "./client";

export const documentsApi = {
  list: () => apiClient.get<DocumentSummary[]>("/api/documents"),
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
