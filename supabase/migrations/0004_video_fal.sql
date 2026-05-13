-- =========================================================
-- Drape — move image-to-video from Higgsfield to fal.ai.
--
-- Run AFTER 0003_video_async.sql.
--
-- Why this exists:
--   Higgsfield's image-to-video endpoints were rejecting valid requests
--   (DoP returned 404 for unknown body keys, Kling/Seedance 400'd on
--   anything outside their strict duration enums) and gave us no useful
--   error UX. fal.ai's queue API exposes the same model lineup (Seedance
--   2.0, Kling 3.0 Pro) with a cleaner submit/status/result contract that
--   we already use for outfit composition.
--
--   This migration renames the two provider-specific columns we added in
--   0003 so they read sensibly under the new vendor:
--
--     higgsfield_request_id   → provider_request_id   (fal queue request_id)
--     higgsfield_status_url   → provider_endpoint     (fal model slug, e.g.
--                                bytedance/seedance-2.0/image-to-video)
--
--   The /api/video/[id]/status route now passes `(provider_endpoint,
--   provider_request_id)` into fal.queue.status() instead of dereferencing
--   a Higgsfield URL.
--
--   Any existing `outfit_videos` rows from the Higgsfield era will have
--   stale, non-fal request IDs — they will surface as `failed` after the
--   first status poll. Safe to delete them manually if you want a clean
--   gallery.
-- =========================================================

alter table public.outfit_videos
  rename column higgsfield_request_id to provider_request_id;

alter table public.outfit_videos
  rename column higgsfield_status_url to provider_endpoint;
