/**
 * Outfit persistence — Stage C results land in the `outfits` table (set up by
 * supabase/migrations/0001_initial.sql). The image binary is mirrored to the
 * `generated-assets` storage bucket so we own the URL even if fal CDN expires.
 */

import { env } from "@/lib/env";
import { STORAGE_BUCKET, supabaseServer } from "@/lib/supabase";

export type OutfitStatus = "queued" | "running" | "completed" | "failed";

export type StoredOutfit = {
  id: string;
  characterId: string | null;
  characterUrl: string | null;
  characterName: string | null;
  garmentIds: string[];
  garments: { id: string; name: string; url: string; category: string | null }[];
  promptOverride: string | null;
  promptUsed: string | null;
  status: OutfitStatus;
  resultImageUrl: string | null;
  falRequestId: string | null;
  costUsd: number;
  backgroundPreset: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type SaveOutfitInput = {
  characterId: string | null;
  garmentIds: string[];
  promptOverride?: string;
  promptUsed: string;
  sourceImageUrl: string;
  falRequestId?: string;
  costUsd: number;
  backgroundPreset?: string;
};

/**
 * Downloads the fal-hosted composition output, uploads it to Supabase Storage,
 * and inserts a fully-formed `completed` row into the outfits table. Returns
 * the persisted record (joined with the asset rows referenced by character_id
 * and garment_ids) for the UI to render immediately.
 */
export async function saveCompletedOutfit(
  input: SaveOutfitInput,
): Promise<StoredOutfit> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    throw new Error(
      "Supabase must be configured to save outfits. Add the SUPABASE_* keys to .env.local.",
    );
  }
  const sb = supabaseServer();

  // Mirror the fal CDN image to our Storage bucket so the URL is stable.
  const res = await fetch(input.sourceImageUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to download composition output from fal CDN: ${res.status} ${res.statusText}`,
    );
  }
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "image/png";
  const ext = contentType.includes("jpeg") ? "jpg" : "png";
  const path = `outfit/${Date.now()}-${input.falRequestId?.slice(0, 8) ?? "out"}.${ext}`;

  const { error: upErr } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(path, buf, { contentType, upsert: false });
  if (upErr) throw new Error(`Supabase upload failed: ${upErr.message}`);

  const { data: pub } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  const { data: row, error: insErr } = await sb
    .from("outfits")
    .insert({
      character_id: input.characterId,
      garment_ids: input.garmentIds,
      prompt_override: input.promptOverride ?? null,
      status: "completed",
      result_image_url: pub.publicUrl,
      result_storage_path: path,
      fal_request_id: input.falRequestId ?? null,
      cost_usd: input.costUsd,
      background_preset: input.backgroundPreset ?? null,
      finished_at: new Date().toISOString(),
    })
    .select("id, created_at")
    .single();
  if (insErr) throw new Error(`Supabase insert failed: ${insErr.message}`);

  // Stash the rendered prompt in metadata-ish; the outfits schema has no JSONB
  // column for it yet, so we encode it into `prompt_override` only when the
  // caller actually provided an override. Otherwise we keep it derivable from
  // the inputs.

  const outfit = await getOutfitById(row.id as string);
  if (!outfit) throw new Error("Outfit saved but could not be re-fetched.");
  return { ...outfit, promptUsed: input.promptUsed };
}

export async function getOutfitById(id: string): Promise<StoredOutfit | null> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) return null;
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("outfits")
    .select(
      "id, character_id, garment_ids, prompt_override, status, result_image_url, fal_request_id, cost_usd, background_preset, error, created_at, finished_at",
    )
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return hydrateOutfit(data);
}

export async function listOutfits(opts: { limit?: number } = {}): Promise<StoredOutfit[]> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) return [];
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("outfits")
    .select(
      "id, character_id, garment_ids, prompt_override, status, result_image_url, fal_request_id, cost_usd, background_preset, error, created_at, finished_at",
    )
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (error) throw new Error(`Supabase select failed: ${error.message}`);
  if (!data || data.length === 0) return [];

  return Promise.all(data.map(hydrateOutfit));
}

export async function deleteOutfit(id: string): Promise<void> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    throw new Error("Supabase must be configured to delete outfits.");
  }
  const sb = supabaseServer();
  const { data: row } = await sb
    .from("outfits")
    .select("result_storage_path")
    .eq("id", id)
    .single();
  const sp = row?.result_storage_path as string | null | undefined;
  if (sp) {
    await sb.storage.from(STORAGE_BUCKET).remove([sp]);
  }
  const { error } = await sb.from("outfits").delete().eq("id", id);
  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}

// -----------------------------------------------------------------------------
// Internal — hydrate a raw outfits row with its joined character + garment
// asset records, so the UI gets self-contained tiles.
// -----------------------------------------------------------------------------

interface RawOutfitRow {
  id: string;
  character_id: string | null;
  garment_ids: string[] | null;
  prompt_override: string | null;
  status: OutfitStatus;
  result_image_url: string | null;
  fal_request_id: string | null;
  cost_usd: number | string;
  background_preset: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

async function hydrateOutfit(raw: RawOutfitRow): Promise<StoredOutfit> {
  const sb = supabaseServer();
  const garmentIds: string[] = raw.garment_ids ?? [];
  const idsToFetch = [raw.character_id, ...garmentIds].filter(Boolean) as string[];

  let assetMap: Record<
    string,
    { id: string; name: string; image_url: string; type: string; metadata: Record<string, unknown> | null }
  > = {};
  if (idsToFetch.length > 0) {
    const { data } = await sb
      .from("assets")
      .select("id, name, image_url, type, metadata")
      .in("id", idsToFetch);
    assetMap = Object.fromEntries(
      (data ?? []).map((a) => [a.id as string, a as never]),
    );
  }

  const character = raw.character_id ? assetMap[raw.character_id] : null;
  const garments = garmentIds
    .map((gid) => {
      const a = assetMap[gid];
      if (!a) return null;
      const meta = (a.metadata ?? {}) as { category?: string };
      return {
        id: a.id,
        name: a.name,
        url: a.image_url,
        category: meta.category ?? null,
      };
    })
    .filter(Boolean) as StoredOutfit["garments"];

  return {
    id: raw.id,
    characterId: raw.character_id,
    characterUrl: character?.image_url ?? null,
    characterName: character?.name ?? null,
    garmentIds,
    garments,
    promptOverride: raw.prompt_override,
    promptUsed: null,
    status: raw.status,
    resultImageUrl: raw.result_image_url,
    falRequestId: raw.fal_request_id,
    costUsd:
      typeof raw.cost_usd === "string" ? parseFloat(raw.cost_usd) : raw.cost_usd,
    backgroundPreset: raw.background_preset,
    error: raw.error,
    createdAt: raw.created_at,
    finishedAt: raw.finished_at,
  };
}
