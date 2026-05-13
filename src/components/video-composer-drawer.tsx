"use client";

/**
 * VideoComposerDrawer — slides in from the right when the user clicks
 * "Generate video" on a saved outfit tile.
 *
 * Lets the user choose:
 *   - a motion preset (the "categorical side of changes" the prompt brief
 *     asked for) which prefills the prompt textarea
 *   - the Higgsfield model (DoP / Seedance / Kling)
 *   - duration: 3s or 5s
 *
 * On submit, calls /api/video/generate which submits to Higgsfield, polls,
 * mirrors the resulting MP4 into Supabase Storage, and returns the persisted
 * outfit_video record. The drawer then plays the result inline.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Sparkles,
  Loader2,
  Film,
  Trash2,
  Download,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SkeletonImage } from "@/components/skeleton-image";
import { useToast } from "@/components/toast";

// Mirror src/lib/video.ts → MOTION_PRESETS so the drawer stays a client
// component without server imports. Keep the IDs and prompts in sync.
type MotionPresetId =
  | "subtle-studio"
  | "editorial-turn"
  | "walk-forward"
  | "catwalk-pass"
  | "detail-pan"
  | "hair-fabric"
  | "custom";

const MOTION_PRESET_OPTIONS: {
  id: MotionPresetId;
  label: string;
  hint: string;
  prompt: string;
}[] = [
  {
    id: "subtle-studio",
    label: "Subtle Studio",
    hint: "Gentle push-in, natural micro-movement",
    prompt:
      "The model holds the same pose with subtle natural micro-movements — soft breathing, slight head tilt. The camera performs a slow gentle push-in. Studio lighting unchanged, garment fabric settles naturally.",
  },
  {
    id: "editorial-turn",
    label: "Editorial Turn",
    hint: "Slow three-quarter turn to camera",
    prompt:
      "The model performs a slow elegant three-quarter turn toward the camera, settling into eye contact at the end of the clip. Hair flows naturally with the rotation. Soft cinematic light, magazine-quality composition.",
  },
  {
    id: "walk-forward",
    label: "Walk Forward",
    hint: "Two confident steps toward the camera",
    prompt:
      "The model takes two confident steps toward the camera with a natural arm sway. Shallow depth of field stays sharp on the face. Runway energy, garment fabric and hair move with the motion.",
  },
  {
    id: "catwalk-pass",
    label: "Catwalk Pass",
    hint: "Side-on runway walk past camera",
    prompt:
      "The model walks past the camera left-to-right at a steady catwalk pace. The camera tracks the model side-on. Fabric, accessories, and hair move naturally with each step. Runway energy.",
  },
  {
    id: "detail-pan",
    label: "Detail Pan",
    hint: "Slow vertical pan head-to-toe",
    prompt:
      "Static model holding the pose. The camera performs a slow smooth vertical pan from face down to shoes, revealing the full outfit head-to-toe. Soft cinematic light, sharp focus on garment details.",
  },
  {
    id: "hair-fabric",
    label: "Hair & Fabric",
    hint: "Wind moves hair + garment, model static",
    prompt:
      "The model holds the pose. Soft directional wind moves the hair and garment fabric naturally throughout the clip. Cinematic still-frame feel, gentle ambient motion only — no camera movement.",
  },
  {
    id: "custom",
    label: "Custom",
    hint: "Write your own motion prompt",
    prompt: "",
  },
];

type VideoModelId = "seedance-2-fast" | "seedance-2-pro" | "kling-3-pro";
type VideoResolution = "480p" | "720p" | "1080p";

// Mirror src/lib/video.ts → VIDEO_MODELS so the drawer can stay a client
// component. Keep `allowedDurations`, `allowedResolutions`, and
// `pricePerSecondUsd` in sync with the server-side registry — the API
// enforces the same sets so a mismatch fails closed with a 400.
type PricePerSecond = Partial<Record<VideoResolution, number>>;

const VIDEO_MODEL_OPTIONS: {
  id: VideoModelId;
  label: string;
  description: string;
  waitLabel: string;
  allowedDurations: number[];
  defaultDuration: number;
  // When length === 1 the UI hides the Resolution chip section — some fal
  // endpoints (Kling 3.0 Pro) don't expose a resolution parameter at all.
  allowedResolutions: VideoResolution[];
  defaultResolution: VideoResolution;
  pricePerSecondUsd: PricePerSecond;
  durationNote?: string;
}[] = [
  {
    id: "seedance-2-fast",
    label: "Seedance 2.0 Fast (ByteDance)",
    description:
      "Lower-latency tier of Seedance 2.0 — best for quick motion iteration.",
    waitLabel: "~30-60s",
    allowedDurations: [4, 5, 6, 8, 10],
    defaultDuration: 5,
    allowedResolutions: ["480p", "720p"],
    defaultResolution: "480p",
    pricePerSecondUsd: { "480p": 0.1, "720p": 0.24 },
  },
  {
    id: "seedance-2-pro",
    label: "Seedance 2.0 (flagship)",
    description:
      "Flagship ByteDance image-to-video — real-world physics, director-level camera control, up to 15s.",
    waitLabel: "~60-120s",
    allowedDurations: [4, 5, 6, 8, 10, 12, 15],
    defaultDuration: 5,
    allowedResolutions: ["480p", "720p", "1080p"],
    defaultResolution: "720p",
    pricePerSecondUsd: { "480p": 0.06, "720p": 0.13, "1080p": 0.23 },
  },
  {
    id: "kling-3-pro",
    label: "Kling 3.0 Pro",
    description:
      "Most cinematic — catalog hero shots, premium campaign look with fluid motion.",
    waitLabel: "~90-180s",
    allowedDurations: [5, 10],
    defaultDuration: 5,
    // fal-ai/kling-video/v3/pro/image-to-video has no resolution parameter
    // in its input schema — single entry → resolution chip hidden in UI.
    allowedResolutions: ["720p"],
    defaultResolution: "720p",
    pricePerSecondUsd: { "720p": 0.112 },
    durationNote: "Kling 3.0 Pro renders at a fixed resolution — no dial.",
  },
];

function rateFor(
  pricePerSecondUsd: PricePerSecond,
  resolution: VideoResolution,
  fallback: VideoResolution,
): number {
  return (
    pricePerSecondUsd[resolution] ?? pricePerSecondUsd[fallback] ?? 0
  );
}

function estimateCost(
  pricePerSecondUsd: PricePerSecond,
  resolution: VideoResolution,
  fallback: VideoResolution,
  durationSeconds: number,
): number {
  const rate = rateFor(pricePerSecondUsd, resolution, fallback);
  return Math.round(rate * durationSeconds * 100) / 100;
}

type OutfitForVideo = {
  id: string;
  resultImageUrl: string | null;
  characterName: string | null;
};

type VideoStatus = "queued" | "running" | "completed" | "failed";

type StoredVideo = {
  id: string;
  resultVideoUrl: string | null;
  motionPreset: MotionPresetId | null;
  model: VideoModelId;
  durationSeconds: number;
  resolution: VideoResolution | null;
  costUsd: number;
  createdAt: string;
  status: VideoStatus;
  error: string | null;
};

const POLL_INTERVAL_MS = 3000;
// Safety cap. Higgsfield's longest model (Kling 2.1 Pro) advertises 60-180s,
// so 10 minutes is a generous ceiling that catches stuck jobs without giving
// up too early on a slow queue.
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export function VideoComposerDrawer({
  outfit,
  onClose,
}: {
  outfit: OutfitForVideo | null;
  onClose: () => void;
}) {
  if (!outfit) return null;
  // Key by outfit.id so all drawer state resets when the user opens a
  // different outfit — no setState-in-effect needed.
  return <DrawerInner key={outfit.id} outfit={outfit} onClose={onClose} />;
}

function DrawerInner({
  outfit,
  onClose,
}: {
  outfit: OutfitForVideo;
  onClose: () => void;
}) {
  const toast = useToast();

  const [motionPreset, setMotionPreset] =
    useState<MotionPresetId>("editorial-turn");
  const [customPrompt, setCustomPrompt] = useState<string>(
    MOTION_PRESET_OPTIONS.find((m) => m.id === "editorial-turn")?.prompt ?? "",
  );
  const [modelId, setModelId] = useState<VideoModelId>("seedance-2-fast");
  const [durationSeconds, setDurationSeconds] = useState<number>(5);
  const [resolution, setResolution] = useState<VideoResolution>("480p");

  const [submitting, setSubmitting] = useState(false);
  const [existingVideos, setExistingVideos] = useState<StoredVideo[]>([]);
  const [latestVideo, setLatestVideo] = useState<StoredVideo | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // The single in-flight video we are polling. When set, the drawer renders
  // a progress strip and refreshes its status every POLL_INTERVAL_MS until
  // status transitions to `completed` or `failed`.
  const [pending, setPending] = useState<StoredVideo | null>(null);
  const [pendingStartedAt, setPendingStartedAt] = useState<number | null>(null);
  // `nowMs` is bumped once per second whenever a pending video is in flight so
  // the elapsed-time label updates. Storing the wall-clock and deriving the
  // elapsed value avoids the setState-in-effect lint rule.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const elapsedSec = pendingStartedAt
    ? Math.max(0, Math.floor((nowMs - pendingStartedAt) / 1000))
    : 0;

  const generating = submitting || pending?.status === "running" || pending?.status === "queued";

  // Fetch existing videos for this outfit ----------------------------------
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/videos/list?outfitId=${outfit.id}`)
      .then(async (res) => (res.ok ? res.json() : { videos: [] }))
      .then((data: { videos?: ServerVideo[] }) => {
        if (cancelled) return;
        const stored = (data.videos ?? []).map(toStored);
        setExistingVideos(stored);
        // If there's a still-running video from a previous session, resume
        // polling it.
        const resumable = stored.find(
          (v) => v.status === "running" || v.status === "queued",
        );
        if (resumable) {
          setPending(resumable);
          setPendingStartedAt(Date.now());
        }
      })
      .catch(() => !cancelled && setExistingVideos([]))
      .finally(() => !cancelled && setLoadingExisting(false));
    return () => {
      cancelled = true;
    };
  }, [outfit.id]);

  // Escape closes the drawer -----------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, submitting]);

  // Elapsed-time ticker — only runs while a pending video is in flight.
  useEffect(() => {
    if (!pending || !pendingStartedAt) return;
    const iv = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, [pending, pendingStartedAt]);

  // Status poller — refreshes the pending row every POLL_INTERVAL_MS until
  // it transitions to completed/failed, or we hit the safety timeout.
  useEffect(() => {
    if (!pending) return;
    if (pending.status === "completed" || pending.status === "failed") return;

    let cancelled = false;
    const startedAt = pendingStartedAt ?? Date.now();

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        toast.error(
          "Video is taking unusually long — stopped polling. Check the Videos page later.",
        );
        setPending(null);
        return;
      }
      try {
        const res = await fetch(`/api/video/${pending.id}/status`);
        const data = (await res.json()) as ServerVideo;
        if (cancelled) return;
        const next = toStored(data);
        setPending(next);

        if (next.status === "completed") {
          setLatestVideo(next);
          setExistingVideos((prev) => {
            const without = prev.filter((v) => v.id !== next.id);
            return [next, ...without];
          });
          toast.success("Video ready — playing below.");
          setPending(null);
          setPendingStartedAt(null);
          return;
        }
        if (next.status === "failed") {
          toast.error(next.error ?? "Video generation failed.");
          setExistingVideos((prev) => {
            const without = prev.filter((v) => v.id !== next.id);
            return [next, ...without];
          });
          setPending(null);
          setPendingStartedAt(null);
          return;
        }
      } catch (err) {
        // Transient — keep polling.
        console.warn("[video] status poll failed", err);
      }
    };

    const iv = window.setInterval(tick, POLL_INTERVAL_MS);
    // Kick off an immediate first poll so the UI updates without waiting a
    // full interval.
    tick();

    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [pending, pendingStartedAt, toast]);

  const handlePresetChange = useCallback((id: MotionPresetId) => {
    setMotionPreset(id);
    const next = MOTION_PRESET_OPTIONS.find((m) => m.id === id);
    if (next && id !== "custom") {
      setCustomPrompt(next.prompt);
    } else if (id === "custom") {
      setCustomPrompt("");
    }
  }, []);

  const activeModel = useMemo(
    () => VIDEO_MODEL_OPTIONS.find((m) => m.id === modelId),
    [modelId],
  );

  const handleModelChange = useCallback((id: VideoModelId) => {
    setModelId(id);
    const next = VIDEO_MODEL_OPTIONS.find((m) => m.id === id);
    if (!next) return;
    // Snap duration + resolution into the new model's allowed sets. We bias
    // toward keeping the user's current selections when they're valid, and
    // fall back to the model's *default* (which is the cheapest sensible
    // option) rather than the smallest allowed value — this prevents the
    // user from accidentally getting bumped to 1080p when switching models.
    setDurationSeconds((current) =>
      next.allowedDurations.includes(current) ? current : next.defaultDuration,
    );
    setResolution((current) =>
      next.allowedResolutions.includes(current) ? current : next.defaultResolution,
    );
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!outfit) return;
    if (motionPreset === "custom" && customPrompt.trim().length < 12) {
      toast.error(
        "Custom motion needs a prompt of at least 12 characters describing the desired motion.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outfitId: outfit.id,
          modelId,
          motionPreset,
          customPrompt:
            customPrompt.trim().length > 0 ? customPrompt.trim() : undefined,
          durationSeconds,
          resolution,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? `Video submit failed (${res.status}).`);
        return;
      }
      const stored = toStored(data);
      // Fast-path: cached result already returned a completed video.
      if (stored.status === "completed") {
        setLatestVideo(stored);
        setExistingVideos((prev) => [stored, ...prev]);
        toast.success("Video ready — playing below.");
      } else {
        setPending(stored);
        setPendingStartedAt(Date.now());
        setExistingVideos((prev) => [stored, ...prev]);
        toast.info(
          `Submitted to ${activeModel?.label ?? modelId} — we'll poll the status every few seconds.`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }, [outfit, motionPreset, customPrompt, modelId, durationSeconds, resolution, toast, activeModel]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? "Failed to delete.");
          return;
        }
        setExistingVideos((prev) => prev.filter((v) => v.id !== id));
        if (latestVideo?.id === id) setLatestVideo(null);
        if (pending?.id === id) {
          setPending(null);
          setPendingStartedAt(null);
        }
        toast.success("Video deleted.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Network error.");
      }
    },
    [latestVideo, pending, toast],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Generate video from outfit"
      className="fixed inset-0 z-40 flex"
    >
      <button
        type="button"
        aria-label="Close drawer"
        onClick={() => !generating && onClose()}
        className="flex-1 cursor-default bg-black/40 backdrop-blur-[2px]"
        disabled={generating}
      />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="ml-auto flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl animate-drawer-in dark:border-zinc-800 dark:bg-zinc-950 sm:max-w-lg"
      >
        {/* Header ------------------------------------------------------ */}
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
              Stage 4 · Image to Video
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Animate outfit
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {outfit.characterName ?? "outfit"} · pick a motion preset, model,
              and duration.
            </p>
          </div>
          <button
            type="button"
            onClick={() => !generating && onClose()}
            disabled={generating}
            className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-900"
            title="Close (Esc)"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-5">
            {/* Source preview ----------------------------------------- */}
            <div className="flex gap-3">
              <SkeletonImage
                src={outfit.resultImageUrl}
                alt={outfit.characterName ?? "source outfit"}
                className="h-32 w-24 shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-800"
                objectFit="cover"
              />
              <div className="flex-1 text-xs text-zinc-500">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">
                  Source frame
                </p>
                <p className="mt-1 leading-relaxed">
                  The model and outfit stay locked from this still. Motion is
                  layered on top by{" "}
                  <span className="font-medium">
                    {activeModel?.label ?? "the selected model"}
                  </span>
                  .
                </p>
              </div>
            </div>

            {/* Motion preset ------------------------------------------- */}
            <div>
              <SectionLabel>Motion preset</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                {MOTION_PRESET_OPTIONS.map((m) => {
                  const active = motionPreset === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handlePresetChange(m.id)}
                      disabled={generating}
                      className={cn(
                        "flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition disabled:opacity-60",
                        active
                          ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                          : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600",
                      )}
                    >
                      <span className="text-xs font-semibold">{m.label}</span>
                      <span className="text-[10px] opacity-75">{m.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Prompt textarea ----------------------------------------- */}
            <div>
              <SectionLabel>
                {motionPreset === "custom"
                  ? "Motion prompt (required)"
                  : "Motion prompt (editable)"}
              </SectionLabel>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                disabled={generating}
                rows={4}
                placeholder={
                  motionPreset === "custom"
                    ? "Describe the motion: camera moves, model actions, fabric / hair behaviour..."
                    : ""
                }
                className="w-full resize-none rounded-lg border border-zinc-300 bg-white p-3 text-xs leading-relaxed text-zinc-900 outline-none focus:border-zinc-900 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            {/* Model picker --------------------------------------------- */}
            <div>
              <SectionLabel>Model</SectionLabel>
              <div className="flex flex-col gap-1.5">
                {VIDEO_MODEL_OPTIONS.map((m) => {
                  const active = modelId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleModelChange(m.id)}
                      disabled={generating}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition disabled:opacity-60",
                        active
                          ? "border-zinc-900 bg-zinc-50 dark:border-white dark:bg-zinc-900"
                          : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600",
                      )}
                    >
                      <div className="flex flex-1 flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                            {m.label}
                          </span>
                          <span className="text-xs tabular-nums text-zinc-500">
                            from $
                            {(
                              rateFor(
                                m.pricePerSecondUsd,
                                m.defaultResolution,
                                m.defaultResolution,
                              ) * m.defaultDuration
                            ).toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {m.description}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                          wait {m.waitLabel} · {m.defaultDuration}s {m.defaultResolution} default
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duration ------------------------------------------------ */}
            <div>
              <SectionLabel>Duration</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {(activeModel?.allowedDurations ?? [5]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setDurationSeconds(s)}
                    disabled={generating}
                    className={cn(
                      "min-w-12 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60",
                      durationSeconds === s
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                        : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900",
                    )}
                  >
                    {s}s
                  </button>
                ))}
              </div>
              {activeModel?.durationNote && (
                <p className="mt-1.5 text-[10px] text-zinc-500">
                  {activeModel.durationNote}
                </p>
              )}
            </div>

            {/* Resolution --------------------------------------------- */}
            {/* Only render the chip selector when the active model
                actually exposes a resolution dial — Kling 3.0 Pro on fal
                doesn't, so showing the chip would be lying. */}
            {activeModel && activeModel.allowedResolutions.length > 1 && (
              <div>
                <SectionLabel>Resolution</SectionLabel>
                <div className="flex gap-2">
                  {activeModel.allowedResolutions.map((r) => {
                    const rateAtR = rateFor(
                      activeModel.pricePerSecondUsd,
                      r,
                      activeModel.defaultResolution,
                    );
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setResolution(r)}
                        disabled={generating}
                        className={cn(
                          "flex flex-1 flex-col items-center gap-0.5 rounded-lg border px-3 py-2 transition disabled:opacity-60",
                          resolution === r
                            ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                            : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900",
                        )}
                      >
                        <span className="text-sm font-medium">{r}</span>
                        <span
                          className={cn(
                            "text-[10px] tabular-nums",
                            resolution === r ? "opacity-75" : "text-zinc-500",
                          )}
                        >
                          ${rateAtR.toFixed(2)}/s
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-zinc-500">
                  Higher resolution = proportionally higher fal.ai bill. 720p
                  is fine for catalog grids; reserve 1080p for hero shots.
                </p>
              </div>
            )}

            {/* Cost estimate ------------------------------------------ */}
            {activeModel && (
              <CostEstimate
                durationSeconds={durationSeconds}
                resolution={resolution}
                pricePerSecondUsd={activeModel.pricePerSecondUsd}
                fallbackResolution={activeModel.defaultResolution}
              />
            )}

            {/* In-progress strip --------------------------------------- */}
            {pending &&
              (pending.status === "running" || pending.status === "queued") && (
                <PendingStrip
                  elapsedSec={elapsedSec}
                  modelLabel={activeModel?.label ?? pending.model}
                  expectedWait={activeModel?.waitLabel ?? "30-180s"}
                />
              )}

            {/* Result preview ------------------------------------------ */}
            {latestVideo?.resultVideoUrl && (
              <VideoPlayer
                video={latestVideo}
                onDelete={() => handleDelete(latestVideo.id)}
              />
            )}

            {/* Existing videos ----------------------------------------- */}
            {existingVideos.length > 0 && (
              <div>
                <SectionLabel>Earlier renders for this outfit</SectionLabel>
                <div className="flex flex-col gap-2">
                  {existingVideos
                    .filter((v) => v.id !== latestVideo?.id && v.id !== pending?.id)
                    .map((v) => (
                      <ExistingVideoRow
                        key={v.id}
                        video={v}
                        onDelete={() => handleDelete(v.id)}
                      />
                    ))}
                </div>
              </div>
            )}

            {existingVideos.length === 0 &&
              !latestVideo &&
              !pending &&
              !loadingExisting && (
                <p className="text-[11px] text-zinc-500">
                  No videos for this outfit yet — generate the first one above.
                </p>
              )}
          </div>
        </div>

        {/* Footer / generate button --------------------------------- */}
        <footer className="border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Submitting to {activeModel?.label ?? "fal.ai"}...
              </>
            ) : pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Rendering · {formatElapsed(elapsedSec)}
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Generate {durationSeconds}s
                {/* Drop the resolution from the label when the model has
                    only one option — it just adds noise (e.g. "Kling · 720p"
                    when no other option exists). */}
                {activeModel && activeModel.allowedResolutions.length > 1
                  ? ` · ${resolution}`
                  : ""}{" "}
                · ~$
                {(activeModel
                  ? estimateCost(
                      activeModel.pricePerSecondUsd,
                      resolution,
                      activeModel.defaultResolution,
                      durationSeconds,
                    )
                  : 0
                ).toFixed(2)}
              </>
            )}
          </button>
          {generating && (
            <p className="mt-2 text-center text-[10px] text-zinc-500">
              You can close this drawer — we&apos;ll keep polling and show the
              result on the Videos page when it&apos;s ready.
            </p>
          )}
        </footer>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function VideoPlayer({
  video,
  onDelete,
}: {
  video: StoredVideo;
  onDelete: () => void;
}) {
  if (!video.resultVideoUrl) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          <Film className="size-4" />
          Just generated · {video.durationSeconds}s
          {video.resolution ? ` · ${video.resolution}` : ""} · ~$
          {video.costUsd.toFixed(2)}
        </p>
        <span className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          {video.motionPreset ?? "custom"} · {video.model}
        </span>
      </div>
      <video
        src={video.resultVideoUrl}
        controls
        autoPlay
        loop
        muted
        playsInline
        className="w-full rounded-lg bg-black"
      />
      <div className="flex items-center gap-2 text-[11px] text-emerald-800 dark:text-emerald-300">
        <a
          href={video.resultVideoUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 rounded-md bg-white/60 px-2 py-1 transition hover:bg-white/80 dark:bg-emerald-900/60 dark:hover:bg-emerald-900"
        >
          <ExternalLink className="size-3" /> Open
        </a>
        <a
          href={video.resultVideoUrl}
          download
          className="flex items-center gap-1 rounded-md bg-white/60 px-2 py-1 transition hover:bg-white/80 dark:bg-emerald-900/60 dark:hover:bg-emerald-900"
        >
          <Download className="size-3" /> Download
        </a>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 transition hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-950/50 dark:hover:text-red-300"
        >
          <Trash2 className="size-3" /> Delete
        </button>
      </div>
    </div>
  );
}

function ExistingVideoRow({
  video,
  onDelete,
}: {
  video: StoredVideo;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
      <video
        src={video.resultVideoUrl ?? undefined}
        muted
        playsInline
        loop
        onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
        onMouseLeave={(e) => {
          e.currentTarget.pause();
          e.currentTarget.currentTime = 0;
        }}
        className="h-16 w-12 shrink-0 rounded bg-zinc-100 object-cover dark:bg-zinc-900"
      />
      <div className="min-w-0 flex-1 text-[11px]">
        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
          {video.motionPreset ?? "custom"} · {video.durationSeconds}s
          {video.resolution ? ` · ${video.resolution}` : ""}
        </p>
        <p className="mt-0.5 truncate text-zinc-500">
          {video.model} · ${video.costUsd.toFixed(2)}
        </p>
      </div>
      <a
        href={video.resultVideoUrl ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        title="Open in new tab"
      >
        <ExternalLink className="size-3.5" />
      </a>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-md p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
        title="Delete"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
      {children}
    </p>
  );
}

function CostEstimate({
  durationSeconds,
  resolution,
  pricePerSecondUsd,
  fallbackResolution,
}: {
  durationSeconds: number;
  resolution: VideoResolution;
  pricePerSecondUsd: PricePerSecond;
  fallbackResolution: VideoResolution;
}) {
  const rate = rateFor(pricePerSecondUsd, resolution, fallbackResolution);
  const estimate = estimateCost(
    pricePerSecondUsd,
    resolution,
    fallbackResolution,
    durationSeconds,
  );
  // Surfaced prominently because fal bills `duration × resolution_factor`,
  // and a single misclick (1080p × 15s) can land at $3+. Show the math, not
  // just the total.
  const isExpensive = estimate >= 1;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
        isExpensive
          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
          : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200",
      )}
    >
      <div className="text-[11px]">
        <p className="font-semibold">Estimated cost</p>
        <p className="mt-0.5 tabular-nums opacity-80">
          {durationSeconds}s × ${rate.toFixed(2)}/s @ {resolution}
        </p>
      </div>
      <p className="text-base font-semibold tabular-nums">
        ~${estimate.toFixed(2)}
      </p>
    </div>
  );
}

function PendingStrip({
  elapsedSec,
  modelLabel,
  expectedWait,
}: {
  elapsedSec: number;
  modelLabel: string;
  expectedWait: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin text-zinc-600 dark:text-zinc-300" />
        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          Rendering on {modelLabel}
        </p>
        <span className="ml-auto tabular-nums text-[11px] text-zinc-500">
          {formatElapsed(elapsedSec)} elapsed · expected {expectedWait}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="h-full w-1/3 animate-[drape-shimmer_2s_linear_infinite] bg-gradient-to-r from-zinc-400 via-zinc-700 to-zinc-400 dark:from-zinc-600 dark:via-zinc-300 dark:to-zinc-600" />
      </div>
      <p className="text-[11px] text-zinc-500">
        Feel free to close this drawer — generation continues server-side. You
        can pick it back up from the Videos page.
      </p>
    </div>
  );
}

function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// API <-> local-state mapper
// ---------------------------------------------------------------------------

type ServerVideo = {
  id: string;
  resultVideoUrl: string | null;
  motionPreset: MotionPresetId | null;
  model: VideoModelId;
  durationSeconds: number;
  resolution?: VideoResolution | null;
  costUsd: number;
  createdAt: string;
  status?: VideoStatus;
  error?: string | null;
};

function toStored(v: ServerVideo): StoredVideo {
  return {
    id: v.id,
    resultVideoUrl: v.resultVideoUrl,
    motionPreset: v.motionPreset,
    model: v.model,
    durationSeconds: v.durationSeconds,
    resolution: v.resolution ?? null,
    costUsd: v.costUsd,
    createdAt: v.createdAt,
    status: v.status ?? (v.resultVideoUrl ? "completed" : "running"),
    error: v.error ?? null,
  };
}
