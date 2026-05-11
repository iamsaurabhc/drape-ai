import Link from "next/link";
import {
  ArrowRight,
  User,
  Shirt,
  Layers,
  Images,
  Sparkles,
  Zap,
  DollarSign,
} from "lucide-react";
import { env } from "@/lib/env";

const STAGES = [
  {
    href: "/character",
    n: "01",
    title: "Character Studio",
    desc: "Generate one hyperreal model with Higgsfield Soul, Nano Banana Pro, or FLUX. Save it once — it becomes the identity reference used in every outfit you compose.",
    icon: User,
    available: true,
  },
  {
    href: "/garments",
    n: "02",
    title: "Garment Studio",
    desc: "Generate studio-grade packshots of tops, bottoms, outerwear, bags, shoes, and accessories — or upload your own product photos. Everything is categorised and reusable.",
    icon: Shirt,
    available: true,
  },
  {
    href: "/composer",
    n: "03",
    title: "Outfit Composer",
    desc: "Pick a saved character plus 2–5 garments and we generate the finished look in one Seedream 4.5 Edit call. Identity, colour, and layering are preserved — no chained pipelines, no drift.",
    icon: Layers,
    available: true,
  },
  {
    href: "/batches",
    n: "04",
    title: "Batches & Delivery",
    desc: "Queue 50+ outfits, watch them populate live, and send approved looks to Google Drive or your CMS. On the roadmap — single outfits work today.",
    icon: Images,
    available: false,
  },
];

const HIGHLIGHTS = [
  {
    icon: DollarSign,
    label: "$0.06 per image",
    sub: "vs. $50–200 for a traditional shoot",
  },
  {
    icon: Zap,
    label: "~80s for 50 outfits",
    sub: "5× parallel composition runs",
  },
  {
    icon: Sparkles,
    label: "Commercial-grade output",
    sub: "Seedream 4.5 + hand-tuned prompts",
  },
];

export default function Home() {
  const higgsfieldReady = env.higgsfield.hasKeys();
  const falReady = env.fal.hasKey();
  const supabaseReady = env.supabase.isConfigured();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-12">
      <section className="flex flex-col gap-4">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          AI fashion photos · batch scale
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
          From SKU list to e-commerce-ready photos in minutes.
        </h1>
        <p className="max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
          Drape is a three-stage AI pipeline that generates a hyperreal model,
          generates the garments, and composes the finished outfit — preserving
          identity, colour, and fit across every photo. Built for fashion brands
          who need 50+ on-model images per drop without booking another shoot.
        </p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {HIGHLIGHTS.map((h) => (
            <div
              key={h.label}
              className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <h.icon className="mt-0.5 size-4 text-zinc-700 dark:text-zinc-300" />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {h.label}
                </span>
                <span className="text-xs text-zinc-500">{h.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          API connections
        </h2>
        <div className="flex flex-wrap gap-2">
          <StatusPill
            ready={higgsfieldReady}
            label="Higgsfield Soul"
            hint="hyperreal character model"
          />
          <StatusPill
            ready={falReady}
            label="fal.ai"
            hint="garment + outfit composition"
          />
          <StatusPill
            ready={supabaseReady}
            label="Supabase"
            hint="asset library + outfit history"
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            The pipeline
          </h2>
          <p className="text-xs text-zinc-500">
            Generate once, reuse forever. Compose in one shot.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {STAGES.map((s) => {
            const Body = (
              <div
                className={`group flex h-full flex-col gap-3 rounded-2xl border p-5 transition ${
                  s.available
                    ? "border-zinc-200 bg-white hover:border-zinc-900 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-100"
                    : "border-dashed border-zinc-200 bg-white/50 dark:border-zinc-800 dark:bg-zinc-900/50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-zinc-400">
                      {s.n}
                    </span>
                    <s.icon className="size-5 text-zinc-700 dark:text-zinc-300" />
                  </div>
                  {!s.available && (
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-zinc-500 dark:bg-zinc-800">
                      Roadmap
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    {s.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {s.desc}
                  </p>
                </div>
                {s.available && (
                  <span className="mt-auto flex items-center gap-1 text-xs font-medium text-zinc-900 group-hover:translate-x-0.5 dark:text-zinc-100">
                    Open <ArrowRight className="size-3.5" />
                  </span>
                )}
              </div>
            );
            return s.available ? (
              <Link key={s.href} href={s.href}>
                {Body}
              </Link>
            ) : (
              <div key={s.href}>{Body}</div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Why a 3-stage pipeline?
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Most AI try-on pipelines chain a character model into a virtual try-on
          model into an upscaler. Every link compounds error — identity drifts,
          colours shift, garments smear. Drape collapses the multi-garment step
          into a single multi-reference call (Seedream 4.5 Edit), with the
          character locked as reference image #1. No LoRA training required, no
          chain to babysit, identity stays pixel-stable across the whole batch.
        </p>
      </section>
    </div>
  );
}

function StatusPill({
  ready,
  label,
  hint,
}: {
  ready: boolean;
  label: string;
  hint: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
        ready
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${
          ready ? "bg-emerald-500" : "bg-amber-500"
        }`}
      />
      <span className="font-medium">{label}</span>
      <span className="opacity-70">· {ready ? "connected" : "not set"}</span>
      <span className="opacity-60">— {hint}</span>
    </div>
  );
}
