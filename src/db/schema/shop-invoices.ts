import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { currencyCheck, currencyColumn, moneyColumn } from './_helpers';
import { shopOrders } from './shop-orders';

export const shopInvoices = pgTable(
  'shop_invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .unique()
      .references(() => shopOrders.id, { onDelete: 'restrict' }),
    invoiceNumber: text('invoice_number').notNull().unique(),
    issuedAt: timestamp('issued_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    billingName: text('billing_name').notNull(),
    billingEmail: text('billing_email').notNull(),
    totalAmount: moneyColumn('total_amount').notNull(),
    currency: currencyColumn(),
  },
  (t) => [
    check('shop_invoices_total_amount_check', sql`${t.totalAmount} >= 0`),
    currencyCheck('shop_invoices', t.currency),
  ]
).enableRLS();
