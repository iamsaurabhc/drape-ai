-- =========================================================
-- Outfit-to-Image Pipeline — initial schema
--
-- Run this in the Supabase SQL editor for your project, OR via
-- `supabase db push` if you have the CLI linked.
--
-- Day 1 needs: `assets` table + `generated-assets` storage bucket.
-- Day 3 needs: `outfits` + `batches`. We create them now so we don't
-- have to migrate again later.
-- =========================================================

-- Extensions ----------------------------------------------------------------
create extension if not exists "pgcrypto";

-- assets --------------------------------------------------------------------
-- One row per reusable image (a character, a garment, or a backdrop).
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('character', 'garment', 'backdrop')),
  name text not null,
  prompt text,
  generated_by_model text,
  storage_path text,
  image_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assets_type_created_at_idx
  on public.assets (type, created_at desc);

-- batches -------------------------------------------------------------------
-- A run of N outfits. Tracks total cost + drive delivery state.
create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  outfit_count int not null default 0,
  total_cost_usd numeric(10, 4) not null default 0,
  drive_folder_id text,
  drive_folder_url text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- outfits -------------------------------------------------------------------
-- One row per generated multi-garment image.
create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.batches(id) on delete cascade,
  character_id uuid references public.assets(id),
  backdrop_id uuid references public.assets(id),
  garment_ids uuid[] not null default '{}',
  prompt_override text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  result_image_url text,
  result_storage_path text,
  fal_request_id text,
  cost_usd numeric(10, 4) not null default 0,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists outfits_batch_status_idx
  on public.outfits (batch_id, status);

-- Storage bucket ------------------------------------------------------------
-- Public-read bucket so generated images can be referenced via plain URLs
-- from the UI and from subsequent fal calls.
insert into storage.buckets (id, name, public)
values ('generated-assets', 'generated-assets', true)
on conflict (id) do nothing;

-- Anonymous read policy on the bucket. (Writes happen via service-role.)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'public_read_generated_assets'
  ) then
    create policy public_read_generated_assets on storage.objects
      for select using (bucket_id = 'generated-assets');
  end if;
end $$;

-- RLS on data tables --------------------------------------------------------
-- Service-role bypasses RLS, so we just need a policy for read access from
-- the browser (anon key) to render the asset library.
alter table public.assets enable row level security;
alter table public.batches enable row level security;
alter table public.outfits enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'assets_read_all') then
    create policy assets_read_all on public.assets for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'batches_read_all') then
    create policy batches_read_all on public.batches for select using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'outfits_read_all') then
    create policy outfits_read_all on public.outfits for select using (true);
  end if;
end $$;
