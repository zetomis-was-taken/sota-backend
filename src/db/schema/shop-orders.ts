import { sql, type SQL } from 'drizzle-orm';
import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import {
  currencyCheck,
  currencyColumn,
  moneyColumn,
  timestamps,
} from './_helpers';
import { paymentStatusEnum, shopOrderStatusEnum } from './enums';
import { museums } from './museums';
import { users } from './users';

export const shopOrders = pgTable(
  'shop_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    museumId: uuid('museum_id')
      .notNull()
      .references(() => museums.id, { onDelete: 'restrict' }),
    status: shopOrderStatusEnum('status').default('pending').notNull(),
    paymentStatus: paymentStatusEnum('payment_status')
      .default('unpaid')
      .notNull(),
    subtotal: moneyColumn('subtotal').notNull(),
    shippingFee: moneyColumn('shipping_fee').default('0').notNull(),
    totalAmount: moneyColumn('total_amount')
      .generatedAlwaysAs((): SQL => sql`subtotal + shipping_fee`)
      .notNull(),
    currency: currencyColumn(),
    shippingName: text('shipping_name').notNull(),
    shippingPhone: text('shipping_phone').notNull(),
    shippingAddress: text('shipping_address').notNull(),
    shippingCity: text('shipping_city'),
    ...timestamps(),
  },
  (t) => [
    check('shop_orders_subtotal_check', sql`${t.subtotal} >= 0`),
    check('shop_orders_shipping_fee_check', sql`${t.shippingFee} >= 0`),
    currencyCheck('shop_orders', t.currency),
    index('shop_orders_user_id_created_at_idx').on(
      t.userId,
      t.createdAt.desc()
    ),
    index('shop_orders_museum_id_created_at_idx').on(
      t.museumId,
      t.createdAt.desc()
    ),
  ]
).enableRLS();
