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
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
  const [characterId, setCharacterId] = useState<string | null>(
    characters[0]?.id ?? null,
  );
  const [selectedGarmentIds, setSelectedGarmentIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [numImages, setNumImages] = useState<1 | 2 | 4>(1);
  const [showOverride, setShowOverride] = useState(false);
  const [promptOverride, setPromptOverride] = useState("");

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);

  const [savingName, setSavingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    null | { kind: "ok" } | { kind: "err"; message: string }
  >(null);

  const [outfits, setOutfits] = useState<Outfit[]>(recentOutfits);

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
    setSaveStatus(null);
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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Composition failed (${res.status}).`);
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
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setGenerating(false);
    }
  }, [
    characterId,
    selectedGarmentIds,
    showOverride,
    promptOverride,
    numImages,
    savingName,
    character,
  ]);

  const handleSave = useCallback(async () => {
    if (!result || !characterId) return;
    const chosen = result.images[selectedImageIdx];
    if (!chosen) return;

    setSaving(true);
    setSaveStatus(null);
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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveStatus({ kind: "err", message: data.error ?? "Save failed." });
      } else {
        setSaveStatus({ kind: "ok" });
        setOutfits((prev) => [data, ...prev]);
      }
    } catch (err) {
      setSaveStatus({
        kind: "err",
        message: err instanceof Error ? err.message : "Network error.",
      });
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
  ]);

  const handleDeleteOutfit = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/outfits/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "Failed to delete.");
        return;
      }
      setOutfits((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Network error.");
    }
  }, []);

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

          {/* Step 3 — Options + Generate ------------------------------ */}
          <Step n="3" title="Compose" icon={Sparkles}>
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
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={result.images[selectedImageIdx].url}
                  alt="Composed outfit"
                  className="h-full w-full object-contain"
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={`Variation ${i + 1}`}
                      className="h-full w-full object-cover"
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
                {saveStatus?.kind === "ok" && (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <CheckCircle2 className="size-4 shrink-0" />
                    Saved — appears in the gallery below.
                  </div>
                )}
                {saveStatus?.kind === "err" && (
                  <ErrorBox>
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{saveStatus.message}</span>
                  </ErrorBox>
                )}
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
        </div>
        {outfits.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 py-10 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
            <ImageIcon className="size-8" />
            <p className="text-sm">No saved outfits yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {outfits.map((o) => (
              <OutfitTile
                key={o.id}
                outfit={o}
                onDelete={handleDeleteOutfit}
              />
            ))}
          </div>
        )}
      </section>
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
      <div className="h-36 w-28 overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.publicUrl}
          alt={asset.name}
          className="h-full w-full object-cover"
        />
      </div>
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
      <div className="aspect-square bg-zinc-50 dark:bg-zinc-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.publicUrl}
          alt={asset.name}
          className="h-full w-full object-contain"
        />
      </div>
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
            <div className="h-12 w-12 overflow-hidden rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.publicUrl}
                alt={g.name}
                className="h-full w-full object-contain"
              />
            </div>
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
}: {
  outfit: Outfit;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="group overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex aspect-[3/4] items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        {outfit.resultImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={outfit.resultImageUrl}
            alt={outfit.characterName ?? "outfit"}
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <ImageIcon className="size-8 text-zinc-400" />
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
