import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { createApp } from '../../src/app';

interface MuseumRecord {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
}

interface ProductRecord {
  id: string;
  museumId: string;
  name: string;
  price: string;
  stockQuantity: number;
  status: 'draft' | 'published' | 'archived';
}

interface CartRecord {
  id: string;
  userId: string;
  museumId: string;
  status: 'active' | 'converted' | 'abandoned';
}

interface CartItemRecord {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
}

interface UserProfile {
  id: string;
  displayName: string | null;
  email: string | null;
}

interface MembershipRecord {
  museumId: string;
  userId: string;
  status: 'active' | 'suspended' | 'revoked';
}

const { mockGetUser, mockState, mockDb } = vi.hoisted(() => {
  const mockGetUser = vi.fn();

  const mockState = {
    users: new Map<string, UserProfile>(),
    userRoles: new Map<string, Set<string>>(),
    memberships: [] as MembershipRecord[],
    museums: new Map<string, MuseumRecord>(),
    products: new Map<string, ProductRecord>(),
    carts: new Map<string, CartRecord>(),
    cartItems: [] as CartItemRecord[],
    shopOrders: new Map<string, any>(),
    shopOrderItems: [] as any[],
    shopInvoices: new Map<string, any>(),
    invoiceSeq: 1,
    failStockUpdate: false,
    failTransaction: false,
  };

  interface FilterConditions {
    eq: Record<string, unknown>;
    in: Record<string, unknown[]>;
  }

  function extractFilters(
    node: unknown,
    out: FilterConditions = { eq: {}, in: {} }
  ): FilterConditions {
    if (!node || typeof node !== 'object') {
      return out;
    }
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (!Array.isArray(chunks)) {
      return out;
    }

    let currentCol: string | null = null;
    let isIn = false;

    for (const chunk of chunks) {
      if (chunk && typeof chunk === 'object') {
        const candidate = chunk as any;
        if (Array.isArray(candidate.queryChunks)) {
          extractFilters(candidate, out);
        } else if (typeof candidate.name === 'string' && candidate.table) {
          currentCol = candidate.name;
        } else if (
          Array.isArray(candidate.value) &&
          candidate.value.some(
            (v: any) => typeof v === 'string' && v.includes('in')
          )
        ) {
          isIn = true;
        } else if (Array.isArray(candidate) && isIn && currentCol) {
          out.in[currentCol] = candidate.map((p: any) => p?.value ?? p);
          currentCol = null;
          isIn = false;
        } else if ('encoder' in candidate && currentCol) {
          out.eq[currentCol] = candidate.value;
          currentCol = null;
        }
      }
    }
    return out;
  }

  const handleSelectRows = (table: any, cond: any, _fields?: any) => {
    let tableName = '';
    try {
      tableName = getTableName(table);
    } catch {
      tableName = '';
    }

    const filters = extractFilters(cond);

    if (tableName === 'users') {
      const idFilter = filters.eq.id;
      if (idFilter) {
        const user = mockState.users.get(String(idFilter));
        return user ? [{ id: user.id, displayName: user.displayName }] : [];
      }
      return Array.from(mockState.users.values());
    }

    if (tableName === 'user_roles') {
      const rows: any[] = [];
      const uidFilter = filters.eq.userId ?? filters.eq.user_id;
      for (const [uid, rSet] of mockState.userRoles.entries()) {
        if (!uidFilter || uid === uidFilter) {
          for (const r of rSet) {
            rows.push({ userId: uid, role: r });
          }
        }
      }
      return rows;
    }

    if (tableName === 'museum_admins') {
      let list = [...mockState.memberships];
      const uidFilter = filters.eq.userId ?? filters.eq.user_id;
      const midFilter = filters.eq.museumId ?? filters.eq.museum_id;
      if (uidFilter) {
        list = list.filter((m) => m.userId === uidFilter);
      }
      if (midFilter) {
        list = list.filter((m) => m.museumId === midFilter);
      }
      return list;
    }

    if (tableName === 'museums') {
      const idFilter = filters.eq.id;
      if (idFilter) {
        const m = mockState.museums.get(String(idFilter));
        return m ? [m] : [];
      }
      return Array.from(mockState.museums.values());
    }

    if (tableName === 'carts') {
      const idFilter = filters.eq.id;
      if (idFilter) {
        const c = mockState.carts.get(String(idFilter));
        return c ? [c] : [];
      }
      return Array.from(mockState.carts.values());
    }

    if (tableName === 'cart_items') {
      let list = [...mockState.cartItems];
      const cartIdFilter = filters.eq.cartId ?? filters.eq.cart_id;
      if (cartIdFilter) {
        list = list.filter((i) => i.cartId === cartIdFilter);
      }
      return list;
    }

    if (tableName === 'souvenir_products') {
      let list = Array.from(mockState.products.values());
      const inIds = filters.in.id;
      const eqId = filters.eq.id;
      if (inIds && Array.isArray(inIds)) {
        list = list.filter((p) => inIds.includes(p.id));
      } else if (eqId) {
        list = list.filter((p) => p.id === eqId);
      }
      return list;
    }

    if (tableName === 'shop_orders') {
      const idFilter = filters.eq.id;
      if (idFilter) {
        const o = mockState.shopOrders.get(String(idFilter));
        return o ? [o] : [];
      }
      return Array.from(mockState.shopOrders.values());
    }

    if (tableName === 'shop_order_items') {
      let list = [...mockState.shopOrderItems];
      const orderIdFilter = filters.eq.orderId ?? filters.eq.order_id;
      if (orderIdFilter) {
        list = list.filter((i) => (i.orderId ?? i.order_id) === orderIdFilter);
      }
      return list;
    }

    if (tableName === 'shop_invoices') {
      const orderIdFilter = filters.eq.orderId ?? filters.eq.order_id;
      if (orderIdFilter) {
        return Array.from(mockState.shopInvoices.values()).filter(
          (inv) => (inv.orderId ?? inv.order_id) === orderIdFilter
        );
      }
      return Array.from(mockState.shopInvoices.values());
    }

    return [];
  };

  const handleInsert = (table: any) => ({
    values: vi.fn((val: any) => {
      const vals = Array.isArray(val) ? val : [val];
      return {
        onConflictDoNothing: vi.fn(async () => {
          for (const item of vals) {
            if (item.id && !mockState.users.has(item.id)) {
              mockState.users.set(item.id, {
                id: item.id,
                displayName: item.displayName ?? null,
                email: null,
              });
            }
            if (item.userId && item.role) {
              const roles =
                mockState.userRoles.get(item.userId) ?? new Set<string>();
              roles.add(item.role);
              mockState.userRoles.set(item.userId, roles);
            }
          }
        }),
        returning: vi.fn(async () => {
          const inserted: any[] = [];
          for (const item of vals) {
            const now = new Date();
            const id =
              item.id ?? `id-${Math.random().toString(36).slice(2, 10)}`;
            const record = {
              ...item,
              id,
              createdAt: now,
              updatedAt: now,
              issuedAt: now,
              lineTotal:
                item.unitPrice && item.quantity
                  ? (Number(item.unitPrice) * item.quantity).toFixed(2)
                  : '0.00',
              totalAmount:
                item.subtotal && item.shippingFee
                  ? (Number(item.subtotal) + Number(item.shippingFee)).toFixed(2)
                  : item.totalAmount ?? '0.00',
            };
            if (item.shippingAddress) {
              mockState.shopOrders.set(id, record);
            } else if (item.invoiceNumber) {
              mockState.shopInvoices.set(id, record);
            } else if (item.orderId && item.productId) {
              mockState.shopOrderItems.push(record);
            }
            inserted.push(record);
          }
          return inserted;
        }),
      };
    }),
  });

  const handleUpdate = (table: any) => ({
    set: vi.fn((values: any) => ({
      where: vi.fn((cond: any) => {
        let tableName = '';
        try {
          tableName = getTableName(table);
        } catch {
          tableName = '';
        }

        const filters = extractFilters(cond);
        const targetId = (filters.eq.id ?? '') as string;

        if (tableName === 'souvenir_products') {
          if (mockState.failStockUpdate) {
            return { returning: vi.fn(async () => []) };
          }
          const product = mockState.products.get(targetId);
          if (!product) {
            return { returning: vi.fn(async () => []) };
          }
          const qty =
            values.stockQuantity?.queryChunks?.find(
              (c: any) => typeof c === 'number'
            ) ?? 1;
          if (product.stockQuantity < qty) {
            return { returning: vi.fn(async () => []) };
          }
          product.stockQuantity -= qty;
          mockState.products.set(targetId, product);
          return {
            returning: vi.fn(async () => [{ id: product.id }]),
          };
        }

        if (tableName === 'carts') {
          const cart = mockState.carts.get(targetId);
          if (!cart) {
            return { returning: vi.fn(async () => []) };
          }
          if (values.status) {
            cart.status = values.status;
          }
          mockState.carts.set(targetId, cart);
          return {
            returning: vi.fn(async () => [cart]),
          };
        }

        return {
          returning: vi.fn(async () => []),
        };
      }),
    })),
  });

  const createQueryChain = (table: any, cond?: any, fields?: any) => {
    let currentLimit = Infinity;
    let currentOffset = 0;

    const chain: any = {
      for: vi.fn(() => chain),
      where: vi.fn((newCond: any) => createQueryChain(table, newCond, fields)),
      orderBy: vi.fn(() => chain),
      limit: vi.fn((n: number) => {
        currentLimit = n;
        return chain;
      }),
      offset: vi.fn((n: number) => {
        currentOffset = n;
        return chain;
      }),
      then: (resolve: any, reject?: any) => {
        const rows = handleSelectRows(table, cond, fields);
        const sliced = rows.slice(currentOffset, currentOffset + currentLimit);
        return Promise.resolve(sliced).then(resolve, reject);
      },
    };
    return chain;
  };

  const txObject: any = {
    select: vi.fn((fields?: any) => ({
      from: vi.fn((table: any) => createQueryChain(table, undefined, fields)),
    })),
    insert: vi.fn(handleInsert),
    update: vi.fn(handleUpdate),
    execute: vi.fn(async () => {
      const seq = String(mockState.invoiceSeq++);
      return [{ seq }];
    }),
  };

  const mockDb = {
    transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => {
      if (mockState.failTransaction) {
        throw new Error('Database transaction deadlocked or connection failed');
      }
      return fn(txObject);
    }),
    select: vi.fn((fields?: any) => ({
      from: vi.fn((table: any) => createQueryChain(table, undefined, fields)),
    })),
    insert: vi.fn(handleInsert),
    update: vi.fn(handleUpdate),
  };

  return { mockGetUser, mockState, mockDb, txObject };
});

vi.mock('../../src/db', () => ({
  db: mockDb,
}));

vi.mock('../../src/config/supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
  supabase: {
    auth: {
      getUser: mockGetUser,
    },
  },
}));

describe('POST /api/v1/carts/:cartId/checkout (Phase 4.1)', () => {
  const app = createApp();

  const validUserId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '11111111-1111-4111-8111-111111111112';
  const validMuseumId = '22222222-2222-4222-8222-222222222222';
  const otherMuseumId = '22222222-2222-4222-8222-222222222223';
  const validCartId = '33333333-3333-4333-8333-333333333333';
  const validProductId1 = '44444444-4444-4444-8444-444444444441';
  const validProductId2 = '44444444-4444-4444-8444-444444444442';
  const validToken = 'valid.jwt.token';

  const validCheckoutBody = {
    shipping_name: 'Nguyen Van A',
    shipping_phone: '0901234567',
    shipping_address: '123 Le Loi, District 1',
    shipping_city: 'Ho Chi Minh City',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockState.users.clear();
    mockState.userRoles.clear();
    mockState.memberships = [];
    mockState.museums.clear();
    mockState.products.clear();
    mockState.carts.clear();
    mockState.cartItems = [];
    mockState.shopOrders.clear();
    mockState.shopOrderItems = [];
    mockState.shopInvoices.clear();
    mockState.invoiceSeq = 1;
    mockState.failStockUpdate = false;
    mockState.failTransaction = false;

    mockGetUser.mockImplementation(async (token: string) => {
      if (token === validToken) {
        return {
          data: {
            user: {
              id: validUserId,
              email: 'shopper@example.com',
            },
          },
          error: null,
        };
      }
      return { data: { user: null }, error: { message: 'Invalid token' } };
    });

    mockState.users.set(validUserId, {
      id: validUserId,
      displayName: 'Nguyen Van A',
      email: 'shopper@example.com',
    });

    mockState.userRoles.set(validUserId, new Set(['normal_user']));

    mockState.museums.set(validMuseumId, {
      id: validMuseumId,
      name: 'National History Museum',
      status: 'published',
    });

    mockState.products.set(validProductId1, {
      id: validProductId1,
      museumId: validMuseumId,
      name: 'Bronze Drum Replica',
      price: '150000.00',
      stockQuantity: 10,
      status: 'published',
    });

    mockState.products.set(validProductId2, {
      id: validProductId2,
      museumId: validMuseumId,
      name: 'Traditional Postcard Set',
      price: '50000.00',
      stockQuantity: 20,
      status: 'published',
    });

    mockState.carts.set(validCartId, {
      id: validCartId,
      userId: validUserId,
      museumId: validMuseumId,
      status: 'active',
    });

    mockState.cartItems.push(
      {
        id: 'cart-item-1',
        cartId: validCartId,
        productId: validProductId1,
        quantity: 2,
      },
      {
        id: 'cart-item-2',
        cartId: validCartId,
        productId: validProductId2,
        quantity: 1,
      }
    );
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .send(validCheckoutBody);

    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('unauthorized');
  });

  it('returns 400 validation_error on malformed cartId', async () => {
    const res = await request(app)
      .post('/api/v1/carts/invalid-uuid/checkout')
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('validation_error');
  });

  it('returns 400 validation_error on missing required shipping fields', async () => {
    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        shipping_name: '',
        shipping_phone: '',
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('validation_error');
  });

  it('returns 404 cart_not_found when cart does not exist', async () => {
    mockState.carts.clear();

    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('cart_not_found');
  });

  it('returns 403 forbidden when cart belongs to another user', async () => {
    mockState.carts.set(validCartId, {
      id: validCartId,
      userId: otherUserId,
      museumId: validMuseumId,
      status: 'active',
    });

    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('forbidden');
  });

  it('returns 400 cart_not_active when cart is already converted', async () => {
    mockState.carts.set(validCartId, {
      id: validCartId,
      userId: validUserId,
      museumId: validMuseumId,
      status: 'converted',
    });

    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('cart_not_active');
  });

  it('returns 400 cart_not_active when cart is abandoned', async () => {
    mockState.carts.set(validCartId, {
      id: validCartId,
      userId: validUserId,
      museumId: validMuseumId,
      status: 'abandoned',
    });

    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('cart_not_active');
  });

  it('returns 400 cart_empty when the active cart has no items', async () => {
    mockState.cartItems = [];

    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('cart_empty');
  });

  it('returns 400 product_unavailable when museum is draft or archived', async () => {
    mockState.museums.set(validMuseumId, {
      id: validMuseumId,
      name: 'Draft Museum',
      status: 'draft',
    });

    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('product_unavailable');
  });

  it('returns 400 product_unavailable when museum does not exist', async () => {
    mockState.museums.clear();

    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('product_unavailable');
  });

  it('returns 400 product_unavailable when product is draft', async () => {
    mockState.products.set(validProductId1, {
      id: validProductId1,
      museumId: validMuseumId,
      name: 'Draft Product',
      price: '150000.00',
      stockQuantity: 10,
      status: 'draft',
    });

    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('product_unavailable');
  });

  it('returns 400 product_unavailable when product belongs to another museum', async () => {
    mockState.products.set(validProductId1, {
      id: validProductId1,
      museumId: otherMuseumId,
      name: 'Other Museum Product',
      price: '150000.00',
      stockQuantity: 10,
      status: 'published',
    });

    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('product_unavailable');
  });

  it('returns 400 out_of_stock when product stock is insufficient', async () => {
    mockState.products.set(validProductId1, {
      id: validProductId1,
      museumId: validMuseumId,
      name: 'Bronze Drum Replica',
      price: '150000.00',
      stockQuantity: 1, // cart wants 2
      status: 'published',
    });

    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('out_of_stock');
  });

  it('returns 400 out_of_stock on concurrent stock decrement race failure', async () => {
    mockState.failStockUpdate = true;

    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('out_of_stock');
  });

  it('creates shop_order, items, invoice and marks cart converted on success', async () => {
    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();

    const { order, items, invoice } = res.body.data;

    // Check order
    expect(order).toBeDefined();
    expect(order.status).toBe('confirmed');
    expect(order.payment_status ?? order.paymentStatus).toBe('paid');
    expect(order.subtotal).toBe('350000.00'); // (150000 * 2) + (50000 * 1)
    expect(order.shipping_fee ?? order.shippingFee).toBe('30000.00');
    expect(order.total_amount ?? order.totalAmount).toBe('380000.00');
    expect(order.shipping_name ?? order.shippingName).toBe('Nguyen Van A');
    expect(order.shipping_phone ?? order.shippingPhone).toBe('0901234567');
    expect(order.shipping_address ?? order.shippingAddress).toBe('123 Le Loi, District 1');
    expect(order.shipping_city ?? order.shippingCity).toBe('Ho Chi Minh City');

    // Check order items
    expect(items).toHaveLength(2);
    expect(items[0].product_name ?? items[0].productName).toBe('Bronze Drum Replica');
    expect(items[0].quantity).toBe(2);
    expect(items[0].unit_price ?? items[0].unitPrice).toBe('150000.00');
    expect(items[1].product_name ?? items[1].productName).toBe('Traditional Postcard Set');
    expect(items[1].quantity).toBe(1);

    // Check invoice
    expect(invoice).toBeDefined();
    const invoiceNum = invoice.invoice_number ?? invoice.invoiceNumber;
    expect(invoiceNum).toMatch(/^SHP-/);
    expect(invoice.total_amount ?? invoice.totalAmount).toBe('380000.00');
    expect(invoice.billing_name ?? invoice.billingName).toBe('Nguyen Van A');
    expect(invoice.billing_email ?? invoice.billingEmail).toBe('shopper@example.com');

    // Check stock decrements
    const product1 = mockState.products.get(validProductId1)!;
    const product2 = mockState.products.get(validProductId2)!;
    expect(product1.stockQuantity).toBe(8); // 10 - 2
    expect(product2.stockQuantity).toBe(19); // 20 - 1

    // Check cart status converted
    const cart = mockState.carts.get(validCartId)!;
    expect(cart.status).toBe('converted');
  });

  it('maps transaction failures to a safe 500 error response', async () => {
    mockState.failTransaction = true;

    const res = await request(app)
      .post(`/api/v1/carts/${validCartId}/checkout`)
      .set('Authorization', `Bearer ${validToken}`)
      .send(validCheckoutBody);

    expect(res.status).toBe(500);
    expect(res.body.error?.code).toBe('internal_error');
  });
});
