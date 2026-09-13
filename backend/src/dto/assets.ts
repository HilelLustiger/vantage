import { z } from "zod";

const ASSET_TYPES = ["stock", "etf", "mutual_fund", "bond", "cash"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

// Asset identity only — what the Review page's picker and "create asset"
// flow need. Never carries valuation, so it's cheap to fetch in bulk.
export interface Asset {
  id: string;
  type: AssetType;
  name: string;
  ticker?: string;
  isin?: string;
  securityNumber?: string;
}

// Wire input for POST /api/assets — the single source of truth (see ADR
// 0009). The TS type is derived, never hand-duplicated.
export const NewAssetInputSchema = z.object({
  type: z.enum(ASSET_TYPES),
  name: z.string().min(1),
  ticker: z.string().min(1).optional(),
  isin: z.string().min(1).optional(),
  securityNumber: z.string().min(1).optional(),
});
export type NewAssetInput = z.infer<typeof NewAssetInputSchema>;
