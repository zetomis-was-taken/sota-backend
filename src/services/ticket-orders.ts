import { and, count, desc, eq, inArray } from 'drizzle-orm';
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
import { canManageMuseum } from '../lib/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors';
import { generateEntryCode, nextInvoiceNumber } from '../lib/invoice';
import { formatMinorUnitsAsMoney, parseMoneyToMinorUnits } from '../lib/money';
import { getTodayVN, isDateInPastVN, isVisitDateNotFutureVN } from '../lib/timezone';
import { isValidCalendarDate } from '../lib/validation';

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

export interface TicketOrderDetailResult extends FormattedTicketOrder {
  order: FormattedTicketOrder;
  invoice: FormattedTicketInvoice | null;
}

function formatOrderItem(item: any): FormattedTicketOrderItem {
  return {
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
  };
}

function formatInvoice(invoice: any): FormattedTicketInvoice {
  return {
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
}

function formatOrder(
  order: any,
  items: FormattedTicketOrderItem[] = []
): FormattedTicketOrder {
  return {
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
    items,
  };
}

/**
 * Creates a new ticket order with items and invoice in a single database transaction.
 */
export async function createTicketOrder(
  input: CreateTicketOrderInput
): Promise<CreateTicketOrderResult> {
  const { userId, userEmail, museum_id, visit_date, time_slot, items } = input;

  if (!isValidCalendarDate(visit_date) || isDateInPastVN(visit_date)) {
    throw new BadRequestError('Visit date is invalid or in the past', 'invalid_visit_date');
  }

  if (!TICKET_TIME_SLOTS.includes(time_slot as TicketTimeSlot)) {
    throw new BadRequestError('Invalid time slot', 'invalid_time_slot');
  }

  if (items.length === 0 || new Set(items.map((i) => i.ticket_type_id)).size !== items.length) {
    throw new BadRequestError('Ticket items are empty or duplicated', 'invalid_items');
  }

  return await db.transaction(async (tx) => {
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

    const totalMinorUnits = items.reduce((sum, item) => {
      const type = types.find((t) => t.id === item.ticket_type_id)!;
      return sum + parseMoneyToMinorUnits(type.price) * BigInt(item.quantity);
    }, 0n);
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

    const formattedItems = insertedItems.map(formatOrderItem);
    const formattedOrder = formatOrder(order, formattedItems);
    const formattedInvoice = formatInvoice(invoice);

    return {
      order: formattedOrder,
      items: formattedItems,
      invoice: formattedInvoice,
    };
  });
}

/**
 * Returns paginated list of ticket orders placed by the current user.
 */
export async function listUserTicketOrders(
  userId: string,
  limit: number,
  offset: number
): Promise<{ orders: FormattedTicketOrder[]; total: number }> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(ticketOrders)
    .where(eq(ticketOrders.userId, userId));

  const rows = await db
    .select()
    .from(ticketOrders)
    .where(eq(ticketOrders.userId, userId))
    .orderBy(desc(ticketOrders.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    orders: rows.map((row) => formatOrder(row)),
    total: Number(total),
  };
}

/**
 * Returns detail of a ticket order with items and invoice.
 * Accessible by order owner or authorized museum admin.
 */
export async function getTicketOrderById(
  userId: string,
  orderId: string
): Promise<TicketOrderDetailResult> {
  const [order] = await db
    .select()
    .from(ticketOrders)
    .where(eq(ticketOrders.id, orderId))
    .limit(1);

  if (!order) {
    throw new NotFoundError('Ticket order not found', 'order_not_found');
  }

  const isOwner = order.userId === userId;
  const isAdmin = !isOwner && (await canManageMuseum(userId, order.museumId));
  if (!isOwner && !isAdmin) {
    throw new ForbiddenError('Access denied', 'not_owner_or_admin');
  }

  const itemRows = await db
    .select()
    .from(ticketOrderItems)
    .where(eq(ticketOrderItems.ticketOrderId, orderId));

  const [invoiceRow] = await db
    .select()
    .from(ticketInvoices)
    .where(eq(ticketInvoices.ticketOrderId, orderId))
    .limit(1);

  const formattedItems = itemRows.map(formatOrderItem);
  const formattedInvoice = invoiceRow ? formatInvoice(invoiceRow) : null;
  const formattedOrder = formatOrder(order, formattedItems);

  return {
    ...formattedOrder,
    order: formattedOrder,
    items: formattedItems,
    invoice: formattedInvoice,
  };
}

/**
 * Cancels a ticket order. Allowed while status is confirmed and before visit_date (VN time).
 * Accessible by order owner or authorized museum admin.
 */
export async function cancelTicketOrder(
  userId: string,
  orderId: string
): Promise<FormattedTicketOrder> {
  const [order] = await db
    .select()
    .from(ticketOrders)
    .where(eq(ticketOrders.id, orderId))
    .limit(1);

  if (!order) {
    throw new NotFoundError('Ticket order not found', 'order_not_found');
  }

  const isOwner = order.userId === userId;
  const isAdmin = !isOwner && (await canManageMuseum(userId, order.museumId));
  if (!isOwner && !isAdmin) {
    throw new ForbiddenError('Access denied', 'not_owner_or_admin');
  }

  if (order.status !== 'confirmed') {
    throw new BadRequestError('Order is not cancellable', 'order_not_cancellable');
  }

  if (isVisitDateNotFutureVN(order.visitDate)) {
    throw new BadRequestError('Visit date has passed or is today', 'visit_date_passed');
  }

  const [updated] = await db
    .update(ticketOrders)
    .set({ status: 'cancelled' })
    .where(and(eq(ticketOrders.id, orderId), eq(ticketOrders.status, 'confirmed')))
    .returning();

  if (!updated) {
    throw new BadRequestError('Order is not cancellable', 'order_not_cancellable');
  }

  return formatOrder(updated);
}

/**
 * Lists ticket orders for an admin-managed museum with filtering by visit_date and status.
 */
export async function listAdminMuseumTicketOrders(
  userId: string,
  museumId: string,
  options: {
    limit: number;
    offset: number;
    visit_date?: string;
    status?: string;
  }
): Promise<{ orders: FormattedTicketOrder[]; total: number }> {
  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(eq(museums.id, museumId))
    .limit(1);

  if (!museum) {
    throw new NotFoundError('Museum not found');
  }

  const allowed = await canManageMuseum(userId, museumId);
  if (!allowed) {
    throw new ForbiddenError('Museum admin access required', 'not_museum_admin');
  }

  const conditions = [eq(ticketOrders.museumId, museumId)];
  if (options.visit_date) {
    conditions.push(eq(ticketOrders.visitDate, options.visit_date));
  }
  if (options.status) {
    conditions.push(eq(ticketOrders.status, options.status as any));
  }

  const whereCondition = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(ticketOrders)
    .where(whereCondition);

  const rows = await db
    .select()
    .from(ticketOrders)
    .where(whereCondition)
    .orderBy(desc(ticketOrders.createdAt))
    .limit(options.limit)
    .offset(options.offset);

  return {
    orders: rows.map((row) => formatOrder(row)),
    total: Number(total),
  };
}

/**
 * Redeems an entry code for admission.
 * Runs in a transaction with row lock, verifies museum admin rights, confirmed status,
 * and current date in Vietnam timezone.
 */
export async function redeemTicketOrder(
  userId: string,
  entryCode: string
): Promise<{ ok: boolean }> {
  return await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(ticketOrders)
      .where(eq(ticketOrders.entryCode, entryCode))
      .for('update')
      .limit(1);

    if (!order) {
      throw new NotFoundError('Entry code not found', 'entry_code_not_found');
    }

    // Authorize against the order's museum before revealing status or visit date
    const allowed = await canManageMuseum(userId, order.museumId);
    if (!allowed) {
      throw new ForbiddenError('Not museum admin', 'not_museum_admin');
    }

    const todayVN = getTodayVN();
    if (order.status === 'used') {
      throw new BadRequestError('Already used', 'already_used');
    }
    if (order.status !== 'confirmed') {
      throw new BadRequestError('Order is not confirmed', 'order_not_confirmed');
    }
    if (order.visitDate !== todayVN) {
      throw new BadRequestError('Wrong visit date', 'wrong_visit_date');
    }

    const updated = await tx
      .update(ticketOrders)
      .set({ status: 'used', usedAt: new Date() })
      .where(and(eq(ticketOrders.id, order.id), eq(ticketOrders.status, 'confirmed')))
      .returning({ id: ticketOrders.id });

    if (updated.length === 0) {
      throw new BadRequestError('Already used', 'already_used');
    }

    return { ok: true };
  });
}
