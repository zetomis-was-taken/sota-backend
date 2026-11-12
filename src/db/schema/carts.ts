import { sql } from 'drizzle-orm';
import { pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';
import { cartStatusEnum } from './enums';
import { museums } from './museums';
import { users } from './users';

export const carts = pgTable(
  'carts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    museumId: uuid('museum_id')
      .notNull()
      .references(() => museums.id, { onDelete: 'restrict' }),
    status: cartStatusEnum('status').default('active').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('carts_active_user_museum_uidx')
      .on(t.userId, t.museumId)
      .where(sql`${t.status} = 'active'`),
  ]
).enableRLS();
