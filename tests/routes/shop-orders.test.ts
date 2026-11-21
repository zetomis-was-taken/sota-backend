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

  const handleSelectRows = (table: any, cond: any, fields?: any) => {
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
      let list = Array.from(mockState.shopOrders.values());
      const uidFilter = filters.eq.userId ?? filters.eq.user_id;
      if (uidFilter) {
        list = list.filter((o) => (o.userId ?? o.user_id) === uidFilter);
      }
      const midFilter = filters.eq.museumId ?? filters.eq.museum_id;
      if (midFilter) {
        list = list.filter((o) => (o.museumId ?? o.museum_id) === midFilter);
      }
      const statusFilter = filters.eq.status;
      if (statusFilter) {
        list = list.filter((o) => o.status === statusFilter);
      }
      if (fields && 'total' in fields) {
        return [{ total: list.length }];
      }
      list.sort(
        (a, b) =>
          new Date(b.createdAt ?? b.created_at ?? 0).getTime() -
          new Date(a.createdAt ?? a.created_at ?? 0).getTime()
      );
      return list;
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
          let qty = 1;
          if (values.stockQuantity?.queryChunks) {
            for (const c of values.stockQuantity.queryChunks) {
              if (typeof c === 'number') {
                qty = c;
                break;
              } else if (c && typeof c === 'object' && typeof c.value === 'number') {
                qty = c.value;
                break;
              }
            }
          }
          const isAdd = JSON.stringify(values.stockQuantity ?? '').includes('+');
          if (isAdd) {
            product.stockQuantity += qty;
          } else {
            if (product.stockQuantity < qty) {
              return { returning: vi.fn(async () => []) };
            }
            product.stockQuantity -= qty;
          }
          mockState.products.set(targetId, product);
          return {
            returning: vi.fn(async () => [{ id: product.id }]),
          };
        }

        if (tableName === 'shop_orders') {
          const order = mockState.shopOrders.get(targetId);
          if (!order) {
            return { returning: vi.fn(async () => []) };
          }
          const statusCondition = filters.eq.status;
          if (statusCondition && order.status !== statusCondition) {
            return { returning: vi.fn(async () => []) };
          }
          if (values.status) {
            order.status = values.status;
          }
          order.updatedAt = new Date();
          mockState.shopOrders.set(targetId, order);
          return {
            returning: vi.fn(async () => [order]),
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

describe('Shop Orders API (Phases 4.1 & 4.2)', () => {
  const app = createApp();

  const validUserId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '11111111-1111-4111-8111-111111111112';
  const adminUserId = '11111111-1111-4111-8111-111111111113';
  const otherAdminUserId = '11111111-1111-4111-8111-111111111114';
  const superAdminId = '11111111-1111-4111-8111-111111111115';

  const validMuseumId = '22222222-2222-4222-8222-222222222222';
  const otherMuseumId = '22222222-2222-4222-8222-222222222223';
  const validCartId = '33333333-3333-4333-8333-333333333333';
  const validProductId1 = '44444444-4444-4444-8444-444444444441';
  const validProductId2 = '44444444-4444-4444-8444-444444444442';

  const validToken = 'valid.jwt.token';
  const otherToken = 'other.jwt.token';
  const adminToken = 'admin.jwt.token';
  const otherAdminToken = 'otheradmin.jwt.token';
  const superAdminToken = 'superadmin.jwt.token';

  const validCheckoutBody = {
    shipping_name: 'Nguyen Van A',
    shipping_phone: '0901234567',
    shipping_address: '123 Le Loi, District 1',
    shipping_city: 'Ho Chi Minh City',
  };

  function seedShopOrder(opts: {
    id?: string;
    userId: string;
    museumId: string;
    status?: 'confirmed' | 'shipped' | 'completed' | 'cancelled' | 'pending';
    paymentStatus?: 'paid' | 'unpaid' | 'refunded';
    subtotal?: string;
    shippingFee?: string;
    totalAmount?: string;
    shippingName?: string;
    shippingPhone?: string;
    shippingAddress?: string;
    shippingCity?: string;
    createdAt?: Date;
    items?: Array<{
      id?: string;
      productId: string;
      productName: string;
      unitPrice: string;
      quantity: number;
    }>;
    invoice?: {
      id?: string;
      invoiceNumber?: string;
      billingName?: string;
      billingEmail?: string;
      totalAmount?: string;
    } | null;
  }) {
    const orderId =
      opts.id ??
      `77777777-7777-4777-8777-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;
    const now = opts.createdAt ?? new Date();
    const subtotal = opts.subtotal ?? '150000.00';
    const shippingFee = opts.shippingFee ?? '30000.00';
    const totalAmount =
      opts.totalAmount ?? (Number(subtotal) + Number(shippingFee)).toFixed(2);

    const orderRecord = {
      id: orderId,
      userId: opts.userId,
      museumId: opts.museumId,
      status: opts.status ?? 'confirmed',
      paymentStatus: opts.paymentStatus ?? 'paid',
      subtotal,
      shippingFee,
      totalAmount,
      currency: 'VND',
      shippingName: opts.shippingName ?? 'Nguyen Van A',
      shippingPhone: opts.shippingPhone ?? '0901234567',
      shippingAddress: opts.shippingAddress ?? '123 Le Loi, District 1',
      shippingCity: opts.shippingCity ?? 'Ho Chi Minh City',
      createdAt: now,
      updatedAt: now,
    };
    mockState.shopOrders.set(orderId, orderRecord);

    if (opts.items) {
      for (const item of opts.items) {
        const itemId =
          item.id ??
          `88888888-8888-4888-8888-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;
        const lineTotal = (Number(item.unitPrice) * item.quantity).toFixed(2);
        mockState.shopOrderItems.push({
          id: itemId,
          orderId,
          productId: item.productId,
          productName: item.productName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          lineTotal,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    if (opts.invoice !== null) {
      const invId =
        opts.invoice?.id ??
        `99999999-9999-4999-8999-${Math.random().toString(16).slice(2, 14).padEnd(12, '0')}`;
      mockState.shopInvoices.set(invId, {
        id: invId,
        orderId,
        invoiceNumber: opts.invoice?.invoiceNumber ?? 'SHP-2026-000001',
        billingName: opts.invoice?.billingName ?? orderRecord.shippingName,
        billingEmail: opts.invoice?.billingEmail ?? 'shopper@example.com',
        totalAmount: opts.invoice?.totalAmount ?? totalAmount,
        currency: 'VND',
        issuedAt: now,
        createdAt: now,
      });
    }

    return orderRecord;
  }

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
      if (token === otherToken) {
        return {
          data: {
            user: {
              id: otherUserId,
              email: 'other@example.com',
            },
          },
          error: null,
        };
      }
      if (token === adminToken) {
        return {
          data: {
            user: {
              id: adminUserId,
              email: 'admin@museum.com',
            },
          },
          error: null,
        };
      }
      if (token === otherAdminToken) {
        return {
          data: {
            user: {
              id: otherAdminUserId,
              email: 'otheradmin@museum.com',
            },
          },
          error: null,
        };
      }
      if (token === superAdminToken) {
        return {
          data: {
            user: {
              id: superAdminId,
              email: 'super@admin.com',
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
    mockState.users.set(otherUserId, {
      id: otherUserId,
      displayName: 'Le Van B',
      email: 'other@example.com',
    });
    mockState.users.set(adminUserId, {
      id: adminUserId,
      displayName: 'Tran Van C',
      email: 'admin@museum.com',
    });
    mockState.users.set(otherAdminUserId, {
      id: otherAdminUserId,
      displayName: 'Pham Van D',
      email: 'otheradmin@museum.com',
    });
    mockState.users.set(superAdminId, {
      id: superAdminId,
      displayName: 'Super Admin',
      email: 'super@admin.com',
    });

    mockState.userRoles.set(validUserId, new Set(['normal_user']));
    mockState.userRoles.set(otherUserId, new Set(['normal_user']));
    mockState.userRoles.set(adminUserId, new Set(['normal_user', 'admin_user']));
    mockState.userRoles.set(
      otherAdminUserId,
      new Set(['normal_user', 'admin_user'])
    );
    mockState.userRoles.set(
      superAdminId,
      new Set(['normal_user', 'super_admin'])
    );

    mockState.memberships.push({
      userId: adminUserId,
      museumId: validMuseumId,
      status: 'active',
    });
    mockState.memberships.push({
      userId: otherAdminUserId,
      museumId: otherMuseumId,
      status: 'active',
    });

    mockState.museums.set(validMuseumId, {
      id: validMuseumId,
      name: 'National History Museum',
      status: 'published',
    });
    mockState.museums.set(otherMuseumId, {
      id: otherMuseumId,
      name: 'Fine Arts Museum',
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

  describe('POST /api/v1/carts/:cartId/checkout (Phase 4.1)', () => {

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

  describe('GET /api/v1/shop-orders (Phase 4.2 - User Orders)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/v1/shop-orders');
      expect(res.status).toBe(401);
    });

    it('returns 400 when pagination query params are invalid', async () => {
      const res1 = await request(app)
        .get('/api/v1/shop-orders?limit=0')
        .set('Authorization', `Bearer ${validToken}`);
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .get('/api/v1/shop-orders?offset=-1')
        .set('Authorization', `Bearer ${validToken}`);
      expect(res2.status).toBe(400);

      const res3 = await request(app)
        .get('/api/v1/shop-orders?limit=101')
        .set('Authorization', `Bearer ${validToken}`);
      expect(res3.status).toBe(400);
    });

    it('returns empty list and total 0 when user has no orders', async () => {
      const res = await request(app)
        .get('/api/v1/shop-orders')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });

    it('returns paginated orders for the authenticated user and omits other users orders', async () => {
      const order1 = seedShopOrder({
        id: '10000000-0000-4000-8000-000000000001',
        userId: validUserId,
        museumId: validMuseumId,
        status: 'confirmed',
        createdAt: new Date('2026-01-01T10:00:00Z'),
      });
      const order2 = seedShopOrder({
        id: '10000000-0000-4000-8000-000000000002',
        userId: validUserId,
        museumId: validMuseumId,
        status: 'shipped',
        createdAt: new Date('2026-01-02T10:00:00Z'),
      });
      // Order belonging to another user
      seedShopOrder({
        id: '10000000-0000-4000-8000-000000000003',
        userId: otherUserId,
        museumId: validMuseumId,
        status: 'confirmed',
      });

      const res = await request(app)
        .get('/api/v1/shop-orders')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.data).toHaveLength(2);
      // Descending order: order2 first, then order1
      expect(res.body.data[0].id).toBe(order2.id);
      expect(res.body.data[1].id).toBe(order1.id);
      expect(res.body.data[0].museum_id).toBe(validMuseumId);
      expect(res.body.data[0].status).toBe('shipped');
    });

    it('respects limit and offset query pagination', async () => {
      seedShopOrder({
        id: '10000000-0000-4000-8000-000000000001',
        userId: validUserId,
        museumId: validMuseumId,
        createdAt: new Date('2026-01-01T10:00:00Z'),
      });
      seedShopOrder({
        id: '10000000-0000-4000-8000-000000000002',
        userId: validUserId,
        museumId: validMuseumId,
        createdAt: new Date('2026-01-02T10:00:00Z'),
      });

      const page1 = await request(app)
        .get('/api/v1/shop-orders?limit=1&offset=0')
        .set('Authorization', `Bearer ${validToken}`);

      expect(page1.status).toBe(200);
      expect(page1.body.data).toHaveLength(1);
      expect(page1.body.data[0].id).toBe('10000000-0000-4000-8000-000000000002');
      expect(page1.body.pagination.total).toBe(2);

      const page2 = await request(app)
        .get('/api/v1/shop-orders?limit=1&offset=1')
        .set('Authorization', `Bearer ${validToken}`);

      expect(page2.status).toBe(200);
      expect(page2.body.data).toHaveLength(1);
      expect(page2.body.data[0].id).toBe('10000000-0000-4000-8000-000000000001');
      expect(page2.body.pagination.total).toBe(2);
    });
  });

  describe('GET /api/v1/shop-orders/:id (Phase 4.2 - Order Detail)', () => {
    const testOrderId = '20000000-0000-4000-8000-000000000001';

    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get(`/api/v1/shop-orders/${testOrderId}`);
      expect(res.status).toBe(401);
    });

    it('returns 400 when order id is not a valid UUID', async () => {
      const res = await request(app)
        .get('/api/v1/shop-orders/not-a-uuid')
        .set('Authorization', `Bearer ${validToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('validation_error');
    });

    it('returns 404 order_not_found when order does not exist', async () => {
      const res = await request(app)
        .get('/api/v1/shop-orders/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${validToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('order_not_found');
    });

    it('returns 403 not_owner_or_admin when user does not own order and is not museum admin', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
      });

      // Another normal user
      const res1 = await request(app)
        .get(`/api/v1/shop-orders/${testOrderId}`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res1.status).toBe(403);
      expect(res1.body.error?.code).toBe('not_owner_or_admin');

      // Admin of a DIFFERENT museum
      const res2 = await request(app)
        .get(`/api/v1/shop-orders/${testOrderId}`)
        .set('Authorization', `Bearer ${otherAdminToken}`);
      expect(res2.status).toBe(403);
      expect(res2.body.error?.code).toBe('not_owner_or_admin');
    });

    it('returns 200 with order, items, and invoice for the order owner', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'confirmed',
        subtotal: '150000.00',
        shippingFee: '30000.00',
        totalAmount: '380000.00',
        items: [
          {
            productId: validProductId1,
            productName: 'Bronze Drum Replica',
            unitPrice: '150000.00',
            quantity: 1,
          },
        ],
        invoice: {
          invoiceNumber: 'SHP-2026-000042',
          billingName: 'Nguyen Van A',
          billingEmail: 'shopper@example.com',
          totalAmount: '380000.00',
        },
      });

      const res = await request(app)
        .get(`/api/v1/shop-orders/${testOrderId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      const { order, items, invoice } = res.body.data;
      expect(order.id).toBe(testOrderId);
      expect(order.status).toBe('confirmed');
      expect(order.subtotal).toBe('150000.00');
      expect(order.shipping_fee ?? order.shippingFee).toBe('30000.00');
      expect(items).toHaveLength(1);
      expect(items[0].product_name ?? items[0].productName).toBe('Bronze Drum Replica');
      expect(invoice).toBeDefined();
      expect(invoice.invoice_number ?? invoice.invoiceNumber).toBe('SHP-2026-000042');
    });

    it('returns 200 for authorized museum admin who does not own the order', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
      });

      const res = await request(app)
        .get(`/api/v1/shop-orders/${testOrderId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.order.id).toBe(testOrderId);
    });

    it('returns 200 for super admin who does not own the order', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
      });

      const res = await request(app)
        .get(`/api/v1/shop-orders/${testOrderId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.order.id).toBe(testOrderId);
    });

    it('returns 200 with null invoice if invoice does not exist', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        invoice: null,
      });

      const res = await request(app)
        .get(`/api/v1/shop-orders/${testOrderId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.order.id).toBe(testOrderId);
      expect(res.body.data.invoice).toBeNull();
    });
  });

  describe('POST /api/v1/shop-orders/:id/cancel (Phase 4.2 - Cancellation & Stock Restore)', () => {
    const testOrderId = '30000000-0000-4000-8000-000000000001';

    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).post(`/api/v1/shop-orders/${testOrderId}/cancel`);
      expect(res.status).toBe(401);
    });

    it('returns 400 when order id is not a valid UUID', async () => {
      const res = await request(app)
        .post('/api/v1/shop-orders/not-a-uuid/cancel')
        .set('Authorization', `Bearer ${validToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('validation_error');
    });

    it('returns 404 order_not_found when order does not exist', async () => {
      const res = await request(app)
        .post('/api/v1/shop-orders/00000000-0000-4000-8000-000000000000/cancel')
        .set('Authorization', `Bearer ${validToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('order_not_found');
    });

    it('returns 403 not_owner_or_admin when user is neither owner nor museum admin', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
      });

      const res = await request(app)
        .post(`/api/v1/shop-orders/${testOrderId}/cancel`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('not_owner_or_admin');
    });

    it('returns 400 already_shipped when order status is shipped or completed', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'shipped',
      });

      const res1 = await request(app)
        .post(`/api/v1/shop-orders/${testOrderId}/cancel`)
        .set('Authorization', `Bearer ${validToken}`);
      expect(res1.status).toBe(400);
      expect(res1.body.error?.code).toBe('already_shipped');

      // Completed order
      const completedOrderId = '30000000-0000-4000-8000-000000000002';
      seedShopOrder({
        id: completedOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'completed',
      });

      const res2 = await request(app)
        .post(`/api/v1/shop-orders/${completedOrderId}/cancel`)
        .set('Authorization', `Bearer ${validToken}`);
      expect(res2.status).toBe(400);
      expect(res2.body.error?.code).toBe('already_shipped');
    });

    it('returns 400 order_not_cancellable when order is already cancelled', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'cancelled',
      });

      const res = await request(app)
        .post(`/api/v1/shop-orders/${testOrderId}/cancel`)
        .set('Authorization', `Bearer ${validToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('order_not_cancellable');
    });

    it('successfully cancels confirmed order and restores product stock quantities', async () => {
      // Set current stock of products
      const p1 = mockState.products.get(validProductId1)!;
      const p2 = mockState.products.get(validProductId2)!;
      p1.stockQuantity = 8;
      p2.stockQuantity = 19;
      mockState.products.set(validProductId1, p1);
      mockState.products.set(validProductId2, p2);

      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'confirmed',
        items: [
          {
            productId: validProductId1,
            productName: 'Bronze Drum Replica',
            unitPrice: '150000.00',
            quantity: 2,
          },
          {
            productId: validProductId2,
            productName: 'Traditional Postcard Set',
            unitPrice: '50000.00',
            quantity: 1,
          },
        ],
      });

      const res = await request(app)
        .post(`/api/v1/shop-orders/${testOrderId}/cancel`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(testOrderId);
      expect(res.body.data.status).toBe('cancelled');

      // Verify stock was restored
      expect(mockState.products.get(validProductId1)!.stockQuantity).toBe(10); // 8 + 2
      expect(mockState.products.get(validProductId2)!.stockQuantity).toBe(20); // 19 + 1

      // Verify order status in DB
      expect(mockState.shopOrders.get(testOrderId)!.status).toBe('cancelled');
    });

    it('allows authorized museum admin to cancel order and restore stock', async () => {
      const p1 = mockState.products.get(validProductId1)!;
      p1.stockQuantity = 5;
      mockState.products.set(validProductId1, p1);

      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'confirmed',
        items: [
          {
            productId: validProductId1,
            productName: 'Bronze Drum Replica',
            unitPrice: '150000.00',
            quantity: 3,
          },
        ],
      });

      const res = await request(app)
        .post(`/api/v1/shop-orders/${testOrderId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
      expect(mockState.products.get(validProductId1)!.stockQuantity).toBe(8); // 5 + 3
    });
  });

  describe('GET /api/v1/admin/museums/:museumId/shop-orders (Phase 4.2 - Admin Fulfillment Queue)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get(
        `/api/v1/admin/museums/${validMuseumId}/shop-orders`
      );
      expect(res.status).toBe(401);
    });

    it('returns 400 when museumId is not a valid UUID', async () => {
      const res = await request(app)
        .get('/api/v1/admin/museums/not-a-uuid/shop-orders')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('validation_error');
    });

    it('returns 404 when museum does not exist', async () => {
      const res = await request(app)
        .get(
          '/api/v1/admin/museums/00000000-0000-4000-8000-000000000000/shop-orders'
        )
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('returns 403 not_museum_admin when user is a normal user', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/museums/${validMuseumId}/shop-orders`)
        .set('Authorization', `Bearer ${validToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('not_museum_admin');
    });

    it('returns 403 not_museum_admin when admin belongs to another museum', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/museums/${validMuseumId}/shop-orders`)
        .set('Authorization', `Bearer ${otherAdminToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('not_museum_admin');
    });

    it('returns 200 with paginated orders for museum admin', async () => {
      seedShopOrder({
        id: '40000000-0000-4000-8000-000000000001',
        userId: validUserId,
        museumId: validMuseumId,
        status: 'confirmed',
        createdAt: new Date('2026-01-01T10:00:00Z'),
      });
      seedShopOrder({
        id: '40000000-0000-4000-8000-000000000002',
        userId: otherUserId,
        museumId: validMuseumId,
        status: 'shipped',
        createdAt: new Date('2026-01-02T10:00:00Z'),
      });
      // Another museum's order
      seedShopOrder({
        id: '40000000-0000-4000-8000-000000000003',
        userId: validUserId,
        museumId: otherMuseumId,
        status: 'confirmed',
      });

      const res = await request(app)
        .get(`/api/v1/admin/museums/${validMuseumId}/shop-orders`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].id).toBe('40000000-0000-4000-8000-000000000002');
      expect(res.body.data[1].id).toBe('40000000-0000-4000-8000-000000000001');
    });

    it('allows super admin to view fulfillment queue', async () => {
      seedShopOrder({
        id: '40000000-0000-4000-8000-000000000001',
        userId: validUserId,
        museumId: validMuseumId,
        status: 'confirmed',
      });

      const res = await request(app)
        .get(`/api/v1/admin/museums/${validMuseumId}/shop-orders`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(1);
    });

    it('filters orders by status', async () => {
      seedShopOrder({
        id: '40000000-0000-4000-8000-000000000001',
        userId: validUserId,
        museumId: validMuseumId,
        status: 'confirmed',
      });
      seedShopOrder({
        id: '40000000-0000-4000-8000-000000000002',
        userId: validUserId,
        museumId: validMuseumId,
        status: 'shipped',
      });

      const res = await request(app)
        .get(`/api/v1/admin/museums/${validMuseumId}/shop-orders?status=confirmed`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(1);
      expect(res.body.data[0].id).toBe('40000000-0000-4000-8000-000000000001');
      expect(res.body.data[0].status).toBe('confirmed');
    });
  });

  describe('PATCH /api/v1/admin/shop-orders/:id/fulfillment (Phase 4.2 - Status Updates)', () => {
    const testOrderId = '50000000-0000-4000-8000-000000000001';

    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/shop-orders/${testOrderId}/fulfillment`)
        .send({ status: 'shipped' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when order id is not a valid UUID', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/shop-orders/not-a-uuid/fulfillment')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('validation_error');
    });

    it('returns 400 when body status is invalid', async () => {
      const res1 = await request(app)
        .patch(`/api/v1/admin/shop-orders/${testOrderId}/fulfillment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'cancelled' });
      expect(res1.status).toBe(400);
      expect(res1.body.error?.code).toBe('validation_error');

      const res2 = await request(app)
        .patch(`/api/v1/admin/shop-orders/${testOrderId}/fulfillment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res2.status).toBe(400);
      expect(res2.body.error?.code).toBe('validation_error');
    });

    it('returns 404 order_not_found when order does not exist', async () => {
      const res = await request(app)
        .patch(
          '/api/v1/admin/shop-orders/00000000-0000-4000-8000-000000000000/fulfillment'
        )
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });
      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('order_not_found');
    });

    it('returns 403 not_museum_admin when user is a normal user', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'confirmed',
      });

      const res = await request(app)
        .patch(`/api/v1/admin/shop-orders/${testOrderId}/fulfillment`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ status: 'shipped' });
      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('not_museum_admin');
    });

    it('returns 403 not_museum_admin when admin belongs to another museum', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'confirmed',
      });

      const res = await request(app)
        .patch(`/api/v1/admin/shop-orders/${testOrderId}/fulfillment`)
        .set('Authorization', `Bearer ${otherAdminToken}`)
        .send({ status: 'shipped' });
      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('not_museum_admin');
    });

    it('returns 400 invalid_transition when trying to skip shipped (confirmed -> completed)', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'confirmed',
      });

      const res = await request(app)
        .patch(`/api/v1/admin/shop-orders/${testOrderId}/fulfillment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'completed' });
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('invalid_transition');
    });

    it('returns 400 invalid_transition when order is already shipped and requested shipped again', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'shipped',
      });

      const res = await request(app)
        .patch(`/api/v1/admin/shop-orders/${testOrderId}/fulfillment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('invalid_transition');
    });

    it('returns 400 invalid_transition when order is cancelled', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'cancelled',
      });

      const res = await request(app)
        .patch(`/api/v1/admin/shop-orders/${testOrderId}/fulfillment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('invalid_transition');
    });

    it('successfully transitions from confirmed to shipped', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'confirmed',
      });

      const res = await request(app)
        .patch(`/api/v1/admin/shop-orders/${testOrderId}/fulfillment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(testOrderId);
      expect(res.body.data.status).toBe('shipped');
      expect(mockState.shopOrders.get(testOrderId)!.status).toBe('shipped');
    });

    it('successfully transitions from shipped to completed', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'shipped',
      });

      const res = await request(app)
        .patch(`/api/v1/admin/shop-orders/${testOrderId}/fulfillment`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(testOrderId);
      expect(res.body.data.status).toBe('completed');
      expect(mockState.shopOrders.get(testOrderId)!.status).toBe('completed');
    });

    it('allows super admin to update fulfillment status', async () => {
      seedShopOrder({
        id: testOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'confirmed',
      });

      const res = await request(app)
        .patch(`/api/v1/admin/shop-orders/${testOrderId}/fulfillment`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'shipped' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('shipped');
    });
  });
});
