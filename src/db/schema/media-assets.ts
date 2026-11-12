import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';
import { mediaEntityTypeEnum, mediaTypeEnum } from './enums';
import { museums } from './museums';
import { users } from './users';

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    museumId: uuid('museum_id')
      .notNull()
      .references(() => museums.id, { onDelete: 'cascade' }),
    entityType: mediaEntityTypeEnum('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    mediaType: mediaTypeEnum('media_type').notNull(),
    storageBucket: text('storage_bucket').notNull(),
    storagePath: text('storage_path').notNull(),
    mimeType: text('mime_type').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (t) => [
    unique('media_assets_storage_bucket_path_key').on(
      t.storageBucket,
      t.storagePath
    ),
    uniqueIndex('media_assets_primary_entity_uidx')
      .on(t.entityType, t.entityId)
      .where(sql`${t.isPrimary}`),
    index('media_assets_museum_entity_sort_idx').on(
      t.museumId,
      t.entityType,
      t.entityId,
      t.sortOrder
    ),
  ]
).enableRLS();
