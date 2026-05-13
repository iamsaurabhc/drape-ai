/**
 * GET /api/assets/list?type=garment&category=bag&limit=100
 *
 * Returns saved assets from Supabase, optionally filtered. Used by the
 * Garment Studio library grid and (later) the Outfit Composer.
 */

import { NextResponse } from "next/server";
import { listAssets, type AssetType, type GarmentCategory } from "@/lib/assets";

const VALID_TYPES: AssetType[] = ["character", "garment", "backdrop"];
const VALID_CATEGORIES: GarmentCategory[] = [
  "top",
  "bottom",
  "outer",
  "dress",
  "bag",
  "shoes",
  "accessory",
  "eyewear",
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const typeParam = url.searchParams.get("type");
  const categoryParam = url.searchParams.get("category");
  const limitParam = url.searchParams.get("limit");
  const pinnedParam = url.searchParams.get("pinned");

  const type =
    typeParam && VALID_TYPES.includes(typeParam as AssetType)
      ? (typeParam as AssetType)
      : undefined;
  const category =
    categoryParam &&
    VALID_CATEGORIES.includes(categoryParam as GarmentCategory)
      ? (categoryParam as GarmentCategory)
      : undefined;
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 200, 500) : 200;
  const pinnedOnly = pinnedParam === "true" || pinnedParam === "1";

  try {
    const assets = await listAssets({ type, category, limit, pinnedOnly });
    return NextResponse.json({ assets });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
