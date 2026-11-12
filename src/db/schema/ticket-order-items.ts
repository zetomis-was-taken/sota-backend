import { sql, type SQL } from 'drizzle-orm';
import { check, index, integer, pgTable, uuid } from 'drizzle-orm/pg-core';
import { moneyColumn, timestamps } from './_helpers';
import { ticketOrders } from './ticket-orders';
import { ticketTypes } from './ticket-types';

export const ticketOrderItems = pgTable(
  'ticket_order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketOrderId: uuid('ticket_order_id')
      .notNull()
      .references(() => ticketOrders.id, { onDelete: 'cascade' }),
    ticketTypeId: uuid('ticket_type_id')
      .notNull()
      .references(() => ticketTypes.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    unitPrice: moneyColumn('unit_price').notNull(),
    lineTotal: moneyColumn('line_total')
      .generatedAlwaysAs((): SQL => sql`unit_price * quantity`)
      .notNull(),
    ...timestamps(),
  },
  (t) => [
    check('ticket_order_items_quantity_check', sql`${t.quantity} > 0`),
    check('ticket_order_items_unit_price_check', sql`${t.unitPrice} >= 0`),
    index('ticket_order_items_ticket_order_id_idx').on(t.ticketOrderId),
    index('ticket_order_items_ticket_type_id_idx').on(t.ticketTypeId),
  ]
).enableRLS();
