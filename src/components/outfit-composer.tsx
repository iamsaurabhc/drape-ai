"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Sparkles,
  Save,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
  Trash2,
  Image as ImageIcon,
  User as UserIcon,
  Shirt,
  X,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Palette,
  Film,
  LayoutGrid,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Lightbox, type LightboxItem } from "@/components/lightbox";
import { SkeletonImage } from "@/components/skeleton-image";
import { useToast } from "@/components/toast";
import { VideoComposerDrawer } from "@/components/video-composer-drawer";

// Mirror src/lib/fal.ts → BACKGROUND_PRESETS keys (kept in sync manually so the
// composer can stay a client component without pulling server imports).
type BackgroundPresetId =
  | "studio-white"
  | "studio-gray"
  | "outdoor-street"
  | "golden-hour";

const BACKGROUND_PRESET_OPTIONS: {
  id: BackgroundPresetId;
  label: string;
  hint: string;
  swatch: string;
}[] = [
  {
    id: "studio-white",
    label: "Studio White",
    hint: "Clean seamless white, e-commerce default",
    swatch:
      "linear-gradient(135deg,#ffffff 0%,#f4f4f5 60%,#e4e4e7 100%)",
  },
  {
    id: "studio-gray",
    label: "Studio Gray",
    hint: "Neutral mid-gray editorial paper",
    swatch:
      "linear-gradient(135deg,#d4d4d8 0%,#a1a1aa 60%,#71717a 100%)",
  },
  {
    id: "outdoor-street",
    label: "Outdoor Street",
    hint: "Sunlit urban backdrop, candid",
    swatch:
      "linear-gradient(135deg,#cbd5e1 0%,#94a3b8 50%,#475569 100%)",
  },
  {
    id: "golden-hour",
    label: "Golden Hour",
    hint: "Warm low-angle sunset light",
    swatch:
      "linear-gradient(135deg,#fde68a 0%,#fb923c 55%,#9a3412 100%)",
  },
];

function backgroundLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return BACKGROUND_PRESET_OPTIONS.find((b) => b.id === id)?.label ?? null;
}

// -----------------------------------------------------------------------------
// Types (mirror src/lib/assets.ts and src/lib/outfits.ts)
// -----------------------------------------------------------------------------

type AssetType = "character" | "garment" | "backdrop";
type Category =
  | "top"
  | "bottom"
  | "outer"
  | "dress"
  | "bag"
  | "shoes"
  | "accessory";

type Asset = {
  id: string | null;
  name: string;
  type: AssetType;
  publicUrl: string;
  prompt: string | null;
  generatedByModel: string | null;
  metadata: { category?: Category; source?: "generated" | "uploaded" };
  storedInSupabase: boolean;
};

type Outfit = {
  id: string;
  characterId: string | null;
  characterUrl: string | null;
  characterName: string | null;
  garmentIds: string[];
  garments: { id: string; name: string; url: string; category: string | null }[];
  promptOverride: string | null;
  status: "queued" | "running" | "completed" | "failed";
  resultImageUrl: string | null;
  costUsd: number;
  backgroundPreset: string | null;
  createdAt: string;
};

type CategoryOption = { id: Category; label: string; examples: string };

type GenerationResult = {
  images: { url: string }[];
  promptUsed: string;
  requestId: string;
  estCostUsd: number;
  characterId: string;
  garmentIds: string[];
};

const NUM_IMAGES_OPTIONS = [1, 2, 4] as const;

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export default function OutfitComposer({
  characters,
  garments,
  categories,
  recentOutfits,
  supabaseReady,
  falReady,
  costPerImage,
  modelLabel,
}: {
  characters: Asset[];
  garments: Asset[];
  categories: CategoryOption[];
  recentOutfits: Outfit[];
  supabaseReady: boolean;
  falReady: boolean;
  costPerImage: number;
  modelLabel: string;
}) {
  const toast = useToast();

  const [characterId, setCharacterId] = useState<string | null>(
    characters[0]?.id ?? null,
  );
  const [selectedGarmentIds, setSelectedGarmentIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [numImages, setNumImages] = useState<1 | 2 | 4>(1);
  const [backgroundPreset, setBackgroundPreset] =
    useState<BackgroundPresetId>("studio-white");
  const [showOverride, setShowOverride] = useState(false);
  const [promptOverride, setPromptOverride] = useState("");

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);

  const [savingName, setSavingName] = useState("");
  const [saving, setSaving] = useState(false);

  const [outfits, setOutfits] = useState<Outfit[]>(recentOutfits);
  const [galleryGrouping, setGalleryGrouping] = useState<"character" | "recent">(
    "character",
  );
  const [galleryFilterCharacterId, setGalleryFilterCharacterId] = useState<
    string | "all"
  >("all");
  const [lightbox, setLightbox] = useState<LightboxItem | null>(null);
  const [videoTarget, setVideoTarget] = useState<Outfit | null>(null);

  const filteredGarments = useMemo(
    () =>
      filter === "all"
        ? garments
        : garments.filter((g) => g.metadata.category === filter),
    [garments, filter],
  );

  const selectedGarments = useMemo(
    () =>
      selectedGarmentIds
        .map((id) => garments.find((g) => g.id === id))
        .filter(Boolean) as Asset[],
    [selectedGarmentIds, garments],
  );

  const character = characters.find((c) => c.id === characterId);

  const canGenerate =
    falReady &&
    supabaseReady &&
    characterId !== null &&
    selectedGarmentIds.length >= 1 &&
    selectedGarmentIds.length <= 8 &&
    !generating;

  const toggleGarment = useCallback((id: string | null) => {
    if (!id) return;
    setSelectedGarmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!characterId) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/outfit/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          characterId,
          garmentIds: selectedGarmentIds,
          promptOverride: showOverride && promptOverride.trim().length >= 20
            ? promptOverride.trim()
            : undefined,
          numImages,
          backgroundPreset,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? `Composition failed (${res.status}).`;
        setError(msg);
        toast.error(msg);
      } else {
        setResult(data);
        setSelectedImageIdx(0);
        if (!savingName) {
          setSavingName(
            `${(character?.name ?? "outfit").slice(0, 14)}-${Date.now()
              .toString(36)
              .slice(-4)}`,
          );
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error.";
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }, [
    characterId,
    selectedGarmentIds,
    showOverride,
    promptOverride,
    numImages,
    backgroundPreset,
    savingName,
    character,
    toast,
  ]);

  const handleSave = useCallback(async () => {
    if (!result || !characterId) return;
    const chosen = result.images[selectedImageIdx];
    if (!chosen) return;

    setSaving(true);
    try {
      const res = await fetch("/api/outfit/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          characterId,
          garmentIds: selectedGarmentIds,
          promptOverride:
            showOverride && promptOverride.trim().length >= 20
              ? promptOverride.trim()
              : undefined,
          promptUsed: result.promptUsed,
          sourceImageUrl: chosen.url,
          falRequestId: result.requestId,
          costUsd: result.estCostUsd / (result.images.length || 1),
          backgroundPreset,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Save failed.");
      } else {
        toast.success("Outfit saved — appears in the gallery below.");
        setOutfits((prev) => [data, ...prev]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }, [
    result,
    selectedImageIdx,
    characterId,
    selectedGarmentIds,
    showOverride,
    promptOverride,
    backgroundPreset,
    toast,
  ]);

  const handleDeleteOutfit = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/outfits/${id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? "Failed to delete.");
          return;
        }
        setOutfits((prev) => prev.filter((o) => o.id !== id));
        toast.success("Outfit deleted.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Network error.");
      }
    },
    [toast],
  );

  // ---- Grouping for the saved-outfits gallery ----------------------------
  const characterFilterOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const o of outfits) {
      const key = o.characterId ?? "__unassigned";
      const name = o.characterName ?? "Unassigned";
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { id: key, name, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [outfits]);

  const filteredOutfits = useMemo(() => {
    if (galleryFilterCharacterId === "all") return outfits;
    if (galleryFilterCharacterId === "__unassigned") {
      return outfits.filter((o) => o.characterId === null);
    }
    return outfits.filter((o) => o.characterId === galleryFilterCharacterId);
  }, [outfits, galleryFilterCharacterId]);

  const outfitGroups = useMemo(() => {
    if (galleryGrouping === "recent") {
      return [
        {
          key: "all",
          label: "Most recent",
          characterUrl: null as string | null,
          outfits: filteredOutfits,
        },
      ];
    }
    const map = new Map<
      string,
      { key: string; label: string; characterUrl: string | null; outfits: Outfit[] }
    >();
    for (const o of filteredOutfits) {
      const key = o.characterId ?? "__unassigned";
      const label = o.characterName ?? "Unassigned";
      const existing = map.get(key);
      if (existing) {
        existing.outfits.push(o);
      } else {
        map.set(key, {
          key,
          label,
          characterUrl: o.characterUrl,
          outfits: [o],
        });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.outfits.length - a.outfits.length,
    );
  }, [filteredOutfits, galleryGrouping]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <Header />

      {/* Setup warnings ---------------------------------------------------- */}
      {!falReady && (
        <Banner kind="warn">
          <Lock className="size-4 shrink-0" />
          <span>
            <code>FAL_KEY</code> is required — composition uses{" "}
            <b>{modelLabel}</b>. Get a key at{" "}
            <a
              href="https://fal.ai/dashboard/keys"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              fal.ai/dashboard/keys
            </a>{" "}
            and restart the dev server.
          </span>
        </Banner>
      )}
      {!supabaseReady && (
        <Banner kind="warn">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            Supabase is not configured — the Composer reads characters /
            garments from the asset library.
          </span>
        </Banner>
      )}
      {supabaseReady && characters.length === 0 && (
        <Banner kind="warn">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            No characters saved yet. Generate one in the{" "}
            <Link href="/character" className="underline">
              Character Studio
            </Link>{" "}
            and click <b>Save as character</b>.
          </span>
        </Banner>
      )}
      {supabaseReady && garments.length === 0 && (
        <Banner kind="warn">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            No garments saved yet. Generate or upload some in the{" "}
            <Link href="/garments" className="underline">
              Garment Studio
            </Link>
            .
          </span>
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_440px]">
        {/* ============== LEFT: Selectors ============== */}
        <div className="flex flex-col gap-8">
          {/* Step 1 — Character ---------------------------------------- */}
          <Step n="1" title="Pick a character" icon={UserIcon}>
            {characters.length === 0 ? (
              <EmptyState
                message="No saved characters yet."
                cta={{ href: "/character", label: "Open Character Studio" }}
              />
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {characters.map((c) => (
                  <CharacterTile
                    key={c.id ?? c.publicUrl}
                    asset={c}
                    selected={c.id === characterId}
                    onClick={() => setCharacterId(c.id)}
                  />
                ))}
              </div>
            )}
          </Step>

          {/* Step 2 — Garments ---------------------------------------- */}
          <Step
            n="2"
            title="Pick garments"
            icon={Shirt}
            subtitle={`${selectedGarmentIds.length} selected · 1–8 allowed`}
          >
            {garments.length === 0 ? (
              <EmptyState
                message="No garments in your library yet."
                cta={{ href: "/garments", label: "Open Garment Studio" }}
              />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <FilterChip
                    active={filter === "all"}
                    onClick={() => setFilter("all")}
                  >
                    All ({garments.length})
                  </FilterChip>
                  {categories.map((c) => {
                    const n = garments.filter(
                      (g) => g.metadata.category === c.id,
                    ).length;
                    if (n === 0) return null;
                    return (
                      <FilterChip
                        key={c.id}
                        active={filter === c.id}
                        onClick={() => setFilter(c.id)}
                      >
                        {c.label} ({n})
                      </FilterChip>
                    );
                  })}
                </div>
                <div className="grid max-h-[420px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-5">
                  {filteredGarments.map((g) => (
                    <GarmentTile
                      key={g.id ?? g.publicUrl}
                      asset={g}
                      selected={
                        g.id ? selectedGarmentIds.includes(g.id) : false
                      }
                      onClick={() => toggleGarment(g.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </Step>

          {/* Step 3 — Background preset ------------------------------ */}
          <Step
            n="3"
            title="Background"
            icon={Palette}
            subtitle="Where does the model stand?"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {BACKGROUND_PRESET_OPTIONS.map((b) => {
                const active = backgroundPreset === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBackgroundPreset(b.id)}
                    className={cn(
                      "group flex flex-col gap-1.5 rounded-xl border p-2 text-left transition",
                      active
                        ? "border-zinc-900 ring-2 ring-zinc-900/10 dark:border-white dark:ring-white/10"
                        : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600",
                    )}
                  >
                    <div
                      className="relative h-14 w-full overflow-hidden rounded-lg"
                      style={{ background: b.swatch }}
                    >
                      {active && (
                        <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-zinc-900 text-white shadow dark:bg-white dark:text-zinc-950">
                          <CheckCircle2 className="size-3.5" />
                        </span>
                      )}
                    </div>
                    <div className="px-0.5">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {b.label}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                        {b.hint}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Step>

          {/* Step 4 — Options + Generate ------------------------------ */}
          <Step n="4" title="Compose" icon={Sparkles}>
            <div className="flex flex-col gap-4">
              {selectedGarments.length > 0 && (
                <SelectedGarmentsStrip
                  garments={selectedGarments}
                  onRemove={toggleGarment}
                />
              )}

              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <Label small>Variations</Label>
                  <div className="mt-1 flex gap-1">
                    {NUM_IMAGES_OPTIONS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setNumImages(n)}
                        className={cn(
                          "min-w-9 rounded-md border px-2 py-1 text-xs font-medium",
                          numImages === n
                            ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                            : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
                        )}
                      >
                        ×{n}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ml-auto flex flex-col text-right">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                    estimated cost
                  </span>
                  <span className="font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    ${(costPerImage * numImages).toFixed(3)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowOverride((v) => !v)}
                className="flex w-fit items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
              >
                {showOverride ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
                Advanced: prompt override
              </button>
              {showOverride && (
                <textarea
                  value={promptOverride}
                  onChange={(e) => setPromptOverride(e.target.value)}
                  rows={4}
                  placeholder="Custom Seedream prompt. Must reference each image as 'Reference 1, 2, ...' for best results. Min 20 chars. Leave empty to use the auto-generated one."
                  className="w-full resize-none rounded-lg border border-zinc-300 bg-white p-3 text-xs text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                {generating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Composing... usually 6–10s per image
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" /> Compose outfit
                  </>
                )}
              </button>

              {error && (
                <ErrorBox>
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{error}</span>
                </ErrorBox>
              )}
            </div>
          </Step>
        </div>

        {/* ============== RIGHT: Preview ============== */}
        <aside className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Preview
              </h3>
              {result && (
                <span className="text-xs text-zinc-500">
                  ${result.estCostUsd.toFixed(3)} · req:{" "}
                  <code className="font-mono">
                    {result.requestId.slice(0, 6)}
                  </code>
                </span>
              )}
            </div>

            <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              {generating ? (
                <div className="flex flex-col items-center gap-3 text-zinc-500">
                  <Loader2 className="size-8 animate-spin" />
                  <p className="text-xs">Composing with {modelLabel}...</p>
                </div>
              ) : result && result.images[selectedImageIdx] ? (
                <SkeletonImage
                  src={result.images[selectedImageIdx].url}
                  alt="Composed outfit"
                  className="group h-full w-full animate-fade-in"
                  objectFit="contain"
                  eager
                  onClick={() =>
                    setLightbox({
                      url: result.images[selectedImageIdx].url,
                      alt: "Composed outfit",
                      caption: `Composed outfit · ${modelLabel} · variation ${
                        selectedImageIdx + 1
                      } of ${result.images.length}`,
                    })
                  }
                  title="Click to view full size"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-400">
                  <ImageIcon className="size-8" />
                  <p className="text-xs">Your composition will appear here.</p>
                </div>
              )}
            </div>

            {result && result.images.length > 1 && (
              <div className="flex gap-1.5">
                {result.images.map((img, i) => (
                  <button
                    key={img.url}
                    type="button"
                    onClick={() => setSelectedImageIdx(i)}
                    className={cn(
                      "h-12 w-12 overflow-hidden rounded border-2",
                      selectedImageIdx === i
                        ? "border-zinc-900 dark:border-white"
                        : "border-transparent opacity-60 hover:opacity-100",
                    )}
                  >
                    <SkeletonImage
                      src={img.url}
                      alt={`Variation ${i + 1}`}
                      className="h-full w-full"
                      objectFit="cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {result && (
              <div className="flex flex-col gap-2">
                <input
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  placeholder="Outfit name (for the gallery)"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm transition hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <RefreshCw className="size-4" /> Retry
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Save outfit
                  </button>
                </div>
                <details className="text-[11px] text-zinc-500">
                  <summary className="cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-200">
                    Show prompt used
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-zinc-50 p-2.5 font-mono text-[10px] leading-relaxed dark:bg-zinc-900">
                    {result.promptUsed}
                  </p>
                </details>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ============== Gallery ============== */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
            Saved outfits{" "}
            <span className="text-zinc-400">({outfits.length})</span>
          </h2>

          {outfits.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
                <button
                  type="button"
                  onClick={() => setGalleryGrouping("character")}
                  className={cn(
                    "flex items-center gap-1 rounded px-2 py-1 text-xs",
                    galleryGrouping === "character"
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200",
                  )}
                  title="Group by character"
                >
                  <LayoutGrid className="size-3.5" /> By model
                </button>
                <button
                  type="button"
                  onClick={() => setGalleryGrouping("recent")}
                  className={cn(
                    "flex items-center gap-1 rounded px-2 py-1 text-xs",
                    galleryGrouping === "recent"
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200",
                  )}
                  title="Sort by most recent"
                >
                  <Clock className="size-3.5" /> Recent
                </button>
              </div>

              {characterFilterOptions.length > 1 && (
                <div className="flex flex-wrap gap-1">
                  <FilterChip
                    active={galleryFilterCharacterId === "all"}
                    onClick={() => setGalleryFilterCharacterId("all")}
                  >
                    All ({outfits.length})
                  </FilterChip>
                  {characterFilterOptions.map((c) => (
                    <FilterChip
                      key={c.id}
                      active={galleryFilterCharacterId === c.id}
                      onClick={() => setGalleryFilterCharacterId(c.id)}
                    >
                      {c.name} ({c.count})
                    </FilterChip>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {outfits.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 py-10 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
            <ImageIcon className="size-8" />
            <p className="text-sm">No saved outfits yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {outfitGroups.map((group) => (
              <div key={group.key} className="flex flex-col gap-3">
                {galleryGrouping === "character" && (
                  <div className="flex items-center gap-2 text-xs">
                    {group.characterUrl && (
                      <span className="block size-7 overflow-hidden rounded-full ring-1 ring-zinc-200 dark:ring-zinc-800">
                        <SkeletonImage
                          src={group.characterUrl}
                          alt={group.label}
                          className="h-full w-full"
                          objectFit="cover"
                        />
                      </span>
                    )}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {group.label}
                    </span>
                    <span className="text-zinc-500">
                      · {group.outfits.length} outfit
                      {group.outfits.length === 1 ? "" : "s"}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {group.outfits.map((o) => (
                    <OutfitTile
                      key={o.id}
                      outfit={o}
                      onDelete={handleDeleteOutfit}
                      onGenerateVideo={() => setVideoTarget(o)}
                      onView={() => {
                        if (!o.resultImageUrl) return;
                        const pieces = o.garments
                          .map((g) => g.category ?? "garment")
                          .join(" + ");
                        setLightbox({
                          url: o.resultImageUrl,
                          alt: o.characterName ?? "outfit",
                          caption: `${o.characterName ?? "outfit"} · ${pieces}`,
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Lightbox item={lightbox} onClose={() => setLightbox(null)} />
      <VideoComposerDrawer
        outfit={videoTarget}
        onClose={() => setVideoTarget(null)}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function Header() {
  return (
    <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
        Step 3 · Outfit Composer
      </p>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Compose the finished outfit
      </h1>
      <p className="max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Pick a saved character, pick 2–5 garments from your library, and we
        generate the finished editorial photo in one Seedream 4.5 Edit call.
        Because the character is passed as reference image #1, identity stays
        pixel-stable across every outfit — no chained pipelines, no
        error accumulation, no LoRA training required.
      </p>
    </header>
  );
}

function Step({
  n,
  title,
  icon: Icon,
  subtitle,
  children,
}: {
  n: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-zinc-900 font-mono text-xs font-bold text-white dark:bg-white dark:text-zinc-950">
          {n}
        </span>
        <div className="flex flex-1 items-baseline gap-2">
          <h3 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            <Icon className="size-4" />
            {title}
          </h3>
          {subtitle && (
            <span className="text-xs text-zinc-500">{subtitle}</span>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        {children}
      </div>
    </section>
  );
}

function CharacterTile({
  asset,
  selected,
  onClick,
}: {
  asset: Asset;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-xl border-2 transition",
        selected
          ? "border-zinc-900 ring-2 ring-zinc-900/10 dark:border-white dark:ring-white/10"
          : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-700",
      )}
    >
      <SkeletonImage
        src={asset.publicUrl}
        alt={asset.name}
        className="h-36 w-28"
        objectFit="cover"
      />
      <span className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-2 py-1 text-left text-[10px] text-white">
        {asset.name}
      </span>
      {selected && (
        <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-950">
          <CheckCircle2 className="size-3.5" />
        </span>
      )}
    </button>
  );
}

function GarmentTile({
  asset,
  selected,
  onClick,
}: {
  asset: Asset;
  selected: boolean;
  onClick: () => void;
}) {
  const cat = asset.metadata.category ?? "—";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-lg border-2 transition",
        selected
          ? "border-zinc-900 dark:border-white"
          : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-700",
      )}
    >
      <SkeletonImage
        src={asset.publicUrl}
        alt={asset.name}
        className="aspect-square w-full"
        objectFit="contain"
      />
      <span className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1.5 py-0.5 text-left text-[9px] text-white">
        {cat} · {asset.name}
      </span>
      {selected && (
        <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-950">
          <CheckCircle2 className="size-3.5" />
        </span>
      )}
    </button>
  );
}

function SelectedGarmentsStrip({
  garments,
  onRemove,
}: {
  garments: Asset[];
  onRemove: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label small>Selected ({garments.length})</Label>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {garments.map((g) => (
          <div key={g.id ?? g.publicUrl} className="relative shrink-0">
            <SkeletonImage
              src={g.publicUrl}
              alt={g.name}
              className="h-12 w-12 rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
              objectFit="contain"
            />
            <button
              type="button"
              onClick={() => onRemove(g.id)}
              className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
              title={`Remove ${g.name}`}
            >
              <X className="size-2.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutfitTile({
  outfit,
  onDelete,
  onView,
  onGenerateVideo,
}: {
  outfit: Outfit;
  onDelete: (id: string) => void;
  onView: () => void;
  onGenerateVideo: () => void;
}) {
  const bgLabel = backgroundLabel(outfit.backgroundPreset);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative">
        <SkeletonImage
          src={outfit.resultImageUrl}
          alt={outfit.characterName ?? "outfit"}
          className="flex aspect-[3/4] w-full items-center justify-center bg-zinc-50 dark:bg-zinc-950"
          imgClassName="transition group-hover:scale-[1.02]"
          objectFit="cover"
          onClick={outfit.resultImageUrl ? onView : undefined}
          title="View full size"
        />
        {outfit.resultImageUrl && (
          <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
            <Maximize2 className="size-3" /> Full size
          </span>
        )}
        {bgLabel && (
          <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white">
            {bgLabel}
          </span>
        )}
        {outfit.resultImageUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onGenerateVideo();
            }}
            className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900/90 px-2.5 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition hover:bg-zinc-900 group-hover:opacity-100 dark:bg-white/90 dark:text-zinc-950 dark:hover:bg-white"
            title="Animate this outfit into a 3-5s clip"
          >
            <Film className="size-3" /> Generate video
          </button>
        )}
      </div>
      <div className="flex items-start justify-between gap-2 p-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
            {outfit.characterName ?? "—"}
          </p>
          <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-zinc-500">
            {outfit.garments.length} pieces ·{" "}
            {outfit.garments
              .map((g) => g.category)
              .filter(Boolean)
              .join(", ") || "—"}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-zinc-400">
            ${outfit.costUsd.toFixed(3)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDelete(outfit.id)}
          className="rounded-md p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          title="Delete"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition",
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  message,
  cta,
}: {
  message: string;
  cta: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <p className="text-sm text-zinc-500">{message}</p>
      <Link
        href={cta.href}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {cta.label} →
      </Link>
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

function Label({
  children,
  small = false,
}: {
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <label
      className={cn(
        "block font-medium uppercase tracking-wider text-zinc-500",
        small ? "text-[10px]" : "text-xs",
      )}
    >
      {children}
    </label>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
      {children}
    </div>
  );
}
