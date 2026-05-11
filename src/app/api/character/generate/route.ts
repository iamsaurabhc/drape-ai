/**
 * POST /api/character/generate
 *
 * Body: { prompt, style?, model?, aspectRatio? }
 *
 * Dispatches to the right provider (Higgsfield Soul or fal-hosted models)
 * based on `model`. Falls back to a clear error if the chosen provider's
 * credentials aren't in .env.local yet.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CHARACTER_MODELS,
  generateCharacter,
  isModelAvailable,
  type CharacterModelId,
} from "@/lib/character";

const MODEL_IDS = Object.keys(CHARACTER_MODELS) as [
  CharacterModelId,
  ...CharacterModelId[],
];

const Body = z.object({
  prompt: z.string().min(8, "Prompt must be at least 8 characters."),
  style: z.enum(["editorial", "streetwear", "minimalist", "luxury"]).optional(),
  model: z.enum(MODEL_IDS).optional(),
  aspectRatio: z.enum(["9:16", "3:4", "1:1", "16:9"]).optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request body." },
      { status: 400 },
    );
  }

  if (body.model && !isModelAvailable(body.model)) {
    const meta = CHARACTER_MODELS[body.model];
    const envHint =
      meta.provider === "higgsfield"
        ? "HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET"
        : "FAL_KEY";
    return NextResponse.json(
      {
        error: `${meta.label} requires ${envHint} in .env.local. Add it and restart the dev server.`,
      },
      { status: 400 },
    );
  }

  try {
    const result = await generateCharacter(body);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json(
      { error: `Character generation failed: ${msg}` },
      { status: 502 },
    );
  }
}
