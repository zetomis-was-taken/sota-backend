import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  cartItems,
  carts,
  museums,
  shopInvoices,
  shopOrderItems,
  shopOrders,
  souvenirProducts,
  users,
} from '../db/schema';
import { canManageMuseum } from '../lib/auth';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors';
import { nextInvoiceNumber } from '../lib/invoice';
import { formatMinorUnitsAsMoney, parseMoneyToMinorUnits } from '../lib/money';

export const FLAT_SHIPPING_FEE = '30000.00';

export interface CheckoutCartInput {
  cartId: string;
  userId: string;
  userEmail?: string | null;
  shipping_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city?: string | null;
}

export interface FormattedShopOrderItem {
  id: string;
  order_id: string;
  orderId: string;
  product_id: string;
  productId: string;
  product_name: string;
  productName: string;
  unit_price: string;
  unitPrice: string;
  quantity: number;
  line_total: string;
  lineTotal: string;
  created_at: Date;
  createdAt: Date;
  updated_at: Date;
  updatedAt: Date;
}

export interface FormattedShopOrder {
  id: string;
  user_id: string;
  userId: string;
  museum_id: string;
  museumId: string;
  status: string;
  payment_status: string;
  paymentStatus: string;
  subtotal: string;
  shipping_fee: string;
  shippingFee: string;
  total_amount: string;
  totalAmount: string;
  currency: string;
  shipping_name: string;
  shippingName: string;
  shipping_phone: string;
  shippingPhone: string;
  shipping_address: string;
  shippingAddress: string;
  shipping_city: string | null;
  shippingCity: string | null;
  created_at: Date;
  createdAt: Date;
  updated_at: Date;
  updatedAt: Date;
  items: FormattedShopOrderItem[];
}

export interface FormattedShopInvoice {
  id: string;
  order_id: string;
  orderId: string;
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

export interface CheckoutCartResult {
  order: FormattedShopOrder;
  items: FormattedShopOrderItem[];
  invoice: FormattedShopInvoice;
}

function formatShopOrderItem(item: any): FormattedShopOrderItem {
  return {
    id: item.id,
    order_id: item.orderId ?? item.order_id,
    orderId: item.orderId ?? item.order_id,
    product_id: item.productId ?? item.product_id,
    productId: item.productId ?? item.product_id,
    product_name: item.productName ?? item.product_name,
    productName: item.productName ?? item.product_name,
    unit_price: item.unitPrice ?? item.unit_price,
    unitPrice: item.unitPrice ?? item.unit_price,
    quantity: item.quantity,
    line_total: item.lineTotal ?? item.line_total,
    lineTotal: item.lineTotal ?? item.line_total,
    created_at: item.createdAt ?? item.created_at,
    createdAt: item.createdAt ?? item.created_at,
    updated_at: item.updatedAt ?? item.updated_at,
    updatedAt: item.updatedAt ?? item.updated_at,
  };
}

function formatShopOrder(
  order: any,
  items: FormattedShopOrderItem[] = []
): FormattedShopOrder {
  return {
    id: order.id,
    user_id: order.userId ?? order.user_id,
    userId: order.userId ?? order.user_id,
    museum_id: order.museumId ?? order.museum_id,
    museumId: order.museumId ?? order.museum_id,
    status: order.status,
    payment_status: order.paymentStatus ?? order.payment_status,
    paymentStatus: order.paymentStatus ?? order.payment_status,
    subtotal: order.subtotal,
    shipping_fee: order.shippingFee ?? order.shipping_fee,
    shippingFee: order.shippingFee ?? order.shipping_fee,
    total_amount: order.totalAmount ?? order.total_amount,
    totalAmount: order.totalAmount ?? order.total_amount,
    currency: order.currency,
    shipping_name: order.shippingName ?? order.shipping_name,
    shippingName: order.shippingName ?? order.shipping_name,
    shipping_phone: order.shippingPhone ?? order.shipping_phone,
    shippingPhone: order.shippingPhone ?? order.shipping_phone,
    shipping_address: order.shippingAddress ?? order.shipping_address,
    shippingAddress: order.shippingAddress ?? order.shipping_address,
    shipping_city: order.shippingCity ?? order.shipping_city ?? null,
    shippingCity: order.shippingCity ?? order.shipping_city ?? null,
    created_at: order.createdAt ?? order.created_at,
    createdAt: order.createdAt ?? order.created_at,
    updated_at: order.updatedAt ?? order.updated_at,
    updatedAt: order.updatedAt ?? order.updated_at,
    items,
  };
}

function formatShopInvoice(invoice: any): FormattedShopInvoice {
  return {
    id: invoice.id,
    order_id: invoice.orderId ?? invoice.order_id,
    orderId: invoice.orderId ?? invoice.order_id,
    invoice_number: invoice.invoiceNumber ?? invoice.invoice_number,
    invoiceNumber: invoice.invoiceNumber ?? invoice.invoice_number,
    issued_at: invoice.issuedAt ?? invoice.issued_at,
    issuedAt: invoice.issuedAt ?? invoice.issued_at,
    billing_name: invoice.billingName ?? invoice.billing_name,
    billingName: invoice.billingName ?? invoice.billing_name,
    billing_email: invoice.billingEmail ?? invoice.billing_email,
    billingEmail: invoice.billingEmail ?? invoice.billing_email,
    total_amount: invoice.totalAmount ?? invoice.total_amount,
    totalAmount: invoice.totalAmount ?? invoice.total_amount,
    currency: invoice.currency,
  };
}

/**
 * Executes cart checkout in a single database transaction.
 */
export async function checkoutCart(
  input: CheckoutCartInput
): Promise<CheckoutCartResult> {
  const {
    cartId,
    userId,
    userEmail,
    shipping_name,
    shipping_phone,
    shipping_address,
    shipping_city,
  } = input;

  return await db.transaction(async (tx) => {
    // 1. Lock cart
    const [cart] = await tx
      .select()
      .from(carts)
      .where(eq(carts.id, cartId))
      .for('update')
      .limit(1);

    if (!cart) {
      throw new NotFoundError('Cart not found', 'cart_not_found');
    }
    if (cart.userId !== userId) {
      throw new ForbiddenError('Forbidden', 'forbidden');
    }
    if (cart.status !== 'active') {
      throw new BadRequestError('Cart is not active', 'cart_not_active');
    }

    // 2. Lock cart items
    const items = await tx
      .select()
      .from(cartItems)
      .where(eq(cartItems.cartId, cartId))
      .orderBy(asc(cartItems.id))
      .for('update');

    if (items.length === 0) {
      throw new BadRequestError('Cart is empty', 'cart_empty');
    }

    // 3. Lock products ordered by ID to prevent deadlock
    const productIds = items.map((i) => i.productId).sort();
    const products = await tx
      .select()
      .from(souvenirProducts)
      .where(inArray(souvenirProducts.id, productIds))
      .orderBy(asc(souvenirProducts.id))
      .for('update');

    // 4. Validate museum is published
    const [museum] = await tx
      .select()
      .from(museums)
      .where(eq(museums.id, cart.museumId))
      .for('share')
      .limit(1);

    if (!museum || museum.status !== 'published') {
      throw new BadRequestError(
        'Museum or product unavailable',
        'product_unavailable'
      );
    }

    // 5. Re-check each item
    let subtotalMinorUnits = 0n;
    const orderItemValues = items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product || product.status !== 'published') {
        throw new BadRequestError(
          `Product ${item.productId} is unavailable`,
          'product_unavailable'
        );
      }
      if (product.museumId !== cart.museumId) {
        throw new BadRequestError(
          `Product ${item.productId} is unavailable`,
          'product_unavailable'
        );
      }
      if (product.stockQuantity < item.quantity) {
        throw new BadRequestError(
          `Product ${product.name} is out of stock`,
          'out_of_stock'
        );
      }

      subtotalMinorUnits +=
        parseMoneyToMinorUnits(product.price) * BigInt(item.quantity);

      return {
        productId: item.productId,
        productName: product.name,
        unitPrice: product.price,
        quantity: item.quantity,
      };
    });

    // 6. Conditionally decrement stock
    for (const item of items) {
      const updated = await tx
        .update(souvenirProducts)
        .set({ stockQuantity: sql`stock_quantity - ${item.quantity}` })
        .where(
          and(
            eq(souvenirProducts.id, item.productId),
            sql`stock_quantity >= ${item.quantity}`
          )
        )
        .returning({ id: souvenirProducts.id });

      if (!updated.length) {
        throw new BadRequestError('Out of stock (concurrent)', 'out_of_stock');
      }
    }

    // 7. Calculate amounts
    const subtotal = formatMinorUnitsAsMoney(subtotalMinorUnits);
    const shippingFee = FLAT_SHIPPING_FEE;
    const totalMinorUnits =
      subtotalMinorUnits + parseMoneyToMinorUnits(shippingFee);
    const calculatedTotalAmount = formatMinorUnitsAsMoney(totalMinorUnits);

    // 8. Create shop order
    const [order] = await tx
      .insert(shopOrders)
      .values({
        userId,
        museumId: cart.museumId,
        status: 'confirmed',
        paymentStatus: 'paid',
        subtotal,
        shippingFee,
        currency: 'VND',
        shippingName: shipping_name,
        shippingPhone: shipping_phone,
        shippingAddress: shipping_address,
        shippingCity: shipping_city ?? null,
      })
      .returning();

    // 9. Insert shop order items
    const insertedItems = await tx
      .insert(shopOrderItems)
      .values(
        orderItemValues.map((v) => ({
          orderId: order.id,
          productId: v.productId,
          productName: v.productName,
          unitPrice: v.unitPrice,
          quantity: v.quantity,
        }))
      )
      .returning();

    // 10. Generate invoice
    const invoiceNumber = await nextInvoiceNumber('SHP', tx);
    const [profile] = await tx
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const [invoice] = await tx
      .insert(shopInvoices)
      .values({
        orderId: order.id,
        invoiceNumber,
        billingName: profile?.displayName || shipping_name || 'Customer',
        billingEmail: userEmail ?? '',
        totalAmount: order.totalAmount ?? calculatedTotalAmount,
        currency: 'VND',
      })
      .returning();

    // 11. Mark cart converted
    await tx
      .update(carts)
      .set({ status: 'converted' })
      .where(eq(carts.id, cartId));

    const formattedItems = insertedItems.map(formatShopOrderItem);
    const formattedOrder = formatShopOrder(order, formattedItems);
    const formattedInvoice = formatShopInvoice(invoice);

    return {
      order: formattedOrder,
      items: formattedItems,
      invoice: formattedInvoice,
    };
  });
}

/**
 * Returns a paginated list of shop orders belonging to the user.
 */
export async function listUserShopOrders(
  userId: string,
  limit: number,
  offset: number
): Promise<{ orders: FormattedShopOrder[]; total: number }> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(shopOrders)
    .where(eq(shopOrders.userId, userId));

  const rows = await db
    .select()
    .from(shopOrders)
    .where(eq(shopOrders.userId, userId))
    .orderBy(desc(shopOrders.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    orders: rows.map((row) => formatShopOrder(row)),
    total: Number(total),
  };
}

/**
 * Returns detail of a shop order with items and invoice.
 * Accessible by order owner or authorized museum admin.
 */
export async function getShopOrderById(
  userId: string,
  orderId: string
): Promise<{
  order: FormattedShopOrder;
  items: FormattedShopOrderItem[];
  invoice: FormattedShopInvoice | null;
}> {
  const [order] = await db
    .select()
    .from(shopOrders)
    .where(eq(shopOrders.id, orderId))
    .limit(1);

  if (!order) {
    throw new NotFoundError('Shop order not found', 'order_not_found');
  }

  const isOwner = order.userId === userId;
  const isAdmin = !isOwner && (await canManageMuseum(userId, order.museumId));
  if (!isOwner && !isAdmin) {
    throw new ForbiddenError('Access denied', 'not_owner_or_admin');
  }

  const itemRows = await db
    .select()
    .from(shopOrderItems)
    .where(eq(shopOrderItems.orderId, orderId));

  const [invoiceRow] = await db
    .select()
    .from(shopInvoices)
    .where(eq(shopInvoices.orderId, orderId))
    .limit(1);

  const formattedItems = itemRows.map(formatShopOrderItem);
  const formattedOrder = formatShopOrder(order, formattedItems);
  const formattedInvoice = invoiceRow ? formatShopInvoice(invoiceRow) : null;

  return {
    order: formattedOrder,
    items: formattedItems,
    invoice: formattedInvoice,
  };
}

/**
 * Cancels a confirmed shop order and restores product inventory in a single transaction.
 */
export async function cancelShopOrder(
  userId: string,
  orderId: string
): Promise<FormattedShopOrder> {
  return await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(shopOrders)
      .where(eq(shopOrders.id, orderId))
      .for('update')
      .limit(1);

    if (!order) {
      throw new NotFoundError('Shop order not found', 'order_not_found');
    }

    const isOwner = order.userId === userId;
    const isAdmin = !isOwner && (await canManageMuseum(userId, order.museumId));
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Access denied', 'not_owner_or_admin');
    }

    if (order.status === 'shipped' || order.status === 'completed') {
      throw new BadRequestError('Order has already been shipped', 'already_shipped');
    }

    if (order.status !== 'confirmed') {
      throw new BadRequestError('Order is not cancellable', 'order_not_cancellable');
    }

    const items = await tx
      .select()
      .from(shopOrderItems)
      .where(eq(shopOrderItems.orderId, orderId))
      .for('update');

    // Sort by productId to guarantee deadlock-free locking
    const sortedItems = [...items].sort((a, b) =>
      a.productId.localeCompare(b.productId)
    );

    for (const item of sortedItems) {
      await tx
        .update(souvenirProducts)
        .set({ stockQuantity: sql`stock_quantity + ${item.quantity}` })
        .where(eq(souvenirProducts.id, item.productId));
    }

    const [updated] = await tx
      .update(shopOrders)
      .set({ status: 'cancelled' })
      .where(and(eq(shopOrders.id, orderId), eq(shopOrders.status, 'confirmed')))
      .returning();

    if (!updated) {
      throw new BadRequestError('Order is not cancellable', 'order_not_cancellable');
    }

    return formatShopOrder(updated);
  });
}

/**
 * Lists shop orders for a managed museum with optional status filtering.
 */
export async function listAdminMuseumShopOrders(
  userId: string,
  museumId: string,
  options: {
    limit: number;
    offset: number;
    status?: string;
  }
): Promise<{ orders: FormattedShopOrder[]; total: number }> {
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

  const conditions = [eq(shopOrders.museumId, museumId)];
  if (options.status) {
    conditions.push(eq(shopOrders.status, options.status as any));
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(shopOrders)
    .where(and(...conditions));

  const rows = await db
    .select()
    .from(shopOrders)
    .where(and(...conditions))
    .orderBy(desc(shopOrders.createdAt))
    .limit(options.limit)
    .offset(options.offset);

  return {
    orders: rows.map((row) => formatShopOrder(row)),
    total: Number(total),
  };
}

/**
 * Updates fulfillment status of a shop order: confirmed -> shipped -> completed.
 */
export async function updateShopOrderFulfillment(
  userId: string,
  orderId: string,
  newStatus: 'shipped' | 'completed'
): Promise<FormattedShopOrder> {
  const [order] = await db
    .select()
    .from(shopOrders)
    .where(eq(shopOrders.id, orderId))
    .limit(1);

  if (!order) {
    throw new NotFoundError('Shop order not found', 'order_not_found');
  }

  const allowed = await canManageMuseum(userId, order.museumId);
  if (!allowed) {
    throw new ForbiddenError('Museum admin access required', 'not_museum_admin');
  }

  const validFrom = newStatus === 'shipped' ? 'confirmed' : 'shipped';
  if (order.status !== validFrom) {
    throw new BadRequestError(
      `Invalid fulfillment status transition from ${order.status} to ${newStatus}`,
      'invalid_transition'
    );
  }

  const [updated] = await db
    .update(shopOrders)
    .set({ status: newStatus })
    .where(and(eq(shopOrders.id, orderId), eq(shopOrders.status, validFrom)))
    .returning();

  if (!updated) {
    throw new BadRequestError(
      'Invalid fulfillment status transition',
      'invalid_transition'
    );
  }

  return formatShopOrder(updated);
}
