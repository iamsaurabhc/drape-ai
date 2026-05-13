/**
 * POST /api/outfit/generate
 *
 * Two compose modes share this route — discriminated by the `mode` field:
 *
 *   mode: "outfit" (default)
 *     {
 *       characterId, garmentIds[],
 *       promptOverride?, numImages?, backgroundPreset?
 *     }
 *     → Multi-garment Seedream 4.5 Edit, 1024×1280 portrait.
 *
 *   mode: "accessory"
 *     {
 *       characterId, accessoryId, view: front|three-quarter|side,
 *       upscale?, numImages?, backgroundPreset?
 *     }
 *     → Head-and-shoulders eyewear shot, 1024×1024 square,
 *       optionally upscaled to ~3000×3000 via Clarity Upscaler so the
 *       output matches the 3000px PDP deliverable spec.
 *
 * Both branches return the same shape:
 *   { images: [{url}], promptUsed, requestId, estCostUsd, ... }
 *
 * Saving is a separate endpoint so users can iterate without polluting
 * their gallery.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  composeOutfit,
  composeAccessory,
  upscaleImage,
  COMPOSITION_MODEL,
  ACCESSORY_COMPOSITION_MODEL,
  UPSCALE_MODEL,
  type GarmentRef,
  type AccessoryView,
} from "@/lib/fal";
import { env } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase";

const BackgroundPreset = z.enum([
  "studio-white",
  "studio-gray",
  "outdoor-street",
  "golden-hour",
]);
const NumImages = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

const OutfitBody = z.object({
  mode: z.literal("outfit").optional(),
  characterId: z.string().uuid(),
  garmentIds: z.array(z.string().uuid()).min(1).max(8),
  promptOverride: z.string().min(20).max(2000).optional(),
  numImages: NumImages.optional(),
  backgroundPreset: BackgroundPreset.optional(),
});

const AccessoryBody = z.object({
  mode: z.literal("accessory"),
  characterId: z.string().uuid(),
  accessoryId: z.string().uuid(),
  view: z.enum(["front", "three-quarter", "side"]),
  upscale: z.boolean().optional(),
  numImages: NumImages.optional(),
  backgroundPreset: BackgroundPreset.optional(),
});

export async function POST(req: Request) {
  if (!env.fal.hasKey()) {
    return NextResponse.json(
      {
        error:
          "FAL_KEY not set. Composition uses Seedream 4 Edit on fal. Add FAL_KEY to .env.local.",
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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid JSON body." },
      { status: 400 },
    );
  }

  // Branch on `mode` so we can give cleaner Zod errors than a discriminated
  // union (which produces noisy union-level error messages on a typo).
  const mode = (raw as { mode?: string })?.mode ?? "outfit";

  if (mode === "accessory") {
    return handleAccessory(raw);
  }
  return handleOutfit(raw);
}

// -----------------------------------------------------------------------------
// Outfit branch — multi-garment, full-body
// -----------------------------------------------------------------------------

async function handleOutfit(raw: unknown) {
  let body: z.infer<typeof OutfitBody>;
  try {
    body = OutfitBody.parse(raw);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request body." },
      { status: 400 },
    );
  }

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
      {
        error: `Asset ${body.characterId} is type=${character.type}, expected 'character'.`,
      },
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
      mode: "outfit",
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

// -----------------------------------------------------------------------------
// Accessory branch — head-and-shoulders eyewear shot + optional 3000px upscale
// -----------------------------------------------------------------------------

async function handleAccessory(raw: unknown) {
  let body: z.infer<typeof AccessoryBody>;
  try {
    body = AccessoryBody.parse(raw);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request body." },
      { status: 400 },
    );
  }

  const sb = supabaseServer();
  const { data: rows, error } = await sb
    .from("assets")
    .select("id, name, type, image_url, metadata")
    .in("id", [body.characterId, body.accessoryId]);
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
      {
        error: `Asset ${body.characterId} is type=${character.type}, expected 'character'.`,
      },
      { status: 400 },
    );
  }

  const accessory = byId[body.accessoryId] as
    | {
        id: string;
        name: string;
        type: string;
        image_url: string;
        metadata?: { category?: string };
      }
    | undefined;
  if (!accessory) {
    return NextResponse.json(
      { error: `Accessory ${body.accessoryId} not found.` },
      { status: 404 },
    );
  }
  if (accessory.type !== "garment") {
    return NextResponse.json(
      {
        error: `Asset ${body.accessoryId} is type=${accessory.type}, expected 'garment'.`,
      },
      { status: 400 },
    );
  }
  // Soft category gate — we still allow other accessories (e.g. hats) to use
  // the portrait pathway, but warn loudly when the saved metadata doesn't
  // match the prompt template's intent.
  const cat = accessory.metadata?.category ?? null;
  if (cat && cat !== "eyewear" && cat !== "accessory") {
    return NextResponse.json(
      {
        error: `Accessory ${body.accessoryId} has category='${cat}'. Accessory mode is designed for eyewear (and other face-worn accessories). Use Outfit mode for body-worn garments.`,
      },
      { status: 400 },
    );
  }

  const numImages = body.numImages ?? 1;
  const upscale = body.upscale ?? false;

  try {
    const result = await composeAccessory({
      characterUrl: character.image_url,
      accessoryUrl: accessory.image_url,
      accessoryName: accessory.name,
      view: body.view as AccessoryView,
      backgroundPreset: body.backgroundPreset ?? "studio-white",
      numImages,
    });

    let images = result.images.map((img) => ({ url: img.url }));
    let upscaledCount = 0;

    if (upscale && images.length > 0) {
      // Run upscales in parallel — they share a fal account, so this is
      // bound by fal's per-account concurrency, not by us. With numImages
      // <= 4 we're well under any reasonable limit.
      const settled = await Promise.allSettled(
        images.map((img) =>
          upscaleImage({ imageUrl: img.url, scale: 3 }),
        ),
      );
      images = settled.map((s, i) => {
        if (s.status === "fulfilled" && s.value.images[0]?.url) {
          upscaledCount += 1;
          return { url: s.value.images[0].url };
        }
        // If a single upscale fails, fall back to the un-upscaled image
        // rather than failing the whole request — the user can re-run.
        return images[i];
      });
    }

    const baseCost = ACCESSORY_COMPOSITION_MODEL.estCostUsd * numImages;
    const upscaleCost = upscale ? UPSCALE_MODEL.estCostUsd * upscaledCount : 0;

    return NextResponse.json({
      mode: "accessory",
      images,
      promptUsed: result.promptUsed,
      requestId: result.requestId,
      estCostUsd: baseCost + upscaleCost,
      characterId: body.characterId,
      garmentIds: [body.accessoryId],
      backgroundPreset: body.backgroundPreset ?? "studio-white",
      view: body.view,
      upscaled: upscale && upscaledCount === images.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown fal error.";
    return NextResponse.json(
      { error: `Accessory composition failed: ${msg}` },
      { status: 502 },
    );
  }
}
