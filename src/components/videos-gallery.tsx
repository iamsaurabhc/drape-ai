"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Film,
  Trash2,
  Download,
  ExternalLink,
  AlertCircle,
  Lock,
  Loader2,
  Maximize2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SkeletonImage } from "@/components/skeleton-image";
import { useToast } from "@/components/toast";

// Mirror src/lib/outfit_videos.ts → StoredOutfitVideo (client copy).
export type GalleryVideo = {
  id: string;
  outfitId: string | null;
  sourceImageUrl: string;
  prompt: string;
  motionPreset:
    | "subtle-studio"
    | "editorial-turn"
    | "walk-forward"
    | "catwalk-pass"
    | "detail-pan"
    | "hair-fabric"
    | "custom"
    | null;
  model: "seedance-2-fast" | "seedance-2-pro" | "kling-3-pro";
  durationSeconds: number;
  resolution: "480p" | "720p" | "1080p" | null;
  status: "queued" | "running" | "completed" | "failed";
  resultVideoUrl: string | null;
  providerRequestId: string | null;
  costUsd: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  outfit: {
    characterId: string | null;
    characterName: string | null;
    characterUrl: string | null;
    imageUrl: string | null;
    garmentCount: number;
  } | null;
};

const MOTION_LABEL: Record<string, string> = {
  "subtle-studio": "Subtle Studio",
  "editorial-turn": "Editorial Turn",
  "walk-forward": "Walk Forward",
  "catwalk-pass": "Catwalk Pass",
  "detail-pan": "Detail Pan",
  "hair-fabric": "Hair & Fabric",
  custom: "Custom",
};

const MODEL_LABEL: Record<string, string> = {
  "seedance-2-fast": "Seedance 2.0 Fast",
  "seedance-2-pro": "Seedance 2.0",
  "kling-3-pro": "Kling 3.0 Pro",
};

export default function VideosGallery({
  initialVideos,
  supabaseReady,
  videoProviderReady,
}: {
  initialVideos: GalleryVideo[];
  supabaseReady: boolean;
  videoProviderReady: boolean;
}) {
  const toast = useToast();

  const [videos, setVideos] = useState<GalleryVideo[]>(initialVideos);
  const [characterFilter, setCharacterFilter] = useState<string | "all">("all");
  const [motionFilter, setMotionFilter] = useState<string | "all">("all");
  const [modelFilter, setModelFilter] = useState<string | "all">("all");
  const [expanded, setExpanded] = useState<GalleryVideo | null>(null);

  const characterFilters = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const v of videos) {
      const id = v.outfit?.characterId ?? "__unassigned";
      const name = v.outfit?.characterName ?? "Unassigned";
      const ex = map.get(id);
      if (ex) ex.count += 1;
      else map.set(id, { id, name, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [videos]);

  const filteredVideos = useMemo(() => {
    return videos.filter((v) => {
      if (characterFilter !== "all") {
        const cid = v.outfit?.characterId ?? "__unassigned";
        if (cid !== characterFilter) return false;
      }
      if (motionFilter !== "all" && v.motionPreset !== motionFilter) return false;
      if (modelFilter !== "all" && v.model !== modelFilter) return false;
      return true;
    });
  }, [videos, characterFilter, motionFilter, modelFilter]);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        label: string;
        characterUrl: string | null;
        videos: GalleryVideo[];
      }
    >();
    for (const v of filteredVideos) {
      const key = v.outfit?.characterId ?? "__unassigned";
      const label = v.outfit?.characterName ?? "Unassigned";
      const ex = map.get(key);
      if (ex) ex.videos.push(v);
      else
        map.set(key, {
          key,
          label,
          characterUrl: v.outfit?.characterUrl ?? null,
          videos: [v],
        });
    }
    return Array.from(map.values()).sort(
      (a, b) => b.videos.length - a.videos.length,
    );
  }, [filteredVideos]);

  // Auto-poll any rows that are still rendering. Each running id has its own
  // setInterval; when the status flips to completed/failed we replace the row
  // in state and the interval clears itself on the next render.
  const runningIds = useMemo(
    () =>
      videos
        .filter((v) => v.status === "running" || v.status === "queued")
        .map((v) => v.id),
    [videos],
  );

  const pollersRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const pollers = pollersRef.current;
    const active = new Set(runningIds);
    // Stop pollers for ids that are no longer running.
    for (const [id, iv] of pollers.entries()) {
      if (!active.has(id)) {
        window.clearInterval(iv);
        pollers.delete(id);
      }
    }
    // Start pollers for newly-active running ids.
    for (const id of runningIds) {
      if (pollers.has(id)) continue;
      const tick = async () => {
        try {
          const res = await fetch(`/api/video/${id}/status`);
          if (!res.ok) return;
          const next = (await res.json()) as GalleryVideo;
          setVideos((prev) => {
            const idx = prev.findIndex((v) => v.id === id);
            if (idx === -1) return prev;
            const copy = prev.slice();
            copy[idx] = next;
            return copy;
          });
          if (next.status === "completed") {
            toast.success(`Video ready · ${MODEL_LABEL[next.model] ?? next.model}`);
          } else if (next.status === "failed") {
            toast.error(next.error ?? "Video generation failed.");
          }
        } catch {
          // transient — try again next tick.
        }
      };
      const iv = window.setInterval(tick, 4000);
      pollers.set(id, iv);
      tick();
    }
    return () => {
      // On unmount, clear all pollers.
      for (const iv of pollers.values()) window.clearInterval(iv);
      pollers.clear();
    };
    // We intentionally exclude `toast` to avoid restarting pollers on toast
    // changes — toast is stable across renders from useToast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningIds]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? "Failed to delete.");
          return;
        }
        setVideos((prev) => prev.filter((v) => v.id !== id));
        if (expanded?.id === id) setExpanded(null);
        toast.success("Video deleted.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Network error.");
      }
    },
    [toast, expanded],
  );

  const motionsUsed = useMemo(() => {
    const set = new Set<string>();
    videos.forEach((v) => {
      if (v.motionPreset) set.add(v.motionPreset);
    });
    return Array.from(set);
  }, [videos]);

  const modelsUsed = useMemo(() => {
    const set = new Set<string>();
    videos.forEach((v) => set.add(v.model));
    return Array.from(set);
  }, [videos]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <Header />

      {!supabaseReady && (
        <Banner kind="warn">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            Supabase is not configured — videos are persisted there. Add the{" "}
            <code>SUPABASE_*</code> keys to <code>.env.local</code>.
          </span>
        </Banner>
      )}
      {!videoProviderReady && (
        <Banner kind="warn">
          <Lock className="size-4 shrink-0" />
          <span>
            <code>FAL_KEY</code> is required to generate new videos — image-to-video
            now runs on fal.ai (Seedance 2.0 / Kling 3.0 Pro). Get a key at{" "}
            <a
              className="underline"
              href="https://fal.ai/dashboard/keys"
              target="_blank"
              rel="noreferrer"
            >
              fal.ai/dashboard/keys
            </a>
            .
          </span>
        </Banner>
      )}

      {videos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <FilterRow
            label="Character"
            options={[
              { id: "all", label: `All (${videos.length})` },
              ...characterFilters.map((c) => ({
                id: c.id,
                label: `${c.name} (${c.count})`,
              })),
            ]}
            value={characterFilter}
            onChange={setCharacterFilter}
          />
          {motionsUsed.length > 0 && (
            <FilterRow
              label="Motion"
              options={[
                { id: "all", label: "All motions" },
                ...motionsUsed.map((m) => ({
                  id: m,
                  label: MOTION_LABEL[m] ?? m,
                })),
              ]}
              value={motionFilter}
              onChange={setMotionFilter}
            />
          )}
          {modelsUsed.length > 1 && (
            <FilterRow
              label="Model"
              options={[
                { id: "all", label: "All models" },
                ...modelsUsed.map((m) => ({
                  id: m,
                  label: MODEL_LABEL[m] ?? m,
                })),
              ]}
              value={modelFilter}
              onChange={setModelFilter}
            />
          )}
        </div>
      )}

      {videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-16 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          <Film className="size-10 text-zinc-400" />
          <div className="max-w-md text-center text-sm">
            <p className="font-medium text-zinc-900 dark:text-zinc-100">
              No videos generated yet.
            </p>
            <p className="mt-1 text-zinc-500">
              Open the{" "}
              <Link href="/composer" className="underline">
                Composer
              </Link>{" "}
              and click <b>Generate video</b> on any saved outfit to animate it
              into a 3-5 second clip.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm">
                {g.characterUrl && (
                  <span className="block size-7 overflow-hidden rounded-full ring-1 ring-zinc-200 dark:ring-zinc-800">
                    <SkeletonImage
                      src={g.characterUrl}
                      alt={g.label}
                      className="h-full w-full"
                      objectFit="cover"
                    />
                  </span>
                )}
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {g.label}
                </span>
                <span className="text-xs text-zinc-500">
                  · {g.videos.length} video{g.videos.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {g.videos.map((v) => (
                  <VideoTile
                    key={v.id}
                    video={v}
                    onDelete={() => handleDelete(v.id)}
                    onExpand={() => setExpanded(v)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {expanded && (
        <VideoLightbox
          video={expanded}
          onClose={() => setExpanded(null)}
          onDelete={() => handleDelete(expanded.id)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header() {
  return (
    <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
        Stage 4 · Videos
      </p>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Animated catalog videos
      </h1>
      <p className="max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Every saved outfit can be turned into a 3-5 second cinematic clip with
        one of three Higgsfield image-to-video models. Pick a{" "}
        <b>motion preset</b> — Subtle Studio, Editorial Turn, Walk Forward,
        Catwalk Pass, Detail Pan, Hair &amp; Fabric, or Custom — and we&apos;ll
        animate the model in-place without losing identity or garment fidelity.
      </p>
    </header>
  );
}

function VideoTile({
  video,
  onDelete,
  onExpand,
}: {
  video: GalleryVideo;
  onDelete: () => void;
  onExpand: () => void;
}) {
  const isRunning = video.status === "running" || video.status === "queued";
  const isFailed = video.status === "failed";

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-white dark:bg-zinc-900",
        isFailed
          ? "border-red-300 dark:border-red-900"
          : isRunning
            ? "border-zinc-300 dark:border-zinc-700"
            : "border-zinc-200 dark:border-zinc-800",
      )}
    >
      <div className="relative aspect-[3/4] w-full bg-zinc-50 dark:bg-zinc-950">
        {video.resultVideoUrl ? (
          <video
            src={video.resultVideoUrl}
            poster={video.sourceImageUrl}
            muted
            playsInline
            loop
            preload="metadata"
            onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
            className="h-full w-full object-cover"
          />
        ) : (
          <SkeletonImage
            src={video.sourceImageUrl}
            alt="Source frame"
            className="h-full w-full"
            objectFit="cover"
          />
        )}
        {isRunning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white">
            <Loader2 className="size-6 animate-spin" />
            <p className="text-[11px] font-medium uppercase tracking-wider">
              Rendering...
            </p>
            <p className="text-[10px] opacity-80">
              {MODEL_LABEL[video.model] ?? video.model}
            </p>
          </div>
        )}
        {isFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-red-950/80 px-3 text-center text-white">
            <AlertCircle className="size-6" />
            <p className="text-[11px] font-medium uppercase tracking-wider">
              Failed
            </p>
            {video.error && (
              <p className="line-clamp-3 text-[10px] opacity-80">
                {video.error}
              </p>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={onExpand}
          className="absolute inset-0 cursor-zoom-in"
          aria-label="Expand video"
          title="Open full size"
        />
        <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white">
          <Film className="size-3" /> {video.durationSeconds}s
          {video.resolution ? ` · ${video.resolution}` : ""}
        </span>
        {!isRunning && !isFailed && (
          <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white opacity-0 transition group-hover:opacity-100">
            <Maximize2 className="inline size-3" /> open
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 p-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
            {MOTION_LABEL[video.motionPreset ?? "custom"]}
          </p>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-zinc-500">
            {MODEL_LABEL[video.model] ?? video.model}
            {video.resolution ? ` · ${video.resolution}` : ""}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-zinc-400">
            ${video.costUsd.toFixed(2)}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          title="Delete"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function VideoLightbox({
  video,
  onClose,
  onDelete,
}: {
  video: GalleryVideo;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-full max-w-4xl flex-col gap-3"
      >
        {video.resultVideoUrl ? (
          <video
            src={video.resultVideoUrl}
            controls
            autoPlay
            loop
            playsInline
            className="max-h-[80vh] max-w-full rounded-lg bg-black shadow-2xl"
          />
        ) : (
          <p className="text-white">Video not available.</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/80">
          <div>
            <p className="font-medium text-white">
              {MOTION_LABEL[video.motionPreset ?? "custom"]} ·{" "}
              {MODEL_LABEL[video.model] ?? video.model} · {video.durationSeconds}s
              {video.resolution ? ` · ${video.resolution}` : ""}
            </p>
            <p className="mt-0.5 opacity-70">
              {video.outfit?.characterName ?? "Unassigned"} · $
              {video.costUsd.toFixed(2)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {video.resultVideoUrl && (
              <>
                <a
                  href={video.resultVideoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 transition hover:bg-white/20"
                >
                  <ExternalLink className="size-3.5" /> Open
                </a>
                <a
                  href={video.resultVideoUrl}
                  download
                  className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 transition hover:bg-white/20"
                >
                  <Download className="size-3.5" /> Download
                </a>
              </>
            )}
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1 rounded-md bg-red-500/20 px-2.5 py-1 text-red-200 transition hover:bg-red-500/30"
            >
              <Trash2 className="size-3.5" /> Delete
            </button>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        title="Close (Esc)"
        className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs transition",
            value === o.id
              ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
              : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: "warn" | "info";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
        kind === "warn"
          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
          : "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300",
      )}
    >
      {children}
    </div>
  );
}
