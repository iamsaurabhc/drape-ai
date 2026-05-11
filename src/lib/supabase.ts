/**
 * Supabase clients.
 *
 * - `supabaseBrowser()` — runs in the browser using the anon key. Safe to call
 *   from client components. Returns `null` if Supabase is not yet configured
 *   so the UI can render a "not connected" state instead of crashing.
 *
 * - `supabaseServer()` — runs on the server using the service-role key.
 *   Bypasses RLS so server actions can write generated assets. Throws if env
 *   is missing because server code should never call this without keys.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export function supabaseBrowser(): SupabaseClient | null {
  const url = env.supabase.url();
  const key = env.supabase.anonKey();
  if (!url || !key) return null;
  return createClient(url, key);
}

export function supabaseServer(): SupabaseClient {
  const url = env.supabase.url();
  const service = env.supabase.serviceRoleKey();
  if (!url || !service) {
    throw new Error(
      "Supabase server client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }
  return createClient(url, service, {
    auth: { persistSession: false },
  });
}

export const STORAGE_BUCKET = "generated-assets";
