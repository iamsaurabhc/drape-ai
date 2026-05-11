import OutfitComposer from "@/components/outfit-composer";
import { listAssets } from "@/lib/assets";
import { listOutfits } from "@/lib/outfits";
import { COMPOSITION_MODEL } from "@/lib/fal";
import { env } from "@/lib/env";
import { GARMENT_CATEGORIES } from "@/lib/garment";

export const metadata = {
  title: "Outfit Composer — Drape",
  description:
    "Pick a character, pick garments, generate a finished outfit photo — single Seedream 4.5 Edit call.",
};

export const dynamic = "force-dynamic";

export default async function ComposerPage() {
  const [characters, garments, recentOutfits] = await Promise.all([
    listAssets({ type: "character", limit: 100 }),
    listAssets({ type: "garment", limit: 300 }),
    listOutfits({ limit: 24 }),
  ]);

  return (
    <OutfitComposer
      characters={characters}
      garments={garments}
      categories={GARMENT_CATEGORIES}
      recentOutfits={recentOutfits}
      supabaseReady={env.supabase.isConfigured()}
      falReady={env.fal.hasKey()}
      costPerImage={COMPOSITION_MODEL.estCostUsd}
      modelLabel={COMPOSITION_MODEL.label}
    />
  );
}
