import type { Document, DocumentResolution, DocumentReview } from "@vantage/backend/dto";
import { apiClient } from "../apiClient";

export const documentsApi = {
  list: () => apiClient.get<Document[]>("/api/documents"),
  upload: (accountId: string, file: File) => {
    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set("file", file);
    return apiClient.postForm<Document>("/api/documents", formData);
  },
  review: (documentId: string) =>
    apiClient.get<DocumentReview>(`/api/documents/${documentId}/review`),
  resolve: (documentId: string, resolutions: DocumentResolution[]) =>
    apiClient.post<Document>(`/api/documents/${documentId}/resolve`, { resolutions }),
};
