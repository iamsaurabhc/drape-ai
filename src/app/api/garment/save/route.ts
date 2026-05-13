/**
 * POST /api/garment/save
 *
 * Body: { name, category, sourceUrl, prompt?, generatedByModel? }
 *
 * Persists a fal-generated garment image to Supabase Storage + assets table,
 * tagged with its category so the Outfit Composer can filter by it.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { saveAsset } from "@/lib/assets";
import { env } from "@/lib/env";

const Body = z.object({
  name: z.string().min(1).max(80),
  category: z.enum([
    "top",
    "bottom",
    "outer",
    "dress",
    "bag",
    "shoes",
    "accessory",
    "eyewear",
  ]),
  sourceUrl: z.string().url(),
  prompt: z.string().optional(),
  generatedByModel: z.string().optional(),
  sku: z.string().min(1).max(60).optional(),
});

export async function POST(req: Request) {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to .env.local, then run supabase/migrations/0001_initial.sql.",
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

  try {
    const saved = await saveAsset({
      name: body.name,
      type: "garment",
      sourceUrl: body.sourceUrl,
      prompt: body.prompt,
      generatedByModel: body.generatedByModel,
      metadata: {
        category: body.category,
        source: "generated",
        ...(body.sku ? { sku: body.sku } : {}),
      },
    });
    return NextResponse.json(saved);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
