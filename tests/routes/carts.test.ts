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
  currency: string;
  stockQuantity: number;
  status: 'draft' | 'published' | 'archived';
}

interface CartRecord {
  id: string;
  userId: string;
  museumId: string;
  status: 'active' | 'converted' | 'abandoned';
  createdAt: Date;
  updatedAt: Date;
}

interface CartItemRecord {
  id: string;
  cartId: string;
  productId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

const { mockGetUser, mockState, mockDb } = vi.hoisted(() => {
  const mockGetUser = vi.fn();

  const mockState = {
    users: new Map<string, { id: string; email: string }>(),
    museums: new Map<string, MuseumRecord>(),
    products: new Map<string, ProductRecord>(),
    carts: new Map<string, CartRecord>(),
    cartItems: new Map<string, CartItemRecord>(),
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

  const handleSelectRows = (table: any, cond: any) => {
    let tableName = '';
    try {
      tableName = getTableName(table);
    } catch {
      tableName = '';
    }
    const filters = extractFilters(cond);

    if (tableName === 'museums') {
      let list = Array.from(mockState.museums.values());
      if (filters.eq.id) list = list.filter((m) => m.id === filters.eq.id);
      return list;
    }

    if (tableName === 'souvenir_products') {
      let list = Array.from(mockState.products.values());
      if (filters.eq.id) list = list.filter((p) => p.id === filters.eq.id);
      if (filters.in.id) list = list.filter((p) => filters.in.id.includes(p.id));
      return list;
    }

    if (tableName === 'carts') {
      let list = Array.from(mockState.carts.values());
      if (filters.eq.id) list = list.filter((c) => c.id === filters.eq.id);
      if (filters.eq.user_id) list = list.filter((c) => c.userId === filters.eq.user_id);
      if (filters.eq.museum_id) list = list.filter((c) => c.museumId === filters.eq.museum_id);
      if (filters.eq.status) list = list.filter((c) => c.status === filters.eq.status);
      return list;
    }

    if (tableName === 'cart_items') {
      let list = Array.from(mockState.cartItems.values());
      if (filters.eq.id) list = list.filter((i) => i.id === filters.eq.id);
      if (filters.eq.cart_id) list = list.filter((i) => i.cartId === filters.eq.cart_id);
      if (filters.in.cart_id) list = list.filter((i) => filters.in.cart_id.includes(i.cartId));
      if (filters.eq.product_id) list = list.filter((i) => i.productId === filters.eq.product_id);
      return list;
    }

    if (tableName === 'users') {
      let list = Array.from(mockState.users.values());
      if (filters.eq.id) list = list.filter((u) => u.id === filters.eq.id);
      return list;
    }

    if (tableName === 'user_roles') {
      return [{ userId: filters.eq.user_id, role: 'normal_user' }];
    }

    return [];
  };

  const createSelectChain = (table: any) => {
    let whereCondition: any = null;
    const chain: any = {
      from: vi.fn((fromTable: any) => createSelectChain(fromTable)),
      where: vi.fn((cond: any) => {
        whereCondition = cond;
        return chain;
      }),
      orderBy: vi.fn(() => chain),
      limit: vi.fn((_n: number) => chain),
      offset: vi.fn((_n: number) => chain),
      then: (resolve: any) => Promise.resolve(handleSelectRows(table, whereCondition)).then(resolve),
    };
    return chain;
  };

  const mockDb = {
    transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => {
      return fn({
        insert: vi.fn((_table: unknown) => ({
          values: vi.fn((_val: any) => ({
            onConflictDoNothing: vi.fn(async () => []),
          })),
        })),
        select: mockDb.select,
        update: mockDb.update,
        delete: mockDb.delete,
      });
    }),
    select: vi.fn((_fields?: any) => ({
      from: vi.fn((table: any) => createSelectChain(table)),
    })),
    insert: vi.fn((table: any) => {
      let tableName = '';
      try {
        tableName = getTableName(table);
      } catch {
        tableName = '';
      }
      return {
        values: vi.fn((val: any) => {
          const now = new Date();
          if (tableName === 'carts') {
            const newCart: CartRecord = {
              id: val.id ?? `c${Math.floor(10000000 + Math.random() * 90000000)}-1111-4111-8111-111111111111`,
              userId: val.userId,
              museumId: val.museumId,
              status: val.status ?? 'active',
              createdAt: now,
              updatedAt: now,
            };
            mockState.carts.set(newCart.id, newCart);
            return {
              returning: vi.fn(async () => [newCart]),
            };
          }
          if (tableName === 'cart_items') {
            const newItem: CartItemRecord = {
              id: val.id ?? `ci${Math.floor(1000000 + Math.random() * 9000000)}-1111-4111-8111-111111111111`,
              cartId: val.cartId,
              productId: val.productId,
              quantity: val.quantity,
              createdAt: now,
              updatedAt: now,
            };
            mockState.cartItems.set(newItem.id, newItem);
            return {
              returning: vi.fn(async () => [newItem]),
            };
          }
          return {
            returning: vi.fn(async () => [val]),
          };
        }),
      };
    }),
    update: vi.fn((table: any) => {
      let tableName = '';
      try {
        tableName = getTableName(table);
      } catch {
        tableName = '';
      }
      return {
        set: vi.fn((values: any) => ({
          where: vi.fn((condition: any) => {
            const filters = extractFilters(condition);
            const targetId = String(filters.eq.id ?? '');
            return {
              returning: vi.fn(async () => {
                if (tableName === 'carts') {
                  const cart = mockState.carts.get(targetId);
                  if (!cart) return [];
                  if (values.status) cart.status = values.status;
                  if (values.updatedAt) cart.updatedAt = values.updatedAt;
                  return [cart];
                }
                if (tableName === 'cart_items') {
                  const item = mockState.cartItems.get(targetId);
                  if (!item) return [];
                  if (values.quantity !== undefined) item.quantity = values.quantity;
                  if (values.updatedAt) item.updatedAt = values.updatedAt;
                  return [item];
                }
                return [];
              }),
            };
          }),
        })),
      };
    }),
    delete: vi.fn((table: any) => {
      let tableName = '';
      try {
        tableName = getTableName(table);
      } catch {
        tableName = '';
      }
      return {
        where: vi.fn(async (condition: any) => {
          const filters = extractFilters(condition);
          const targetId = String(filters.eq.id ?? '');
          if (tableName === 'carts') {
            mockState.carts.delete(targetId);
            // cascade delete cart items
            for (const [id, item] of mockState.cartItems.entries()) {
              if (item.cartId === targetId) {
                mockState.cartItems.delete(id);
              }
            }
          }
          if (tableName === 'cart_items') {
            mockState.cartItems.delete(targetId);
          }
          return [];
        }),
      };
    }),
  };

  return { mockGetUser, mockState, mockDb };
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

describe('Carts API (Phase 3)', () => {
  const app = createApp();

  const validUserId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '22222222-2222-4222-8222-222222222222';
  const validMuseumId = '33333333-3333-4333-8333-333333333333';
  const otherMuseumId = '44444444-4444-4444-8444-444444444444';
  const validProductId = '55555555-5555-4555-8555-555555555555';
  const otherMuseumProductId = '66666666-6666-4666-8666-666666666666';

  const validToken = 'valid-token';

  beforeEach(() => {
    mockState.users.clear();
    mockState.museums.clear();
    mockState.products.clear();
    mockState.carts.clear();
    mockState.cartItems.clear();

    mockState.users.set(validUserId, { id: validUserId, email: 'user@museum.vn' });
    mockState.users.set(otherUserId, { id: otherUserId, email: 'other@museum.vn' });

    mockState.museums.set(validMuseumId, {
      id: validMuseumId,
      name: 'History Museum',
      status: 'published',
    });

    mockState.museums.set(otherMuseumId, {
      id: otherMuseumId,
      name: 'Art Museum',
      status: 'published',
    });

    mockState.products.set(validProductId, {
      id: validProductId,
      museumId: validMuseumId,
      name: 'Book',
      price: '50000.00',
      currency: 'VND',
      stockQuantity: 10,
      status: 'published',
    });

    mockState.products.set(otherMuseumProductId, {
      id: otherMuseumProductId,
      museumId: otherMuseumId,
      name: 'Painting',
      price: '100000.00',
      currency: 'VND',
      stockQuantity: 5,
      status: 'published',
    });

    mockGetUser.mockReset();
    mockGetUser.mockImplementation(async (token: string) => {
      if (token === validToken) {
        return { data: { user: { id: validUserId, email: 'user@museum.vn' } }, error: null };
      }
      if (token === 'other-token') {
        return { data: { user: { id: otherUserId, email: 'other@museum.vn' } }, error: null };
      }
      return { data: { user: null }, error: new Error('Invalid token') };
    });
  });

  describe('GET /api/v1/carts', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/v1/carts');
      expect(res.status).toBe(401);
    });

    it('returns empty list when user has no active carts', async () => {
      const res = await request(app)
        .get('/api/v1/carts')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });

    it('returns active carts with items and product summaries', async () => {
      const cartId = 'c1111111-1111-4111-8111-111111111111';
      mockState.carts.set(cartId, {
        id: cartId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const itemId = 'ci111111-1111-4111-8111-111111111111';
      mockState.cartItems.set(itemId, {
        id: itemId,
        cartId,
        productId: validProductId,
        quantity: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get('/api/v1/carts')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(cartId);
      expect(res.body.data[0].items).toHaveLength(1);
      expect(res.body.data[0].items[0].product.name).toBe('Book');
    });

    it('omits abandoned or converted carts and other users carts', async () => {
      mockState.carts.set('cart-abandoned', {
        id: 'cart-abandoned',
        userId: validUserId,
        museumId: validMuseumId,
        status: 'abandoned',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockState.carts.set('cart-other-user', {
        id: 'cart-other-user',
        userId: otherUserId,
        museumId: validMuseumId,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get('/api/v1/carts')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('POST /api/v1/carts', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .post('/api/v1/carts')
        .send({ museum_id: validMuseumId });
      expect(res.status).toBe(401);
    });

    it('returns 400 validation error on invalid UUID', async () => {
      const res = await request(app)
        .post('/api/v1/carts')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ museum_id: 'invalid-uuid' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when museum does not exist', async () => {
      const res = await request(app)
        .post('/api/v1/carts')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ museum_id: '99999999-9999-4999-8999-999999999999' });
      expect(res.status).toBe(404);
    });

    it('creates active cart successfully', async () => {
      const res = await request(app)
        .post('/api/v1/carts')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ museum_id: validMuseumId });

      expect(res.status).toBe(201);
      expect(res.body.data.museum_id).toBe(validMuseumId);
      expect(res.body.data.status).toBe('active');
    });

    it('returns 409 active_cart_exists when user already has an active cart for this museum', async () => {
      mockState.carts.set('existing-active', {
        id: 'existing-active',
        userId: validUserId,
        museumId: validMuseumId,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/carts')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ museum_id: validMuseumId });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('active_cart_exists');
    });
  });

  describe('PATCH /api/v1/carts/:id', () => {
    const cartId = 'c1111111-1111-4111-8111-111111111111';

    beforeEach(() => {
      mockState.carts.set(cartId, {
        id: cartId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('returns 404 when cart does not exist', async () => {
      const res = await request(app)
        .patch('/api/v1/carts/99999999-9999-4999-8999-999999999999')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ status: 'abandoned' });
      expect(res.status).toBe(404);
    });

    it('returns 403 when cart belongs to another user', async () => {
      const res = await request(app)
        .patch(`/api/v1/carts/${cartId}`)
        .set('Authorization', 'Bearer other-token')
        .send({ status: 'abandoned' });
      expect(res.status).toBe(403);
    });

    it('returns 400 when status is not abandoned', async () => {
      const res = await request(app)
        .patch(`/api/v1/carts/${cartId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ status: 'converted' });
      expect(res.status).toBe(400);
    });

    it('updates status to abandoned', async () => {
      const res = await request(app)
        .patch(`/api/v1/carts/${cartId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ status: 'abandoned' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('abandoned');
    });

    it('returns 400 when attempting to abandon converted cart', async () => {
      mockState.carts.get(cartId)!.status = 'converted';

      const res = await request(app)
        .patch(`/api/v1/carts/${cartId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ status: 'abandoned' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('cart_converted');
    });
  });

  describe('DELETE /api/v1/carts/:id', () => {
    const cartId = 'c1111111-1111-4111-8111-111111111111';

    beforeEach(() => {
      mockState.carts.set(cartId, {
        id: cartId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('returns 403 when cart belongs to another user', async () => {
      const res = await request(app)
        .delete(`/api/v1/carts/${cartId}`)
        .set('Authorization', 'Bearer other-token');
      expect(res.status).toBe(403);
    });

    it('returns 400 when cart is converted', async () => {
      mockState.carts.get(cartId)!.status = 'converted';

      const res = await request(app)
        .delete(`/api/v1/carts/${cartId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('cart_converted');
    });

    it('deletes cart successfully', async () => {
      const res = await request(app)
        .delete(`/api/v1/carts/${cartId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);
      expect(mockState.carts.has(cartId)).toBe(false);
    });
  });

  describe('POST /api/v1/carts/:cartId/items', () => {
    const cartId = 'c1111111-1111-4111-8111-111111111111';

    beforeEach(() => {
      mockState.carts.set(cartId, {
        id: cartId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('returns 400 on invalid quantity (<= 0)', async () => {
      const res = await request(app)
        .post(`/api/v1/carts/${cartId}/items`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ product_id: validProductId, quantity: 0 });
      expect(res.status).toBe(400);
    });

    it('returns 400 cart_not_active when cart is abandoned', async () => {
      mockState.carts.get(cartId)!.status = 'abandoned';

      const res = await request(app)
        .post(`/api/v1/carts/${cartId}/items`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ product_id: validProductId, quantity: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('cart_not_active');
    });

    it('returns 400 product_museum_mismatch when product belongs to another museum', async () => {
      const res = await request(app)
        .post(`/api/v1/carts/${cartId}/items`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ product_id: otherMuseumProductId, quantity: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('product_museum_mismatch');
    });

    it('adds item to cart successfully', async () => {
      const res = await request(app)
        .post(`/api/v1/carts/${cartId}/items`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ product_id: validProductId, quantity: 2 });

      expect(res.status).toBe(201);
      expect(res.body.data.product_id).toBe(validProductId);
      expect(res.body.data.quantity).toBe(2);
    });

    it('returns 409 item_already_exists when product is already in cart', async () => {
      mockState.cartItems.set('existing-item', {
        id: 'existing-item',
        cartId,
        productId: validProductId,
        quantity: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/carts/${cartId}/items`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ product_id: validProductId, quantity: 1 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('item_already_exists');
    });
  });

  describe('PATCH /api/v1/carts/:cartId/items/:itemId', () => {
    const cartId = 'c1111111-1111-4111-8111-111111111111';
    const itemId = 'c2222222-2222-4222-8222-222222222222';

    beforeEach(() => {
      mockState.carts.set(cartId, {
        id: cartId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockState.cartItems.set(itemId, {
        id: itemId,
        cartId,
        productId: validProductId,
        quantity: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('returns 400 on quantity <= 0', async () => {
      const res = await request(app)
        .patch(`/api/v1/carts/${cartId}/items/${itemId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ quantity: -1 });
      expect(res.status).toBe(400);
    });

    it('updates item quantity successfully', async () => {
      const res = await request(app)
        .patch(`/api/v1/carts/${cartId}/items/${itemId}`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({ quantity: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.quantity).toBe(5);
    });
  });

  describe('DELETE /api/v1/carts/:cartId/items/:itemId', () => {
    const cartId = 'c1111111-1111-4111-8111-111111111111';
    const itemId = 'c2222222-2222-4222-8222-222222222222';

    beforeEach(() => {
      mockState.carts.set(cartId, {
        id: cartId,
        userId: validUserId,
        museumId: validMuseumId,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockState.cartItems.set(itemId, {
        id: itemId,
        cartId,
        productId: validProductId,
        quantity: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('removes item from cart successfully', async () => {
      const res = await request(app)
        .delete(`/api/v1/carts/${cartId}/items/${itemId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);
      expect(mockState.cartItems.has(itemId)).toBe(false);
    });
  });
});
