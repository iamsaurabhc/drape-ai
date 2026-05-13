/**
 * Outfit-video persistence — Stage D results land in the `outfit_videos` table
 * (created by supabase/migrations/0002_videos.sql). The MP4 binary is mirrored
 * to the `generated-assets` storage bucket so the URL is stable even after the
 * Higgsfield CDN expires.
 */

import { env } from "@/lib/env";
import { STORAGE_BUCKET, supabaseServer } from "@/lib/supabase";
import type { MotionPresetId, VideoModelId, VideoResolution } from "@/lib/video";

export type VideoStatus = "queued" | "running" | "completed" | "failed";

export type StoredOutfitVideo = {
  id: string;
  outfitId: string | null;
  sourceImageUrl: string;
  prompt: string;
  motionPreset: MotionPresetId | null;
  model: VideoModelId;
  durationSeconds: number;
  resolution: VideoResolution | null;
  status: VideoStatus;
  resultVideoUrl: string | null;
  // Vendor-neutral identifiers. For the current fal implementation these are
  // the fal queue request_id and the fal model slug (e.g.
  // bytedance/seedance-2.0/image-to-video) respectively.
  providerRequestId: string | null;
  providerEndpoint: string | null;
  costUsd: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  // Hydrated joins (best-effort; null when the parent outfit was deleted).
  outfit: {
    characterId: string | null;
    characterName: string | null;
    characterUrl: string | null;
    imageUrl: string | null;
    garmentCount: number;
  } | null;
};

export type InsertPendingVideoInput = {
  outfitId: string;
  sourceImageUrl: string;
  prompt: string;
  motionPreset: MotionPresetId;
  model: VideoModelId;
  durationSeconds: number;
  resolution: VideoResolution;
  providerRequestId: string;
  providerEndpoint: string;
  costUsd: number;
};

/**
 * Inserts a `running` row immediately after submitting to Higgsfield, so the
 * client gets an id to poll against. The MP4 is mirrored to Supabase later by
 * `finalizeVideo` once the Higgsfield job completes.
 */
export async function insertPendingVideo(
  input: InsertPendingVideoInput,
): Promise<StoredOutfitVideo> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    throw new Error(
      "Supabase must be configured to save outfit videos. Add the SUPABASE_* keys to .env.local.",
    );
  }
  const sb = supabaseServer();

  const { data: row, error: insErr } = await sb
    .from("outfit_videos")
    .insert({
      outfit_id: input.outfitId,
      source_image_url: input.sourceImageUrl,
      prompt: input.prompt,
      motion_preset: input.motionPreset,
      model: input.model,
      duration_seconds: input.durationSeconds,
      resolution: input.resolution,
      status: "running",
      provider_request_id: input.providerRequestId,
      provider_endpoint: input.providerEndpoint,
      cost_usd: input.costUsd,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`Supabase insert failed: ${insErr.message}`);

  const saved = await getVideoById(row.id as string);
  if (!saved) throw new Error("Video row inserted but could not be re-fetched.");
  return saved;
}

/**
 * Downloads the Higgsfield-hosted MP4, mirrors it to Supabase Storage, and
 * flips the row to `completed`. Returns the hydrated row.
 */
export async function finalizeVideo(
  id: string,
  videoUrl: string,
): Promise<StoredOutfitVideo> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    throw new Error("Supabase must be configured to finalize outfit videos.");
  }
  const sb = supabaseServer();

  // Look up the row so we have the outfitId / request_id for the storage path.
  const { data: existing, error: selErr } = await sb
    .from("outfit_videos")
    .select("id, outfit_id, provider_request_id, status, result_storage_path")
    .eq("id", id)
    .single();
  if (selErr || !existing) {
    throw new Error(`outfit_videos row ${id} not found.`);
  }
  // Idempotent — if we've already mirrored, just return the current row.
  if (existing.status === "completed" && existing.result_storage_path) {
    const already = await getVideoById(id);
    if (already) return already;
  }

  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to download video from fal CDN: ${res.status} ${res.statusText}`,
    );
  }
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "video/mp4";
  const ext = contentType.includes("webm") ? "webm" : "mp4";
  const path = `video/${existing.outfit_id}-${Date.now()}-${
    String(existing.provider_request_id ?? "vid").slice(0, 8)
  }.${ext}`;

  const { error: upErr } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(path, buf, { contentType, upsert: false });
  if (upErr) throw new Error(`Supabase upload failed: ${upErr.message}`);

  const { data: pub } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  const { error: updErr } = await sb
    .from("outfit_videos")
    .update({
      status: "completed",
      result_video_url: pub.publicUrl,
      result_storage_path: path,
      finished_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", id);
  if (updErr) throw new Error(`Supabase update failed: ${updErr.message}`);

  const saved = await getVideoById(id);
  if (!saved) throw new Error("Video finalized but could not be re-fetched.");
  return saved;
}

/**
 * Marks the row as failed so the UI can stop polling and surface a useful
 * error. Returns the hydrated row.
 */
export async function failVideo(
  id: string,
  errorMessage: string,
): Promise<StoredOutfitVideo | null> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    return null;
  }
  const sb = supabaseServer();
  await sb
    .from("outfit_videos")
    .update({
      status: "failed",
      error: errorMessage.slice(0, 500),
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
  return getVideoById(id);
}

const VIDEO_SELECT =
  "id, outfit_id, source_image_url, prompt, motion_preset, model, duration_seconds, resolution, status, result_video_url, provider_request_id, provider_endpoint, cost_usd, error, created_at, finished_at";

export async function getVideoById(
  id: string,
): Promise<StoredOutfitVideo | null> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) return null;
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("outfit_videos")
    .select(VIDEO_SELECT)
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return hydrate(data);
}

export async function listVideosByOutfit(
  outfitId: string,
): Promise<StoredOutfitVideo[]> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) return [];
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("outfit_videos")
    .select(VIDEO_SELECT)
    .eq("outfit_id", outfitId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Supabase select failed: ${error.message}`);
  return Promise.all((data ?? []).map(hydrate));
}

export async function listAllVideos(
  opts: { limit?: number } = {},
): Promise<StoredOutfitVideo[]> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) return [];
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("outfit_videos")
    .select(VIDEO_SELECT)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (error) throw new Error(`Supabase select failed: ${error.message}`);
  return Promise.all((data ?? []).map(hydrate));
}

export async function deleteVideo(id: string): Promise<void> {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    throw new Error("Supabase must be configured to delete videos.");
  }
  const sb = supabaseServer();
  const { data: row } = await sb
    .from("outfit_videos")
    .select("result_storage_path")
    .eq("id", id)
    .single();
  const sp = row?.result_storage_path as string | null | undefined;
  if (sp) {
    await sb.storage.from(STORAGE_BUCKET).remove([sp]);
  }
  const { error } = await sb.from("outfit_videos").delete().eq("id", id);
  if (error) throw new Error(`Supabase delete failed: ${error.message}`);
}

// -----------------------------------------------------------------------------
// Internal — hydrate a raw row with its source outfit + character so the UI
// can render self-contained tiles in the /videos gallery.
// -----------------------------------------------------------------------------

interface RawVideoRow {
  id: string;
  outfit_id: string | null;
  source_image_url: string;
  prompt: string;
  motion_preset: string | null;
  model: string;
  duration_seconds: number;
  resolution: string | null;
  status: VideoStatus;
  result_video_url: string | null;
  provider_request_id: string | null;
  provider_endpoint: string | null;
  cost_usd: number | string;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

async function hydrate(raw: RawVideoRow): Promise<StoredOutfitVideo> {
  const sb = supabaseServer();
  let outfit: StoredOutfitVideo["outfit"] = null;

  if (raw.outfit_id) {
    const { data: outfitRow } = await sb
      .from("outfits")
      .select("character_id, garment_ids, result_image_url")
      .eq("id", raw.outfit_id)
      .single();

    if (outfitRow) {
      const garmentIds = (outfitRow.garment_ids as string[] | null) ?? [];
      let characterName: string | null = null;
      let characterUrl: string | null = null;

      if (outfitRow.character_id) {
        const { data: assetRow } = await sb
          .from("assets")
          .select("name, image_url")
          .eq("id", outfitRow.character_id as string)
          .single();
        characterName = (assetRow?.name as string | null) ?? null;
        characterUrl = (assetRow?.image_url as string | null) ?? null;
      }

      outfit = {
        characterId: (outfitRow.character_id as string | null) ?? null,
        characterName,
        characterUrl,
        imageUrl: (outfitRow.result_image_url as string | null) ?? null,
        garmentCount: garmentIds.length,
      };
    }
  }

  return {
    id: raw.id,
    outfitId: raw.outfit_id,
    sourceImageUrl: raw.source_image_url,
    prompt: raw.prompt,
    motionPreset: (raw.motion_preset as MotionPresetId | null) ?? null,
    model: raw.model as VideoModelId,
    durationSeconds: raw.duration_seconds,
    resolution: (raw.resolution as VideoResolution | null) ?? null,
    status: raw.status,
    resultVideoUrl: raw.result_video_url,
    providerRequestId: raw.provider_request_id,
    providerEndpoint: raw.provider_endpoint,
    costUsd:
      typeof raw.cost_usd === "string" ? parseFloat(raw.cost_usd) : raw.cost_usd,
    error: raw.error,
    createdAt: raw.created_at,
    finishedAt: raw.finished_at,
    outfit,
  };
}
