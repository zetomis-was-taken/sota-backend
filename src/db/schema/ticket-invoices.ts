import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { currencyCheck, currencyColumn, moneyColumn } from './_helpers';
import { ticketOrders } from './ticket-orders';

export const ticketInvoices = pgTable(
  'ticket_invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketOrderId: uuid('ticket_order_id')
      .notNull()
      .unique()
      .references(() => ticketOrders.id, { onDelete: 'restrict' }),
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
    check('ticket_invoices_total_amount_check', sql`${t.totalAmount} >= 0`),
    currencyCheck('ticket_invoices', t.currency),
  ]
).enableRLS();
