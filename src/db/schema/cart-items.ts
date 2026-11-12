import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { timestamps } from './_helpers';
import { carts } from './carts';
import { souvenirProducts } from './souvenir-products';

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    cartId: uuid('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => souvenirProducts.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    ...timestamps(),
  },
  (t) => [
    check('cart_items_quantity_check', sql`${t.quantity} > 0`),
    unique('cart_items_cart_id_product_id_key').on(t.cartId, t.productId),
    index('cart_items_cart_id_idx').on(t.cartId),
    index('cart_items_product_id_idx').on(t.productId),
  ]
).enableRLS();
