import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  museums,
  ticketInvoices,
  ticketOrderItems,
  ticketOrders,
  ticketTypes,
  users,
  TICKET_TIME_SLOTS,
  type TicketTimeSlot,
} from '../db/schema';
import { BadRequestError } from '../lib/errors';
import { generateEntryCode, nextInvoiceNumber } from '../lib/invoice';
import {
  formatMinorUnitsAsMoney,
  MAX_MONEY_MINOR_UNITS,
  parseMoneyToMinorUnits,
} from '../lib/money';
import { isDateInPastVN } from '../lib/timezone';
import { isValidCalendarDate } from '../lib/validation';

const POSTGRES_INTEGER_MAX = 2_147_483_647;

export interface CreateTicketOrderItemInput {
  ticket_type_id: string;
  quantity: number;
}

export interface CreateTicketOrderInput {
  userId: string;
  userEmail: string | null;
  museum_id: string;
  visit_date: string;
  time_slot: string;
  items: CreateTicketOrderItemInput[];
}

export interface FormattedTicketOrderItem {
  id: string;
  ticket_order_id: string;
  ticketOrderId: string;
  ticket_type_id: string;
  ticketTypeId: string;
  quantity: number;
  unit_price: string;
  unitPrice: string;
  line_total: string;
  lineTotal: string;
  created_at: Date;
  createdAt: Date;
  updated_at: Date;
  updatedAt: Date;
}

export interface FormattedTicketOrder {
  id: string;
  user_id: string;
  userId: string;
  museum_id: string;
  museumId: string;
  visit_date: string;
  visitDate: string;
  time_slot: TicketTimeSlot;
  timeSlot: TicketTimeSlot;
  status: string;
  payment_status: string;
  paymentStatus: string;
  total_amount: string;
  totalAmount: string;
  currency: string;
  entry_code: string | null;
  entryCode: string | null;
  used_at: Date | null;
  usedAt: Date | null;
  created_at: Date;
  createdAt: Date;
  updated_at: Date;
  updatedAt: Date;
  items: FormattedTicketOrderItem[];
}

export interface FormattedTicketInvoice {
  id: string;
  ticket_order_id: string;
  ticketOrderId: string;
  invoice_number: string;
  invoiceNumber: string;
  issued_at: Date;
  issuedAt: Date;
  billing_name: string;
  billingName: string;
  billing_email: string;
  billingEmail: string;
  total_amount: string;
  totalAmount: string;
  currency: string;
}

export interface CreateTicketOrderResult {
  order: FormattedTicketOrder;
  items: FormattedTicketOrderItem[];
  invoice: FormattedTicketInvoice;
}

/**
 * Creates a new ticket order with items and invoice in a single database transaction.
 * Enforces business constraints:
 * - Museum must be published
 * - Ticket types must belong to museum and be available
 * - Visit date must be valid calendar date and not in the past (Asia/Ho_Chi_Minh)
 * - Time slot must be valid
 * - Items must not be empty or contain duplicate ticket_type_ids
 */
export async function createTicketOrder(
  input: CreateTicketOrderInput
): Promise<CreateTicketOrderResult> {
  const { userId, userEmail, museum_id, visit_date, time_slot, items } = input;

  // Domain validation before starting transaction
  if (!isValidCalendarDate(visit_date) || isDateInPastVN(visit_date)) {
    throw new BadRequestError('Visit date is invalid or in the past', 'invalid_visit_date');
  }

  if (!TICKET_TIME_SLOTS.includes(time_slot as TicketTimeSlot)) {
    throw new BadRequestError('Invalid time slot', 'invalid_time_slot');
  }

  if (
    items.length === 0 ||
    new Set(items.map((i) => i.ticket_type_id)).size !== items.length ||
    items.some(
      (item) =>
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > POSTGRES_INTEGER_MAX
    )
  ) {
    throw new BadRequestError('Ticket items are empty or duplicated', 'invalid_items');
  }

  return await db.transaction(async (tx) => {
    // Re-verify visit date inside transaction in case midnight crossed
    if (isDateInPastVN(visit_date)) {
      throw new BadRequestError('Visit date is invalid or in the past', 'invalid_visit_date');
    }

    const [museum] = await tx
      .select()
      .from(museums)
      .where(eq(museums.id, museum_id))
      .for('share')
      .limit(1);

    if (!museum || museum.status !== 'published') {
      throw new BadRequestError('Museum is not available', 'museum_not_available');
    }

    const typeIds = items.map((i) => i.ticket_type_id);
    const types = await tx
      .select()
      .from(ticketTypes)
      .where(and(inArray(ticketTypes.id, typeIds), eq(ticketTypes.museumId, museum_id)))
      .for('share');

    if (types.length !== typeIds.length || types.some((t) => !t.isAvailable)) {
      throw new BadRequestError(
        'One or more ticket types are unavailable',
        'ticket_type_unavailable'
      );
    }

    // Exact minor-unit addition without floating point drift
    const totalMinorUnits = items.reduce((sum, item) => {
      const type = types.find((t) => t.id === item.ticket_type_id)!;
      return sum + parseMoneyToMinorUnits(type.price) * BigInt(item.quantity);
    }, 0n);
    if (totalMinorUnits > MAX_MONEY_MINOR_UNITS) {
      throw new BadRequestError(
        'Ticket order total exceeds the supported maximum',
        'invalid_items'
      );
    }
    const totalAmount = formatMinorUnitsAsMoney(totalMinorUnits);

    const entryCode = generateEntryCode();

    const [order] = await tx
      .insert(ticketOrders)
      .values({
        userId,
        museumId: museum_id,
        visitDate: visit_date,
        timeSlot: time_slot as TicketTimeSlot,
        status: 'confirmed',
        paymentStatus: 'paid',
        totalAmount,
        currency: 'VND',
        entryCode,
      })
      .returning();

    const insertedItems = await tx
      .insert(ticketOrderItems)
      .values(
        items.map((item) => {
          const type = types.find((t) => t.id === item.ticket_type_id)!;
          return {
            ticketOrderId: order.id,
            ticketTypeId: item.ticket_type_id,
            quantity: item.quantity,
            unitPrice: type.price,
          };
        })
      )
      .returning();

    const invoiceNumber = await nextInvoiceNumber('TKT', tx);

    const [profile] = await tx
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const [invoice] = await tx
      .insert(ticketInvoices)
      .values({
        ticketOrderId: order.id,
        invoiceNumber,
        billingName: profile?.displayName ?? userEmail ?? 'Visitor',
        billingEmail: userEmail ?? '',
        totalAmount: order.totalAmount,
        currency: 'VND',
      })
      .returning();

    const formattedItems: FormattedTicketOrderItem[] = insertedItems.map((item) => ({
      id: item.id,
      ticket_order_id: item.ticketOrderId,
      ticketOrderId: item.ticketOrderId,
      ticket_type_id: item.ticketTypeId,
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      unitPrice: item.unitPrice,
      line_total: item.lineTotal,
      lineTotal: item.lineTotal,
      created_at: item.createdAt,
      createdAt: item.createdAt,
      updated_at: item.updatedAt,
      updatedAt: item.updatedAt,
    }));

    const formattedOrder: FormattedTicketOrder = {
      id: order.id,
      user_id: order.userId,
      userId: order.userId,
      museum_id: order.museumId,
      museumId: order.museumId,
      visit_date: order.visitDate,
      visitDate: order.visitDate,
      time_slot: order.timeSlot,
      timeSlot: order.timeSlot,
      status: order.status,
      payment_status: order.paymentStatus,
      paymentStatus: order.paymentStatus,
      total_amount: order.totalAmount,
      totalAmount: order.totalAmount,
      currency: order.currency,
      entry_code: order.entryCode,
      entryCode: order.entryCode,
      used_at: order.usedAt,
      usedAt: order.usedAt,
      created_at: order.createdAt,
      createdAt: order.createdAt,
      updated_at: order.updatedAt,
      updatedAt: order.updatedAt,
      items: formattedItems,
    };

    const formattedInvoice: FormattedTicketInvoice = {
      id: invoice.id,
      ticket_order_id: invoice.ticketOrderId,
      ticketOrderId: invoice.ticketOrderId,
      invoice_number: invoice.invoiceNumber,
      invoiceNumber: invoice.invoiceNumber,
      issued_at: invoice.issuedAt,
      issuedAt: invoice.issuedAt,
      billing_name: invoice.billingName,
      billingName: invoice.billingName,
      billing_email: invoice.billingEmail,
      billingEmail: invoice.billingEmail,
      total_amount: invoice.totalAmount,
      totalAmount: invoice.totalAmount,
      currency: invoice.currency,
    };

    return {
      order: formattedOrder,
      items: formattedItems,
      invoice: formattedInvoice,
    };
  });
}
