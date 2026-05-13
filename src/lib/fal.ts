/**
 * fal.ai client wrapper.
 *
 * Exposes three high-level helpers — one per pipeline stage:
 *   - generateCharacter(...)   Stage A — hyperreal model on a clean backdrop
 *   - generateGarment(...)     Stage B — studio packshot of a garment / bag
 *   - composeOutfit(...)       Stage C — multi-reference single-shot composition
 *
 * Each helper returns a normalised result so the UI / API routes do not need
 * to know which underlying fal model was used.
 */

import { fal } from "@fal-ai/client";
import { env } from "@/lib/env";

// -----------------------------------------------------------------------------
// Client setup
// -----------------------------------------------------------------------------

let configured = false;
function ensureConfigured() {
  if (configured) return;
  fal.config({ credentials: env.fal.key() });
  configured = true;
}

// -----------------------------------------------------------------------------
// Model registry — fal-hosted models only (see src/lib/character.ts for the
// unified character-model registry that also includes Higgsfield Soul).
// -----------------------------------------------------------------------------

export type FalCharacterModelId = "nano-banana-pro" | "flux-pro-1.1" | "flux-2-pro";

export const FAL_CHARACTER_MODELS: Record<
  FalCharacterModelId,
  { endpoint: string; label: string; estCostUsd: number; description: string }
> = {
  "nano-banana-pro": {
    endpoint: "fal-ai/nano-banana-pro",
    label: "Nano Banana Pro (Google)",
    estCostUsd: 0.06,
    description:
      "Google's realism-tuned model. Strong fallback for hyperreal humans.",
  },
  "flux-pro-1.1": {
    endpoint: "fal-ai/flux-pro/v1.1",
    label: "FLUX 1.1 Pro (Black Forest Labs)",
    estCostUsd: 0.04,
    description:
      "Sharp, photoreal — strong fallback if Nano Banana over-stylises faces.",
  },
  "flux-2-pro": {
    endpoint: "fal-ai/flux-2-pro",
    label: "FLUX 2 Pro (Black Forest Labs)",
    estCostUsd: 0.08,
    description: "Newest FLUX flagship — premium quality for hero shots.",
  },
};

export type GarmentModelId = "nano-banana-pro" | "flux-pro-1.1";

export const GARMENT_MODELS: Record<
  GarmentModelId,
  { endpoint: string; label: string; estCostUsd: number }
> = {
  "nano-banana-pro": {
    endpoint: "fal-ai/nano-banana-pro",
    label: "Nano Banana Pro",
    estCostUsd: 0.06,
  },
  "flux-pro-1.1": {
    endpoint: "fal-ai/flux-pro/v1.1",
    label: "FLUX 1.1 Pro",
    estCostUsd: 0.04,
  },
};

/**
 * Stage C model registry. v4.5 is the default — noticeably better multi-reference
 * fidelity than v4, same per-image cost. v4 is kept as a constant for A/B
 * comparison if a particular outfit gets weird artefacts.
 */
export const COMPOSITION_MODEL = {
  endpoint: "fal-ai/bytedance/seedream/v4.5/edit",
  label: "Seedream 4.5 Edit (multi-reference)",
  estCostUsd: 0.06,
} as const;

export const COMPOSITION_MODEL_FALLBACK = {
  endpoint: "fal-ai/bytedance/seedream/v4/edit",
  label: "Seedream 4.0 Edit (multi-reference, fallback)",
  estCostUsd: 0.06,
} as const;

// -----------------------------------------------------------------------------
// Shared normaliser — fal models return slightly different shapes, but every
// image generation model exposes one of these two patterns. We coerce both
// into a single typed result so callers don't branch.
// -----------------------------------------------------------------------------

export type FalImage = {
  url: string;
  width?: number;
  height?: number;
  contentType?: string;
};

export type FalResult = {
  images: FalImage[];
  requestId: string;
  seed?: number;
};

interface FalImageLike {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

function normaliseResult(raw: unknown, requestId: string): FalResult {
  const data = raw as {
    images?: FalImageLike[];
    image?: FalImageLike;
    seed?: number;
  };
  const list: FalImageLike[] = data.images ?? (data.image ? [data.image] : []);
  return {
    requestId,
    seed: data.seed,
    images: list.map((img) => ({
      url: img.url,
      width: img.width,
      height: img.height,
      contentType: img.content_type,
    })),
  };
}

// -----------------------------------------------------------------------------
// Stage A — Character generation via fal (Nano Banana Pro / FLUX). For the
// unified entry point that also dispatches to Higgsfield Soul, see
// src/lib/character.ts → generateCharacter().
// -----------------------------------------------------------------------------

const NEGATIVE_DEFAULTS =
  "warped fingers, extra limbs, distorted face, plastic skin, cartoon, illustration, watermark, text, logo";

export type FalCharacterInput = {
  prompt: string;
  model?: FalCharacterModelId;
  aspectRatio?: "9:16" | "3:4" | "1:1" | "16:9";
};

export async function generateCharacterViaFal(
  input: FalCharacterInput,
): Promise<FalResult & { model: FalCharacterModelId }> {
  ensureConfigured();
  const model = input.model ?? "nano-banana-pro";
  const cfg = FAL_CHARACTER_MODELS[model];
  const aspect = input.aspectRatio ?? "3:4";

  const modelInput =
    model === "nano-banana-pro"
      ? {
          prompt: input.prompt,
          aspect_ratio: aspect,
          num_images: 1,
        }
      : {
          prompt: input.prompt,
          image_size: aspectToFluxSize(aspect),
          num_images: 1,
          negative_prompt: NEGATIVE_DEFAULTS,
        };

  const out = await fal.subscribe(cfg.endpoint, {
    input: modelInput,
    logs: false,
  });

  return {
    ...normaliseResult(out.data, out.requestId),
    model,
  };
}

function aspectToFluxSize(
  aspect: "9:16" | "3:4" | "1:1" | "16:9",
):
  | "portrait_4_3"
  | "portrait_16_9"
  | "square_hd"
  | "landscape_16_9"
  | "landscape_4_3" {
  switch (aspect) {
    case "9:16":
      return "portrait_16_9";
    case "3:4":
      return "portrait_4_3";
    case "1:1":
      return "square_hd";
    case "16:9":
      return "landscape_16_9";
  }
}

// -----------------------------------------------------------------------------
// Stage B — Garment generation (used Day 2; stub today)
// -----------------------------------------------------------------------------

export type GenerateGarmentInput = {
  prompt: string;
  model?: GarmentModelId;
};

export async function generateGarment(
  input: GenerateGarmentInput,
): Promise<FalResult & { model: GarmentModelId; promptUsed: string }> {
  ensureConfigured();
  const model = input.model ?? "nano-banana-pro";
  const cfg = GARMENT_MODELS[model];
  const fullPrompt = `${input.prompt}, studio product photography, isolated on pure white seamless backdrop, soft even lighting, no shadows on backdrop, sharp focus, e-commerce packshot, 4K`;

  const modelInput =
    model === "nano-banana-pro"
      ? { prompt: fullPrompt, aspect_ratio: "1:1", num_images: 1 }
      : {
          prompt: fullPrompt,
          image_size: "square_hd" as const,
          num_images: 1,
          negative_prompt: "person, model, body, mannequin, " + NEGATIVE_DEFAULTS,
        };

  const out = await fal.subscribe(cfg.endpoint, {
    input: modelInput,
    logs: false,
  });
  return {
    ...normaliseResult(out.data, out.requestId),
    model,
    promptUsed: fullPrompt,
  };
}

// -----------------------------------------------------------------------------
// Stage C — Multi-garment composition. The core technical bet of the whole
// pipeline: one Seedream 4 Edit call with [character, ...garments, ?backdrop]
// as reference images produces a single 4K finished outfit photo.
// -----------------------------------------------------------------------------

export type GarmentRef = {
  url: string;
  category?: string;
  name?: string;
};

// -----------------------------------------------------------------------------
// Background presets — prompt-only scene controls. We keep `backdropUrl`
// available for future reference-image upgrades, but the four presets here
// drive the scene via prose, which Seedream follows reliably.
// -----------------------------------------------------------------------------

export type BackgroundPresetId =
  | "studio-white"
  | "studio-gray"
  | "outdoor-street"
  | "golden-hour";

export const BACKGROUND_PRESETS: Record<
  BackgroundPresetId,
  { id: BackgroundPresetId; label: string; hint: string; promptFragment: string }
> = {
  "studio-white": {
    id: "studio-white",
    label: "Studio White",
    hint: "Clean seamless white, e-commerce default",
    promptFragment:
      "pure white seamless studio backdrop, soft even diffused front lighting, no visible floor seam, clean e-commerce / PDP look",
  },
  "studio-gray": {
    id: "studio-gray",
    label: "Studio Gray",
    hint: "Neutral mid-gray editorial paper",
    promptFragment:
      "neutral mid-gray editorial paper backdrop, soft side fill light, fashion magazine lighting, subtle shadow under feet",
  },
  "outdoor-street": {
    id: "outdoor-street",
    label: "Outdoor Street",
    hint: "Sunlit urban backdrop",
    promptFragment:
      "sunlit urban street scene with soft natural daylight, slightly defocused real-world city background behind the model, realistic depth of field, candid editorial fashion energy",
  },
  "golden-hour": {
    id: "golden-hour",
    label: "Golden Hour",
    hint: "Warm low-angle sunset light",
    promptFragment:
      "outdoor golden-hour scene with warm low-angle sunlight, soft rim lighting on the model, blurred natural background, cinematic campaign atmosphere",
  },
};

export type ComposeOutfitInput = {
  characterUrl: string;
  garments: GarmentRef[];
  backdropUrl?: string;
  backgroundPreset?: BackgroundPresetId;
  promptOverride?: string;
  numImages?: 1 | 2 | 3 | 4;
};

// =============================================================================
// Composition prompt — see docs/PROMPT_ENGINEERING.md for the design rationale.
//
// Key principles followed (from Seedream 4 prompt engineering research):
//   1. Natural prose, not bullets — Seedream follows flowing directions better.
//   2. "Image N" not "Reference N" — closer to the model's training corpus.
//   3. Describe each image's CONTENT (category + name), not just its index.
//   4. Explicit pose directive — without it, model defaults to stiff "AI
//      mannequin" stance.
//   5. Photography vocabulary (85mm lens, soft diffused light, shallow DOF)
//      anchors editorial realism.
//   6. Explicit "do NOT use the product backgrounds" — prevents white-bg leak.
//   7. Enumerated forbiddens (no face change, no colour modification, no added
//      accessories) — stronger than vague "preserve" language.
//   8. Layering specifics — coat open showing blouse, trouser hem at ankle, etc.
// =============================================================================

const FASHION_PHOTOGRAPHY_STYLE =
  "premium editorial fashion campaign photography, hyperreal skin texture with visible pores, magazine quality, 85mm portrait lens look, soft diffused front lighting, shallow depth of field, sharp focus on face and garments, 4K resolution";

const HARD_FORBIDDENS =
  "Do not alter the model's face, identity, or body shape. Do not modify any garment's colour, material, pattern, or hardware. Do not add accessories that are not in the references. Do not use the white product backgrounds from the garment images. No text, no watermarks, no logos beyond what is shown in the references.";

function buildCompositionPrompt(input: ComposeOutfitInput): string {
  if (input.promptOverride) return input.promptOverride;

  const garmentDescriptors = input.garments
    .map((g, i) => describeGarmentImage(g, i + 2))
    .join(" ");

  const totalImages = 1 + input.garments.length + (input.backdropUrl ? 1 : 0);
  const garmentImageRange =
    input.garments.length === 1 ? "Image 2" : `Images 2-${1 + input.garments.length}`;

  const presetFragment = input.backgroundPreset
    ? BACKGROUND_PRESETS[input.backgroundPreset].promptFragment
    : null;

  const backdropClause = input.backdropUrl
    ? `Image ${totalImages} sets the backdrop, lighting, and colour temperature — match it exactly. Do NOT use the white product backgrounds from ${garmentImageRange} in the final scene.`
    : presetFragment
      ? `Place the model in this scene: ${presetFragment}. Do NOT use the white product backgrounds from ${garmentImageRange} in the final scene — replace them with the scene described.`
      : `Use the exact same backdrop, lighting, and colour temperature as Image 1. Do NOT use the white product backgrounds from ${garmentImageRange} in the final scene.`;

  const pose = derivePose(input.garments);
  const layering = describeLayering(input.garments);

  return [
    // — Subject + action --------------------------------------------------
    `Photograph the model from Image 1 wearing the garments shown in ${garmentImageRange}.`,
    // — Image-by-image roles ----------------------------------------------
    "Image 1 shows the model — preserve their face, hair, skin tone, body proportions, and pose exactly as shown; do not redraw the face.",
    garmentDescriptors,
    // — Pose + composition -------------------------------------------------
    `Pose the model in ${pose}. Full body head to toe in frame.`,
    // — Backdrop control (CRITICAL) ---------------------------------------
    backdropClause,
    // — Layering specifics -------------------------------------------------
    layering,
    // — Fidelity directives ------------------------------------------------
    "Preserve the precise fabric texture, weave, colour, pattern, stitching, buttons, hardware, lapels, and silhouette of every garment exactly as shown in its reference image. Natural fabric drape and physics. Accurate hem, sleeve, and cuff length.",
    // — Style anchor -------------------------------------------------------
    `Style: ${FASHION_PHOTOGRAPHY_STYLE}.`,
    // — Negative constraints ----------------------------------------------
    HARD_FORBIDDENS,
  ].join("\n\n");
}

/**
 * "Image 3 shows the top (cream-blouse) — worn with collar visible above the coat."
 * Uses the garment's stored name as a content cue. The garment IMAGE itself
 * carries the actual visual detail; the text just disambiguates roles.
 */
function describeGarmentImage(g: GarmentRef, imageNo: number): string {
  const role = (g.category ?? "garment").toLowerCase();
  const namePart = g.name ? ` ("${g.name}")` : "";
  const roleHint = CATEGORY_WEARING_HINT[role as keyof typeof CATEGORY_WEARING_HINT] ?? "the model must wear it.";
  return `Image ${imageNo} shows the ${role}${namePart} — ${roleHint}`;
}

const CATEGORY_WEARING_HINT = {
  top: "worn on the torso, collar / neckline visible.",
  bottom: "worn on the legs, waistband at natural waist, hem at the appropriate length.",
  outer: "worn as an outer layer, hanging open or buttoned naturally.",
  dress: "worn as the main piece, falling at the correct length.",
  bag: "carried in hand or worn over the shoulder, scaled correctly relative to the body.",
  shoes: "worn on the feet, both shoes visible at the bottom of the frame.",
  accessory: "worn or carried in the appropriate position.",
} as const;

/**
 * Pose derivation — picks a natural editorial pose based on what the outfit
 * actually contains, so we don't get the same stiff "model facing camera, arms
 * at sides" on every single image of a 50-outfit batch.
 */
function derivePose(garments: GarmentRef[]): string {
  const cats = new Set(garments.map((g) => g.category ?? ""));
  const has = (c: string) => cats.has(c);

  if (has("dress")) {
    return "a graceful three-quarter turn, slight movement in the hem, weight on one leg, soft confident expression";
  }
  if (has("outer") && has("bottom")) {
    return "a confident standing editorial pose — front-facing or slight three-quarter angle, weight on one leg, one hand relaxed at the side or in a pocket, neutral confident expression";
  }
  if (has("shoes") && garments.length <= 2) {
    return "a full-body pose with shoes clearly visible at the bottom of the frame, slight three-quarter turn";
  }
  if (has("bag")) {
    return "a natural editorial pose with the bag held in hand or worn on the shoulder, slight movement, looking just off camera";
  }
  return "a relaxed natural editorial pose, three-quarter angle to camera, weight on one leg, soft confident expression";
}

/**
 * Layering directives — explicit instructions about how the pieces should
 * stack. The image refs alone don't tell Seedream that the coat goes over
 * the blouse (it could plausibly render either order), so we say so.
 */
function describeLayering(garments: GarmentRef[]): string {
  const cats = new Set(garments.map((g) => g.category ?? ""));
  const has = (c: string) => cats.has(c);

  const layers: string[] = [];
  if (has("outer") && has("top")) {
    layers.push(
      "Layer the outerwear OVER the top — the coat / jacket hangs open or is buttoned such that the top's collar and shoulders are visible underneath.",
    );
  } else if (has("outer")) {
    layers.push("The outerwear is worn buttoned or open as appropriate for the style.");
  }
  if (has("top") && has("bottom")) {
    layers.push(
      "Decide based on the top's cut whether it is tucked into the bottom or worn loose over the waistband — pick whichever reads more polished.",
    );
  }
  if (has("bottom")) {
    layers.push("The trousers / skirt hem falls at the appropriate natural length.");
  }
  if (has("shoes") && (has("bottom") || has("dress"))) {
    layers.push("The shoes are visible at the bottom of the frame.");
  }
  if (has("bag")) {
    layers.push("The bag is carried in one hand or worn over the shoulder, sized correctly to the body.");
  }

  return layers.length > 0
    ? layers.join(" ")
    : "Layer the garments naturally as they would be worn together in real life.";
}

export async function composeOutfit(
  input: ComposeOutfitInput,
): Promise<FalResult & { promptUsed: string }> {
  ensureConfigured();
  if (!input.characterUrl) throw new Error("composeOutfit: characterUrl is required.");
  if (input.garments.length === 0)
    throw new Error("composeOutfit: at least one garment is required.");
  if (input.garments.length > 8)
    throw new Error("composeOutfit: max 8 garments per composition.");

  const refs: string[] = [
    input.characterUrl,
    ...input.garments.map((g) => g.url),
    ...(input.backdropUrl ? [input.backdropUrl] : []),
  ];
  const prompt = buildCompositionPrompt(input);

  const out = await fal.subscribe(COMPOSITION_MODEL.endpoint, {
    input: {
      prompt,
      image_urls: refs,
      // 4:5 portrait — the e-commerce / editorial standard (Zara, Net-a-Porter,
      // AllSaints all use this for PDP / lookbook). Explicit width/height
      // avoids Seedream defaulting to square output for multi-ref edits.
      image_size: { width: 1024, height: 1280 },
      num_images: input.numImages ?? 1,
      max_images: input.numImages ?? 1,
    },
    logs: false,
  });
  return {
    ...normaliseResult(out.data, out.requestId),
    promptUsed: prompt,
  };
}

// =============================================================================
// Accessory composition — eyewear-first PDP shots
//
// Sunglasses e-commerce work demands tight head-and-shoulders portraits with
// the frame placed correctly on the bridge of the nose. Reusing composeOutfit
// gives weak results: Seedream renders a full-body model, the glasses end up
// floating, and the camera sits too far back to read frame details. This
// pathway forces a portrait-crop output and bakes eyewear-specific guidance
// (perspective foreshortening, lens reflections, frame shadow under the brow)
// into the prompt.
// =============================================================================

export const ACCESSORY_COMPOSITION_MODEL = {
  endpoint: "fal-ai/bytedance/seedream/v4.5/edit",
  label: "Seedream 4.5 Edit (accessory portrait)",
  estCostUsd: 0.06,
} as const;

/**
 * Upscaler — used to push the 1024px square composition output up to the
 * 3000×3000 final export the brief calls for. We pick Clarity Upscaler
 * because it preserves skin/glass detail better than ESRGAN on portraits.
 */
export const UPSCALE_MODEL = {
  endpoint: "fal-ai/clarity-upscaler",
  label: "Clarity Upscaler",
  estCostUsd: 0.03,
} as const;

export type AccessoryView = "front" | "three-quarter" | "side";

export const ACCESSORY_VIEWS: Record<
  AccessoryView,
  { id: AccessoryView; label: string; hint: string; promptFragment: string }
> = {
  front: {
    id: "front",
    label: "Front",
    hint: "Straight-on, both lenses visible",
    promptFragment:
      "camera positioned directly in front of the model at eye level, the model looking straight into the lens, both eyes and both lenses of the eyewear visible, the frame perfectly horizontal and symmetrically centred across the face",
  },
  "three-quarter": {
    id: "three-quarter",
    label: "Three-quarter",
    hint: "30–40° angled, both temples partly visible",
    promptFragment:
      "the model turned thirty to forty degrees away from the camera in a natural three-quarter pose, near-side lens and temple arm clearly visible, the far temple arm fading toward the ear, the bridge of the nose and the frame's perspective foreshortening rendered believably",
  },
  side: {
    id: "side",
    label: "Side profile",
    hint: "Pure 90° profile, full frame silhouette",
    promptFragment:
      "pure ninety-degree side profile of the model, the entire silhouette of the frame visible from temple to hinge to lens, the model's eyelashes faintly visible behind the lens, head held level, jawline clean against the backdrop",
  },
};

export type ComposeAccessoryInput = {
  characterUrl: string;
  accessoryUrl: string;
  accessoryName?: string;
  view: AccessoryView;
  backgroundPreset?: BackgroundPresetId;
  numImages?: 1 | 2 | 3 | 4;
};

const ACCESSORY_FORBIDDENS =
  "Do not alter the model's face, identity, skin tone, eye colour, hair, or expression. Do not modify the frame's colour, lens tint, shape, hinge style, or branding hardware. Do not add lens flare, glare, or reflections that are not consistent with the studio lighting. Do not distort frame proportions or tilt the frame off-axis. No text, watermarks, or logos beyond what is shown in the eyewear reference.";

const ACCESSORY_PHOTOGRAPHY_STYLE =
  "premium eyewear e-commerce campaign photography, hyperreal skin texture with visible pores, tight head-and-shoulders portrait, 85mm portrait lens, f/2.8 shallow depth of field, face and eyewear tack sharp, soft diffused beauty-dish front light with a subtle fill, magazine quality, 4K resolution";

function buildAccessoryPrompt(input: ComposeAccessoryInput): string {
  const viewFragment = ACCESSORY_VIEWS[input.view].promptFragment;
  const namePart = input.accessoryName ? ` ("${input.accessoryName}")` : "";

  const presetFragment = input.backgroundPreset
    ? BACKGROUND_PRESETS[input.backgroundPreset].promptFragment
    : BACKGROUND_PRESETS["studio-white"].promptFragment;

  return [
    // — Subject + action --------------------------------------------------
    `Photograph the model from Image 1 wearing the eyewear shown in Image 2${namePart}.`,
    // — Image-by-image roles ----------------------------------------------
    "Image 1 shows the model — preserve their face, hair, skin tone, eye colour, and expression exactly as shown; do not redraw the face.",
    `Image 2 shows the eyewear — preserve its frame shape, colour, material, lens tint, hinges, and any branding hardware exactly as shown.`,
    // — Placement (CRITICAL for eyewear realism) --------------------------
    "Place the eyewear naturally on the bridge of the nose: the nose pads rest on either side of the bridge, the frame top sits just below the brow, the temple arms follow the curve of the temples back toward and over the ears. Render correct perspective foreshortening for the chosen camera angle so the frame reads as a real 3D object and not a flat sticker. Add a soft realistic shadow cast by the frame onto the cheekbones and under the brow, matched to the lighting direction. Include subtle lens reflections that match the studio lighting — never invent new light sources.",
    // — View / camera -----------------------------------------------------
    `View: ${viewFragment}.`,
    // — Framing -----------------------------------------------------------
    "Tight head-and-shoulders portrait crop, the eyewear and full face filling the centre of the frame, shoulders just visible at the bottom edge, top of the head with a small margin above.",
    // — Backdrop ----------------------------------------------------------
    `Background: ${presetFragment}. Replace the product-packshot background of Image 2 with this scene — the eyewear must appear worn, not photographed against its own backdrop.`,
    // — Style anchor ------------------------------------------------------
    `Style: ${ACCESSORY_PHOTOGRAPHY_STYLE}.`,
    // — Negative constraints ----------------------------------------------
    ACCESSORY_FORBIDDENS,
  ].join("\n\n");
}

export async function composeAccessory(
  input: ComposeAccessoryInput,
): Promise<FalResult & { promptUsed: string }> {
  ensureConfigured();
  if (!input.characterUrl)
    throw new Error("composeAccessory: characterUrl is required.");
  if (!input.accessoryUrl)
    throw new Error("composeAccessory: accessoryUrl is required.");

  const prompt = buildAccessoryPrompt(input);

  const out = await fal.subscribe(ACCESSORY_COMPOSITION_MODEL.endpoint, {
    input: {
      prompt,
      image_urls: [input.characterUrl, input.accessoryUrl],
      // 1:1 square — eyewear PDP industry standard (Warby Parker, Ray-Ban,
      // Persol, Bonlook all ship square 3000×3000 PDP shots). Square also
      // upscales cleanly to the 3000px deliverable spec.
      image_size: { width: 1024, height: 1024 },
      num_images: input.numImages ?? 1,
      max_images: input.numImages ?? 1,
    },
    logs: false,
  });

  return {
    ...normaliseResult(out.data, out.requestId),
    promptUsed: prompt,
  };
}

/**
 * Upscale a single fal-hosted image to ~3× resolution (1024 → ~3000).
 * The brief specifies 3000×3000 final exports; clarity-upscaler holds skin
 * texture and lens detail better than plain ESRGAN at this scale.
 */
export async function upscaleImage(input: {
  imageUrl: string;
  scale?: 2 | 3 | 4;
}): Promise<FalResult> {
  ensureConfigured();
  if (!input.imageUrl) throw new Error("upscaleImage: imageUrl is required.");
  const scale = input.scale ?? 3;

  const out = await fal.subscribe(UPSCALE_MODEL.endpoint, {
    input: {
      image_url: input.imageUrl,
      upscale_factor: scale,
      // Low creativity keeps the upscaler faithful to the source — we are
      // adding pixels, not hallucinating new content.
      creativity: 0.35,
      resemblance: 1.5,
    },
    logs: false,
  });

  return normaliseResult(out.data, out.requestId);
}
