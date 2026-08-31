import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the service role key.
 * This bypasses Row Level Security, so it must only ever be imported
 * from server code (API routes, server components) — never the browser.
 *
 * The real client is built lazily on first use via a Proxy so that
 * `next build` (which imports route modules) doesn't crash when env
 * vars aren't present at build time — only actual requests need them.
 */
let cached: SupabaseClient | null = null;

function build(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Add them to .env.local (see .env.example)."
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    if (!cached) cached = build();
    const value = Reflect.get(cached as object, prop, receiver);
    return typeof value === "function" ? value.bind(cached) : value;
  },
});
