import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/** Returns true when both Supabase URL and publishable key are configured. */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabasePublishableKey);
}

function initSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    console.warn(
      'Supabase credentials are not set in .env (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY). Client initialization skipped.'
    );
    return null;
  }

  return createClient(env.supabaseUrl, env.supabasePublishableKey);
}

export const supabase: SupabaseClient | null = initSupabaseClient();

/** Returns the configured Supabase client or throws if credentials are missing. */
export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase client is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env.'
    );
  }
  return supabase;
}

/** Creates a per-request Supabase client forwarding the caller's JWT so RLS applies. */
export function createUserSupabaseClient(accessToken: string): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase client is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in .env.'
    );
  }
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
