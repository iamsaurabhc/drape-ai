/**
 * Centralised env access with friendly errors. Server-only values throw at
 * call-time (never at module-load) so the dev server still boots without keys.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local — see .env.example.`,
    );
  }
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export const env = {
  fal: {
    key: () => required("FAL_KEY"),
    hasKey: () => Boolean(optional("FAL_KEY")),
  },
  higgsfield: {
    apiKey: () => required("HIGGSFIELD_API_KEY"),
    apiSecret: () => required("HIGGSFIELD_API_SECRET"),
    hasKeys: () =>
      Boolean(optional("HIGGSFIELD_API_KEY") && optional("HIGGSFIELD_API_SECRET")),
  },
  supabase: {
    url: () => optional("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: () => optional("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: () => optional("SUPABASE_SERVICE_ROLE_KEY"),
    isConfigured: () =>
      Boolean(
        optional("NEXT_PUBLIC_SUPABASE_URL") &&
          optional("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      ),
  },
} as const;
