/**
 * Unified character generation — Stage A of the pipeline.
 *
 * The character model registry lives here so the UI / API can stay agnostic
 * about which underlying provider (Higgsfield, fal) backs each option. Add a
 * new model by appending to CHARACTER_MODELS and extending generateCharacter.
 */

import { generateCharacterViaFal, FAL_CHARACTER_MODELS } from "@/lib/fal";
import { generateSoulStandard, type HiggsfieldAspectRatio } from "@/lib/higgsfield";
import { env } from "@/lib/env";

// -----------------------------------------------------------------------------
// Registry
// -----------------------------------------------------------------------------

export type CharacterProvider = "higgsfield" | "fal";

export type CharacterModelId =
  | "higgsfield-soul"
  | "nano-banana-pro"
  | "flux-pro-1.1"
  | "flux-2-pro";

export type CharacterStylePreset =
  | "editorial"
  | "streetwear"
  | "minimalist"
  | "luxury";

export type CharacterAspectRatio = "9:16" | "3:4" | "1:1" | "16:9";

export interface CharacterModelMeta {
  id: CharacterModelId;
  provider: CharacterProvider;
  label: string;
  estCostUsd: number;
  description: string;
}

export const CHARACTER_MODELS: Record<CharacterModelId, CharacterModelMeta> = {
  "higgsfield-soul": {
    id: "higgsfield-soul",
    provider: "higgsfield",
    label: "Higgsfield Soul (Standard)",
    estCostUsd: 0.08,
    description:
      "Higgsfield's flagship hyperreal human model — best for editorial fashion-grade portraits. Async (5-30s).",
  },
  "nano-banana-pro": {
    id: "nano-banana-pro",
    provider: "fal",
    label: FAL_CHARACTER_MODELS["nano-banana-pro"].label,
    estCostUsd: FAL_CHARACTER_MODELS["nano-banana-pro"].estCostUsd,
    description: FAL_CHARACTER_MODELS["nano-banana-pro"].description,
  },
  "flux-pro-1.1": {
    id: "flux-pro-1.1",
    provider: "fal",
    label: FAL_CHARACTER_MODELS["flux-pro-1.1"].label,
    estCostUsd: FAL_CHARACTER_MODELS["flux-pro-1.1"].estCostUsd,
    description: FAL_CHARACTER_MODELS["flux-pro-1.1"].description,
  },
  "flux-2-pro": {
    id: "flux-2-pro",
    provider: "fal",
    label: FAL_CHARACTER_MODELS["flux-2-pro"].label,
    estCostUsd: FAL_CHARACTER_MODELS["flux-2-pro"].estCostUsd,
    description: FAL_CHARACTER_MODELS["flux-2-pro"].description,
  },
};

// -----------------------------------------------------------------------------
// Prompt assembly — shared by both providers so the style language stays
// consistent regardless of which model renders the image.
// -----------------------------------------------------------------------------

const STYLE_PROMPT_FRAGMENT: Record<CharacterStylePreset, string> = {
  editorial:
    "editorial fashion photography, soft front lighting, magazine-quality composition",
  streetwear:
    "candid streetwear photography, natural daylight, slight motion, urban energy",
  minimalist:
    "clean minimalist studio photography, soft diffused light, neutral grey backdrop",
  luxury:
    "luxury campaign photography, dramatic side lighting, premium materials, refined elegance",
};

function buildPrompt(
  base: string,
  style: CharacterStylePreset | undefined,
): string {
  return [
    base,
    style ? STYLE_PROMPT_FRAGMENT[style] : "",
    "full body, head to toe in frame, standing on clean seamless backdrop, sharp focus, hyperreal skin texture, natural fabric drape, 4K",
  ]
    .filter(Boolean)
    .join(", ");
}

// -----------------------------------------------------------------------------
// Public entry point — dispatches to the right provider.
// -----------------------------------------------------------------------------

export type GenerateCharacterInput = {
  prompt: string;
  style?: CharacterStylePreset;
  model?: CharacterModelId;
  aspectRatio?: CharacterAspectRatio;
};

export type GenerateCharacterResult = {
  imageUrl: string;
  width?: number;
  height?: number;
  model: CharacterModelId;
  provider: CharacterProvider;
  estCostUsd: number;
  promptUsed: string;
  requestId: string;
};

export async function generateCharacter(
  input: GenerateCharacterInput,
): Promise<GenerateCharacterResult> {
  const modelId = input.model ?? defaultCharacterModel();
  const meta = CHARACTER_MODELS[modelId];
  const fullPrompt = buildPrompt(input.prompt, input.style);
  const aspect = input.aspectRatio ?? "3:4";

  if (meta.provider === "higgsfield") {
    const out = await generateSoulStandard({
      prompt: fullPrompt,
      aspectRatio: aspect as HiggsfieldAspectRatio,
      resolution: "1080p",
    });
    const img = out.images[0];
    if (!img) throw new Error("Higgsfield returned no images.");
    return {
      imageUrl: img.url,
      model: modelId,
      provider: "higgsfield",
      estCostUsd: meta.estCostUsd,
      promptUsed: fullPrompt,
      requestId: out.requestId,
    };
  }

  // fal-backed model
  const out = await generateCharacterViaFal({
    prompt: fullPrompt,
    model: modelId as "nano-banana-pro" | "flux-pro-1.1" | "flux-2-pro",
    aspectRatio: aspect,
  });
  const img = out.images[0];
  if (!img) throw new Error("fal returned no images.");
  return {
    imageUrl: img.url,
    width: img.width,
    height: img.height,
    model: modelId,
    provider: "fal",
    estCostUsd: meta.estCostUsd,
    promptUsed: fullPrompt,
    requestId: out.requestId,
  };
}

/**
 * Picks the best default model based on which provider has credentials set.
 * Higgsfield Soul is preferred (specifically tuned for hyperreal fashion
 * humans); we fall back to Nano Banana Pro if only fal is configured.
 */
export function defaultCharacterModel(): CharacterModelId {
  if (env.higgsfield.hasKeys()) return "higgsfield-soul";
  if (env.fal.hasKey()) return "nano-banana-pro";
  return "higgsfield-soul";
}

export function isModelAvailable(id: CharacterModelId): boolean {
  const meta = CHARACTER_MODELS[id];
  if (meta.provider === "higgsfield") return env.higgsfield.hasKeys();
  return env.fal.hasKey();
}
