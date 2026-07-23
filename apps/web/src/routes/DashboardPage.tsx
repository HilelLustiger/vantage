import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  Asset,
  AssetType,
  CurrencyBreakdown,
  Portfolio,
  PortfolioHistory,
} from "@vantage/shared-types";
import { Card } from "../components/Card";
import { assetsApi } from "../lib/api/assets";
import { portfolioApi } from "../lib/api/portfolio";
import { ApiError } from "../lib/apiClient";

const CURRENCIES = ["ILS", "USD", "EUR"];

const TYPE_COLORS: Record<AssetType, string> = {
  stock: "#10b981",
  etf: "#0ea5e9",
  mutual_fund: "#8b5cf6",
  bond: "#f59e0b",
  cash: "#9ca3af",
};

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

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
  const history = useFetchState<PortfolioHistory>(
    () => portfolioApi.history(currency),
    [currency],
  );

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
  }));

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
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card>
              <p className="text-sm font-medium text-gray-500">Total net worth</p>
              {portfolio.error ? (
                <div className="mt-2">
                  <ErrorBanner message={portfolio.error} />
                </div>
              ) : (
                <p className="mt-1 text-3xl font-semibold text-gray-900">
                  {portfolio.data ? formatMoney(total, currency) : "—"}
                </p>
              )}
            </Card>

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
                      <Tooltip formatter={(value: unknown) => formatMoney(Number(value), currency)} />
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

            <Card>
              <p className="mb-2 text-sm font-medium text-gray-500">Currency breakdown</p>
              {breakdown.error ? (
                <ErrorBanner message={breakdown.error} />
              ) : !breakdown.data || breakdown.data.lines.length === 0 ? (
                <p className="text-sm text-gray-400">—</p>
              ) : (
                <div className="space-y-3">
                  {breakdown.data.lines.map((line) => (
                    <div key={line.currency}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-700">{line.currency}</span>
                        <span className="text-gray-500">
                          {formatMoney(Number(line.value), line.currency)} (
                          {line.percentageOfPortfolio.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-emerald-500"
                          style={{ width: `${line.percentageOfPortfolio}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card>
            <p className="mb-2 text-sm font-medium text-gray-500">Net worth over time</p>
            {history.error ? (
              <ErrorBanner message={history.error} />
            ) : historyPoints.length === 0 ? (
              <p className="text-sm text-gray-400">—</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={historyPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value: number) => formatMoney(value, currency)}
                    width={80}
                  />
                  <Tooltip formatter={(value: unknown) => formatMoney(Number(value), currency)} />
                  <Line type="monotone" dataKey="value" stroke="#10b981" dot />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
