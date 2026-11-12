import { pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { appRoleEnum } from './enums';
import { users } from './users';

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: appRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })]
).enableRLS();
