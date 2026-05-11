"use client";

import { useState } from "react";
import {
  Sparkles,
  Save,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ModelId =
  | "higgsfield-soul"
  | "nano-banana-pro"
  | "flux-pro-1.1"
  | "flux-2-pro";
type Provider = "higgsfield" | "fal";
type StylePreset = "editorial" | "streetwear" | "minimalist" | "luxury";
type AspectRatio = "9:16" | "3:4" | "1:1" | "16:9";

type ModelOption = {
  id: ModelId;
  label: string;
  provider: Provider;
  estCostUsd: number;
  description: string;
  available: boolean;
};

type GenerationResult = {
  imageUrl: string;
  width?: number;
  height?: number;
  model: ModelId;
  provider: Provider;
  estCostUsd: number;
  promptUsed: string;
  requestId: string;
};

const STYLE_PRESETS: { id: StylePreset; label: string; hint: string }[] = [
  { id: "editorial", label: "Editorial", hint: "Magazine-quality, soft front light" },
  { id: "streetwear", label: "Streetwear", hint: "Candid, natural daylight, urban" },
  { id: "minimalist", label: "Minimalist", hint: "Clean studio, neutral grey" },
  { id: "luxury", label: "Luxury", hint: "Dramatic side light, premium" },
];

const ASPECT_RATIOS: { id: AspectRatio; label: string }[] = [
  { id: "3:4", label: "3:4 (default — full body portrait)" },
  { id: "9:16", label: "9:16 (mobile-first)" },
  { id: "1:1", label: "1:1 (square)" },
  { id: "16:9", label: "16:9 (wide)" },
];

const PROMPT_TEMPLATES = [
  "28-year-old woman, athletic build, shoulder-length dark brown hair, neutral expression, olive skin, standing facing camera",
  "32-year-old man, slim build, short black hair, light stubble, calm confident expression, mediterranean features",
  "26-year-old woman, tall, long blonde hair, soft smile, scandinavian features, natural makeup",
  "30-year-old man, broad shoulders, buzz cut, warm brown skin, slight smile, sharp jawline",
];

export default function CharacterStudio({
  models,
  defaultModel,
}: {
  models: ModelOption[];
  defaultModel: ModelId;
}) {
  const [prompt, setPrompt] = useState(PROMPT_TEMPLATES[0]);
  const [style, setStyle] = useState<StylePreset>("editorial");
  const [model, setModel] = useState<ModelId>(defaultModel);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("3:4");

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [savingName, setSavingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    | null
    | { kind: "ok"; storedInSupabase: boolean }
    | { kind: "err"; message: string }
  >(null);

  const selectedModelCfg = models.find((m) => m.id === model);
  const selectedAvailable = selectedModelCfg?.available ?? false;

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setResult(null);
    setSaveStatus(null);
    try {
      const res = await fetch("/api/character/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, style, model, aspectRatio }),
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
  }

  async function handleSave() {
    if (!result) return;
    setSaving(true);
    setSaveStatus(null);
    try {
      const res = await fetch("/api/character/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: savingName || deriveDefaultName(prompt),
          sourceUrl: result.imageUrl,
          prompt: result.promptUsed,
          generatedByModel: result.model,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveStatus({ kind: "err", message: data.error ?? "Save failed." });
      } else {
        setSaveStatus({ kind: "ok", storedInSupabase: data.storedInSupabase });
      }
    } catch (err) {
      setSaveStatus({
        kind: "err",
        message: err instanceof Error ? err.message : "Network error.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <Header />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[420px_1fr]">
        {/* ---------- Control panel ---------- */}
        <section className="flex flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <Label>Prompt</Label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="mt-2 w-full resize-none rounded-lg border border-zinc-300 bg-white p-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="Describe the model — age, build, hair, expression, ethnicity..."
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PROMPT_TEMPLATES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPrompt(t)}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {t.split(",")[0]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Style</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {STYLE_PRESETS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStyle(s.id)}
                  className={cn(
                    "flex flex-col items-start rounded-lg border p-3 text-left transition",
                    style === s.id
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-950"
                      : "border-zinc-200 bg-white hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600",
                  )}
                >
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="mt-0.5 text-[11px] opacity-75">{s.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Model</Label>
            <div className="mt-2 flex flex-col gap-1.5">
              {models.map((m) => {
                const active = model === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => m.available && setModel(m.id)}
                    disabled={!m.available}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition",
                      active && m.available
                        ? "border-zinc-900 bg-zinc-50 dark:border-white dark:bg-zinc-900"
                        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
                      m.available
                        ? "hover:border-zinc-400 dark:hover:border-zinc-600"
                        : "cursor-not-allowed opacity-50",
                    )}
                  >
                    <div className="flex flex-1 flex-col gap-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                          {m.label}
                        </span>
                        <span className="text-xs tabular-nums text-zinc-500">
                          ~${m.estCostUsd.toFixed(2)}
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {m.description}
                      </span>
                      {!m.available && (
                        <span className="mt-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                          <Lock className="size-3" />
                          {m.provider === "higgsfield"
                            ? "Add HIGGSFIELD_API_KEY + SECRET"
                            : "Add FAL_KEY"}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Aspect ratio</Label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {ASPECT_RATIOS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={
              generating || prompt.trim().length < 8 || !selectedAvailable
            }
            className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {generating ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Generating...
              </>
            ) : (
              <>
                <Sparkles className="size-4" /> Generate character
              </>
            )}
          </button>

          {error && (
            <ErrorBox>
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </ErrorBox>
          )}
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

          <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            {generating ? (
              <div className="flex flex-col items-center gap-3 text-zinc-500">
                <Loader2 className="size-8 animate-spin" />
                <p className="text-sm">
                  Calling{" "}
                  <code className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-800">
                    {selectedModelCfg?.label}
                  </code>
                  {selectedModelCfg?.provider === "higgsfield"
                    ? "... queued (5–30s)"
                    : "... usually 5–10s"}
                </p>
              </div>
            ) : result ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.imageUrl}
                alt="Generated character"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-zinc-400">
                <Sparkles className="size-8" />
                <p className="text-sm">Your character will appear here.</p>
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
                    placeholder="e.g. ava-editorial-v1"
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </div>
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
                    Save as character
                  </button>
                </div>
              </div>

              {saveStatus?.kind === "ok" && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="size-4 shrink-0" />
                  {saveStatus.storedInSupabase
                    ? "Saved to Supabase asset library — ready to use in the Outfit Composer."
                    : "Generation successful — Supabase isn't configured yet, so it wasn't persisted. Set up .env.local + the SQL migration to enable saving."}
                </div>
              )}
              {saveStatus?.kind === "err" && (
                <ErrorBox>
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{saveStatus.message}</span>
                </ErrorBox>
              )}

              <details className="text-xs text-zinc-500 dark:text-zinc-400">
                <summary className="cursor-pointer select-none hover:text-zinc-900 dark:hover:text-zinc-200">
                  Show prompt used
                </summary>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 font-mono text-[11px] dark:bg-zinc-950">
                  {result.promptUsed}
                </p>
              </details>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6 dark:border-zinc-800">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
        Step 1 · Character Studio
      </p>
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Generate your hyperreal model
      </h1>
      <p className="max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Describe the model you want — age, build, ethnicity, hair, expression —
        and pick a style preset. We&apos;ll generate a full-body portrait you
        can save once and reuse as the identity reference in every outfit
        composition downstream. No LoRA training, no chained pipelines:
        identity stays pixel-stable across the entire batch.
      </p>
    </header>
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
  const first = prompt.split(",")[0]?.trim() ?? "character";
  return (
    first
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, "")
      .split(" ")
      .slice(0, 4)
      .join("-")
      .slice(0, 40) || "character"
  );
}
