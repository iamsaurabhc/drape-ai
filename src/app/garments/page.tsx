import GarmentStudio from "@/components/garment-studio";
import { GARMENT_CATEGORIES, GARMENT_MODELS } from "@/lib/garment";
import { listAssets } from "@/lib/assets";
import { env } from "@/lib/env";

export const metadata = {
  title: "Garment Studio — Drape",
  description:
    "Generate studio-grade garment packshots, or upload real product photos. The reusable building blocks for every outfit.",
};

export const dynamic = "force-dynamic";

export default async function GarmentsPage() {
  const models = (Object.keys(GARMENT_MODELS) as Array<keyof typeof GARMENT_MODELS>).map(
    (id) => ({
      id,
      label: GARMENT_MODELS[id].label,
      estCostUsd: GARMENT_MODELS[id].estCostUsd,
      available: env.fal.hasKey(),
    }),
  );

  const initialAssets = await listAssets({ type: "garment", limit: 200 });

  const supabaseReady = env.supabase.isConfigured();
  const falReady = env.fal.hasKey();

  return (
    <GarmentStudio
      categories={GARMENT_CATEGORIES}
      models={models}
      initialAssets={initialAssets}
      supabaseReady={supabaseReady}
      falReady={falReady}
    />
  );
}
