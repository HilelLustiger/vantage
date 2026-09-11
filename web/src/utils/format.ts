export function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
}

export function formatPct(value: number) {
  return `${value.toFixed(1)}%`;
}

// gain green / loss red / flat gray — the whole point of a return figure is
// "did this do well."
export function signColor(value: number) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-600";
  return "text-gray-500";
}
