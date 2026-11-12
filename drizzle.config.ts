import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

function getMigrationUrl(): string {
  const raw =
    process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();

  if (!raw) {
    throw new Error(
      'DIRECT_URL or DATABASE_URL must be set in .env to run Drizzle Kit.'
    );
  }

  const parsed = new URL(raw);
  parsed.searchParams.delete('pgbouncer');
  return parsed.toString();
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: {
    url: getMigrationUrl(),
  },
  migrations: {
    table: '__drizzle_migrations',
    schema: 'drizzle',
  },
  verbose: true,
  strict: true,
});
