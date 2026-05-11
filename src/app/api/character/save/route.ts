/**
 * POST /api/character/save
 *
 * Body: { name, sourceUrl, prompt?, generatedByModel? }
 *
 * Downloads the fal CDN image and persists it to Supabase Storage + assets
 * table so it can be reused as a Stage C composition reference.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { saveAsset } from "@/lib/assets";
import { env } from "@/lib/env";

const Body = z.object({
  name: z.string().min(1).max(80),
  sourceUrl: z.string().url(),
  prompt: z.string().optional(),
  generatedByModel: z.string().optional(),
});

export async function POST(req: Request) {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to .env.local, then run supabase/migrations/0001_initial.sql in the SQL editor.",
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
      type: "character",
      sourceUrl: body.sourceUrl,
      prompt: body.prompt,
      generatedByModel: body.generatedByModel,
    });
    return NextResponse.json(saved);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
