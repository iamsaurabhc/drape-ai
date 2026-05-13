/**
 * POST /api/outfit/generate
 *
 * Body:
 *   {
 *     characterId: string,
 *     garmentIds: string[]   // 1..8, fetched server-side from assets table
 *     promptOverride?: string,
 *     numImages?: 1 | 2 | 3 | 4
 *   }
 *
 * Server-side flow:
 *   1. Look up each asset to get its image URL + category (so the prompt can
 *      use category language).
 *   2. Call composeOutfit() — single Seedream 4 Edit call with multi-reference.
 *   3. Return the result URL (NOT persisted yet — Save is a separate endpoint
 *      so users can iterate without polluting their gallery).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { composeOutfit, COMPOSITION_MODEL, type GarmentRef } from "@/lib/fal";
import { env } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase";

const Body = z.object({
  characterId: z.string().uuid(),
  garmentIds: z.array(z.string().uuid()).min(1).max(8),
  promptOverride: z.string().min(20).max(2000).optional(),
  numImages: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .optional(),
  backgroundPreset: z
    .enum(["studio-white", "studio-gray", "outdoor-street", "golden-hour"])
    .optional(),
});

export async function POST(req: Request) {
  if (!env.fal.hasKey()) {
    return NextResponse.json(
      {
        error:
          "FAL_KEY not set. Outfit composition uses Seedream 4 Edit on fal. Add FAL_KEY to .env.local.",
      },
      { status: 400 },
    );
  }
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    return NextResponse.json(
      {
        error:
          "Supabase must be configured — the Composer reads characters and garments from the assets table.",
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

  // Resolve assets server-side so the client cannot forge image URLs.
  const sb = supabaseServer();
  const { data: rows, error } = await sb
    .from("assets")
    .select("id, name, type, image_url, metadata")
    .in("id", [body.characterId, ...body.garmentIds]);
  if (error) {
    return NextResponse.json(
      { error: `Asset lookup failed: ${error.message}` },
      { status: 500 },
    );
  }
  const byId = Object.fromEntries(
    (rows ?? []).map((r) => [r.id as string, r as never]),
  );

  const character = byId[body.characterId] as
    | { id: string; type: string; image_url: string; name: string }
    | undefined;
  if (!character) {
    return NextResponse.json(
      { error: `Character ${body.characterId} not found.` },
      { status: 404 },
    );
  }
  if (character.type !== "character") {
    return NextResponse.json(
      { error: `Asset ${body.characterId} is type=${character.type}, expected 'character'.` },
      { status: 400 },
    );
  }

  const garments: GarmentRef[] = [];
  for (const gid of body.garmentIds) {
    const g = byId[gid] as
      | {
          id: string;
          name: string;
          type: string;
          image_url: string;
          metadata?: { category?: string };
        }
      | undefined;
    if (!g) {
      return NextResponse.json(
        { error: `Garment ${gid} not found.` },
        { status: 404 },
      );
    }
    if (g.type !== "garment") {
      return NextResponse.json(
        { error: `Asset ${gid} is type=${g.type}, expected 'garment'.` },
        { status: 400 },
      );
    }
    garments.push({
      url: g.image_url,
      category: g.metadata?.category,
      name: g.name,
    });
  }

  try {
    const result = await composeOutfit({
      characterUrl: character.image_url,
      garments,
      promptOverride: body.promptOverride,
      numImages: body.numImages,
      backgroundPreset: body.backgroundPreset,
    });

    return NextResponse.json({
      images: result.images.map((img) => ({ url: img.url })),
      promptUsed: result.promptUsed,
      requestId: result.requestId,
      estCostUsd: COMPOSITION_MODEL.estCostUsd * (body.numImages ?? 1),
      characterId: body.characterId,
      garmentIds: body.garmentIds,
      backgroundPreset: body.backgroundPreset ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown fal error.";
    return NextResponse.json(
      { error: `Composition failed: ${msg}` },
      { status: 502 },
    );
  }
}
