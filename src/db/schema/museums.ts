import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';
import { publicationStatusEnum } from './enums';
import { users } from './users';

export const museums = pgTable(
  'museums',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description'),
    address: text('address'),
    city: text('city'),
    coverImagePath: text('cover_image_path'),
    status: publicationStatusEnum('status').default('draft').notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (t) => [index('museums_status_created_at_idx').on(t.status, t.createdAt)]
).enableRLS();
