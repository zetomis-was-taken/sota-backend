import { randomBytes } from 'crypto';
import { sql } from 'drizzle-orm';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PostgresJsTransaction } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';

export type DrizzleTransaction = PostgresJsTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Generates a cryptographically random, unguessable entry code. */
export function generateEntryCode(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Allocates the next sequential invoice number from `invoice_seq` within a transaction.
 * Returns formatted string like `TKT-1` or `SHP-1`.
 */
export async function nextInvoiceNumber(
  prefix: 'TKT' | 'SHP',
  tx: DrizzleTransaction
): Promise<string> {
  const result = await tx.execute(
    sql<{ seq: string }>`SELECT nextval('invoice_seq')::text AS seq`
  );
  const rows = Array.isArray(result) ? result : [result];
  const row = rows[0] as { seq?: string } | undefined;
  if (!row?.seq) {
    throw new Error('Could not allocate invoice number');
  }
  return `${prefix}-${row.seq}`;
}
