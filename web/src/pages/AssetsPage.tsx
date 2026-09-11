import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import type {
  Asset,
  AssetCurrencyValue,
  AssetHistory,
  AssetHoldingBreakdown,
  AssetType,
} from "@vantage/backend/dto";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { FreshnessBadge } from "../components/FreshnessBadge";
import { Modal } from "../components/Modal";
import { ValueCostBasisChart } from "../components/ValueCostBasisChart";
import { assetsApi } from "../api/assets";
import { portfolioApi } from "../api/portfolio";
import { formatMoney, formatPct, signColor } from "../utils/format";

const ASSET_TYPES: AssetType[] = ["stock", "etf", "mutual_fund", "bond", "cash"];

// A fixed-rate deposit moves predictably with a known rate — a chart
// wouldn't show anything the numbers don't already, so it's skipped for
// this Asset type (see the mockup's own reasoning for the same case).
function chartEligible(type: AssetType) {
  return type !== "cash";
}

export function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [holdings, setHoldings] = useState<AssetHoldingBreakdown[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedAssetIds, setExpandedAssetIds] = useState<Set<string>>(new Set());

  async function refresh() {
    const [assetList, byAsset] = await Promise.all([assetsApi.list(), portfolioApi.byAsset()]);
    setAssets(assetList);
    setHoldings(byAsset.assets);
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

  const holdingsByAssetId = new Map(holdings.map((h) => [h.assetId, h]));

  // Open positions first (by total quantity desc — currency-agnostic, unlike
  // value which can't be compared across currencies without conversion, see
  // ADR 0005), closed positions and never-held Assets after, in registry
  // order — closed keeps its realized history instead of just disappearing
  // (ADR 0006), but still isn't a "current" holding for ranking purposes.
  const sortedAssets = [...assets].sort((a, b) => {
    const qa = Number(holdingsByAssetId.get(a.id)?.quantity ?? 0);
    const qb = Number(holdingsByAssetId.get(b.id)?.quantity ?? 0);
    if (qa === 0 && qb === 0) return 0;
    if (qa === 0) return 1;
    if (qb === 0) return -1;
    return qb - qa;
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
        {sortedAssets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            holding={holdingsByAssetId.get(asset.id)}
            isExpanded={expandedAssetIds.has(asset.id)}
            onToggle={() => toggleExpanded(asset.id)}
          />
        ))}
        {!isLoading && assets.length === 0 && (
          <Card className="text-center text-sm text-gray-500">No assets yet.</Card>
        )}
      </div>

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

function AssetCard({
  asset,
  holding,
  isExpanded,
  onToggle,
}: {
  asset: Asset;
  holding: AssetHoldingBreakdown | undefined;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isHeld = holding !== undefined && holding.valuesByCurrency.length > 0;
  // Every currency entry for one Asset moves open->closed together (closed
  // means zero current quantity overall) — the first entry's status stands
  // in for the whole Asset.
  const isClosed = isHeld && holding.valuesByCurrency[0].status === "closed";

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={isHeld ? onToggle : undefined}
        disabled={!isHeld}
        className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left disabled:cursor-default"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <p className={`truncate font-medium ${isClosed ? "text-gray-400" : "text-gray-900"}`}>
              {asset.name}
              {asset.ticker && (
                <span className="ml-1 font-normal text-gray-400">({asset.ticker})</span>
              )}
            </p>
          </div>
          <Badge className={isClosed ? "bg-gray-100 text-gray-400" : undefined}>{asset.type}</Badge>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {isHeld && (
            <FreshnessBadge
              status={holding.valuesByCurrency[0].status}
              freshness={holding.valuesByCurrency[0].freshness}
              closedAt={holding.valuesByCurrency[0].heldTo}
            />
          )}
          <span className={`text-sm ${isClosed ? "text-gray-300" : "text-gray-500"}`}>
            {isHeld && !isClosed ? holding.quantity : "—"}
          </span>
          <span className={`text-sm font-medium ${isClosed ? "text-gray-400" : "text-gray-900"}`}>
            {isHeld && !isClosed
              ? holding.valuesByCurrency
                  .map((v) => formatMoney(Number(v.value), v.currency))
                  .join(" · ")
              : "—"}
          </span>
          {isHeld && (isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
        </div>
      </button>

      {isExpanded && isHeld && (
        <div className="space-y-4 border-t border-gray-100 px-6 py-4">
          {holding.valuesByCurrency.map((v) => (
            <CurrencyDetail
              key={v.currency}
              assetId={asset.id}
              assetType={asset.type}
              value={v}
              showCurrencyLabel={holding.valuesByCurrency.length > 1}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function CurrencyDetail({
  assetId,
  assetType,
  value,
  showCurrencyLabel,
}: {
  assetId: string;
  assetType: AssetType;
  value: AssetCurrencyValue;
  showCurrencyLabel: boolean;
}) {
  if (value.status === "closed") {
    return <ClosedPositionDetail value={value} showCurrencyLabel={showCurrencyLabel} />;
  }

  return (
    <div>
      {showCurrencyLabel && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {value.currency}
        </p>
      )}

      {chartEligible(assetType) && (
        <div className="mb-4">
          <p className="mb-2 text-xs text-gray-400">
            Value vs. cost basis for this holding — shaded area is this asset's own real profit.
          </p>
          <AssetChart assetId={assetId} freshness={value.freshness} />
        </div>
      )}

      <MetricsGrid value={value} />
    </div>
  );
}

function AssetChart({
  assetId,
  freshness,
}: {
  assetId: string;
  freshness: AssetCurrencyValue["freshness"];
}) {
  const [history, setHistory] = useState<AssetHistory | null>(null);

  useEffect(() => {
    assetsApi.history(assetId).then(setHistory);
  }, [assetId]);

  if (!history) return null;

  const points = history.points.map((p) => ({
    date: p.date,
    value: Number(p.value),
    costBasis: Number(p.costBasis),
  }));
  const lastPoint = points[points.length - 1];
  const liveNow =
    freshness.kind === "live" && lastPoint
      ? { value: Number(history.points[history.points.length - 1].value) }
      : undefined;

  return <ValueCostBasisChart points={points} liveNow={liveNow} height={140} />;
}

function MetricsGrid({ value }: { value: AssetCurrencyValue }) {
  const profit = Number(value.profit);
  const simpleReturnPct = value.simpleReturnPct;

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
      <MetricRow label="Cost basis" value={formatMoney(Number(value.costBasis), value.currency)} />
      <MetricRow
        label="Profit"
        value={formatMoney(profit, value.currency)}
        className={signColor(profit)}
      />
      <MetricRow
        label="Return %"
        value={simpleReturnPct === null ? "—" : formatPct(simpleReturnPct)}
        className={simpleReturnPct === null ? undefined : signColor(simpleReturnPct)}
      />
      <MetricRow
        label="Tax on profit"
        value={formatMoney(Number(value.taxOnProfit), value.currency)}
      />
      <MetricRow label="Net of tax" value={formatMoney(Number(value.netOfTax), value.currency)} />
      {/* De-emphasized/hidden below the minimum holding period (#42) — the
          backend already collapses "too new" and "uncomputable" into the
          same null, so there's nothing more specific to show. */}
      {value.xirr !== null && (
        <MetricRow
          label="XIRR"
          value={formatPct(value.xirr * 100)}
          className={signColor(value.xirr)}
        />
      )}
    </dl>
  );
}

// A closed position (fully sold) keeps its realized outcome instead of
// disappearing into "—" — a distinct state from never having been held,
// see ADR 0006.
function ClosedPositionDetail({
  value,
  showCurrencyLabel,
}: {
  value: AssetCurrencyValue;
  showCurrencyLabel: boolean;
}) {
  const realizedProfit = Number(value.realizedProfit ?? 0);
  return (
    <div>
      {showCurrencyLabel && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {value.currency}
        </p>
      )}
      <p className="mb-3 text-xs text-gray-400">
        Fully sold — kept for its realized history, not blended into your current live/stale total.
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <MetricRow
          label="Held"
          value={value.heldFrom && value.heldTo ? `${value.heldFrom} – ${value.heldTo}` : "—"}
          className="text-gray-700"
        />
        <MetricRow
          label="Cost basis"
          value={formatMoney(Number(value.costBasis), value.currency)}
          className="text-gray-700"
        />
        <MetricRow
          label="Sold for"
          value={formatMoney(Number(value.realizedProceeds ?? 0), value.currency)}
          className="text-gray-700"
        />
        <MetricRow
          label="Realized profit"
          value={formatMoney(realizedProfit, value.currency)}
          className={signColor(realizedProfit)}
        />
        <MetricRow
          label="Return %"
          value={value.realizedReturnPct == null ? "—" : formatPct(value.realizedReturnPct)}
          className={
            value.realizedReturnPct == null ? undefined : signColor(value.realizedReturnPct)
          }
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
