/**
 * POST /api/outfit/save
 *
 * Body:
 *   {
 *     characterId, garmentIds, promptOverride?, promptUsed,
 *     sourceImageUrl, falRequestId?, costUsd
 *   }
 *
 * Persists a completed composition to the `outfits` table, mirroring the
 * fal CDN image to Supabase Storage. Returns the fully-hydrated outfit.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { saveCompletedOutfit } from "@/lib/outfits";
import { env } from "@/lib/env";

const Body = z.object({
  characterId: z.string().uuid().nullable(),
  garmentIds: z.array(z.string().uuid()).min(0).max(8),
  promptOverride: z.string().optional(),
  promptUsed: z.string(),
  sourceImageUrl: z.string().url(),
  falRequestId: z.string().optional(),
  costUsd: z.number().min(0),
});

export async function POST(req: Request) {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY to .env.local.",
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
    const saved = await saveCompletedOutfit(body);
    return NextResponse.json(saved);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
