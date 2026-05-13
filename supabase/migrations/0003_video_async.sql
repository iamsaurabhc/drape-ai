-- =========================================================
-- Drape — async image-to-video migration
--
-- Run this AFTER 0002_videos.sql.
--
-- Why this exists:
--   The first version of /api/video/generate submitted the job to
--   Higgsfield and then polled inline for up to 5 minutes inside the
--   HTTP request handler. That blocks the UI, breaks under Netlify's
--   60s function limit, and gives the user no visibility into what's
--   happening. The new design is non-blocking:
--
--     POST /api/video/generate      → submit to Higgsfield, insert a
--                                     row with status='running', return
--                                     immediately.
--     GET  /api/video/[id]/status   → polls Higgsfield's status_url for
--                                     this single video, finalises the
--                                     row when completed/failed.
--
--   The status route needs to know which Higgsfield URL to hit, so we
--   persist it on the row.
-- =========================================================

alter table public.outfit_videos
  add column if not exists higgsfield_status_url text;
