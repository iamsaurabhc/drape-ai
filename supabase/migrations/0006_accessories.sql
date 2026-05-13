-- =========================================================
-- Drape — eyewear / accessories support.
--
-- Run AFTER 0005_video_resolution.sql.
--
-- Adds:
--   - `is_pinned` flag on assets so the Outfit Composer can surface a
--     small set of recurring models (the brief calls for 6 reused
--     faces across a 650-image eyewear catalogue).
--   - Functional index on `metadata->>'sku'` so we can quickly group
--     all colour variations of an eyewear SKU together.
-- =========================================================

alter table public.assets
  add column if not exists is_pinned boolean not null default false;

create index if not exists assets_pinned_idx
  on public.assets (type, is_pinned, created_at desc);

-- SKU lives inside `metadata` jsonb (no schema change needed) so colour
-- variations of the same frame share metadata.sku and the Composer can
-- group them in one row.
create index if not exists assets_eyewear_sku_idx
  on public.assets ((metadata->>'sku'))
  where type = 'garment';
