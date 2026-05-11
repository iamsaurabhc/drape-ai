/**
 * Asset persistence helpers — write generated images to Supabase so they are
 * reusable across batches. Falls back to a no-op (returns the source URL) when
 * Supabase is not configured, so Day 1 testing works with just a fal key.
 */

import { env } from "@/lib/env";
import { STORAGE_BUCKET, supabaseServer } from "@/lib/supabase";

export type AssetType = "character" | "garment" | "backdrop";

export type GarmentCategory =
  | "top"
  | "bottom"
  | "outer"
  | "dress"
  | "bag"
  | "shoes"
  | "accessory";

export type AssetMetadata = {
  category?: GarmentCategory;
  source?: "generated" | "uploaded";
  [key: string]: unknown;
};

export type SavedAsset = {
  id: string | null;
  name: string;
  type: AssetType;
  publicUrl: string;
  prompt: string | null;
  generatedByModel: string | null;
  metadata: AssetMetadata;
  storedInSupabase: boolean;
};

export type SaveAssetInput = {
  name: string;
  type: AssetType;
  sourceUrl: string;
  prompt?: string;
  generatedByModel?: string;
  metadata?: AssetMetadata;
};

/**
 * Downloads the fal-hosted image and uploads it to Supabase Storage, then
 * inserts a row in `assets`. If Supabase isn't configured, returns the source
 * URL untouched so the UI can still display the result.
 */
export async function saveAsset(input: SaveAssetInput): Promise<SavedAsset> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    return {
      id: null,
      name: input.name,
      type: input.type,
      publicUrl: input.sourceUrl,
      prompt: input.prompt ?? null,
      generatedByModel: input.generatedByModel ?? null,
      metadata: input.metadata ?? {},
      storedInSupabase: false,
    };
  }

  const sb = supabaseServer();

  const res = await fetch(input.sourceUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to download generated image from fal CDN: ${res.status} ${res.statusText}`,
    );
  }
  const arrayBuf = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "image/png";
  const ext = contentType.includes("jpeg") ? "jpg" : "png";
  const path = `${input.type}/${Date.now()}-${slugify(input.name)}.${ext}`;

  const { error: uploadErr } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(path, arrayBuf, { contentType, upsert: false });
  if (uploadErr) {
    throw new Error(`Supabase upload failed: ${uploadErr.message}`);
  }

  const { data: pub } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  const { data: row, error: insertErr } = await sb
    .from("assets")
    .insert({
      type: input.type,
      name: input.name,
      prompt: input.prompt ?? null,
      generated_by_model: input.generatedByModel ?? null,
      storage_path: path,
      image_url: pub.publicUrl,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();
  if (insertErr) {
    throw new Error(`Supabase insert failed: ${insertErr.message}`);
  }

  return {
    id: row.id as string,
    name: input.name,
    type: input.type,
    publicUrl: pub.publicUrl,
    prompt: input.prompt ?? null,
    generatedByModel: input.generatedByModel ?? null,
    metadata: input.metadata ?? {},
    storedInSupabase: true,
  };
}

// -----------------------------------------------------------------------------
// Upload (real product photo path) — bypasses fal/Higgsfield and just stores
// a user-supplied image. Used in the Garment Studio to ingest real product
// photos straight into the asset library.
// -----------------------------------------------------------------------------

export type UploadAssetInput = {
  name: string;
  type: AssetType;
  bytes: ArrayBuffer;
  contentType: string;
  metadata?: AssetMetadata;
};

export async function uploadAsset(input: UploadAssetInput): Promise<SavedAsset> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    throw new Error(
      "Supabase must be configured to upload assets. Add the three SUPABASE_* keys to .env.local.",
    );
  }
  const sb = supabaseServer();
  const ext = input.contentType.includes("jpeg")
    ? "jpg"
    : input.contentType.includes("webp")
      ? "webp"
      : "png";
  const path = `${input.type}/${Date.now()}-${slugify(input.name)}.${ext}`;

  const { error: uploadErr } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(path, input.bytes, {
      contentType: input.contentType,
      upsert: false,
    });
  if (uploadErr) throw new Error(`Supabase upload failed: ${uploadErr.message}`);

  const { data: pub } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  const metadata: AssetMetadata = {
    ...(input.metadata ?? {}),
    source: input.metadata?.source ?? "uploaded",
  };

  const { data: row, error: insertErr } = await sb
    .from("assets")
    .insert({
      type: input.type,
      name: input.name,
      prompt: null,
      generated_by_model: null,
      storage_path: path,
      image_url: pub.publicUrl,
      metadata,
    })
    .select("id")
    .single();
  if (insertErr) throw new Error(`Supabase insert failed: ${insertErr.message}`);

  return {
    id: row.id as string,
    name: input.name,
    type: input.type,
    publicUrl: pub.publicUrl,
    prompt: null,
    generatedByModel: null,
    metadata,
    storedInSupabase: true,
  };
}

// -----------------------------------------------------------------------------
// Read helpers
// -----------------------------------------------------------------------------

export async function listAssets(opts: {
  type?: AssetType;
  category?: GarmentCategory;
  limit?: number;
}): Promise<SavedAsset[]> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    return [];
  }
  const sb = supabaseServer();
  let q = sb
    .from("assets")
    .select(
      "id, name, type, prompt, generated_by_model, image_url, metadata, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (opts.type) q = q.eq("type", opts.type);
  if (opts.category) q = q.eq("metadata->>category", opts.category);

  const { data, error } = await q;
  if (error) throw new Error(`Supabase select failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    type: row.type as AssetType,
    publicUrl: row.image_url as string,
    prompt: (row.prompt as string | null) ?? null,
    generatedByModel: (row.generated_by_model as string | null) ?? null,
    metadata: (row.metadata as AssetMetadata | null) ?? {},
    storedInSupabase: true,
  }));
}

export async function deleteAsset(id: string): Promise<void> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    throw new Error("Supabase must be configured to delete assets.");
  }
  const sb = supabaseServer();
  const { data: row, error: selErr } = await sb
    .from("assets")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (selErr) throw new Error(`Asset not found: ${selErr.message}`);

  const storagePath = row.storage_path as string | null;
  if (storagePath) {
    await sb.storage.from(STORAGE_BUCKET).remove([storagePath]);
  }

  const { error: delErr } = await sb.from("assets").delete().eq("id", id);
  if (delErr) throw new Error(`Supabase delete failed: ${delErr.message}`);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "asset";
}
