import { pgSchema, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';

const authSchema = pgSchema('auth');
const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
});

export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  phone: text('phone'),
  ...timestamps(),
}).enableRLS();
