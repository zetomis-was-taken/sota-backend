import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { cartItems, carts, museums, souvenirProducts } from '../db/schema';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors';

export interface CartProductSummary {
  id: string;
  name: string;
  price: string;
  currency: string;
  stock_quantity: number;
  status: string;
}

export interface FormattedCartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  created_at: Date;
  updated_at: Date;
  product?: CartProductSummary;
}

export interface FormattedCart {
  id: string;
  user_id: string;
  museum_id: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  items: FormattedCartItem[];
}

/** Lists active carts belonging to the user with items and product summaries. */
export async function getUserActiveCarts(
  userId: string
): Promise<FormattedCart[]> {
  const cartRows = await db
    .select()
    .from(carts)
    .where(and(eq(carts.userId, userId), eq(carts.status, 'active')))
    .orderBy(desc(carts.createdAt));

  if (cartRows.length === 0) {
    return [];
  }

  const cartIds = cartRows.map((c) => c.id);
  const itemRows = await db
    .select()
    .from(cartItems)
    .where(inArray(cartItems.cartId, cartIds));

  const productIds = Array.from(new Set(itemRows.map((i) => i.productId)));
  const products =
    productIds.length > 0
      ? await db
          .select({
            id: souvenirProducts.id,
            name: souvenirProducts.name,
            price: souvenirProducts.price,
            currency: souvenirProducts.currency,
            stockQuantity: souvenirProducts.stockQuantity,
            status: souvenirProducts.status,
          })
          .from(souvenirProducts)
          .where(inArray(souvenirProducts.id, productIds))
      : [];

  const productMap = new Map(products.map((p) => [p.id, p]));

  return cartRows.map((cart) => {
    const items = itemRows
      .filter((item) => item.cartId === cart.id)
      .map((item) => {
        const prod = productMap.get(item.productId);
        return {
          id: item.id,
          cart_id: item.cartId,
          product_id: item.productId,
          quantity: item.quantity,
          created_at: item.createdAt,
          updated_at: item.updatedAt,
          product: prod
            ? {
                id: prod.id,
                name: prod.name,
                price: prod.price,
                currency: prod.currency,
                stock_quantity: prod.stockQuantity,
                status: prod.status,
              }
            : undefined,
        };
      });

    return {
      id: cart.id,
      user_id: cart.userId,
      museum_id: cart.museumId,
      status: cart.status,
      created_at: cart.createdAt,
      updated_at: cart.updatedAt,
      items,
    };
  });
}

/** Creates a new active cart for a museum. Rejects if an active cart already exists for this museum. */
export async function createCart(
  userId: string,
  museumId: string
): Promise<FormattedCart> {
  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(eq(museums.id, museumId))
    .limit(1);

  if (!museum) {
    throw new NotFoundError('Museum not found');
  }

  const [existing] = await db
    .select({ id: carts.id })
    .from(carts)
    .where(
      and(
        eq(carts.userId, userId),
        eq(carts.museumId, museumId),
        eq(carts.status, 'active')
      )
    )
    .limit(1);

  if (existing) {
    throw new ConflictError(
      'Active cart already exists for this museum',
      'active_cart_exists'
    );
  }

  const [created] = await db
    .insert(carts)
    .values({
      userId,
      museumId,
      status: 'active',
    })
    .returning();

  return {
    id: created.id,
    user_id: created.userId,
    museum_id: created.museumId,
    status: created.status,
    created_at: created.createdAt,
    updated_at: created.updatedAt,
    items: [],
  };
}

/** Updates cart status. Only 'abandoned' is client-settable. */
export async function updateCartStatus(
  userId: string,
  cartId: string,
  status: 'abandoned'
): Promise<FormattedCart> {
  const [cart] = await db
    .select()
    .from(carts)
    .where(eq(carts.id, cartId))
    .limit(1);

  if (!cart) {
    throw new NotFoundError('Cart not found');
  }

  if (cart.userId !== userId) {
    throw new ForbiddenError('Forbidden', 'forbidden');
  }

  if (cart.status === 'converted') {
    throw new BadRequestError(
      'Converted carts cannot be abandoned',
      'cart_converted'
    );
  }

  const [updated] = await db
    .update(carts)
    .set({ status, updatedAt: new Date() })
    .where(eq(carts.id, cartId))
    .returning();

  return {
    id: updated.id,
    user_id: updated.userId,
    museum_id: updated.museumId,
    status: updated.status,
    created_at: updated.createdAt,
    updated_at: updated.updatedAt,
    items: [],
  };
}

/** Deletes a cart. Converted carts cannot be deleted. */
export async function deleteCart(
  userId: string,
  cartId: string
): Promise<{ id: string; deleted: boolean }> {
  const [cart] = await db
    .select()
    .from(carts)
    .where(eq(carts.id, cartId))
    .limit(1);

  if (!cart) {
    throw new NotFoundError('Cart not found');
  }

  if (cart.userId !== userId) {
    throw new ForbiddenError('Forbidden', 'forbidden');
  }

  if (cart.status === 'converted') {
    throw new BadRequestError(
      'Converted carts cannot be deleted',
      'cart_converted'
    );
  }

  await db.delete(carts).where(eq(carts.id, cartId));

  return { id: cartId, deleted: true };
}

/** Adds an item to an active cart. */
export async function addItemToCart(
  userId: string,
  cartId: string,
  productId: string,
  quantity: number
): Promise<FormattedCartItem> {
  const [cart] = await db
    .select()
    .from(carts)
    .where(eq(carts.id, cartId))
    .limit(1);

  if (!cart) {
    throw new NotFoundError('Cart not found');
  }

  if (cart.userId !== userId) {
    throw new ForbiddenError('Forbidden', 'forbidden');
  }

  if (cart.status !== 'active') {
    throw new BadRequestError('Cart is not active', 'cart_not_active');
  }

  const [product] = await db
    .select()
    .from(souvenirProducts)
    .where(eq(souvenirProducts.id, productId))
    .limit(1);

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  if (product.museumId !== cart.museumId) {
    throw new BadRequestError(
      'Product belongs to a different museum',
      'product_museum_mismatch'
    );
  }

  const [existingItem] = await db
    .select({ id: cartItems.id })
    .from(cartItems)
    .where(
      and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId))
    )
    .limit(1);

  if (existingItem) {
    throw new ConflictError(
      'Product already exists in cart',
      'item_already_exists'
    );
  }

  const [created] = await db
    .insert(cartItems)
    .values({
      cartId,
      productId,
      quantity,
    })
    .returning();

  return {
    id: created.id,
    cart_id: created.cartId,
    product_id: created.productId,
    quantity: created.quantity,
    created_at: created.createdAt,
    updated_at: created.updatedAt,
    product: {
      id: product.id,
      name: product.name,
      price: product.price,
      currency: product.currency,
      stock_quantity: product.stockQuantity,
      status: product.status,
    },
  };
}

/** Updates the quantity of a cart item in an active cart. */
export async function updateCartItem(
  userId: string,
  cartId: string,
  itemId: string,
  quantity: number
): Promise<FormattedCartItem> {
  const [cart] = await db
    .select()
    .from(carts)
    .where(eq(carts.id, cartId))
    .limit(1);

  if (!cart) {
    throw new NotFoundError('Cart not found');
  }

  if (cart.userId !== userId) {
    throw new ForbiddenError('Forbidden', 'forbidden');
  }

  if (cart.status !== 'active') {
    throw new BadRequestError('Cart is not active', 'cart_not_active');
  }

  const [item] = await db
    .select()
    .from(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)))
    .limit(1);

  if (!item) {
    throw new NotFoundError('Cart item not found');
  }

  const [updated] = await db
    .update(cartItems)
    .set({ quantity, updatedAt: new Date() })
    .where(eq(cartItems.id, itemId))
    .returning();

  return {
    id: updated.id,
    cart_id: updated.cartId,
    product_id: updated.productId,
    quantity: updated.quantity,
    created_at: updated.createdAt,
    updated_at: updated.updatedAt,
  };
}

/** Removes an item from an active cart. */
export async function deleteCartItem(
  userId: string,
  cartId: string,
  itemId: string
): Promise<{ id: string; deleted: boolean }> {
  const [cart] = await db
    .select()
    .from(carts)
    .where(eq(carts.id, cartId))
    .limit(1);

  if (!cart) {
    throw new NotFoundError('Cart not found');
  }

  if (cart.userId !== userId) {
    throw new ForbiddenError('Forbidden', 'forbidden');
  }

  if (cart.status !== 'active') {
    throw new BadRequestError('Cart is not active', 'cart_not_active');
  }

  const [item] = await db
    .select({ id: cartItems.id })
    .from(cartItems)
    .where(and(eq(cartItems.id, itemId), eq(cartItems.cartId, cartId)))
    .limit(1);

  if (!item) {
    throw new NotFoundError('Cart item not found');
  }

  await db.delete(cartItems).where(eq(cartItems.id, itemId));

  return { id: itemId, deleted: true };
}
