// Where holdings are actually invested, not their Account currency — one
// combined sector+geography label per bucket, matching the mockup's legend
// ("Technology (US)", "Israeli gov't & fixed income", ...).
//
// FUTURE FEATURE — placeholder contract, not yet wired to a real data
// source. Unlike allocation-by-type, this can't obviously be derived from
// HoldingRow: a single holding (e.g. a mutual fund) can itself span several
// sectors/geographies, so it may need its own per-holding breakdown rather
// than a single label per row — undecided. Kept here so the shape exists
// when that's designed, not implemented against yet.
export type SectorAllocation = Array<{
  label: string;
  value: string;
  percentageOfTotal: number;
}>;
