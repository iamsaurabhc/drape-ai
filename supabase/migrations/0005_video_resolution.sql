-- =========================================================
-- Drape — persist video render resolution.
--
-- Run AFTER 0004_video_fal.sql.
--
-- Why this exists:
--   fal.ai bills image-to-video as `unit_price × duration × resolution`.
--   A 15s × 1080p Seedance 2.0 Pro render came in at $3.43 when we
--   defaulted Pro to 1080p; the same render at 720p would have been
--   ~$1.80, at 480p ~$0.90.
--
--   The Composer now surfaces a Resolution chip selector (480p / 720p /
--   1080p, gated by what the chosen model supports) so users can trade
--   quality for cost deliberately. We persist the choice on the row so
--   the gallery / cost reporting can tell at a glance which renders went
--   to 1080p.
-- =========================================================

alter table public.outfit_videos
  add column if not exists resolution text;
