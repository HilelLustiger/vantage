import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Circle, FileWarning, Lock, SearchX } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type {
  Asset,
  AssetType,
  DocumentLine,
  DocumentResolution,
  DocumentReview,
  DocumentSummary,
  ExtractedLine,
  ValidityCheckResult,
} from "@vantage/backend/dto";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Combobox, type ComboboxSelection } from "../components/Combobox";
import { DocumentPreviewPane } from "../components/DocumentPreviewPane";
import { assetsApi } from "../api/assets";
import { documentsApi } from "../api/documents";
import { ApiError } from "../api/client";

const ASSET_TYPES: AssetType[] = ["stock", "etf", "mutual_fund", "bond", "cash"];

type LineState =
  | { mode: "unset" }
  | { mode: "match"; assetId: string; label: string }
  | { mode: "create"; type: AssetType; name: string; ticker: string; isin: string };

// What the model read off the document for one extraction_review line,
// editable before it's ever written to a Holding/Transaction — a reviewer
// must explicitly confirm the figures are right (or fix them first), not
// just where the money should be booked. Editing any field un-confirms it:
// a changed number needs a fresh look, not carried-over trust.
type LineFigure =
  | { kind: "holding"; value: string; quantity: string; currency: string; confirmed: boolean }
  | {
      kind: "transaction";
      amount: string;
      quantityDelta: string;
      occurredAt: string;
      currency: string;
      confirmed: boolean;
    };

// The three states a non-redacted content_review line can be in — the
// color always means the same thing regardless of how a line got there:
// "send" (will be sent), "attention" (flagged, still undecided), "off"
// (won't be sent). "attention" only ever moves forward to "send"/"off" —
// once a human has looked at a line, red never comes back, since red
// specifically means "nobody's decided yet."
type ContentLineDecision = "send" | "attention" | "off";

function nextContentLineDecision(current: ContentLineDecision): ContentLineDecision {
  return current === "send" ? "off" : "send";
}

export function ReviewDocumentPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [review, setReview] = useState<DocumentReview | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [lineStates, setLineStates] = useState<Record<number, LineState>>({});
  const [lineDecisions, setLineDecisions] = useState<Record<number, ContentLineDecision>>({});
  const [lineFigures, setLineFigures] = useState<Record<number, LineFigure>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<DocumentSummary | null>(null);

  useEffect(() => {
    if (!documentId) return;
    Promise.all([documentsApi.review(documentId), assetsApi.list()])
      .then(([reviewResult, assetList]) => {
        applyReview(reviewResult);
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

  function applyReview(next: DocumentReview) {
    setReview(next);
    setLineStates({});
    if (next.reason === "content_review") {
      const decisions: Record<number, ContentLineDecision> = {};
      for (const line of next.lines) {
        if (line.status === "included") decisions[line.index] = "send";
        else if (line.status === "flagged") decisions[line.index] = "attention";
        // "redacted" lines get no entry at all — nothing to decide.
      }
      setLineDecisions(decisions);
      setLineFigures({});
    } else {
      const figures: Record<number, LineFigure> = {};
      for (const line of next.lines) {
        figures[line.index] =
          line.kind === "holding"
            ? {
                kind: "holding",
                value: line.value,
                quantity: line.quantity,
                currency: line.currency,
                confirmed: false,
              }
            : {
                kind: "transaction",
                amount: line.amount,
                quantityDelta: line.quantityDelta ?? "",
                occurredAt: line.occurredAt,
                currency: line.currency,
                confirmed: false,
              };
      }
      setLineFigures(figures);
    }
  }

  function setLineState(index: number, state: LineState) {
    setLineStates((prev) => ({ ...prev, [index]: state }));
  }

  function toggleLine(index: number) {
    setLineDecisions((prev) => ({ ...prev, [index]: nextContentLineDecision(prev[index]) }));
  }

  function updateFigureField(index: number, field: string, value: string) {
    setLineFigures((prev) => {
      const current = prev[index];
      if (!current) return prev;
      return { ...prev, [index]: { ...current, [field]: value, confirmed: false } };
    });
  }

  function toggleFigureConfirmed(index: number) {
    setLineFigures((prev) => {
      const current = prev[index];
      if (!current) return prev;
      return { ...prev, [index]: { ...current, confirmed: !current.confirmed } };
    });
  }

  const extractionLines = review?.reason === "extraction_review" ? review.lines : [];
  const unresolvedLines = extractionLines.filter((line) => !line.resolvedAssetId);
  const allMatched = unresolvedLines.every((line) => {
    const state = lineStates[line.index];
    if (!state) return false;
    if (state.mode === "match") return true;
    if (state.mode === "create") return state.name.trim().length > 0;
    return false;
  });
  const allFiguresConfirmed = extractionLines.every((line) => lineFigures[line.index]?.confirmed);
  const allResolved = allMatched && allFiguresConfirmed;

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
      if (document.status === "needs_review") {
        // content_review's approval led to extraction_review (the model
        // found something else needing attention) — keep reviewing rather
        // than treating this as a dead end.
        const nextReview = await documentsApi.review(documentId);
        applyReview(nextReview);
        return;
      }
      setResult(document);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmExtraction() {
    if (!allResolved) return;
    const resolutions: DocumentResolution[] = extractionLines.map((line) =>
      buildResolution(line, lineStates[line.index], lineFigures[line.index]),
    );
    await submitResolutions(resolutions);
  }

  async function handleConfirmContentReview() {
    const includedIndices = Object.entries(lineDecisions)
      .filter(([, decision]) => decision === "send")
      .map(([index]) => Number(index));
    if (includedIndices.length === 0) return;
    await submitResolutions([{ approveContentReview: { includedIndices } }]);
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

  if (review.reason === "content_review") {
    return (
      <ContentReviewScreen
        documentId={documentId!}
        lines={review.lines}
        pageWidth={review.pageWidth}
        pageHeight={review.pageHeight}
        lineDecisions={lineDecisions}
        onToggle={toggleLine}
        onConfirm={handleConfirmContentReview}
        isSubmitting={isSubmitting}
        error={error}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <Link to="/import" className="mb-1.5 shrink-0 text-xs text-gray-400 hover:text-gray-600">
        &larr; Back to Import
      </Link>
      <h1 className="mb-4 shrink-0 text-lg font-semibold text-gray-900">Review statement lines</h1>

      {/* Dual-pane per ADR-0008: NeedsReview reasons converge on this one
          shape (original document preview + editable form), varying only in
          banner text and how pre-filled the form arrives. */}
      <div className="flex min-h-0 flex-1 gap-6">
        <DocumentPreviewPane documentId={documentId!} />

        <Card className="flex w-[58%] flex-1 flex-col overflow-y-auto">
          {review.failedChecks.length > 0 && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3.5">
              <FileWarning size={18} className="mt-0.5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Some values didn't check out</p>
                <p className="mt-1 text-sm leading-relaxed text-amber-800">
                  The numbers below didn't match what the statement itself claims — confirm or
                  correct them before committing.
                </p>
                <ul className="mt-2 space-y-1 text-xs text-amber-700">
                  {review.failedChecks.map((check) => (
                    <li key={check.name}>{describeValidityCheck(check)}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {unresolvedLines.length > 0 && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3.5">
              <SearchX size={18} className="mt-0.5 shrink-0 text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-blue-900">Some holdings need a match</p>
                <p className="mt-1 text-sm leading-relaxed text-blue-800">
                  We couldn't confidently match every line to an existing Asset — search for the
                  right one or create a new one below, using the preview on the left.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {extractionLines.map((line) =>
              line.resolvedAssetId ? (
                <MatchedLineRow
                  key={line.index}
                  line={line}
                  assets={assets}
                  figure={lineFigures[line.index]}
                  asOfDate={review.asOfDate}
                  onChangeField={(field, value) => updateFigureField(line.index, field, value)}
                  onToggleConfirm={() => toggleFigureConfirmed(line.index)}
                />
              ) : (
                <ReviewLineEditor
                  key={line.index}
                  line={line}
                  assets={assets}
                  state={lineStates[line.index] ?? { mode: "unset" }}
                  onChange={(state) => setLineState(line.index, state)}
                  figure={lineFigures[line.index]}
                  asOfDate={review.asOfDate}
                  onChangeField={(field, value) => updateFigureField(line.index, field, value)}
                  onToggleConfirm={() => toggleFigureConfirmed(line.index)}
                />
              ),
            )}
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <div className="flex-1" />

          <Button
            className="mt-6"
            disabled={!allResolved || isSubmitting}
            onClick={handleConfirmExtraction}
          >
            {isSubmitting ? "Confirming..." : "Confirm"}
          </Button>
        </Card>
      </div>
    </div>
  );
}

// `kind` has to be branched on explicitly (rather than spread from `line`)
// so each branch's object literal lines up with DocumentResolution's own
// discriminated variants instead of widening to "holding" | "transaction".
// A line parser already auto-matched (line.resolvedAssetId set) needs no
// assetId/newAsset at all — just its (possibly human-corrected) figures.
function buildResolution(
  line: ExtractedLine,
  state: LineState | undefined,
  figure: LineFigure,
): DocumentResolution {
  if (line.kind === "holding") {
    const f = figure as Extract<LineFigure, { kind: "holding" }>;
    const overrides = { value: f.value, quantity: f.quantity, currency: f.currency };
    if (line.resolvedAssetId) return { index: line.index, kind: "holding", ...overrides };
    if (state?.mode === "match") {
      return { index: line.index, kind: "holding", assetId: state.assetId, ...overrides };
    }
    if (state?.mode === "create") {
      return {
        index: line.index,
        kind: "holding",
        newAsset: {
          type: state.type,
          name: state.name.trim(),
          ticker: state.ticker.trim() || undefined,
          isin: state.isin.trim() || undefined,
        },
        ...overrides,
      };
    }
    throw new Error(`line ${line.index} has no resolution`);
  }

  const f = figure as Extract<LineFigure, { kind: "transaction" }>;
  const overrides = {
    amount: f.amount,
    quantityDelta: f.quantityDelta || undefined,
    occurredAt: f.occurredAt,
    currency: f.currency,
  };
  if (line.resolvedAssetId) return { index: line.index, kind: "transaction", ...overrides };
  if (state?.mode === "match") {
    return { index: line.index, kind: "transaction", assetId: state.assetId, ...overrides };
  }
  if (state?.mode === "create") {
    return {
      index: line.index,
      kind: "transaction",
      newAsset: {
        type: state.type,
        name: state.name.trim(),
        ticker: state.ticker.trim() || undefined,
        isin: state.isin.trim() || undefined,
      },
      ...overrides,
    };
  }
  throw new Error(`line ${line.index} has no resolution`);
}

function formatAmount(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n.toLocaleString() : String(value);
}

// The one validity check formatting.py currently runs (holdings total vs.
// the statement's own stated balance) — spelled out in plain language and
// pointed at the holding lines below, rather than a bare "computed X,
// claimed Y" that doesn't say what those numbers even are.
function describeValidityCheck(check: ValidityCheckResult): string {
  if (check.name === "statementBalance") {
    return `Adding up the holdings below comes to ${formatAmount(check.computed)}, but the statement itself states its balance as ${formatAmount(check.claimed)}. Check the holding value below — one of these two numbers needs correcting.`;
  }
  return `${check.name}: computed ${formatAmount(check.computed)}, statement claims ${formatAmount(check.claimed)}`;
}

// Holding lines describe current value; transaction lines describe dated
// activity — the two never mix within one line, so the label differs by
// `kind` rather than showing blank fields for whichever doesn't apply.
function lineKindLabel(line: ExtractedLine): string {
  if (line.kind === "holding") return "Holding";
  return line.transactionKind[0].toUpperCase() + line.transactionKind.slice(1);
}

function InlineInput({
  value,
  onChange,
  label,
  type = "text",
  className = "w-24",
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`rounded border border-gray-300 bg-white px-1.5 py-0.5 text-sm font-medium text-gray-900 focus:border-emerald-500 focus:outline-none ${className}`}
    />
  );
}

// The claim itself: what the model says it found, spelled out as a
// sentence with the actual figures inline and editable — not a bare "10 ·
// 1000 ILS" a reviewer has to reverse-engineer the meaning of. Every field
// defaults to the model's own value; changing one un-confirms the line
// (see LineFigure) until the reviewer explicitly confirms again.
function LineClaim({
  line,
  figure,
  asOfDate,
  onChangeField,
  onToggleConfirm,
}: {
  line: ExtractedLine;
  figure: LineFigure;
  asOfDate: string;
  onChangeField: (field: string, value: string) => void;
  onToggleConfirm: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      {line.kind === "holding" ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-sm text-gray-700">
          <span>The model found that the current value of</span>
          <strong className="text-gray-900">{line.assetName}</strong>
          <span>as of</span>
          <strong className="text-gray-900">{asOfDate}</strong>
          <span>is</span>
          <InlineInput
            value={(figure as Extract<LineFigure, { kind: "holding" }>).value}
            onChange={(v) => onChangeField("value", v)}
            label={`Value for line ${line.index}`}
          />
          <InlineInput
            value={(figure as Extract<LineFigure, { kind: "holding" }>).currency}
            onChange={(v) => onChangeField("currency", v)}
            label={`Currency for line ${line.index}`}
            className="w-14"
          />
          <span>.</span>
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-sm text-gray-700">
          <span>The model found a</span>
          <strong className="text-gray-900">{line.transactionKind}</strong>
          <span>for</span>
          <strong className="text-gray-900">{line.assetName}</strong>
          <span>of</span>
          <InlineInput
            value={(figure as Extract<LineFigure, { kind: "transaction" }>).amount}
            onChange={(v) => onChangeField("amount", v)}
            label={`Amount for line ${line.index}`}
          />
          <InlineInput
            value={(figure as Extract<LineFigure, { kind: "transaction" }>).currency}
            onChange={(v) => onChangeField("currency", v)}
            label={`Currency for line ${line.index}`}
            className="w-14"
          />
          <span>on</span>
          <InlineInput
            type="date"
            value={(figure as Extract<LineFigure, { kind: "transaction" }>).occurredAt}
            onChange={(v) => onChangeField("occurredAt", v)}
            label={`Date for line ${line.index}`}
            className="w-36"
          />
          <span>.</span>
        </p>
      )}
      <button
        type="button"
        onClick={onToggleConfirm}
        aria-label={`${figure.confirmed ? "Confirmed" : "Confirm"} figures for line ${line.index}`}
        className={`mt-2.5 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
          figure.confirmed
            ? "bg-emerald-100 text-emerald-700"
            : "border border-dashed border-red-400 text-red-600 hover:bg-red-50"
        }`}
      >
        {figure.confirmed ? <CheckCircle2 size={13} /> : <Circle size={13} />}
        {figure.confirmed ? "Confirmed" : "Confirm this"}
      </button>
    </div>
  );
}

function MatchedLineRow({
  line,
  assets,
  figure,
  asOfDate,
  onChangeField,
  onToggleConfirm,
}: {
  line: ExtractedLine;
  assets: Asset[];
  figure: LineFigure;
  asOfDate: string;
  onChangeField: (field: string, value: string) => void;
  onToggleConfirm: () => void;
}) {
  const asset = assets.find((a) => a.id === line.resolvedAssetId);
  return (
    <Card>
      <div className="mb-2.5 flex items-center justify-between">
        <Badge className="bg-gray-100 text-gray-600">{lineKindLabel(line)}</Badge>
        <Badge className="bg-emerald-100 text-emerald-700">
          Matched to {asset?.name ?? line.resolvedAssetId}
        </Badge>
      </div>
      <LineClaim
        line={line}
        figure={figure}
        asOfDate={asOfDate}
        onChangeField={onChangeField}
        onToggleConfirm={onToggleConfirm}
      />
    </Card>
  );
}

function ReviewLineEditor({
  line,
  assets,
  state,
  onChange,
  figure,
  asOfDate,
  onChangeField,
  onToggleConfirm,
}: {
  line: ExtractedLine;
  assets: Asset[];
  state: LineState;
  onChange: (state: LineState) => void;
  figure: LineFigure;
  asOfDate: string;
  onChangeField: (field: string, value: string) => void;
  onToggleConfirm: () => void;
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
      <div className="mb-2.5">
        <Badge className="bg-gray-100 text-gray-600">{lineKindLabel(line)}</Badge>
      </div>
      <LineClaim
        line={line}
        figure={figure}
        asOfDate={asOfDate}
        onChangeField={onChangeField}
        onToggleConfirm={onToggleConfirm}
      />

      <div className="mt-3">
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
      </div>
    </Card>
  );
}

// The pre-model approval gate (ADR-0008): the document itself, rendered
// from the real PDF, is the review surface — clicking a region on the page
// changes its state directly, at the position parser/segmentation.py
// reported (Bbox, already normalized against the source PDF's own mediabox
// origin — see backend/src/dto/documents.ts). Color always means the same
// thing regardless of how a region got there: green = will be sent, red =
// still waiting on a decision, unmarked = won't be sent. "redacted"
// regions never had text to begin with (parser never let it leave that
// process) — the dark placeholder here is informational, not a technical
// mask: this is the household's own document, in their own browser, so
// there's nothing to hide from them — it just shows where something was
// removed before anything left the machine.
function ContentReviewScreen({
  documentId,
  lines,
  pageWidth,
  pageHeight,
  lineDecisions,
  onToggle,
  onConfirm,
  isSubmitting,
  error,
}: {
  documentId: string;
  lines: DocumentLine[];
  pageWidth: number;
  pageHeight: number;
  lineDecisions: Record<number, ContentLineDecision>;
  onToggle: (index: number) => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const buffer = await documentsApi.file(documentId);
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const page = await pdf.getPage(1);
        // Rendered at 2x for sharpness — displayed at 100% container width
        // via CSS regardless (see the canvas's own className below), so
        // this only affects crispness, not layout.
        const viewport = page.getViewport({ scale: 2 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) return;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
      } catch {
        if (!cancelled) setRenderError("Couldn't load a preview of this document.");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const sendCount = Object.values(lineDecisions).filter((d) => d === "send").length;
  const selectableCount = Object.keys(lineDecisions).length;

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <Link to="/import" className="mb-1.5 block text-xs text-gray-400 hover:text-gray-600">
        &larr; Back to Import
      </Link>
      <h1 className="mb-1 text-lg font-semibold text-gray-900">
        Before sending — choose directly on the document
      </h1>
      <p className="mb-4 text-sm text-gray-500">
        Click a region to change it. <span className="font-medium text-emerald-700">Green</span>{" "}
        will be sent, <span className="font-medium text-red-700">red</span> is waiting on your
        decision, and anything unmarked won&apos;t be sent.
      </p>

      <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <canvas ref={canvasRef} className="block h-auto w-full" />
        {renderError && <p className="p-4 text-sm text-red-600">{renderError}</p>}
        {lines.map((line) => {
          const style = {
            left: `${(line.bbox.x0 / pageWidth) * 100}%`,
            top: `${(line.bbox.top / pageHeight) * 100}%`,
            width: `${((line.bbox.x1 - line.bbox.x0) / pageWidth) * 100}%`,
            height: `${((line.bbox.bottom - line.bbox.top) / pageHeight) * 100}%`,
          };

          if (line.status === "redacted") {
            return (
              <div
                key={line.index}
                className="absolute flex items-center justify-center rounded-sm bg-gray-800/90"
                style={style}
                title="Removed automatically — identifying information"
              >
                <Lock size={11} className="text-white/80" />
              </div>
            );
          }

          const decision = lineDecisions[line.index] ?? "off";
          return (
            <button
              key={line.index}
              type="button"
              onClick={() => onToggle(line.index)}
              aria-label={
                line.status === "flagged"
                  ? `Region ${line.index}: ${line.flagReason} (${decision})`
                  : `Region ${line.index} (${decision})`
              }
              title={line.status === "flagged" ? line.flagReason : undefined}
              className={`absolute rounded-sm border transition-colors ${
                decision === "send"
                  ? "border-emerald-500 bg-emerald-400/20 hover:bg-emerald-400/30"
                  : decision === "attention"
                    ? "border-dashed border-red-500 bg-red-400/15 hover:bg-red-400/25"
                    : "border-transparent hover:border-gray-300 hover:bg-gray-400/10"
              }`}
              style={style}
            />
          );
        })}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white px-6 py-3.5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="text-sm text-gray-500">
            {sendCount} of {selectableCount} regions will be sent
          </span>
          <Button disabled={sendCount === 0 || isSubmitting} onClick={onConfirm}>
            {isSubmitting
              ? "Confirming..."
              : sendCount === 0
                ? "Select at least one region"
                : `Confirm and send ${sendCount} regions`}
          </Button>
        </div>
      </div>
    </div>
  );
}
