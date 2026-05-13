-- =========================================================
-- Drape — image-to-video + background preset migration
--
-- Run this in the Supabase SQL editor AFTER 0001_initial.sql.
--
-- Adds:
--   1. `outfits.background_preset` — remembers which preset scene
--      a saved outfit was composed against (studio-white / gray /
--      outdoor-street / golden-hour) so the gallery can label it.
--   2. `outfit_videos` table — one row per generated 3s/5s clip,
--      linked to its source outfit, with the MP4 mirrored into
--      Supabase Storage.
-- =========================================================

-- 1. Background preset column on outfits ------------------------------------
alter table public.outfits
  add column if not exists background_preset text;

-- 2. outfit_videos ----------------------------------------------------------
create table if not exists public.outfit_videos (
  id uuid primary key default gen_random_uuid(),
  outfit_id uuid references public.outfits(id) on delete cascade,
  source_image_url text not null,
  prompt text not null,
  motion_preset text,
  model text not null,
  duration_seconds int not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  result_video_url text,
  result_storage_path text,
  higgsfield_request_id text,
  cost_usd numeric(10, 4) not null default 0,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists outfit_videos_outfit_idx
  on public.outfit_videos (outfit_id, created_at desc);

create index if not exists outfit_videos_created_idx
  on public.outfit_videos (created_at desc);

-- RLS — same pattern as 0001 (read-all so the browser can render the gallery
-- with the anon key; writes happen via the service role which bypasses RLS).
alter table public.outfit_videos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where policyname = 'outfit_videos_read_all'
  ) then
    create policy outfit_videos_read_all on public.outfit_videos
      for select using (true);
  end if;
end $$;
