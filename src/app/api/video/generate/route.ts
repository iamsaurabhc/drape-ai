/**
 * POST /api/video/generate
 *
 * Body:
 *   {
 *     outfitId: uuid,
 *     modelId: "seedance-2-fast" | "seedance-2-pro" | "kling-3-pro",
 *     motionPreset: MotionPresetId,
 *     customPrompt?: string,
 *     durationSeconds: number,
 *   }
 *
 * Server-side flow (non-blocking):
 *   1. Look up the outfit → grab its `result_image_url` (the catalog image).
 *   2. Submit to fal's image-to-video queue and capture the request_id.
 *   3. Insert a `running` row in `outfit_videos` storing (provider_request_id,
 *      provider_endpoint) so the status route can re-derive everything.
 *   4. Return the row immediately (status="running").
 *
 * The client then polls GET /api/video/[id]/status every few seconds until
 * the row transitions to `completed` or `failed`. This avoids the previous
 * 5-min blocking request that timed out under Netlify's 60s function limit.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase";
import { submitOutfitVideo, VIDEO_MODELS } from "@/lib/video";
import { insertPendingVideo } from "@/lib/outfit_videos";

const Body = z.object({
  outfitId: z.string().uuid(),
  modelId: z.enum(["seedance-2-fast", "seedance-2-pro", "kling-3-pro"]),
  motionPreset: z.enum([
    "subtle-studio",
    "editorial-turn",
    "walk-forward",
    "catwalk-pass",
    "detail-pan",
    "hair-fabric",
    "custom",
  ]),
  customPrompt: z.string().max(2000).optional(),
  // Duration is validated per-model below — each fal endpoint has a different
  // allowed set (e.g. Kling 3.0 Pro = [5, 10], Seedance 2.0 Pro = [4..15]).
  durationSeconds: z.number().int().positive().max(60),
  // Resolution is optional — if omitted we use the model's default (480p for
  // the fast tier, 720p for everything else). Validated per-model below so
  // we don't bill 1080p on a model that doesn't allow it.
  resolution: z.enum(["480p", "720p", "1080p"]).optional(),
});

export async function POST(req: Request) {
  if (!env.fal.hasKey()) {
    return NextResponse.json(
      {
        error:
          "FAL_KEY is not set. Image-to-video uses fal.ai. Add the key to .env.local.",
      },
      { status: 400 },
    );
  }
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    return NextResponse.json(
      {
        error:
          "Supabase must be configured — video generation reads the source outfit and writes the resulting MP4 to Storage.",
      },
      { status: 400 },
    );
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request body." },
      { status: 400 },
    );
  }

  if (body.motionPreset === "custom") {
    if (!body.customPrompt || body.customPrompt.trim().length < 12) {
      return NextResponse.json(
        {
          error:
            "Custom motion requires a custom prompt of at least 12 characters.",
        },
        { status: 400 },
      );
    }
  }

  const modelMeta = VIDEO_MODELS[body.modelId];
  if (!modelMeta.allowedDurations.includes(body.durationSeconds)) {
    return NextResponse.json(
      {
        error: `${modelMeta.label} only supports ${modelMeta.allowedDurations
          .map((d) => `${d}s`)
          .join(" / ")}. Got ${body.durationSeconds}s.`,
      },
      { status: 400 },
    );
  }
  if (body.resolution && !modelMeta.allowedResolutions.includes(body.resolution)) {
    return NextResponse.json(
      {
        error: `${modelMeta.label} only supports ${modelMeta.allowedResolutions.join(" / ")}. Got ${body.resolution}.`,
      },
      { status: 400 },
    );
  }

  const sb = supabaseServer();
  const { data: outfit, error: outfitErr } = await sb
    .from("outfits")
    .select("id, result_image_url, status")
    .eq("id", body.outfitId)
    .single();
  if (outfitErr || !outfit) {
    return NextResponse.json(
      { error: `Outfit ${body.outfitId} not found.` },
      { status: 404 },
    );
  }
  const sourceImageUrl = outfit.result_image_url as string | null;
  if (!sourceImageUrl) {
    return NextResponse.json(
      {
        error:
          "Source outfit has no result image yet — only completed outfits can be animated.",
      },
      { status: 400 },
    );
  }

  try {
    const submission = await submitOutfitVideo({
      modelId: body.modelId,
      imageUrl: sourceImageUrl,
      motionPreset: body.motionPreset,
      customPrompt: body.customPrompt,
      durationSeconds: body.durationSeconds,
      resolution: body.resolution,
    });

    const pending = await insertPendingVideo({
      outfitId: body.outfitId,
      sourceImageUrl,
      prompt: submission.promptUsed,
      motionPreset: body.motionPreset,
      model: body.modelId,
      durationSeconds: submission.effectiveDurationSeconds,
      resolution: submission.effectiveResolution,
      providerRequestId: submission.requestId,
      providerEndpoint: submission.endpoint,
      // Use the per-second × resolution estimate from the registry, not a
      // flat rate. Honest cost reporting matters since fal bills can vary
      // 4× across the resolution dimension alone.
      costUsd: submission.estCostUsd,
    });

    return NextResponse.json(pending);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown video error.";
    console.error("[video/generate] submit failed", err);
    return NextResponse.json(
      { error: `Video submit failed: ${msg}` },
      { status: 502 },
    );
  }
}
