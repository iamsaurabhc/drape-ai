/**
 * Garment generation orchestrator — Stage B of the pipeline.
 *
 * Higgsfield Soul is tuned for humans so it tends to render artefacts on
 * isolated objects. Garments go through fal models (Nano Banana Pro / FLUX 1.1
 * Pro) which excel at clean studio packshots.
 */

import { GARMENT_MODELS, type GarmentModelId, generateGarment as falGenerateGarment } from "@/lib/fal";
import type { GarmentCategory } from "@/lib/assets";

export const GARMENT_CATEGORIES: {
  id: GarmentCategory;
  label: string;
  examples: string;
}[] = [
  { id: "top", label: "Top", examples: "shirt, blouse, t-shirt, sweater, blazer" },
  { id: "bottom", label: "Bottom", examples: "trousers, jeans, skirt, shorts" },
  { id: "outer", label: "Outer", examples: "coat, jacket, parka, trench" },
  { id: "dress", label: "Dress / one-piece", examples: "dress, jumpsuit, romper" },
  { id: "bag", label: "Bag", examples: "handbag, tote, crossbody, backpack" },
  { id: "shoes", label: "Shoes", examples: "sneakers, boots, heels, loafers" },
  { id: "accessory", label: "Accessory", examples: "belt, hat, scarf" },
  {
    id: "eyewear",
    label: "Eyewear",
    examples: "sunglasses, optical frames, aviators, wayfarers",
  },
];

const CATEGORY_PROMPT_FRAGMENT: Record<GarmentCategory, string> = {
  top: "garment laid flat or floating against pure white, full silhouette visible, collar and cuffs clearly defined",
  bottom: "garment laid flat or floating against pure white, full length visible, waistband to hem",
  outer: "garment shown open or buttoned, full silhouette visible, lapels and pockets crisp",
  dress: "full-length silhouette visible, hem to neckline, no body inside, garment shape preserved",
  bag: "product photo, isolated, three-quarter angle showing strap and front face, no body",
  shoes: "product photo, side profile, both shoes visible if pair, isolated on white",
  accessory: "product photo, clean isolated, no body, clear material detail",
  eyewear:
    "eyewear product packshot, isolated on pure white, three-quarter front angle, both lenses and one temple arm visible, no model, sharp focus on frame edges and hinges, soft even studio lighting, no harsh reflections on the lenses, no shadow on the backdrop",
};

export type GenerateGarmentInput = {
  prompt: string;
  category: GarmentCategory;
  model?: GarmentModelId;
};

export type GenerateGarmentResult = {
  imageUrl: string;
  width?: number;
  height?: number;
  model: GarmentModelId;
  category: GarmentCategory;
  estCostUsd: number;
  promptUsed: string;
  requestId: string;
};

export async function generateGarmentImage(
  input: GenerateGarmentInput,
): Promise<GenerateGarmentResult> {
  const fullPrompt = [
    input.prompt,
    CATEGORY_PROMPT_FRAGMENT[input.category],
  ].join(", ");

  const result = await falGenerateGarment({
    prompt: fullPrompt,
    model: input.model,
  });

  const img = result.images[0];
  if (!img) throw new Error("fal returned no images for the garment prompt.");
  const modelId = result.model;

  return {
    imageUrl: img.url,
    width: img.width,
    height: img.height,
    model: modelId,
    category: input.category,
    estCostUsd: GARMENT_MODELS[modelId].estCostUsd,
    promptUsed: result.promptUsed,
    requestId: result.requestId,
  };
}

export { GARMENT_MODELS };
export type { GarmentModelId };
