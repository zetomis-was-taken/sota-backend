import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  currencyCheck,
  currencyColumn,
  moneyColumn,
  timestamps,
} from './_helpers';
import { publicationStatusEnum } from './enums';
import { museums } from './museums';
import { users } from './users';

export const souvenirProducts = pgTable(
  'souvenir_products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    museumId: uuid('museum_id')
      .notNull()
      .references(() => museums.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    sku: text('sku'),
    price: moneyColumn('price').notNull(),
    currency: currencyColumn(),
    stockQuantity: integer('stock_quantity').default(0).notNull(),
    status: publicationStatusEnum('status').default('draft').notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (t) => [
    check('souvenir_products_price_check', sql`${t.price} >= 0`),
    currencyCheck('souvenir_products', t.currency),
    check('souvenir_products_stock_quantity_check', sql`${t.stockQuantity} >= 0`),
    index('souvenir_products_museum_id_idx').on(t.museumId),
    index('souvenir_products_museum_id_status_created_at_idx').on(
      t.museumId,
      t.status,
      t.createdAt
    ),
    uniqueIndex('souvenir_products_museum_id_sku_uidx')
      .on(t.museumId, t.sku)
      .where(sql`${t.sku} IS NOT NULL`),
  ]
).enableRLS();
