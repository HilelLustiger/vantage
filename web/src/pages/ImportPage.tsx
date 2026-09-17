import { useEffect, useRef, useState, type DragEvent } from "react";
import { UploadCloud } from "lucide-react";
import { Link } from "react-router-dom";
import type { Account, DocumentStatus, DocumentSummary } from "@vantage/backend/dto";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from "../components/Table";
import { accountsApi } from "../api/accounts";
import { documentsApi } from "../api/documents";
import { ApiError } from "../api/client";

const STATUS_STYLES: Record<DocumentStatus, string> = {
  uploaded: "bg-gray-100 text-gray-700",
  processing: "bg-blue-100 text-blue-700",
  needs_review: "bg-amber-100 text-amber-700",
  committed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  duplicate: "bg-gray-100 text-gray-500",
};

interface UploadRow {
  id: string;
  fileName: string;
  status: "uploading" | "done" | "error";
  document?: DocumentSummary;
  error?: string;
}

export function ImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refreshDocuments() {
    setDocuments(await documentsApi.list());
  }

  useEffect(() => {
    accountsApi.list().then((list) => {
      setAccounts(list);
      setSelectedAccountId((current) => current || (list[0]?.id ?? ""));
    });
    refreshDocuments();
  }, []);

  async function uploadFiles(files: File[]) {
    if (!selectedAccountId || files.length === 0) return;

    const rows: UploadRow[] = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      fileName: file.name,
      status: "uploading",
    }));
    setUploadRows((prev) => [...rows, ...prev]);

    await Promise.allSettled(
      files.map(async (file, index) => {
        const row = rows[index];
        try {
          const document = await documentsApi.upload(selectedAccountId, file);
          setUploadRows((prev) =>
            prev.map((r) => (r.id === row.id ? { ...r, status: "done", document } : r)),
          );
        } catch (err) {
          const message = err instanceof ApiError ? err.message : "Upload failed";
          setUploadRows((prev) =>
            prev.map((r) => (r.id === row.id ? { ...r, status: "error", error: message } : r)),
          );
        }
      }),
    );
    await refreshDocuments();
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDraggingOver(false);
    uploadFiles([...e.dataTransfer.files]);
  }

  const sortedDocuments = [...documents].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-gray-900">Import</h1>

      <Card className="mb-6">
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="import-account">
          Account
        </label>
        <select
          id="import-account"
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="mb-4 w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        >
          {accounts.length === 0 && <option value="">No accounts yet</option>}
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center ${
            isDraggingOver ? "border-emerald-500 bg-emerald-50" : "border-gray-300"
          }`}
        >
          <UploadCloud className="mb-2 text-gray-400" size={28} />
          <p className="text-sm text-gray-600">
            Drag documents here, or <span className="font-medium text-emerald-700">browse</span>
          </p>
          <p className="mt-1 text-xs text-gray-400">PDF only, multiple files at once</p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="application/pdf"
            aria-label="Upload documents"
            className="hidden"
            onChange={(e) => {
              uploadFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>

        {uploadRows.length > 0 && (
          <ul className="mt-4 space-y-1">
            {uploadRows.map((row) => (
              <li key={row.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{row.fileName}</span>
                {row.status === "uploading" && <span className="text-gray-400">Uploading…</span>}
                {row.status === "done" && row.document && (
                  <Badge className={STATUS_STYLES[row.document.status]}>
                    {row.document.status}
                  </Badge>
                )}
                {row.status === "error" && <span className="text-red-600">{row.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-0">
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Uploaded</TableHeaderCell>
              <TableHeaderCell>Account</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Details</TableHeaderCell>
              <TableHeaderCell>Action</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {sortedDocuments.map((document) => (
              <tr key={document.id}>
                <TableCell>{new Date(document.uploadedAt).toLocaleString()}</TableCell>
                <TableCell>{document.accountName}</TableCell>
                <TableCell>
                  <Badge className={STATUS_STYLES[document.status]}>{document.status}</Badge>
                </TableCell>
                <TableCell className="text-gray-500">
                  {document.status === "failed" ? (document.failureReason ?? "—") : "—"}
                </TableCell>
                <TableCell>
                  {document.status === "needs_review" ? (
                    <Link
                      to={`/import/${document.id}/review`}
                      className="font-medium text-emerald-700 hover:text-emerald-800"
                    >
                      Review
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </tr>
            ))}
          </TableBody>
        </Table>
        {documents.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No documents yet.</p>
        )}
      </Card>
    </div>
  );
}
