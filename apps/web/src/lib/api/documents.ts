import type { Document } from "@vantage/shared-types";
import { apiClient } from "../apiClient";

export const documentsApi = {
  list: () => apiClient.get<Document[]>("/api/documents"),
  upload: (accountId: string, file: File) => {
    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set("file", file);
    return apiClient.postForm<Document>("/api/documents", formData);
  },
};
