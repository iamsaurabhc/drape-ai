/**
 * GET /api/outfits/list?limit=50
 *
 * Returns recent outfits with their character + garment metadata hydrated,
 * so each tile is fully self-describing for the Composer gallery.
 */

import { NextResponse } from "next/server";
import { listOutfits } from "@/lib/outfits";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

  try {
    const outfits = await listOutfits({ limit });
    return NextResponse.json({ outfits });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
