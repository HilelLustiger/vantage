import { Plus } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "./Button";
import { Card } from "./Card";

export interface ManualHoldingRow {
  assetName: string;
  quantity: string;
  value: string;
  currency: string;
}

const EMPTY_ROW: ManualHoldingRow = { assetName: "", quantity: "", value: "", currency: "ILS" };

// The right-hand pane for the preflight-abort reason (ADR-0008): no
// extraction ran at all, so every holding is entered from scratch, plus a
// statement-balance figure the user (not the backend) cross-checks their
// own entries against. Deliberately independent of `DocumentReview`/
// `DocumentResolution` — those don't have a shape for this yet (tracked in
// the DTO issue derived from this one); this component only needs plain
// row data in and a submit callback out.
export function ManualHoldingsForm({
  accountHolder,
  accountNumber,
  onCancel,
  onConfirm,
}: {
  accountHolder: string;
  accountNumber: string;
  onCancel: () => void;
  onConfirm: (holdings: ManualHoldingRow[], statementBalance: string) => void;
}) {
  const [rows, setRows] = useState<ManualHoldingRow[]>([{ ...EMPTY_ROW }, { ...EMPTY_ROW }]);
  const [statementBalance, setStatementBalance] = useState("");
  const headingId = useId();

  function updateRow(index: number, patch: Partial<ManualHoldingRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  const canConfirm = rows.some((row) => row.assetName.trim() && row.quantity && row.value);

  return (
    <Card className="flex w-[58%] flex-1 flex-col overflow-y-auto">
      <p className="mb-2 text-sm font-medium text-gray-500">
        Confirmed locally (never left your device)
      </p>
      <div className="mb-5 grid grid-cols-2 gap-2.5">
        <div className="rounded-md bg-gray-50 px-3 py-2">
          <p className="text-[11px] text-gray-400">Account holder</p>
          <p className="mt-0.5 text-sm font-medium text-gray-900">{accountHolder}</p>
        </div>
        <div className="rounded-md bg-gray-50 px-3 py-2">
          <p className="text-[11px] text-gray-400">Account number</p>
          <p className="mt-0.5 text-sm font-medium text-gray-900">{accountNumber}</p>
        </div>
      </div>

      <div className="mb-2.5 flex items-center justify-between">
        <p id={headingId} className="text-sm font-medium text-gray-500">
          Holdings
        </p>
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800"
        >
          <Plus size={14} />
          Add holding
        </button>
      </div>

      <div
        role="group"
        aria-labelledby={headingId}
        className="grid grid-cols-[2.2fr_1fr_1fr_0.8fr] gap-2 px-0.5 pb-1.5 text-[11px] text-gray-400"
      >
        <span>Asset</span>
        <span>Quantity</span>
        <span>Value</span>
        <span>Currency</span>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[2.2fr_1fr_1fr_0.8fr] gap-2">
            <input
              aria-label="Asset"
              placeholder="e.g. Migdal Gemel Fund"
              value={row.assetName}
              onChange={(e) => updateRow(i, { assetName: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              aria-label="Quantity"
              placeholder="0"
              value={row.quantity}
              onChange={(e) => updateRow(i, { quantity: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              aria-label="Value"
              placeholder="0.00"
              value={row.value}
              onChange={(e) => updateRow(i, { value: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              aria-label="Currency"
              value={row.currency}
              onChange={(e) => updateRow(i, { currency: e.target.value })}
              className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-gray-100 pt-4">
        <label className="mb-2 block text-sm font-medium text-gray-500" htmlFor="statement-balance">
          Statement balance (for cross-check)
        </label>
        <input
          id="statement-balance"
          placeholder="Total balance on the statement"
          value={statementBalance}
          onChange={(e) => setStatementBalance(e.target.value)}
          className="w-full max-w-[220px] rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
        />
      </div>

      <div className="flex-1" />

      <div className="mt-5 flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
        <Button disabled={!canConfirm} onClick={() => onConfirm(rows, statementBalance)}>
          Confirm &amp; commit
        </Button>
      </div>
    </Card>
  );
}
