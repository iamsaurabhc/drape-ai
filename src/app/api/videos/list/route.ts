/**
 * GET /api/videos/list?outfitId=...&limit=100
 *
 * If `outfitId` is provided, returns the videos for that outfit; otherwise
 * returns the most-recent N across the project (for the /videos gallery).
 */

import { NextResponse } from "next/server";
import { listAllVideos, listVideosByOutfit } from "@/lib/outfit_videos";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const outfitId = url.searchParams.get("outfitId");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 100, 200) : 100;

  try {
    const videos = outfitId
      ? await listVideosByOutfit(outfitId)
      : await listAllVideos({ limit });
    return NextResponse.json({ videos });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
