import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type {
  Asset,
  AssetType,
  CurrencyBreakdown,
  Portfolio,
  PortfolioHistory,
} from "@vantage/backend/dto";
import { Card } from "../components/Card";
import { ValueCostBasisChart } from "../components/ValueCostBasisChart";
import { assetsApi } from "../api/assets";
import { portfolioApi } from "../api/portfolio";
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
  const [assets, setAssets] = useState<Asset[]>([]);

  useEffect(() => {
    assetsApi.list().then(setAssets);
  }, []);

  const portfolio = useFetchState<Portfolio>(() => portfolioApi.get(currency), [currency]);
  const breakdown = useFetchState<CurrencyBreakdown>(
    () => portfolioApi.currencyBreakdown(currency),
    [currency],
  );
  const history = useFetchState<PortfolioHistory>(() => portfolioApi.history(currency), [currency]);

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const lines = portfolio.data?.lines ?? [];
  const total = lines.reduce((sum, line) => sum + Number(line.value), 0);

  const byType = new Map<AssetType, number>();
  for (const line of lines) {
    const type = assetsById.get(line.assetId)?.type ?? "cash";
    byType.set(type, (byType.get(type) ?? 0) + Number(line.value));
  }
  const allocation = [...byType.entries()]
    .map(([type, value]) => ({ type, value }))
    .sort((a, b) => b.value - a.value);

  const showEmptyState =
    !portfolio.isLoading && !portfolio.error && portfolio.data !== null && lines.length === 0;

  const historyPoints = (history.data?.points ?? []).map((p) => ({
    date: p.date,
    value: Number(p.value),
    costBasis: Number(p.costBasis),
  }));
  const liveValue = Number(portfolio.data?.liveValue ?? 0);
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
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <NetWorthCard
              total={total}
              currency={currency}
              portfolio={portfolio.data}
              breakdown={breakdown.data}
              error={portfolio.error ?? breakdown.error}
            />

            <Card>
              <p className="mb-2 text-sm font-medium text-gray-500">Allocation by type</p>
              {portfolio.error ? (
                <ErrorBanner message={portfolio.error} />
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

// Total net worth, merged with the live/document freshness split and the
// native-currency breakdown (ADR 0005), plus portfolio-level real profit
// (ADR 0006) — one card, since the breakdown/freshness/profit are all just
// context on the one headline total, not independent facts.
function NetWorthCard({
  total,
  currency,
  portfolio,
  breakdown,
  error,
}: {
  total: number;
  currency: string;
  portfolio: Portfolio | null;
  breakdown: CurrencyBreakdown | null;
  error: string | null;
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

  const liveValue = Number(portfolio?.liveValue ?? 0);
  const livePct = total > 0 ? (liveValue / total) * 100 : 0;
  const documentPct = 100 - livePct;
  const profit = portfolio ? Number(portfolio.profit) : 0;
  const simpleReturnPct = portfolio?.simpleReturnPct ?? null;

  return (
    <Card>
      <p className="text-sm font-medium text-gray-500">Total net worth</p>
      <p className="mb-3 mt-1 text-3xl font-semibold text-gray-900">
        {portfolio ? formatMoney(total, currency) : "—"}
      </p>

      {portfolio && total > 0 && (
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

      {portfolio && (
        <div className="mt-3.5 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Real profit</span>
            <span className={`text-sm font-semibold ${signColor(profit)}`}>
              {formatMoney(profit, currency)}
              {simpleReturnPct !== null &&
                ` · ${profit >= 0 ? "+" : ""}${formatPct(simpleReturnPct)}`}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
            Value beyond what you've put in — new contributions don't count as profit, only market
            movement does.
          </p>
        </div>
      )}

      {breakdown && breakdown.lines.length > 0 && (
        <div className="mt-3.5 border-t border-gray-100 pt-3">
          <span className="text-sm font-medium text-gray-500">By currency</span>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-gray-100">
            {breakdown.lines.map((line, i) => (
              <div
                key={line.currency}
                className={i % 2 === 0 ? "bg-emerald-500" : "bg-sky-500"}
                style={{ width: `${line.percentageOfPortfolio}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3.5 text-xs text-gray-500">
            {breakdown.lines.map((line, i) => (
              <span key={line.currency} className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${i % 2 === 0 ? "bg-emerald-500" : "bg-sky-500"}`}
                />
                {line.currency} · {formatMoney(Number(line.value), line.currency)} (
                {line.percentageOfPortfolio.toFixed(1)}%)
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
