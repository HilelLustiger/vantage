// Stepped value line + dashed cost-basis line + shaded real-profit area —
// shared between the Dashboard's portfolio-level history and an Asset's
// own expanded history (ADR 0006). Both series are event-based: a point
// only exists where a Snapshot/cash_flow event actually happened, and the
// line only moves there, never continuously — see ADR 0006's "stays
// stepped, never a continuous line" decision.

interface Point {
  date: string;
  value: number;
  costBasis: number;
}

interface Coord {
  x: number;
  y: number;
}

const WIDTH = 1000;
const TOP_PAD = 16;
const BOTTOM_PAD = 28;
const LEFT_PAD = 8;

// Turns [(x0,y0), (x1,y1), ...] into the "step-after" coordinate sequence
// a stepped line/area needs: hold the previous value flat until the next
// event's date, then jump — never interpolate between two real values.
function stepCoords(coords: Coord[]): Coord[] {
  if (coords.length === 0) return [];
  const out: Coord[] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    out.push({ x: coords[i].x, y: coords[i - 1].y });
    out.push(coords[i]);
  }
  return out;
}

function toPath(coords: Coord[]): string {
  return coords.map((c) => `${c.x},${c.y}`).join(" ");
}

function formatShortDate(isoDate: string) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function ValueCostBasisChart({
  points,
  liveNow,
  height = 220,
}: {
  points: Point[];
  /** Today's live total, shown as a dashed connector past the last real
   * event point — only meaningful when at least one held Asset is
   * live-priced (ADR 0005). Omit entirely when nothing is live. */
  liveNow?: { value: number };
  height?: number;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-gray-400">—</p>;
  }

  const rightPad = liveNow ? 40 : 12;
  const plotWidth = WIDTH - LEFT_PAD - rightPad;
  const xStep = points.length > 1 ? plotWidth / (points.length - 1) : 0;
  const xFor = (i: number) => LEFT_PAD + xStep * i;
  const liveX = WIDTH - rightPad + 20;

  const allValues = points.flatMap((p) => [p.value, p.costBasis]);
  if (liveNow) allValues.push(liveNow.value);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const plotHeight = height - TOP_PAD - BOTTOM_PAD;
  const yFor = (v: number) => TOP_PAD + plotHeight - ((v - min) / range) * plotHeight;

  const valueCoords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.value) }));
  const costBasisCoords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.costBasis) }));
  const steppedValue = stepCoords(valueCoords);
  const steppedCostBasis = stepCoords(costBasisCoords);

  const areaPath = `${toPath(steppedValue)} ${toPath([...steppedCostBasis].reverse())}`;

  const lastValueCoord = valueCoords[valueCoords.length - 1];
  const liveCoord = liveNow ? { x: liveX, y: yFor(liveNow.value) } : undefined;

  // First, last, and up to two evenly-spaced dates in between — enough to
  // orient without crowding an axis whose point count varies with real
  // import history.
  const tickIndices = [
    ...new Set([
      0,
      Math.floor((points.length - 1) / 3),
      Math.floor(((points.length - 1) * 2) / 3),
      points.length - 1,
    ]),
  ];

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${WIDTH} ${height}`}
      style={{ overflow: "visible", display: "block" }}
    >
      {[0.1, 0.35, 0.6, 0.85].map((f) => (
        <line
          key={f}
          x1={0}
          y1={TOP_PAD + plotHeight * f}
          x2={WIDTH}
          y2={TOP_PAD + plotHeight * f}
          stroke="#e5e7eb"
          strokeDasharray="3 3"
        />
      ))}

      <polygon points={areaPath} fill="#10b981" fillOpacity={0.08} />

      <polyline
        points={toPath(steppedCostBasis)}
        fill="none"
        stroke="#9ca3af"
        strokeWidth={2}
        strokeDasharray="5 3"
      />
      {costBasisCoords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={3.5} fill="#9ca3af" />
      ))}

      <polyline
        points={toPath(steppedValue)}
        fill="none"
        stroke="#10b981"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {valueCoords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={4} fill="#10b981" />
      ))}

      {liveCoord && (
        <>
          <line
            x1={lastValueCoord.x}
            y1={lastValueCoord.y}
            x2={liveCoord.x}
            y2={liveCoord.y}
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
          <circle
            cx={liveCoord.x}
            cy={liveCoord.y}
            r={6}
            fill="#ffffff"
            stroke="#10b981"
            strokeWidth={2.5}
          />
          <circle cx={liveCoord.x} cy={liveCoord.y} r={2.5} fill="#10b981" />
          <text
            x={liveCoord.x - 45}
            y={liveCoord.y - 12}
            fontSize={11}
            fill="#059669"
            fontWeight={600}
          >
            Live now
          </text>
        </>
      )}

      {tickIndices.map((i) => (
        <text key={i} x={xFor(i)} y={height - 8} fontSize={11} fill="#6b7280">
          {formatShortDate(points[i].date)}
        </text>
      ))}
    </svg>
  );
}
