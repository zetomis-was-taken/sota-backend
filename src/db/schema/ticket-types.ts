import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import {
  currencyCheck,
  currencyColumn,
  moneyColumn,
  timestamps,
} from './_helpers';
import { museums } from './museums';

export const ticketTypes = pgTable(
  'ticket_types',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    museumId: uuid('museum_id')
      .notNull()
      .references(() => museums.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    price: moneyColumn('price').notNull(),
    currency: currencyColumn(),
    isAvailable: boolean('is_available').default(true).notNull(),
    ...timestamps(),
  },
  (t) => [
    check('ticket_types_price_check', sql`${t.price} >= 0`),
    currencyCheck('ticket_types', t.currency),
    index('ticket_types_museum_id_idx').on(t.museumId),
  ]
).enableRLS();
