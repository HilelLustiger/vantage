import type { Freshness } from "@vantage/backend/dto";
import { Badge } from "./Badge";

// Age tiers for a document-priced Holding's staleness — thresholds chosen
// to match the mockup's own examples (5d "recent", 16d "aging", 82d
// "stale"): a week feels current, a month feels dated, beyond that it's
// stale regardless of exactly how far.
const AGING_AFTER_DAYS = 7;
const STALE_AFTER_DAYS = 30;

function formatShortDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function LiveDot() {
  return (
    <span className="relative inline-flex h-[7px] w-[7px]">
      <span className="absolute inset-0 scale-[1.9] rounded-full bg-emerald-500 opacity-35" />
      <span className="relative h-[7px] w-[7px] rounded-full bg-emerald-500" />
    </span>
  );
}

export function FreshnessBadge({
  status,
  freshness,
  closedAt,
}: {
  status: "open" | "closed";
  freshness: Freshness;
  /** heldTo — only read when status is "closed". */
  closedAt?: string;
}) {
  if (status === "closed") {
    return (
      <Badge className="bg-gray-100 text-gray-400">
        Closed{closedAt ? ` · sold ${formatShortDate(closedAt)}` : ""}
      </Badge>
    );
  }

  if (freshness.kind === "live") {
    return (
      <Badge className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700">
        <LiveDot />
        Live · updated seconds ago
      </Badge>
    );
  }

  const { asOfDate, daysSinceStatement } = freshness;
  const tone =
    daysSinceStatement < AGING_AFTER_DAYS
      ? "bg-gray-100 text-gray-600"
      : daysSinceStatement < STALE_AFTER_DAYS
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-700";

  return (
    <Badge className={`flex items-center gap-1.5 ${tone}`}>
      As of {formatShortDate(asOfDate)} · {daysSinceStatement}d ago
    </Badge>
  );
}
