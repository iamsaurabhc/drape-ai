"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Sparkles,
  Save,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Upload,
  Lock,
  Trash2,
  Image as ImageIcon,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Lightbox, type LightboxItem } from "@/components/lightbox";
import { SkeletonImage } from "@/components/skeleton-image";
import { useToast } from "@/components/toast";

type Category =
  | "top"
  | "bottom"
  | "outer"
  | "dress"
  | "bag"
  | "shoes"
  | "accessory"
  | "eyewear";

type ModelId = "nano-banana-pro" | "flux-pro-1.1";

type CategoryOption = { id: Category; label: string; examples: string };

type ModelOption = {
  id: ModelId;
  label: string;
  estCostUsd: number;
  available: boolean;
};

type SavedAsset = {
  id: string | null;
  name: string;
  type: "character" | "garment" | "backdrop";
  publicUrl: string;
  prompt: string | null;
  generatedByModel: string | null;
  metadata: {
    category?: Category;
    source?: "generated" | "uploaded";
    sku?: string;
  };
  storedInSupabase: boolean;
};

type GenerationResult = {
  imageUrl: string;
  width?: number;
  height?: number;
  model: ModelId;
  category: Category;
  estCostUsd: number;
  promptUsed: string;
  requestId: string;
};

const PROMPT_TEMPLATES: Record<Category, string[]> = {
  top: [
    "cream silk button-up blouse with mother-of-pearl buttons",
    "charcoal wool blazer, single breasted, notch lapel",
    "ivory cashmere crew neck sweater, ribbed cuffs",
  ],
  bottom: [
    "tailored navy wool trousers, pleated front, ankle hem",
    "indigo selvedge denim jeans, straight leg, raw hem",
    "midi pleated skirt in olive green",
  ],
  outer: [
    "double-breasted camel wool overcoat, knee length",
    "black leather biker jacket, asymmetric zip",
    "khaki cotton trench coat with belt",
  ],
  dress: [
    "black slip dress, bias cut, midi length, satin",
    "white linen shirt dress, button front, knee length",
  ],
  bag: [
    "brown leather crossbody bag with gold hardware",
    "black canvas tote with leather handles",
    "olive nylon backpack with technical straps",
  ],
  shoes: [
    "white leather low-top sneakers, minimal design",
    "black leather chelsea boots, ankle height",
    "tan suede loafers, penny strap",
  ],
  accessory: [
    "tan leather belt, brushed silver buckle, 1.5 inch wide",
    "black wool felt fedora, narrow brim",
    "silver chain necklace, layered, brushed finish",
  ],
  eyewear: [
    "amber tortoiseshell aviator sunglasses, gold metal frame, gradient brown lenses",
    "black acetate wayfarer sunglasses, slim arms, smoke lenses",
    "matte black round metal sunglasses, polarised grey lenses",
    "cream acetate cat-eye sunglasses, brown gradient lenses, gold hinges",
  ],
};

export default function GarmentStudio({
  categories,
  models,
  initialAssets,
  supabaseReady,
  falReady,
}: {
  categories: CategoryOption[];
  models: ModelOption[];
  initialAssets: SavedAsset[];
  supabaseReady: boolean;
  falReady: boolean;
}) {
  const [prompt, setPrompt] = useState(PROMPT_TEMPLATES.bag[0]);
  const [category, setCategory] = useState<Category>("bag");
  const [model, setModel] = useState<ModelId>("nano-banana-pro");

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [savingName, setSavingName] = useState("");
  const [savingSku, setSavingSku] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    | null
    | { kind: "ok"; storedInSupabase: boolean }
    | { kind: "err"; message: string }
  >(null);

  const [uploading, setUploading] = useState(false);
  const [uploadSku, setUploadSku] = useState("");
  const [uploadStatus, setUploadStatus] = useState<
    null | { kind: "ok" } | { kind: "err"; message: string }
  >(null);

  const [assets, setAssets] = useState<SavedAsset[]>(initialAssets);
  const [libraryFilter, setLibraryFilter] = useState<Category | "all">("all");
  const [lightbox, setLightbox] = useState<LightboxItem | null>(null);

  const toast = useToast();

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    setSaveStatus(null);
    try {
      const res = await fetch("/api/garment/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, category, model }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Generation failed (${res.status}).`);
      } else {
        setResult(data);
        if (!savingName) setSavingName(deriveDefaultName(prompt));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setGenerating(false);
    }
  }, [prompt, category, model, savingName]);

  const handleSave = useCallback(async () => {
    if (!result) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const sku =
        result.category === "eyewear" && savingSku.trim()
          ? savingSku.trim()
          : undefined;
      const res = await fetch("/api/garment/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: savingName || deriveDefaultName(prompt),
          category: result.category,
          sourceUrl: result.imageUrl,
          prompt: result.promptUsed,
          generatedByModel: result.model,
          ...(sku ? { sku } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveStatus({ kind: "err", message: data.error ?? "Save failed." });
      } else {
        setSaveStatus({ kind: "ok", storedInSupabase: data.storedInSupabase });
        if (data.storedInSupabase) {
          setAssets((a) => [data, ...a]);
        }
      }
    } catch (err) {
      setSaveStatus({
        kind: "err",
        message: err instanceof Error ? err.message : "Network error.",
      });
    } finally {
      setSaving(false);
    }
  }, [result, savingName, savingSku, prompt]);

  const handleUpload = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadStatus(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("name", file.name.replace(/\.[^.]+$/, "").slice(0, 60));
        fd.append("category", category);
        if (category === "eyewear" && uploadSku.trim()) {
          fd.append("sku", uploadSku.trim());
        }
        const res = await fetch("/api/garment/upload", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          setUploadStatus({
            kind: "err",
            message: data.error ?? "Upload failed.",
          });
        } else {
          setUploadStatus({ kind: "ok" });
          setAssets((a) => [data, ...a]);
        }
      } catch (err) {
        setUploadStatus({
          kind: "err",
          message: err instanceof Error ? err.message : "Network error.",
        });
      } finally {
        setUploading(false);
      }
    },
    [category, uploadSku],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!id) return;
      try {
        const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? "Failed to delete.");
          return;
        }
        setAssets((a) => a.filter((x) => x.id !== id));
        toast.success("Garment removed from library.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Network error.");
      }
    },
    [toast],
  );

  const filteredAssets =
    libraryFilter === "all"
      ? assets
      : assets.filter((a) => a.metadata.category === libraryFilter);

  const assetsByCategory = useMemo(() => {
    const buckets: Record<Category, SavedAsset[]> = {
      top: [],
      bottom: [],
      outer: [],
      dress: [],
      bag: [],
      shoes: [],
      accessory: [],
      eyewear: [],
    };
    const uncategorised: SavedAsset[] = [];
    for (const a of assets) {
      const cat = a.metadata.category;
      if (cat && cat in buckets) buckets[cat as Category].push(a);
      else uncategorised.push(a);
    }
    return { buckets, uncategorised };
  }, [assets]);

  // Eyewear has a SKU-grouped sub-view (a single sunglasses model usually
  // ships in 4–6 colour variants — the brief calls them "folders"). When the
  // user filters to eyewear, we render those groups instead of a flat grid.
  const eyewearBySku = useMemo(() => {
    if (libraryFilter !== "eyewear") return null;
    const groups = new Map<string, { sku: string; items: SavedAsset[] }>();
    const ungrouped: SavedAsset[] = [];
    for (const a of assetsByCategory.buckets.eyewear ?? []) {
      const sku = a.metadata.sku?.trim();
      if (sku) {
        const g = groups.get(sku);
        if (g) g.items.push(a);
        else groups.set(sku, { sku, items: [a] });
      } else {
        ungrouped.push(a);
      }
    }
    return {
      groups: Array.from(groups.values()).sort((a, b) =>
        a.sku.localeCompare(b.sku),
      ),
      ungrouped,
    };
  }, [libraryFilter, assetsByCategory]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <Header />

      {!falReady && (
        <Banner kind="warn">
          <Lock className="size-4 shrink-0" />
          <span>
            Garment <b>generation</b> needs <code>FAL_KEY</code> in .env.local
            — get one at{" "}
            <a
              href="https://fal.ai/dashboard/keys"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              fal.ai/dashboard/keys
            </a>
            . You can still <b>upload real product photos</b> below without it.
          </span>
        </Banner>
      )}
      {!supabaseReady && (
        <Banner kind="warn">
          <AlertCircle className="size-4 shrink-0" />
          <span>
            Supabase is not configured — generated garments will preview but
            won&apos;t persist or appear in your Library.
          </span>
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[420px_1fr]">
        {/* ---------- Control panel ---------- */}
        <section className="flex flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <Label>Category</Label>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCategory(c.id);
                    if (PROMPT_TEMPLATES[c.id]?.[0]) setPrompt(PROMPT_TEMPLATES[c.id][0]);
                  }}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium transition",
                    category === c.id
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500">
              examples: {categories.find((c) => c.id === category)?.examples}
            </p>
          </div>

          <div>
            <Label>Prompt</Label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="mt-2 w-full resize-none rounded-lg border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="Describe the garment — material, colour, cut, hardware..."
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(PROMPT_TEMPLATES[category] ?? []).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPrompt(t)}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {truncate(t, 38)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Model</Label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ModelId)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} (~${m.estCostUsd.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || prompt.trim().length < 4 || !falReady}
            className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generating...
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Generate garment
              </>
            )}
          </button>

          {error && (
            <ErrorBox>
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </ErrorBox>
          )}

          {/* Upload path ------------------------------------------------- */}
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <Upload className="size-3.5" /> Or upload a real product photo
            </div>
            {category === "eyewear" && (
              <div className="mb-2">
                <Label small>SKU (optional)</Label>
                <input
                  value={uploadSku}
                  onChange={(e) => setUploadSku(e.target.value)}
                  placeholder="e.g. SG-1042 — colour variants share this code"
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950"
                />
              </div>
            )}
            <label className="block">
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                disabled={uploading || !supabaseReady}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
                className="block w-full text-xs text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-zinc-700 disabled:opacity-50 dark:text-zinc-400 dark:file:bg-white dark:file:text-zinc-950 dark:hover:file:bg-zinc-200"
              />
            </label>
            <p className="mt-1.5 text-[11px] text-zinc-500">
              Uploads inherit the selected category above ({category}).
              PNG / JPEG / WebP, max 10 MB.
            </p>
            {uploadStatus?.kind === "ok" && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3.5" /> Uploaded to library.
              </p>
            )}
            {uploadStatus?.kind === "err" && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-red-700 dark:text-red-300">
                <AlertCircle className="size-3.5" /> {uploadStatus.message}
              </p>
            )}
          </div>
        </section>

        {/* ---------- Preview ---------- */}
        <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Preview
            </h2>
            {result && (
              <span className="text-xs text-zinc-500">
                cost: ${result.estCostUsd.toFixed(2)} · model: {result.model}
              </span>
            )}
          </div>

          <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            {generating ? (
              <div className="flex flex-col items-center gap-3 text-zinc-500">
                <Loader2 className="size-8 animate-spin" />
                <p className="text-sm">Generating packshot...</p>
              </div>
            ) : result ? (
              <SkeletonImage
                src={result.imageUrl}
                alt="Generated garment"
                className="group h-full w-full animate-fade-in"
                objectFit="contain"
                eager
                onClick={() =>
                  setLightbox({
                    url: result.imageUrl,
                    alt: "Generated garment",
                    caption: `Generated garment · ${result.category} · ${result.model}`,
                  })
                }
                title="Click to view full size"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-zinc-400">
                <ImageIcon className="size-8" />
                <p className="text-sm">Your garment will appear here.</p>
              </div>
            )}
          </div>

          {result && (
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
                <div className="flex-1">
                  <Label small>Asset name</Label>
                  <input
                    value={savingName}
                    onChange={(e) => setSavingName(e.target.value)}
                    placeholder="e.g. brown-leather-crossbody"
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </div>
                {result.category === "eyewear" && (
                  <div className="sm:w-40">
                    <Label small>SKU (optional)</Label>
                    <input
                      value={savingSku}
                      onChange={(e) => setSavingSku(e.target.value)}
                      placeholder="e.g. SG-1042"
                      className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <RefreshCw className="size-4" /> Retry
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !savingName.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Save to library
                  </button>
                </div>
              </div>

              {saveStatus?.kind === "ok" && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="size-4 shrink-0" />
                  {saveStatus.storedInSupabase
                    ? "Saved to library — visible below."
                    : "Generation OK — Supabase isn't configured so it wasn't persisted."}
                </div>
              )}
              {saveStatus?.kind === "err" && (
                <ErrorBox>
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{saveStatus.message}</span>
                </ErrorBox>
              )}
            </div>
          )}
        </section>
      </div>

      {/* ---------- Library ---------- */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Library{" "}
              <span className="text-zinc-400">
                ({libraryFilter === "all" ? assets.length : filteredAssets.length})
              </span>
            </h2>
            <p className="text-xs text-zinc-500">
              Click any garment to view full size. Filter by category, or browse
              everything grouped below.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              active={libraryFilter === "all"}
              onClick={() => setLibraryFilter("all")}
            >
              All ({assets.length})
            </FilterChip>
            {categories.map((c) => {
              const n = assetsByCategory.buckets[c.id]?.length ?? 0;
              if (n === 0) return null;
              return (
                <FilterChip
                  key={c.id}
                  active={libraryFilter === c.id}
                  onClick={() => setLibraryFilter(c.id)}
                >
                  {c.label} ({n})
                </FilterChip>
              );
            })}
          </div>
        </div>

        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 py-12 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
            <ImageIcon className="size-8" />
            <p className="text-sm">
              No garments yet — generate or upload one above.
            </p>
          </div>
        ) : libraryFilter === "eyewear" && eyewearBySku ? (
          // Eyewear filtered view: SKU-grouped sub-folders (the brief's
          // "one folder per sunglasses model" structure).
          filteredAssets.length === 0 ? (
            <EmptyCategoryNote categoryLabel="Eyewear" />
          ) : (
            <div className="flex flex-col gap-6">
              {eyewearBySku.groups.map((g) => (
                <div key={g.sku} className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                    SKU {g.sku}{" "}
                    <span className="text-zinc-400">({g.items.length})</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {g.items.map((a) => (
                      <LibraryTile
                        key={a.id ?? a.publicUrl}
                        asset={a}
                        onDelete={handleDelete}
                        onView={() =>
                          setLightbox({
                            url: a.publicUrl,
                            alt: a.name,
                            caption: `eyewear · SKU ${g.sku} · ${a.name}`,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
              {eyewearBySku.ungrouped.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    No SKU{" "}
                    <span className="text-zinc-400">
                      ({eyewearBySku.ungrouped.length})
                    </span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {eyewearBySku.ungrouped.map((a) => (
                      <LibraryTile
                        key={a.id ?? a.publicUrl}
                        asset={a}
                        onDelete={handleDelete}
                        onView={() =>
                          setLightbox({
                            url: a.publicUrl,
                            alt: a.name,
                            caption: `eyewear · ${a.name}`,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ) : libraryFilter !== "all" ? (
          // Filtered view: flat grid of one category
          filteredAssets.length === 0 ? (
            <EmptyCategoryNote categoryLabel={
              categories.find((c) => c.id === libraryFilter)?.label ?? libraryFilter
            } />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {filteredAssets.map((a) => (
                <LibraryTile
                  key={a.id ?? a.publicUrl}
                  asset={a}
                  onDelete={handleDelete}
                  onView={() =>
                    setLightbox({
                      url: a.publicUrl,
                      alt: a.name,
                      caption: `${a.metadata.category ?? ""} · ${a.name}`,
                    })
                  }
                />
              ))}
            </div>
          )
        ) : (
          // "All" view: grouped by category for easier browsing
          <div className="flex flex-col gap-6">
            {categories.map((cat) => {
              const items = assetsByCategory.buckets[cat.id] ?? [];
              if (items.length === 0) return null;
              return (
                <div key={cat.id} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      {cat.label}{" "}
                      <span className="text-zinc-400">({items.length})</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setLibraryFilter(cat.id)}
                      className="text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:hover:text-zinc-200"
                    >
                      Filter to {cat.label.toLowerCase()} only
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {items.map((a) => (
                      <LibraryTile
                        key={a.id ?? a.publicUrl}
                        asset={a}
                        onDelete={handleDelete}
                        onView={() =>
                          setLightbox({
                            url: a.publicUrl,
                            alt: a.name,
                            caption: `${cat.label} · ${a.name}`,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {assetsByCategory.uncategorised.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Uncategorised{" "}
                  <span className="text-zinc-400">
                    ({assetsByCategory.uncategorised.length})
                  </span>
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {assetsByCategory.uncategorised.map((a) => (
                    <LibraryTile
                      key={a.id ?? a.publicUrl}
                      asset={a}
                      onDelete={handleDelete}
                      onView={() =>
                        setLightbox({
                          url: a.publicUrl,
                          alt: a.name,
                          caption: a.name,
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <Lightbox item={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

function EmptyCategoryNote({ categoryLabel }: { categoryLabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 py-10 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
      <ImageIcon className="size-8" />
      <p className="text-sm">No {categoryLabel.toLowerCase()} items yet.</p>
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
        Step 2 · Garment Studio
      </p>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Build your garment library
      </h1>
      <p className="max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Generate clean studio packshots of tops, bottoms, outerwear, bags,
        shoes, and accessories — or drop in your own product photos. Every
        saved item is categorised, stored in Supabase, and becomes selectable
        in the Outfit Composer. Build it once, reuse across every drop.
      </p>
    </header>
  );
}

function LibraryTile({
  asset,
  onDelete,
  onView,
}: {
  asset: SavedAsset;
  onDelete: (id: string) => void;
  onView: () => void;
}) {
  const cat = asset.metadata.category ?? "—";
  const source =
    asset.metadata.source ?? (asset.generatedByModel ? "generated" : "uploaded");
  return (
    <div className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="relative">
        <SkeletonImage
          src={asset.publicUrl}
          alt={asset.name}
          className="aspect-square w-full bg-zinc-50 dark:bg-zinc-950"
          imgClassName="transition group-hover:scale-[1.02]"
          objectFit="contain"
          onClick={onView}
          title="View full size"
        />
        <span className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
          <Maximize2 className="size-3" /> Full size
        </span>
      </div>
      <div className="flex items-start justify-between gap-2 p-2.5">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
            {asset.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
            <span className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-zinc-800">
              {cat}
            </span>
            <span>·</span>
            <span>{source}</span>
          </p>
        </div>
        {asset.id && (
          <button
            type="button"
            onClick={() => onDelete(asset.id!)}
            className="rounded-md p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
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

function deriveDefaultName(prompt: string): string {
  return (
    prompt
      .split(",")[0]
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, "")
      .split(" ")
      .slice(0, 5)
      .join("-")
      .slice(0, 40) || "garment"
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
