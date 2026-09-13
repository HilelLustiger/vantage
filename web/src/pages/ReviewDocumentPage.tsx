import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FileWarning, SearchX, ShieldCheck } from "lucide-react";
import type {
  Asset,
  AssetType,
  DocumentResolution,
  DocumentReview,
  DocumentSummary,
  ExtractedLine,
} from "@vantage/backend/dto";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Combobox, type ComboboxSelection } from "../components/Combobox";
import { DocumentPreviewPane } from "../components/DocumentPreviewPane";
import { ManualHoldingsForm, type ManualHoldingRow } from "../components/ManualHoldingsForm";
import { assetsApi } from "../api/assets";
import { documentsApi } from "../api/documents";
import { ApiError } from "../api/client";

const ASSET_TYPES: AssetType[] = ["stock", "etf", "mutual_fund", "bond", "cash"];

type LineState =
  | { mode: "unset" }
  | { mode: "match"; assetId: string; label: string }
  | { mode: "create"; type: AssetType; name: string; ticker: string; isin: string };

export function ReviewDocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [review, setReview] = useState<DocumentReview | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [lineStates, setLineStates] = useState<Record<number, LineState>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<DocumentSummary | null>(null);

  useEffect(() => {
    if (!documentId) return;
    Promise.all([documentsApi.review(documentId), assetsApi.list()])
      .then(([reviewResult, assetList]) => {
        setReview(reviewResult);
        setAssets(assetList);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
          return;
        }
        setError(err instanceof Error ? err.message : "Something went wrong");
      });
  }, [documentId]);

  function setLineState(index: number, state: LineState) {
    setLineStates((prev) => ({ ...prev, [index]: state }));
  }

  const lines = review && review.reason !== "privacy_preflight_aborted" ? review.lines : [];
  const unresolvedLines = lines.filter((line) => !line.resolvedAssetId);
  const allResolved = unresolvedLines.every((line) => {
    const state = lineStates[line.index];
    if (!state) return false;
    if (state.mode === "match") return true;
    if (state.mode === "create") return state.name.trim().length > 0;
    return false;
  });

  async function submitResolutions(resolutions: DocumentResolution[]) {
    if (!documentId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const document = await documentsApi.resolve(documentId, resolutions);
      if (document.status === "committed") {
        navigate("/import");
        return;
      }
      setResult(document);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (!allResolved) return;
    const resolutions: DocumentResolution[] = unresolvedLines.map((line) => {
      const state = lineStates[line.index];
      if (state.mode === "match") {
        return { index: line.index, assetId: state.assetId };
      }
      if (state.mode === "create") {
        return {
          index: line.index,
          newAsset: {
            type: state.type,
            name: state.name.trim(),
            ticker: state.ticker.trim() || undefined,
            isin: state.isin.trim() || undefined,
          },
        };
      }
      throw new Error(`line ${line.index} has no resolution`);
    });
    await submitResolutions(resolutions);
  }

  async function handleManualConfirm(rows: ManualHoldingRow[]) {
    const resolutions: DocumentResolution[] = rows
      .filter((row) => row.assetName.trim() && row.quantity && row.value)
      .map((row) => ({
        manualHolding: {
          // No type picker in this form (no extraction ran to suggest one) —
          // defaults to "stock" like the quick-create path in
          // ReviewLineEditor below; correctable afterward from the Assets
          // page if wrong.
          newAsset: { type: "stock", name: row.assetName.trim() },
          quantity: row.quantity,
          value: row.value,
          currency: row.currency,
        },
      }));
    await submitResolutions(resolutions);
  }

  if (notFound) {
    return (
      <div>
        <p className="text-sm text-gray-600">
          This document isn&apos;t waiting on review (already resolved, or not found).
        </p>
        <Link to="/import" className="text-sm font-medium text-emerald-700">
          Back to Import
        </Link>
      </div>
    );
  }

  if (result) {
    return (
      <div>
        <h1 className="mb-4 text-lg font-semibold text-gray-900">Review</h1>
        <Card>
          <p className="text-sm text-red-600">
            Confirming these lines didn&apos;t complete: {result.failureReason}
          </p>
          <Link to="/import" className="mt-4 inline-block text-sm font-medium text-emerald-700">
            Back to Import
          </Link>
        </Card>
      </div>
    );
  }

  if (!review) {
    return null;
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <Link to="/import" className="mb-1.5 shrink-0 text-xs text-gray-400 hover:text-gray-600">
        &larr; Back to Import
      </Link>
      <h1 className="mb-4 shrink-0 text-lg font-semibold text-gray-900">
        {review.reason === "privacy_preflight_aborted"
          ? "Manual correction needed"
          : "Review statement lines"}
      </h1>

      {/* Dual-pane per ADR-0008: every NeedsReview reason converges on this
          one shape (original document preview + editable form), varying
          only in banner text and how pre-filled the form arrives. */}
      <div className="flex min-h-0 flex-1 gap-6">
        {review.reason === "privacy_preflight_aborted" ? (
          <>
            <DocumentPreviewPane highlightNote="Not extracted — fill in on the right" />
            <div className="flex w-[58%] flex-1 flex-col gap-4">
              <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5">
                <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-600" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">
                    We didn&apos;t send this document to an external service
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-blue-800">
                    Part of this statement looked like it might contain personal identifying
                    information, so as a precaution we skipped automatic extraction for it entirely
                    rather than risk sending it out. Please fill in the holdings below using the
                    preview on the left.
                  </p>
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <ManualHoldingsForm
                accountHolder={review.locallyConfirmed.accountHolder}
                accountNumber={review.locallyConfirmed.accountNumber}
                onCancel={() => navigate("/import")}
                onConfirm={handleManualConfirm}
              />
            </div>
          </>
        ) : (
          <>
            <DocumentPreviewPane />

            <Card className="flex w-[58%] flex-1 flex-col overflow-y-auto">
              {review.reason === "validity_failure" && (
                <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5">
                  <FileWarning size={18} className="mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      Some values didn't check out
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-amber-800">
                      The numbers below didn't match what the statement itself claims — confirm or
                      correct them before committing.
                    </p>
                    {review.failedChecks.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs text-amber-700">
                        {review.failedChecks.map((check) => (
                          <li key={check.name}>
                            {check.name}: computed {check.computed ?? "—"}, statement claims{" "}
                            {check.claimed ?? "—"}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {review.reason === "asset_resolution" && (
                <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5">
                  <SearchX size={18} className="mt-0.5 shrink-0 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900">
                      Some holdings need a match
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-blue-800">
                      We couldn't confidently match every line to an existing Asset — search for the
                      right one or create a new one below, using the preview on the left.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {lines.map((line) =>
                  line.resolvedAssetId ? (
                    <MatchedLineRow key={line.index} line={line} assets={assets} />
                  ) : (
                    <ReviewLineEditor
                      key={line.index}
                      line={line}
                      assets={assets}
                      state={lineStates[line.index] ?? { mode: "unset" }}
                      onChange={(state) => setLineState(line.index, state)}
                    />
                  ),
                )}
              </div>

              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

              <div className="flex-1" />

              <Button
                className="mt-6"
                disabled={!allResolved || isSubmitting}
                onClick={handleConfirm}
              >
                {isSubmitting ? "Confirming..." : "Confirm"}
              </Button>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function MatchedLineRow({ line, assets }: { line: ExtractedLine; assets: Asset[] }) {
  const asset = assets.find((a) => a.id === line.resolvedAssetId);
  return (
    <Card className="flex items-center justify-between">
      <div>
        <p className="font-medium text-gray-900">{line.assetName}</p>
        <p className="text-sm text-gray-500">
          {line.quantity} · {line.value} {line.currency}
        </p>
      </div>
      <Badge className="bg-emerald-100 text-emerald-700">
        Matched to {asset?.name ?? line.resolvedAssetId}
      </Badge>
    </Card>
  );
}

function ReviewLineEditor({
  line,
  assets,
  state,
  onChange,
}: {
  line: ExtractedLine;
  assets: Asset[];
  state: LineState;
  onChange: (state: LineState) => void;
}) {
  function handleComboboxChange(selection: ComboboxSelection) {
    if (selection.id) {
      onChange({ mode: "match", assetId: selection.id, label: selection.label });
    } else {
      onChange({ mode: "create", type: "stock", name: selection.label, ticker: "", isin: "" });
    }
  }

  return (
    <Card>
      <p className="font-medium text-gray-900">{line.assetName}</p>
      <p className="mb-3 text-sm text-gray-500">
        {line.quantity} · {line.value} {line.currency}
      </p>

      {state.mode !== "create" && (
        <Combobox
          options={assets.map((a) => ({
            id: a.id,
            label: a.ticker ? `${a.name} (${a.ticker})` : a.name,
          }))}
          value={state.mode === "match" ? { id: state.assetId, label: state.label } : null}
          onChange={handleComboboxChange}
          placeholder="Search assets, or create a new one"
        />
      )}

      {state.mode === "create" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onChange({ mode: "unset" })}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; back to search
          </button>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
            <select
              value={state.type}
              onChange={(e) => onChange({ ...state, type: e.target.value as AssetType })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            >
              {ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
            <input
              value={state.name}
              onChange={(e) => onChange({ ...state, name: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Ticker (optional)
            </label>
            <input
              value={state.ticker}
              onChange={(e) => onChange({ ...state, ticker: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">ISIN (optional)</label>
            <input
              value={state.isin}
              onChange={(e) => onChange({ ...state, isin: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </Card>
  );
}
