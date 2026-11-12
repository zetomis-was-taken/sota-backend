import { sql, type SQL } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { moneyColumn, timestamps } from './_helpers';
import { shopOrders } from './shop-orders';
import { souvenirProducts } from './souvenir-products';

export const shopOrderItems = pgTable(
  'shop_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => shopOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => souvenirProducts.id, { onDelete: 'restrict' }),
    productName: text('product_name').notNull(),
    unitPrice: moneyColumn('unit_price').notNull(),
    quantity: integer('quantity').notNull(),
    lineTotal: moneyColumn('line_total')
      .generatedAlwaysAs((): SQL => sql`unit_price * quantity`)
      .notNull(),
    ...timestamps(),
  },
  (t) => [
    check('shop_order_items_unit_price_check', sql`${t.unitPrice} >= 0`),
    check('shop_order_items_quantity_check', sql`${t.quantity} > 0`),
    index('shop_order_items_order_id_idx').on(t.orderId),
    index('shop_order_items_product_id_idx').on(t.productId),
  ]
).enableRLS();
