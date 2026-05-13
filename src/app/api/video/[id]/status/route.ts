/**
 * GET /api/video/[id]/status
 *
 * One-shot status check for a single outfit_videos row. The client polls this
 * endpoint every ~3 seconds while a video is rendering.
 *
 * Behaviour:
 *   - If the row is already `completed` or `failed`, return it verbatim.
 *   - Otherwise call `checkFalVideoStatus(endpoint, requestId)` and:
 *       • status === "completed" → mirror the MP4 to Supabase, flip the row.
 *       • status === "failed"    → mark the row as failed.
 *       • status === "queued"/"running" → return the row unchanged so the
 *         client keeps polling.
 *
 * Each call makes ≤ 2 fal HTTP requests so we stay well inside Netlify's 60s
 * function limit.
 */

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { checkFalVideoStatus } from "@/lib/fal-video";
import {
  failVideo,
  finalizeVideo,
  getVideoById,
} from "@/lib/outfit_videos";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    return NextResponse.json(
      { error: "Supabase must be configured." },
      { status: 400 },
    );
  }
  const { id } = await ctx.params;

  const row = await getVideoById(id);
  if (!row) {
    return NextResponse.json({ error: `Video ${id} not found.` }, { status: 404 });
  }

  // Terminal states — nothing more to do.
  if (row.status === "completed" || row.status === "failed") {
    return NextResponse.json(row);
  }

  if (!row.providerRequestId || !row.providerEndpoint) {
    const failed = await failVideo(
      id,
      "Row is missing the provider request_id / endpoint — can't poll fal.",
    );
    return NextResponse.json(failed ?? row, { status: 500 });
  }

  try {
    const remote = await checkFalVideoStatus(
      row.providerEndpoint,
      row.providerRequestId,
    );
    console.log(
      `[video/status] id=${id} request_id=${row.providerRequestId} endpoint=${row.providerEndpoint} → ${remote.status}`,
    );

    if (remote.status === "completed") {
      if (!remote.videoUrl) {
        const failed = await failVideo(
          id,
          "fal reported completed but did not return a video URL.",
        );
        return NextResponse.json(failed ?? row, { status: 502 });
      }
      const finalised = await finalizeVideo(id, remote.videoUrl);
      return NextResponse.json(finalised);
    }

    if (remote.status === "failed") {
      const failed = await failVideo(
        id,
        remote.error ?? "fal reported the job as failed.",
      );
      return NextResponse.json(failed ?? row);
    }

    // queued / running — just return the row as-is so the client can keep
    // polling. Status hasn't changed on our side yet.
    return NextResponse.json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown status error.";
    console.error(`[video/status] id=${id} error`, err);
    // A transient fal network blip shouldn't fail the whole video — we
    // leave the row in `running` state and let the client retry on its next
    // poll tick.
    return NextResponse.json({ ...row, error: msg }, { status: 200 });
  }
}
