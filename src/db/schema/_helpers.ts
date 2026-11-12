import { sql } from 'drizzle-orm';
import {
  check,
  numeric,
  text,
  timestamp,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/** Standard UTC `created_at` and `updated_at` columns for mutable tables. */
export function timestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  };
}

/** Standard VND money column (`numeric(12, 2)`). */
export function moneyColumn(name: string) {
  return numeric(name, { precision: 12, scale: 2 });
}

/** Standard `currency` column defaulting to `'VND'`. */
export function currencyColumn() {
  return text('currency').default('VND').notNull();
}

/** Enforce VND-only currency constraint per `docs/database-design.md` §2. */
export function currencyCheck(tableName: string, column: AnyPgColumn) {
  return check(`${tableName}_currency_check`, sql`${column} = 'VND'`);
}
