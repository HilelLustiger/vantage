import { useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import type { Asset, AssetType } from "@vantage/shared-types";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Modal } from "../components/Modal";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell } from "../components/Table";
import { assetsApi } from "../lib/api/assets";

const ASSET_TYPES: AssetType[] = ["stock", "etf", "mutual_fund", "bond", "cash"];

export function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  async function refresh() {
    setAssets(await assetsApi.list());
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Assets</h1>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={16} className="mr-1" />
          Add asset
        </Button>
      </div>

      <Card className="p-0">
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Type</TableHeaderCell>
              <TableHeaderCell>Ticker</TableHeaderCell>
              <TableHeaderCell>ISIN</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {assets.map((asset) => (
              <tr key={asset.id}>
                <TableCell className="font-medium text-gray-900">{asset.name}</TableCell>
                <TableCell>
                  <Badge>{asset.type}</Badge>
                </TableCell>
                <TableCell>{asset.ticker ?? "—"}</TableCell>
                <TableCell>{asset.isin ?? "—"}</TableCell>
              </tr>
            ))}
          </TableBody>
        </Table>
        {!isLoading && assets.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-500">No assets yet.</p>
        )}
      </Card>

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
