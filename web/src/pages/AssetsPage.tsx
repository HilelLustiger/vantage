import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import type { AssetType, HoldingDetail, HoldingRow } from "@vantage/backend/dto";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { FreshnessBadge } from "../components/FreshnessBadge";
import { Modal } from "../components/Modal";
import { ValueCostBasisChart } from "../components/ValueCostBasisChart";
import { assetsApi } from "../api/assets";
import { holdingsApi } from "../api/holdings";
import { formatMoney, formatPct, signColor } from "../utils/format";

const ASSET_TYPES: AssetType[] = ["stock", "etf", "mutual_fund", "bond", "cash"];

// No currency selector on this page in the mockup (unlike the Dashboard) —
// holdings are always shown converted to the household's home currency.
const DISPLAY_CURRENCY = "ILS";

export function AssetsPage() {
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedAssetIds, setExpandedAssetIds] = useState<Set<string>>(new Set());

  async function refresh() {
    setHoldings(await holdingsApi.list(DISPLAY_CURRENCY));
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, []);

  function toggleExpanded(assetId: string) {
    setExpandedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }

  // Open positions first (by converted value desc — all rows are already in
  // DISPLAY_CURRENCY, so this is a fair comparison unlike native-currency
  // quantities), closed positions after — closed keeps its realized history
  // instead of just disappearing (see ClosedHoldingDetail), but still isn't
  // a "current" holding for ranking purposes.
  const sortedHoldings = [...holdings].sort((a, b) => {
    const aOpen = a.detail.status === "open";
    const bOpen = b.detail.status === "open";
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return Number(b.value ?? 0) - Number(a.value ?? 0);
  });

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Assets</h1>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={16} className="mr-1" />
          Add asset
        </Button>
      </div>
      <p className="mb-5 text-sm text-gray-400">
        Freshness reflects how the value shown was priced — live market data, or your last imported
        statement.
      </p>

      <div className="space-y-4">
        {sortedHoldings.map((holding) => (
          <HoldingCard
            key={holding.assetId}
            holding={holding}
            isExpanded={expandedAssetIds.has(holding.assetId)}
            onToggle={() => toggleExpanded(holding.assetId)}
          />
        ))}
        {!isLoading && holdings.length === 0 && (
          <Card className="text-center text-sm text-gray-500">No assets yet.</Card>
        )}
      </div>

      {!isLoading && holdings.length > 0 && <FreshnessLegend />}

      {isModalOpen && (
        <AddAssetModal
          onClose={() => setIsModalOpen(false)}
          onCreated={async () => {
            setIsModalOpen(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

// Explains FreshnessBadge's color tiers — the tiers/thresholds themselves
// already live there, this just spells out what each color means.
const FRESHNESS_LEGEND: { label: string; color: string }[] = [
  { label: "Live market price", color: "#10b981" },
  { label: "From statement, recent", color: "#9ca3af" },
  { label: "From statement, aging", color: "#f59e0b" },
  { label: "From statement, stale", color: "#dc2626" },
  { label: "Closed, fully sold", color: "#d1d5db" },
];

function FreshnessLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-5 text-xs text-gray-400">
      {FRESHNESS_LEGEND.map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

function HoldingCard({
  holding,
  isExpanded,
  onToggle,
}: {
  holding: HoldingRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isClosed = holding.detail.status === "closed";

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <p className={`truncate font-medium ${isClosed ? "text-gray-400" : "text-gray-900"}`}>
              {holding.name}
              {holding.ticker && (
                <span className="ml-1 font-normal text-gray-400">({holding.ticker})</span>
              )}
            </p>
          </div>
          <Badge className={isClosed ? "bg-gray-100 text-gray-400" : undefined}>
            {holding.type}
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <FreshnessBadge
            status={holding.detail.status}
            freshness={holding.freshness}
            closedOn={holding.closedOn}
          />
          <span className={`text-sm ${isClosed ? "text-gray-300" : "text-gray-500"}`}>
            {holding.quantity ?? "—"}
          </span>
          <span className={`text-sm font-medium ${isClosed ? "text-gray-400" : "text-gray-900"}`}>
            {holding.value === null ? "—" : formatMoney(Number(holding.value), DISPLAY_CURRENCY)}
          </span>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 px-6 py-4">
          <HoldingDetailView detail={holding.detail} />
        </div>
      )}
    </Card>
  );
}

function HoldingDetailView({ detail }: { detail: HoldingDetail }) {
  if (detail.status === "closed") {
    return <ClosedPositionDetail detail={detail} />;
  }

  return (
    <div>
      {detail.chart && (
        <div className="mb-4">
          <p className="mb-2 text-xs text-gray-400">
            Value vs. cost basis for this holding — shaded area is this asset's own real profit.
          </p>
          <ValueCostBasisChart
            points={detail.chart.map((p) => ({
              date: p.date,
              value: Number(p.value),
              costBasis: Number(p.costBasis),
            }))}
            height={140}
          />
        </div>
      )}

      <MetricsGrid detail={detail} />
    </div>
  );
}

function MetricsGrid({ detail }: { detail: Extract<HoldingDetail, { status: "open" }> }) {
  const profit = Number(detail.profit);

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
      <MetricRow
        label="Cost basis"
        value={formatMoney(Number(detail.costBasis), DISPLAY_CURRENCY)}
      />
      <MetricRow
        label="Profit"
        value={formatMoney(profit, DISPLAY_CURRENCY)}
        className={signColor(profit)}
      />
      <MetricRow
        label="Return %"
        value={detail.returnPct === null ? "—" : formatPct(detail.returnPct)}
        className={detail.returnPct === null ? undefined : signColor(detail.returnPct)}
      />
      {/* Fixed-rate deposits show Rate instead of tax/XIRR — tax-on-profit
          framing doesn't apply the same way to them, per the mockup. */}
      {detail.annualRatePct !== undefined ? (
        <MetricRow label="Rate" value={`${detail.annualRatePct}% annual`} />
      ) : (
        <>
          <MetricRow
            label="Tax on profit"
            value={formatMoney(Number(detail.taxOnProfit), DISPLAY_CURRENCY)}
          />
          {/* De-emphasized/hidden below the minimum holding period — the
              backend already collapses "too new" and "uncomputable" into
              the same null, so there's nothing more specific to show. */}
          {detail.xirr != null && (
            <MetricRow
              label="XIRR"
              value={formatPct(detail.xirr * 100)}
              className={signColor(detail.xirr)}
            />
          )}
        </>
      )}
    </dl>
  );
}

// A closed position (fully sold) keeps its realized outcome instead of
// disappearing into "—" — a distinct state from never having been held.
function ClosedPositionDetail({
  detail,
}: {
  detail: Extract<HoldingDetail, { status: "closed" }>;
}) {
  const realizedProfit = Number(detail.realizedProfit);
  return (
    <div>
      <p className="mb-3 text-xs text-gray-400">
        Fully sold — kept for its realized history, not blended into your current live/stale total.
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <MetricRow
          label="Held"
          value={`${detail.heldFrom} – ${detail.heldTo}`}
          className="text-gray-700"
        />
        <MetricRow
          label="Cost basis"
          value={formatMoney(Number(detail.costBasis), DISPLAY_CURRENCY)}
          className="text-gray-700"
        />
        <MetricRow
          label="Sold for"
          value={formatMoney(Number(detail.soldFor), DISPLAY_CURRENCY)}
          className="text-gray-700"
        />
        <MetricRow
          label="Realized profit"
          value={formatMoney(realizedProfit, DISPLAY_CURRENCY)}
          className={signColor(realizedProfit)}
        />
        <MetricRow
          label="Return %"
          value={formatPct(detail.realizedReturnPct)}
          className={signColor(detail.realizedReturnPct)}
        />
      </dl>
    </div>
  );
}

function MetricRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`font-medium ${className ?? "text-gray-900"}`}>{value}</dd>
    </div>
  );
}

function AddAssetModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}) {
  const [type, setType] = useState<AssetType>("stock");
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [isin, setIsin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await assetsApi.create({
        type,
        name,
        ticker: ticker.trim() || undefined,
        isin: isin.trim() || undefined,
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal title="Add asset" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="asset-type">
            Type
          </label>
          <select
            id="asset-type"
            value={type}
            onChange={(e) => setType(e.target.value as AssetType)}
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
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="asset-name">
            Name
          </label>
          <input
            id="asset-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="asset-ticker">
            Ticker (optional)
          </label>
          <input
            id="asset-ticker"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="asset-isin">
            ISIN (optional)
          </label>
          <input
            id="asset-isin"
            value={isin}
            onChange={(e) => setIsin(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Creating..." : "Create asset"}
        </Button>
      </form>
    </Modal>
  );
}
