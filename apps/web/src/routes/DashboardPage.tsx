import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Asset, AssetType, Portfolio } from "@vantage/shared-types";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from "../components/Table";
import { assetsApi } from "../lib/api/assets";
import { portfolioApi } from "../lib/api/portfolio";
import { ApiError } from "../lib/apiClient";

const CURRENCIES = ["ILS", "USD", "EUR"];

const TYPE_COLORS: Record<AssetType, string> = {
  stock: "bg-emerald-500",
  etf: "bg-sky-500",
  mutual_fund: "bg-violet-500",
  bond: "bg-amber-500",
  cash: "bg-gray-400",
};

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

export function DashboardPage() {
  const [currency, setCurrency] = useState("ILS");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    assetsApi.list().then(setAssets);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    portfolioApi
      .get(currency)
      .then((result) => setPortfolio(result))
      .catch((err) => {
        setPortfolio(null);
        setError(err instanceof ApiError ? err.message : "Something went wrong");
      })
      .finally(() => setIsLoading(false));
  }, [currency]);

  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const lines = portfolio?.lines ?? [];
  const total = lines.reduce((sum, line) => sum + Number(line.value), 0);

  const byType = new Map<AssetType, number>();
  for (const line of lines) {
    const type = assetsById.get(line.assetId)?.type ?? "cash";
    byType.set(type, (byType.get(type) ?? 0) + Number(line.value));
  }
  const allocation = [...byType.entries()].sort((a, b) => b[1] - a[1]);

  const sortedLines = [...lines].sort((a, b) => Number(b.value) - Number(a.value));

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

      {error && (
        <Card className="mb-6 border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>
      )}

      {!isLoading && !error && lines.length === 0 && (
        <Card className="text-center text-sm text-gray-500">
          No holdings yet —{" "}
          <Link to="/import" className="font-medium text-emerald-700 hover:text-emerald-800">
            import a statement
          </Link>{" "}
          to see your portfolio.
        </Card>
      )}

      {!error && lines.length > 0 && (
        <div className="space-y-6">
          <Card>
            <p className="text-sm font-medium text-gray-500">Total net worth</p>
            <p className="mt-1 text-3xl font-semibold text-gray-900">
              {formatMoney(total, currency)}
            </p>
          </Card>

          <Card>
            <p className="mb-4 text-sm font-medium text-gray-500">Allocation by type</p>
            <div className="space-y-3">
              {allocation.map(([type, value]) => {
                const pct = total === 0 ? 0 : (value / total) * 100;
                return (
                  <div key={type}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-700">{type}</span>
                      <span className="text-gray-500">
                        {formatMoney(value, currency)} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100">
                      <div
                        className={`h-2 rounded-full ${TYPE_COLORS[type]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-0">
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Asset</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Quantity</TableHeaderCell>
                  <TableHeaderCell>Value</TableHeaderCell>
                  <TableHeaderCell>% of portfolio</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {sortedLines.map((line) => {
                  const asset = assetsById.get(line.assetId);
                  const value = Number(line.value);
                  const pct = total === 0 ? 0 : (value / total) * 100;
                  return (
                    <tr key={line.assetId}>
                      <TableCell className="font-medium text-gray-900">
                        {asset?.name ?? "Unknown asset"}
                        {asset?.ticker && (
                          <span className="ml-1 font-normal text-gray-400">({asset.ticker})</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge>{asset?.type ?? "—"}</Badge>
                      </TableCell>
                      <TableCell>{line.quantity}</TableCell>
                      <TableCell>{formatMoney(value, currency)}</TableCell>
                      <TableCell>{pct.toFixed(1)}%</TableCell>
                    </tr>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}
