import type { Freshness } from "@vantage/backend/dto";
import { Badge } from "./Badge";

// Tier -> tone mapping only — the recent/aging/stale grading itself is a
// business rule the backend decides (see Freshness in dto/holdings.ts), not
// something this component recomputes from a raw day count.
const TIER_TONE: Record<Exclude<Freshness["tier"], "live">, string> = {
  recent: "bg-gray-100 text-gray-600",
  aging: "bg-amber-50 text-amber-700",
  stale: "bg-red-50 text-red-700",
};

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

function formatUpdatedAgo(seconds: number) {
  if (seconds < 30) return "updated just now";
  if (seconds < 60) return "updated seconds ago";
  const minutes = Math.round(seconds / 60);
  return `updated ${minutes}m ago`;
}

export function FreshnessBadge({
  status,
  freshness,
  closedOn,
}: {
  status: "open" | "closed";
  freshness: Freshness;
  /** Only read when status is "closed". */
  closedOn?: string;
}) {
  if (status === "closed") {
    return (
      <Badge className="bg-gray-100 text-gray-400">
        Closed{closedOn ? ` · sold ${formatShortDate(closedOn)}` : ""}
      </Badge>
    );
  }

  if (freshness.tier === "live") {
    return (
      <Badge className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700">
        <LiveDot />
        Live · {formatUpdatedAgo(freshness.updatedSecondsAgo)}
      </Badge>
    );
  }

  return (
    <Badge className={`flex items-center gap-1.5 ${TIER_TONE[freshness.tier]}`}>
      As of {formatShortDate(freshness.asOfDate)} · {freshness.daysAgo}d ago
    </Badge>
  );
}
