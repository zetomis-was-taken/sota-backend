import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env';
import * as schema from './schema';

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is not configured in .env.');
}

/**
 * Strip Prisma-specific `?pgbouncer=true` flag if present so Postgres.js does not
 * forward it as an unknown startup parameter, while keeping `prepare: false`
 * for Supabase Transaction Pooler (port 6543) compatibility.
 */
function sanitizeDatabaseUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  parsed.searchParams.delete('pgbouncer');
  return parsed.toString();
}

export const queryClient = postgres(sanitizeDatabaseUrl(env.databaseUrl), {
  prepare: false,
});

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;

export async function closeDb(): Promise<void> {
  await queryClient.end();
}
