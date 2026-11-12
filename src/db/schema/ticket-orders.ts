import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  currencyCheck,
  currencyColumn,
  moneyColumn,
  timestamps,
} from './_helpers';
import { paymentStatusEnum, ticketOrderStatusEnum } from './enums';
import { museums } from './museums';
import { users } from './users';

export const TICKET_TIME_SLOTS = [
  '09:00-11:00',
  '11:00-13:00',
  '14:00-16:00',
  '16:00-18:00',
] as const;

export type TicketTimeSlot = (typeof TICKET_TIME_SLOTS)[number];

export const ticketOrders = pgTable(
  'ticket_orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    museumId: uuid('museum_id')
      .notNull()
      .references(() => museums.id, { onDelete: 'restrict' }),
    visitDate: date('visit_date', { mode: 'string' }).notNull(),
    timeSlot: text('time_slot').$type<TicketTimeSlot>().notNull(),
    status: ticketOrderStatusEnum('status').default('pending').notNull(),
    paymentStatus: paymentStatusEnum('payment_status')
      .default('unpaid')
      .notNull(),
    totalAmount: moneyColumn('total_amount').notNull(),
    currency: currencyColumn(),
    entryCode: text('entry_code').unique(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    check(
      'ticket_orders_time_slot_check',
      sql`${t.timeSlot} IN ('09:00-11:00', '11:00-13:00', '14:00-16:00', '16:00-18:00')`
    ),
    check('ticket_orders_total_amount_check', sql`${t.totalAmount} >= 0`),
    currencyCheck('ticket_orders', t.currency),
    index('ticket_orders_user_id_created_at_idx').on(
      t.userId,
      t.createdAt.desc()
    ),
    index('ticket_orders_museum_visit_slot_status_idx').on(
      t.museumId,
      t.visitDate,
      t.timeSlot,
      t.status
    ),
  ]
).enableRLS();
