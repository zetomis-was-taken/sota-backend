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
