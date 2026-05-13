/**
 * POST /api/garment/generate
 *
 * Body: { prompt, category, model? }
 *
 * Generates a studio packshot of one garment via fal. Does NOT persist —
 * the UI shows the preview and lets the user click Save (separate endpoint)
 * once they're happy with the result.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { generateGarmentImage, GARMENT_MODELS } from "@/lib/garment";
import { env } from "@/lib/env";

const Body = z.object({
  prompt: z.string().min(4, "Prompt must be at least 4 characters."),
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
  model: z.enum(Object.keys(GARMENT_MODELS) as ["nano-banana-pro", "flux-pro-1.1"]).optional(),
});

export async function POST(req: Request) {
  if (!env.fal.hasKey()) {
    return NextResponse.json(
      {
        error:
          "FAL_KEY not set. Garment generation uses fal models (Nano Banana Pro / FLUX 1.1 Pro). Add FAL_KEY to .env.local — see .env.example.",
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
    const result = await generateGarmentImage(body);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown fal error.";
    return NextResponse.json(
      { error: `Garment generation failed: ${msg}` },
      { status: 502 },
    );
  }
}
