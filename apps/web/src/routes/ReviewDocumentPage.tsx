import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  Asset,
  AssetType,
  Document,
  DocumentResolution,
  DocumentReview,
  DocumentReviewLine,
} from "@vantage/shared-types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Combobox, type ComboboxSelection } from "../components/Combobox";
import { assetsApi } from "../lib/api/assets";
import { documentsApi } from "../lib/api/documents";
import { ApiError } from "../lib/apiClient";

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
  const [result, setResult] = useState<Document | null>(null);

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

  const unresolvedLines = review?.lines.filter((line) => !line.resolvedAssetId) ?? [];
  const allResolved = unresolvedLines.every((line) => {
    const state = lineStates[line.index];
    if (!state) return false;
    if (state.mode === "match") return true;
    if (state.mode === "create") return state.name.trim().length > 0;
    return false;
  });

  async function handleConfirm() {
    if (!documentId || !allResolved) return;
    setError(null);
    setIsSubmitting(true);
    try {
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
    <div>
      <h1 className="mb-6 text-lg font-semibold text-gray-900">Review statement lines</h1>

      <div className="space-y-4">
        {review.lines.map((line) =>
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

      <Button
        className="mt-6"
        disabled={!allResolved || isSubmitting}
        onClick={handleConfirm}
      >
        {isSubmitting ? "Confirming..." : "Confirm"}
      </Button>
    </div>
  );
}

function MatchedLineRow({ line, assets }: { line: DocumentReviewLine; assets: Asset[] }) {
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
  line: DocumentReviewLine;
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
            <label className="mb-1 block text-sm font-medium text-gray-700">
              ISIN (optional)
            </label>
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
