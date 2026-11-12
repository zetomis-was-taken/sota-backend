import {
  index,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { adminMembershipStatusEnum } from './enums';
import { museums } from './museums';
import { users } from './users';

export const museumAdmins = pgTable(
  'museum_admins',
  {
    museumId: uuid('museum_id')
      .notNull()
      .references(() => museums.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: adminMembershipStatusEnum('status').default('active').notNull(),
    assignedBy: uuid('assigned_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    assignedAt: timestamp('assigned_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.museumId, t.userId] }),
    index('museum_admins_user_id_status_idx').on(t.userId, t.status),
  ]
).enableRLS();
