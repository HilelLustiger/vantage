import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type {
  AssetType,
  HoldingRow,
  NetWorthHistory,
  OpenHoldingDetail,
} from "@vantage/backend/dto";
import { Card } from "../components/Card";
import { ValueCostBasisChart } from "../components/ValueCostBasisChart";
import { holdingsApi } from "../api/holdings";
import { ApiError } from "../api/client";
import { formatMoney, formatPct, signColor } from "../utils/format";

const CURRENCIES = ["ILS", "USD", "EUR"];

const TYPE_COLORS: Record<AssetType, string> = {
  stock: "#10b981",
  etf: "#0ea5e9",
  mutual_fund: "#8b5cf6",
  bond: "#f59e0b",
  cash: "#9ca3af",
};

// A handful of distinct colors for the "By currency" bar — cycled by
// insertion order since the set of currencies actually held is open-ended,
// unlike asset type which has a fixed, known palette above.
const CURRENCY_COLORS = ["#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#9ca3af"];

interface FetchState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

function useFetchState<T>(fetch: () => Promise<T>, deps: unknown[]): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ data: null, error: null, isLoading: true });

  useEffect(() => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    fetch()
      .then((data) => setState({ data, error: null, isLoading: false }))
      .catch((err) =>
        setState({
          data: null,
          error: err instanceof ApiError ? err.message : "Something went wrong",
          isLoading: false,
        }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

export function DashboardPage() {
  const [currency, setCurrency] = useState("ILS");

  const holdings = useFetchState<HoldingRow[]>(() => holdingsApi.list(currency), [currency]);
  const history = useFetchState<NetWorthHistory>(() => holdingsApi.history(currency), [currency]);

  // Every card below is a group-by/sum over the same holdings the Assets
  // table fetches — see the comment on HoldingRow in dto/holdings.ts for why
  // there's no separate portfolio-summary query.
  const openHoldings = (holdings.data ?? []).filter(
    (h): h is HoldingRow & { detail: OpenHoldingDetail } => h.detail.status === "open",
  );
  const total = openHoldings.reduce((sum, h) => sum + Number(h.value ?? 0), 0);

  const liveHoldings = openHoldings.filter((h) => h.freshness.tier === "live");
  const liveValue = liveHoldings.reduce((sum, h) => sum + Number(h.value ?? 0), 0);

  const realProfit = openHoldings.reduce((sum, h) => sum + Number(h.detail.profit), 0);
  // Simple aggregate return — profit over cost basis across every open
  // holding, in the same display currency as `total`.
  const totalCostBasis = openHoldings.reduce((sum, h) => sum + Number(h.detail.costBasis), 0);
  const realProfitPct = totalCostBasis > 0 ? (realProfit / totalCostBasis) * 100 : null;

  const byType = new Map<AssetType, number>();
  for (const h of openHoldings) {
    byType.set(h.type, (byType.get(h.type) ?? 0) + Number(h.value ?? 0));
  }
  const allocation = [...byType.entries()]
    .map(([type, value]) => ({ type, value }))
    .sort((a, b) => b.value - a.value);

  // Native-currency buckets — nativeValue/nativeCurrency, not the
  // display-converted `value`, since grouping by currency only means
  // something before conversion collapses everything into one.
  const byCurrency = new Map<string, number>();
  for (const h of openHoldings) {
    byCurrency.set(
      h.nativeCurrency,
      (byCurrency.get(h.nativeCurrency) ?? 0) + Number(h.nativeValue ?? 0),
    );
  }
  const currencyBreakdown = [...byCurrency.entries()].map(([curr, nativeValue]) => {
    const displayValue = openHoldings
      .filter((h) => h.nativeCurrency === curr)
      .reduce((sum, h) => sum + Number(h.value ?? 0), 0);
    return {
      currency: curr,
      nativeValue,
      percentageOfTotal: total > 0 ? (displayValue / total) * 100 : 0,
    };
  });

  const showEmptyState = !holdings.isLoading && !holdings.error && holdings.data?.length === 0;

  const historyPoints = (history.data ?? []).map((p) => ({
    date: p.date,
    value: Number(p.portfolioValue),
    costBasis: Number(p.costBasis),
    tooltipLabel: historyTooltipLabel(p.event),
  }));
  const chartLiveNow = liveValue > 0 ? { value: total } : undefined;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
        <select
          aria-label="Display currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {showEmptyState && (
        <Card className="text-center text-sm text-gray-500">
          No holdings yet —{" "}
          <Link to="/import" className="font-medium text-emerald-700 hover:text-emerald-800">
            import a statement
          </Link>{" "}
          to see your portfolio.
        </Card>
      )}

      {!showEmptyState && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.2fr_1fr_1fr]">
            <NetWorthCard
              total={total}
              currency={currency}
              liveValue={liveValue}
              realProfit={realProfit}
              realProfitPct={realProfitPct}
              currencyBreakdown={currencyBreakdown}
              error={holdings.error}
              hasData={holdings.data !== null}
            />

            <Card>
              <p className="mb-2 text-sm font-medium text-gray-500">Allocation by type</p>
              {holdings.error ? (
                <ErrorBanner message={holdings.error} />
              ) : allocation.length === 0 ? (
                <p className="text-sm text-gray-400">—</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={allocation}
                        dataKey="value"
                        nameKey="type"
                        innerRadius={35}
                        outerRadius={70}
                      >
                        {allocation.map((entry) => (
                          <Cell key={entry.type} fill={TYPE_COLORS[entry.type]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: unknown) => formatMoney(Number(value), currency)}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="mt-2 space-y-1 text-xs text-gray-600">
                    {allocation.map((entry) => (
                      <li key={entry.type} className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: TYPE_COLORS[entry.type] }}
                        />
                        {entry.type} — {formatMoney(entry.value, currency)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>

            <SectorGeographyCard />
          </div>

          <Card>
            <div className="mb-1 flex items-baseline justify-between">
              <p className="text-sm font-medium text-gray-500">Net worth over time</p>
              <p className="text-xs text-gray-400">
                One point per imported statement — today's value updates live, cost basis only moves
                when you actually add money.
              </p>
            </div>
            {history.error ? (
              <ErrorBanner message={history.error} />
            ) : (
              <ValueCostBasisChart points={historyPoints} liveNow={chartLiveNow} height={240} />
            )}
            <div className="mt-3 flex items-center gap-5 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-emerald-500" />
                Portfolio value
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 bg-gray-400" />
                Cost basis (money put in)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500 opacity-25" />
                Shaded = real profit
              </span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function historyTooltipLabel(event: NetWorthHistory[number]["event"]) {
  if (!event) return "Statement imported";
  if (event.kind === "statement_imported") {
    return event.institutionName
      ? `Statement imported · ${event.institutionName}`
      : "Statement imported";
  }
  const verb = event.kind === "purchase" ? "Purchased" : "Sold";
  return event.assetName ? `${verb} ${event.quantity ?? ""} ${event.assetName}`.trim() : verb;
}

// Placeholder until the backend exposes real sector/geography classification
// (see SectorAllocation in dto/dashboard.ts) — where holdings are actually
// invested, not their Account currency. Frontend-only fixture, not derived
// from any real data yet.
const MOCK_SECTOR_GEOGRAPHY = [
  { label: "Technology (US)", percentageOfPortfolio: 34, color: "#0ea5e9" },
  { label: "Israeli gov't & fixed income", percentageOfPortfolio: 22, color: "#f59e0b" },
  { label: "Financials", percentageOfPortfolio: 18, color: "#8b5cf6" },
  { label: "Cash & other", percentageOfPortfolio: 17, color: "#9ca3af" },
  { label: "Healthcare", percentageOfPortfolio: 9, color: "#10b981" },
];

function SectorGeographyCard() {
  return (
    <Card>
      <p className="mb-0.5 text-sm font-medium text-gray-500">Sector &amp; geography</p>
      <p className="mb-2 text-xs text-gray-400">
        Where holdings are actually invested, not their Account currency.
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={MOCK_SECTOR_GEOGRAPHY}
            dataKey="percentageOfPortfolio"
            nameKey="label"
            innerRadius={35}
            outerRadius={70}
          >
            {MOCK_SECTOR_GEOGRAPHY.map((entry) => (
              <Cell key={entry.label} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value: unknown) => `${value}%`} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-2 space-y-1 text-xs text-gray-600">
        {MOCK_SECTOR_GEOGRAPHY.map((entry) => (
          <li key={entry.label} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.label} — {entry.percentageOfPortfolio}%
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Total net worth, merged with the live/document freshness split and the
// native-currency breakdown, plus portfolio-level real profit — one card,
// since the breakdown/freshness/profit are all just context on the one
// headline total, not independent facts.
function NetWorthCard({
  total,
  currency,
  liveValue,
  realProfit,
  realProfitPct,
  currencyBreakdown,
  error,
  hasData,
}: {
  total: number;
  currency: string;
  liveValue: number;
  realProfit: number;
  realProfitPct: number | null;
  currencyBreakdown: Array<{ currency: string; nativeValue: number; percentageOfTotal: number }>;
  error: string | null;
  hasData: boolean;
}) {
  if (error) {
    return (
      <Card>
        <p className="text-sm font-medium text-gray-500">Total net worth</p>
        <div className="mt-2">
          <ErrorBanner message={error} />
        </div>
      </Card>
    );
  }

  const livePct = total > 0 ? (liveValue / total) * 100 : 0;
  const documentPct = 100 - livePct;

  return (
    <Card>
      <p className="text-sm font-medium text-gray-500">Total net worth</p>
      <p className="mb-3 mt-1 text-3xl font-semibold text-gray-900">
        {hasData ? formatMoney(total, currency) : "—"}
      </p>

      {hasData && total > 0 && (
        <>
          <div className="flex h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="bg-emerald-500" style={{ width: `${livePct}%` }} />
            <div className="bg-gray-300" style={{ width: `${documentPct}%` }} />
          </div>
          <div className="mt-3 flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-gray-700">
                <span className="relative inline-flex h-2 w-2">
                  <span className="absolute inset-0 scale-150 rounded-full bg-emerald-500 opacity-35" />
                  <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live-priced · {livePct.toFixed(0)}%
              </span>
              <span className="text-gray-400">updated seconds ago</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-gray-700">
                <span className="inline-block h-2 w-2 rounded-full bg-gray-300" />
                Statement-based · {documentPct.toFixed(0)}%
              </span>
              <span className="text-gray-400">as of your last imports</span>
            </div>
          </div>
        </>
      )}

      {hasData && (
        <div className="mt-3.5 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Real profit</span>
            <span className={`text-sm font-semibold ${signColor(realProfit)}`}>
              {formatMoney(realProfit, currency)}
              {realProfitPct !== null &&
                ` · ${realProfit >= 0 ? "+" : ""}${formatPct(realProfitPct)}`}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
            Value beyond what you've put in — new contributions don't count as profit, only market
            movement does.
          </p>
        </div>
      )}

      {currencyBreakdown.length > 0 && (
        <div className="mt-3.5 border-t border-gray-100 pt-3">
          <span className="text-sm font-medium text-gray-500">By currency</span>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-gray-100">
            {currencyBreakdown.map((line, i) => (
              <div
                key={line.currency}
                style={{
                  width: `${line.percentageOfTotal}%`,
                  backgroundColor: CURRENCY_COLORS[i % CURRENCY_COLORS.length],
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3.5 text-xs text-gray-500">
            {currencyBreakdown.map((line, i) => (
              <span key={line.currency} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: CURRENCY_COLORS[i % CURRENCY_COLORS.length] }}
                />
                {line.currency} · {formatMoney(line.nativeValue, line.currency)} (
                {line.percentageOfTotal.toFixed(1)}%)
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
