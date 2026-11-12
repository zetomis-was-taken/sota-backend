/**
 * Minimal HTTP helper for testing Supabase's /auth/v1, /rest/v1, and /storage/v1
 * endpoints using only SUPABASE_URL and SUPABASE_ANON_KEY (never service_role).
 */

export function getConfig() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY. Copy .env.example to .env and populate it from `supabase status -o env`."
    );
  }

  return { url, anonKey };
}

export async function supabaseFetch(path, options = {}) {
  const { url, anonKey } = getConfig();
  const { token, headers = {}, ...rest } = options;

  const requestHeaders = new Headers(headers);
  requestHeaders.set("apikey", anonKey);
  if (!requestHeaders.has("Authorization")) {
    requestHeaders.set("Authorization", `Bearer ${token ?? anonKey}`);
  }

  return fetch(`${url}${path}`, {
    ...rest,
    headers: requestHeaders,
  });
}
