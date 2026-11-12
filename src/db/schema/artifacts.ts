import { sql } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';
import { publicationStatusEnum } from './enums';
import { museums } from './museums';
import { users } from './users';

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    museumId: uuid('museum_id')
      .notNull()
      .references(() => museums.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    period: text('period'),
    inventoryCode: text('inventory_code'),
    status: publicationStatusEnum('status').default('draft').notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (t) => [
    index('artifacts_museum_id_idx').on(t.museumId),
    index('artifacts_museum_id_status_created_at_idx').on(
      t.museumId,
      t.status,
      t.createdAt
    ),
    uniqueIndex('artifacts_museum_id_inventory_code_uidx')
      .on(t.museumId, t.inventoryCode)
      .where(sql`${t.inventoryCode} IS NOT NULL`),
  ]
).enableRLS();
