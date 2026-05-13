/**
 * Image-to-video orchestrator — Stage D of the pipeline.
 *
 * Animates a finished outfit image into a 3-15s cinematic clip via fal.ai's
 * image-to-video endpoints. The registry pattern mirrors src/lib/character.ts
 * so the UI stays model-agnostic; swapping in a new fal video model is just a
 * registry entry + a UI label update.
 *
 * History note: this used to call Higgsfield (DoP / Seedance v1 Pro / Kling 2.1)
 * directly, but those endpoints kept returning 400s on duration enums and 404s
 * on body shape mismatches with no useful error UX. fal exposes the same model
 * lineup (plus newer Seedance 2.0 / Kling 3.0) under a clean queue API that
 * we already use for outfit composition.
 */

import { env } from "@/lib/env";
import {
  submitFalVideo,
  type FalVideoSubmission,
} from "@/lib/fal-video";

// -----------------------------------------------------------------------------
// Model registry
// -----------------------------------------------------------------------------

export type VideoModelId =
  | "seedance-2-fast"
  | "seedance-2-pro"
  | "kling-3-pro";

export type VideoResolution = "480p" | "720p" | "1080p";

// Inputs the UI collects, in a model-neutral form. Each model's
// `buildFalInput` reshapes these into the exact body its fal endpoint
// expects — see the per-model implementations below.
export type CommonVideoInputs = {
  imageUrl: string;
  prompt: string;
  // Already snapped into the model's allowed set by submitOutfitVideo.
  durationSeconds: number;
  resolution: VideoResolution;
};

export interface VideoModelMeta {
  id: VideoModelId;
  endpoint: string;
  label: string;
  description: string;
  expectedWaitLabel: string;
  // Durations the model accepts (seconds). The UI surfaces only these and the
  // submit code validates against this set so we never POST an out-of-range
  // value to fal.
  allowedDurations: number[];
  defaultDuration: number;
  // Resolution options surfaced in the UI + the corresponding fal billing
  // rate (USD per output second). fal bills `unit_price × quantity` where the
  // quantity scales with `duration × resolution`. A single 1080p × 15s
  // Seedance 2.0 Pro render once came in at $3.43 — that's why every cost
  // bubbles up to the UI now.
  //
  // Models without a resolution dial (Kling 3.0 Pro on fal) declare a single
  // entry here and the UI hides the chip selector.
  allowedResolutions: VideoResolution[];
  defaultResolution: VideoResolution;
  // Partial — Kling 3.0 Pro only prices the one resolution it actually
  // accepts. Lookups fall back to `defaultResolution`.
  pricePerSecondUsd: Partial<Record<VideoResolution, number>>;
  // Shapes the body for `fal.queue.submit(endpoint, { input })`. Each fal
  // video endpoint has its own schema (Seedance uses `image_url`, Kling
  // uses `start_image_url`, neither accepts the other's resolution / aspect
  // ratio / audio knobs) — keeping this per-model means we never POST a key
  // the endpoint will silently reject and then 422 on result fetch.
  buildFalInput: (common: CommonVideoInputs) => Record<string, unknown>;
}

// Pricing notes — fal.ai bills per "unit" where a unit is roughly
// (output_seconds × resolution_factor). The values below come from fal's
// published price cards plus real bills:
//
//   • Seedance 2.0 Fast — fal lists $0.2419/s at 720p; we use the linear
//     ratio for 480p (~$0.10/s). The endpoint does NOT support 1080p.
//   • Seedance 2.0 Pro  — one 15s × 1080p run came in at $3.43 → ~$0.23/s
//     at 1080p. Lower resolutions scale ~linearly.
//   • Kling 3.0 Pro     — fal lists $0.112/s flat (audio off). The endpoint
//     does NOT expose a resolution dial at all, so we keep a single entry.
//
// Update when fal publishes a new price card; UI cost panels and the
// `cost_usd` column on outfit_videos recalculate automatically.
export const VIDEO_MODELS: Record<VideoModelId, VideoModelMeta> = {
  "seedance-2-fast": {
    id: "seedance-2-fast",
    endpoint: "bytedance/seedance-2.0/fast/image-to-video",
    label: "Seedance 2.0 Fast (ByteDance)",
    description:
      "Lower-latency tier of Seedance 2.0 — best for fast iteration on motion / pose.",
    expectedWaitLabel: "~30-60s",
    allowedDurations: [4, 5, 6, 8, 10],
    defaultDuration: 5,
    // Endpoint enum is `480p | 720p` only — no 1080p path here.
    allowedResolutions: ["480p", "720p"],
    defaultResolution: "480p",
    pricePerSecondUsd: { "480p": 0.1, "720p": 0.24 },
    buildFalInput: ({ imageUrl, prompt, durationSeconds, resolution }) => ({
      prompt,
      image_url: imageUrl,
      duration: String(durationSeconds),
      resolution,
      aspect_ratio: "3:4",
      generate_audio: false,
    }),
  },
  "seedance-2-pro": {
    id: "seedance-2-pro",
    endpoint: "bytedance/seedance-2.0/image-to-video",
    label: "Seedance 2.0 (ByteDance, flagship)",
    description:
      "Flagship ByteDance image-to-video — real-world physics, director-level camera control, cinematic motion.",
    expectedWaitLabel: "~60-120s",
    allowedDurations: [4, 5, 6, 8, 10, 12, 15],
    defaultDuration: 5,
    allowedResolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    pricePerSecondUsd: { "480p": 0.06, "720p": 0.13, "1080p": 0.23 },
    buildFalInput: ({ imageUrl, prompt, durationSeconds, resolution }) => ({
      prompt,
      image_url: imageUrl,
      duration: String(durationSeconds),
      resolution,
      aspect_ratio: "3:4",
      generate_audio: false,
    }),
  },
  "kling-3-pro": {
    id: "kling-3-pro",
    endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
    label: "Kling 3.0 Pro",
    description:
      "Most cinematic — catalog hero shots, premium campaign look with fluid motion.",
    expectedWaitLabel: "~90-180s",
    // Kling V3 Pro image-to-video accepts 3..15s as a string enum. We pick
    // a tight subset that matches what the UI offers elsewhere.
    allowedDurations: [5, 10],
    defaultDuration: 5,
    // The fal Kling V3 Pro image-to-video endpoint does NOT expose a
    // resolution parameter (the schema has no `resolution` field). One
    // entry → the UI hides the resolution chip selector.
    allowedResolutions: ["720p"],
    defaultResolution: "720p",
    pricePerSecondUsd: { "720p": 0.112 },
    // CRITICAL: Kling uses `start_image_url`, NOT `image_url`. It also
    // rejects `resolution`, `aspect_ratio`, and `generate_audio`. Sending
    // any of those keys makes fal accept the submit (request_id returned)
    // but reject the actual run with 422 Unprocessable Entity on result
    // fetch — which is what the original "Unprocessable Entity" bug was.
    buildFalInput: ({ imageUrl, prompt, durationSeconds }) => ({
      prompt,
      start_image_url: imageUrl,
      duration: String(durationSeconds),
      negative_prompt:
        "blur, distort, low quality, warped fingers, extra limbs",
    }),
  },
};

/**
 * Surfaced in the drawer + persisted to `outfit_videos.cost_usd`. Rounds
 * to the nearest cent so we don't render `$0.3000000004` from float math.
 */
export function estimateVideoCost(
  modelId: VideoModelId,
  resolution: VideoResolution,
  durationSeconds: number,
): number {
  const meta = VIDEO_MODELS[modelId];
  // Falls back to the default resolution rate when the user asked for one
  // the model doesn't price (shouldn't happen — submitOutfitVideo snaps to
  // the allowed set first — but the typesystem can't prove that here).
  const rate =
    meta.pricePerSecondUsd[resolution] ??
    meta.pricePerSecondUsd[meta.defaultResolution] ??
    0;
  return Math.round(rate * durationSeconds * 100) / 100;
}

export function defaultVideoModel(): VideoModelId {
  return "seedance-2-fast";
}

export function isVideoConfigured(): boolean {
  // Video now uses the same fal credentials as image generation. If the
  // primary fal key is present, video is configured.
  return env.fal.hasKey();
}

// -----------------------------------------------------------------------------
// Motion presets — the "categorical side of changes" the user can pick from
// without having to hand-write a motion prompt. Selecting a preset prefills
// the prompt textarea; user can still edit before generating.
// -----------------------------------------------------------------------------

export type MotionPresetId =
  | "subtle-studio"
  | "editorial-turn"
  | "walk-forward"
  | "catwalk-pass"
  | "detail-pan"
  | "hair-fabric"
  | "custom";

export interface MotionPresetMeta {
  id: MotionPresetId;
  label: string;
  hint: string;
  prompt: string;
}

export const MOTION_PRESETS: Record<MotionPresetId, MotionPresetMeta> = {
  "subtle-studio": {
    id: "subtle-studio",
    label: "Subtle Studio",
    hint: "Gentle push-in, natural micro-movement",
    prompt:
      "The model holds the same pose with subtle natural micro-movements — soft breathing, slight head tilt. The camera performs a slow gentle push-in. Studio lighting unchanged, garment fabric settles naturally.",
  },
  "editorial-turn": {
    id: "editorial-turn",
    label: "Editorial Turn",
    hint: "Slow three-quarter turn to camera",
    prompt:
      "The model performs a slow elegant three-quarter turn toward the camera, settling into eye contact at the end of the clip. Hair flows naturally with the rotation. Soft cinematic light, magazine-quality composition.",
  },
  "walk-forward": {
    id: "walk-forward",
    label: "Walk Forward",
    hint: "Two confident steps toward the camera",
    prompt:
      "The model takes two confident steps toward the camera with a natural arm sway. Shallow depth of field stays sharp on the face. Runway energy, garment fabric and hair move with the motion.",
  },
  "catwalk-pass": {
    id: "catwalk-pass",
    label: "Catwalk Pass",
    hint: "Side-on runway walk past camera",
    prompt:
      "The model walks past the camera left-to-right at a steady catwalk pace. The camera tracks the model side-on. Fabric, accessories, and hair move naturally with each step. Runway energy.",
  },
  "detail-pan": {
    id: "detail-pan",
    label: "Detail Pan",
    hint: "Slow vertical pan head-to-toe",
    prompt:
      "Static model holding the pose. The camera performs a slow smooth vertical pan from face down to shoes, revealing the full outfit head-to-toe. Soft cinematic light, sharp focus on garment details.",
  },
  "hair-fabric": {
    id: "hair-fabric",
    label: "Hair & Fabric",
    hint: "Wind moves hair + garment, model static",
    prompt:
      "The model holds the pose. Soft directional wind moves the hair and garment fabric naturally throughout the clip. Cinematic still-frame feel, gentle ambient motion only — no camera movement.",
  },
  custom: {
    id: "custom",
    label: "Custom",
    hint: "Write your own motion prompt",
    prompt: "",
  },
};

const VIDEO_QUALITY_SUFFIX =
  "4K, photorealistic, smooth motion, cinematic lighting, sharp focus, no morphing artefacts, no warped fingers, no extra limbs.";

export function buildVideoPrompt(input: {
  motionPreset: MotionPresetId;
  customPrompt?: string;
}): string {
  const meta = MOTION_PRESETS[input.motionPreset];
  const base =
    input.motionPreset === "custom"
      ? (input.customPrompt ?? "").trim()
      : input.customPrompt && input.customPrompt.trim().length > 0
        ? input.customPrompt.trim()
        : meta.prompt;
  if (!base) {
    throw new Error("buildVideoPrompt: prompt is empty.");
  }
  return `${base}\n\n${VIDEO_QUALITY_SUFFIX}`;
}

// -----------------------------------------------------------------------------
// Public entry — submits the job to fal and returns immediately with the
// request id + endpoint. The caller (the API route) persists those in
// `outfit_videos` and the client polls /api/video/[id]/status until the row
// transitions to `completed` or `failed`.
//
// Non-blocking — Kling 3.0 Pro can take 90-180s, longer than Netlify's 60s
// function timeout, and even the fast models would freeze the UI for too long.
// -----------------------------------------------------------------------------

export type GenerateVideoInput = {
  modelId: VideoModelId;
  imageUrl: string;
  motionPreset: MotionPresetId;
  customPrompt?: string;
  durationSeconds: number;
  resolution?: VideoResolution;
};

export type GenerateVideoSubmission = FalVideoSubmission & {
  modelId: VideoModelId;
  endpoint: string;
  promptUsed: string;
  // Estimated billed cost for the row, computed from the model's per-second
  // rate at the chosen resolution × the (snapped) duration we actually sent
  // to fal. Persisted to outfit_videos.cost_usd so the gallery shows what
  // each render *should* cost.
  estCostUsd: number;
  // Echo the duration + resolution actually sent so the caller can persist
  // what the model will produce. Matters when the requested values are
  // outside the model's allowed sets and we snap to a valid default.
  effectiveDurationSeconds: number;
  effectiveResolution: VideoResolution;
};

export async function submitOutfitVideo(
  input: GenerateVideoInput,
): Promise<GenerateVideoSubmission> {
  const meta = VIDEO_MODELS[input.modelId];
  if (!meta) {
    throw new Error(`Unknown video model: ${input.modelId}`);
  }
  if (!env.fal.hasKey()) {
    throw new Error(
      "FAL_KEY is required for image-to-video. Add it to .env.local.",
    );
  }

  // Snap duration + resolution into the model's allowed sets defensively.
  // The API route already validates these, but a stale client cache or unit
  // test shouldn't be able to send invalid values to fal — and accidentally
  // billing 1080p on a model that doesn't allow it would be expensive.
  const effectiveDurationSeconds = meta.allowedDurations.includes(
    input.durationSeconds,
  )
    ? input.durationSeconds
    : meta.defaultDuration;

  const requestedResolution = input.resolution ?? meta.defaultResolution;
  const effectiveResolution: VideoResolution = meta.allowedResolutions.includes(
    requestedResolution,
  )
    ? requestedResolution
    : meta.defaultResolution;

  const prompt = buildVideoPrompt({
    motionPreset: input.motionPreset,
    customPrompt: input.customPrompt,
  });

  // Each model shapes its own body — Seedance and Kling have completely
  // different schemas (image_url vs start_image_url, resolution support
  // vs none, etc.). See VideoModelMeta.buildFalInput.
  const body = meta.buildFalInput({
    imageUrl: input.imageUrl,
    prompt,
    durationSeconds: effectiveDurationSeconds,
    resolution: effectiveResolution,
  });

  const submission = await submitFalVideo({
    endpoint: meta.endpoint,
    body,
  });

  return {
    ...submission,
    modelId: input.modelId,
    endpoint: meta.endpoint,
    promptUsed: prompt,
    estCostUsd: estimateVideoCost(
      input.modelId,
      effectiveResolution,
      effectiveDurationSeconds,
    ),
    effectiveDurationSeconds,
    effectiveResolution,
  };
}
