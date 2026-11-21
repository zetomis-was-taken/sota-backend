import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { createApp } from '../../src/app';
import { getTodayVN } from '../../src/lib/timezone';

interface MuseumRecord {
  id: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
}

interface TicketTypeRecord {
  id: string;
  museumId: string;
  name: string;
  price: string;
  isAvailable: boolean;
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
    ticketTypes: new Map<string, TicketTypeRecord>(),
    ticketOrders: new Map<string, any>(),
    ticketOrderItems: [] as any[],
    ticketInvoices: new Map<string, any>(),
    invoiceSeq: 1,
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

    if (tableName === 'museums') {
      let list = Array.from(mockState.museums.values());
      if (filters.eq.id) {
        list = list.filter((m) => m.id === filters.eq.id);
      }
      return list.map((m) => ({
        ...m,
        id: m.id,
        status: m.status,
      }));
    }

    if (tableName === 'ticket_types') {
      let list = Array.from(mockState.ticketTypes.values());
      const museumIdFilter = filters.eq.museum_id ?? filters.eq.museumId;
      if (museumIdFilter) {
        list = list.filter((t) => t.museumId === museumIdFilter);
      }
      if (filters.in.id && Array.isArray(filters.in.id)) {
        list = list.filter((t) => filters.in.id.includes(t.id));
      }
      return list.map((t) => ({
        ...t,
        id: t.id,
        museumId: t.museumId,
        name: t.name,
        price: t.price,
        isAvailable: t.isAvailable,
      }));
    }

    if (tableName === 'users') {
      let list = Array.from(mockState.users.values());
      if (filters.eq.id) {
        list = list.filter((u) => u.id === filters.eq.id);
      }
      return list.map((u) => ({
        ...u,
        id: u.id,
        displayName: u.displayName,
      }));
    }

    if (tableName === 'user_roles') {
      let rows: any[] = [];
      const uidFilter = filters.eq.userId ?? filters.eq.user_id;
      const roleFilter = filters.eq.role;
      for (const [uid, rSet] of mockState.userRoles.entries()) {
        if (!uidFilter || uid === uidFilter) {
          for (const r of rSet) {
            if (!roleFilter || r === roleFilter) {
              rows.push({ userId: uid, role: r });
            }
          }
        }
      }
      return rows;
    }

    if (tableName === 'museum_admins') {
      let list = [...mockState.memberships];
      const uidFilter = filters.eq.userId ?? filters.eq.user_id;
      const midFilter = filters.eq.museumId ?? filters.eq.museum_id;
      const statusFilter = filters.eq.status;
      if (uidFilter) {
        list = list.filter((m) => m.userId === uidFilter);
      }
      if (midFilter) {
        list = list.filter((m) => m.museumId === midFilter);
      }
      if (statusFilter) {
        list = list.filter((m) => m.status === statusFilter);
      }
      return list.map((m) => ({
        userId: m.userId,
        museumId: m.museumId,
        status: m.status,
      }));
    }

    if (tableName === 'ticket_orders') {
      let list = Array.from(mockState.ticketOrders.values());
      const idFilter = filters.eq.id;
      const uidFilter = filters.eq.userId ?? filters.eq.user_id;
      const midFilter = filters.eq.museumId ?? filters.eq.museum_id;
      const codeFilter = filters.eq.entryCode ?? filters.eq.entry_code;
      const dateFilter = filters.eq.visitDate ?? filters.eq.visit_date;
      const statusFilter = filters.eq.status;

      if (idFilter) {
        list = list.filter((o) => o.id === idFilter);
      }
      if (uidFilter) {
        list = list.filter((o) => (o.userId ?? o.user_id) === uidFilter);
      }
      if (midFilter) {
        list = list.filter((o) => (o.museumId ?? o.museum_id) === midFilter);
      }
      if (codeFilter) {
        list = list.filter((o) => (o.entryCode ?? o.entry_code) === codeFilter);
      }
      if (dateFilter) {
        list = list.filter((o) => (o.visitDate ?? o.visit_date) === dateFilter);
      }
      if (statusFilter) {
        list = list.filter((o) => o.status === statusFilter);
      }

      if (fields && typeof fields === 'object' && 'total' in fields) {
        return [{ total: list.length }];
      }

      return list.map((o) => ({
        ...o,
        id: o.id,
        userId: o.userId ?? o.user_id,
        museumId: o.museumId ?? o.museum_id,
        visitDate: o.visitDate ?? o.visit_date,
        timeSlot: o.timeSlot ?? o.time_slot,
        totalAmount: o.totalAmount ?? o.total_amount,
        paymentStatus: o.paymentStatus ?? o.payment_status,
        entryCode: o.entryCode ?? o.entry_code,
        usedAt: o.usedAt ?? o.used_at,
      }));
    }

    if (tableName === 'ticket_order_items') {
      let list = [...mockState.ticketOrderItems];
      const orderIdFilter = filters.eq.ticketOrderId ?? filters.eq.ticket_order_id;
      if (orderIdFilter) {
        list = list.filter((i) => (i.ticketOrderId ?? i.ticket_order_id) === orderIdFilter);
      }
      return list;
    }

    if (tableName === 'ticket_invoices') {
      let list = Array.from(mockState.ticketInvoices.values());
      const orderIdFilter = filters.eq.ticketOrderId ?? filters.eq.ticket_order_id;
      if (orderIdFilter) {
        list = list.filter((i) => (i.ticketOrderId ?? i.ticket_order_id) === orderIdFilter);
      }
      return list;
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
              const roles = mockState.userRoles.get(item.userId) ?? new Set<string>();
              roles.add(item.role);
              mockState.userRoles.set(item.userId, roles);
            }
          }
        }),
        returning: vi.fn(async () => {
          const inserted: any[] = [];
          for (const item of vals) {
            const now = new Date();
            const id = item.id ?? `id-${Math.random().toString(36).slice(2, 10)}`;
            const record = {
              ...item,
              id,
              createdAt: now,
              updatedAt: now,
              issuedAt: now,
              lineTotal: item.unitPrice && item.quantity
                ? (Number(item.unitPrice) * item.quantity).toFixed(2)
                : '0.00',
            };
            if (item.visitDate) {
              mockState.ticketOrders.set(id, record);
            } else if (item.invoiceNumber) {
              mockState.ticketInvoices.set(id, record);
            } else if (item.ticketOrderId && item.ticketTypeId) {
              mockState.ticketOrderItems.push(record);
            }
            inserted.push(record);
          }
          return inserted;
        }),
      };
    }),
  });

  const handleUpdate = (_table: any) => ({
    set: vi.fn((values: any) => ({
      where: vi.fn((cond: any) => {
        const filters = extractFilters(cond);
        const targetId = (filters.eq.id ?? '') as string;
        const expectedStatus = filters.eq.status as string | undefined;

        const order = targetId ? mockState.ticketOrders.get(targetId) : null;
        if (!order) {
          return { returning: vi.fn(async () => []) };
        }

        if (expectedStatus && order.status !== expectedStatus) {
          return { returning: vi.fn(async () => []) };
        }

        if (values.status) {
          order.status = values.status;
        }
        if (values.usedAt) {
          order.usedAt = values.usedAt;
        }
        order.updatedAt = new Date();
        mockState.ticketOrders.set(targetId, order);

        return {
          returning: vi.fn(async () => [order]),
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
    transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(txObject)),
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

const app = createApp();

describe('Ticket Orders API', () => {
  const validUserId = '11111111-1111-4111-8111-111111111111';
  const otherUserId = '11111111-1111-4111-8111-222222222222';
  const adminUserId = '11111111-1111-4111-8111-333333333333';
  const superAdminId = '11111111-1111-4111-8111-444444444444';

  const validMuseumId = '22222222-2222-4222-8222-222222222222';
  const otherMuseumId = '22222222-2222-4222-8222-333333333333';

  const validTypeId1 = '33333333-3333-4333-8333-333333333333';
  const validTypeId2 = '44444444-4444-4444-8444-444444444444';

  const validToken = 'valid-token';
  const otherToken = 'other-token';
  const adminToken = 'admin-token';
  const superAdminToken = 'super-token';

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.users.clear();
    mockState.userRoles.clear();
    mockState.memberships = [];
    mockState.museums.clear();
    mockState.ticketTypes.clear();
    mockState.ticketOrders.clear();
    mockState.ticketOrderItems = [];
    mockState.ticketInvoices.clear();
    mockState.invoiceSeq = 1;

    // Seed regular user
    mockState.users.set(validUserId, {
      id: validUserId,
      displayName: 'Nguyen Van A',
      email: 'user@example.com',
    });
    mockState.userRoles.set(validUserId, new Set(['normal_user']));

    // Seed other user
    mockState.users.set(otherUserId, {
      id: otherUserId,
      displayName: 'Tran Van B',
      email: 'other@example.com',
    });
    mockState.userRoles.set(otherUserId, new Set(['normal_user']));

    // Seed admin user
    mockState.users.set(adminUserId, {
      id: adminUserId,
      displayName: 'Admin User',
      email: 'admin@example.com',
    });
    mockState.userRoles.set(adminUserId, new Set(['admin_user']));
    mockState.memberships.push({
      museumId: validMuseumId,
      userId: adminUserId,
      status: 'active',
    });

    // Seed super admin
    mockState.users.set(superAdminId, {
      id: superAdminId,
      displayName: 'Super Admin',
      email: 'super@example.com',
    });
    mockState.userRoles.set(superAdminId, new Set(['super_admin']));

    // Supabase auth mock
    mockGetUser.mockImplementation(async (token: string) => {
      if (token === validToken) {
        return {
          data: {
            user: { id: validUserId, email: 'user@example.com' },
          },
          error: null,
        };
      }
      if (token === otherToken) {
        return {
          data: {
            user: { id: otherUserId, email: 'other@example.com' },
          },
          error: null,
        };
      }
      if (token === adminToken) {
        return {
          data: {
            user: { id: adminUserId, email: 'admin@example.com' },
          },
          error: null,
        };
      }
      if (token === superAdminToken) {
        return {
          data: {
            user: { id: superAdminId, email: 'super@example.com' },
          },
          error: null,
        };
      }
      return { data: { user: null }, error: new Error('Invalid token') };
    });

    // Seed museums
    mockState.museums.set(validMuseumId, {
      id: validMuseumId,
      name: 'Vietnam National History Museum',
      status: 'published',
    });
    mockState.museums.set(otherMuseumId, {
      id: otherMuseumId,
      name: 'Other Museum',
      status: 'published',
    });

    // Seed ticket types
    mockState.ticketTypes.set(validTypeId1, {
      id: validTypeId1,
      museumId: validMuseumId,
      name: 'Adult Standard',
      price: '100000.00',
      isAvailable: true,
    });
    mockState.ticketTypes.set(validTypeId2, {
      id: validTypeId2,
      museumId: validMuseumId,
      name: 'Student Discount',
      price: '50000.00',
      isAvailable: true,
    });
  });

  describe('POST /api/v1/ticket-orders (Phase 3.2)', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).post('/api/v1/ticket-orders').send({});
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('unauthorized');
    });

    it('returns 400 validation_error on malformed body structure', async () => {
      const res = await request(app)
        .post('/api/v1/ticket-orders')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          museum_id: 'not-a-uuid',
          visit_date: '2026-12-01',
          time_slot: '09:00-11:00',
          items: [{ ticket_type_id: validTypeId1, quantity: 0 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('validation_error');
    });

    it('returns 400 invalid_visit_date when visit_date is in the past', async () => {
      const res = await request(app)
        .post('/api/v1/ticket-orders')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          museum_id: validMuseumId,
          visit_date: '2020-01-01',
          time_slot: '09:00-11:00',
          items: [{ ticket_type_id: validTypeId1, quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('invalid_visit_date');
    });

    it('returns 400 invalid_visit_date for malformed dates', async () => {
      const res = await request(app)
        .post('/api/v1/ticket-orders')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          museum_id: validMuseumId,
          visit_date: '2026-02-31',
          time_slot: '09:00-11:00',
          items: [{ ticket_type_id: validTypeId1, quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('invalid_visit_date');
    });

    it('returns 400 invalid_time_slot for bad slot value', async () => {
      const res = await request(app)
        .post('/api/v1/ticket-orders')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          museum_id: validMuseumId,
          visit_date: '2099-12-31',
          time_slot: '08:00-10:00',
          items: [{ ticket_type_id: validTypeId1, quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('invalid_time_slot');
    });

    it('returns 400 invalid_items for empty items array', async () => {
      const res = await request(app)
        .post('/api/v1/ticket-orders')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          museum_id: validMuseumId,
          visit_date: '2099-12-31',
          time_slot: '09:00-11:00',
          items: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('invalid_items');
    });

    it('rejects duplicate ticket_type_id entries as invalid_items', async () => {
      const res = await request(app)
        .post('/api/v1/ticket-orders')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          museum_id: validMuseumId,
          visit_date: '2099-12-31',
          time_slot: '09:00-11:00',
          items: [
            { ticket_type_id: validTypeId1, quantity: 1 },
            { ticket_type_id: validTypeId1, quantity: 2 },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('invalid_items');
    });

    it('returns 400 museum_not_available when museum is draft or archived', async () => {
      mockState.museums.set(validMuseumId, {
        id: validMuseumId,
        name: 'Draft Museum',
        status: 'draft',
      });

      const res = await request(app)
        .post('/api/v1/ticket-orders')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          museum_id: validMuseumId,
          visit_date: '2099-12-31',
          time_slot: '09:00-11:00',
          items: [{ ticket_type_id: validTypeId1, quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('museum_not_available');
    });

    it('returns 400 museum_not_available when museum does not exist', async () => {
      mockState.museums.clear();

      const res = await request(app)
        .post('/api/v1/ticket-orders')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          museum_id: validMuseumId,
          visit_date: '2099-12-31',
          time_slot: '09:00-11:00',
          items: [{ ticket_type_id: validTypeId1, quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('museum_not_available');
    });

    it('returns 400 ticket_type_unavailable when ticket type is not available', async () => {
      mockState.ticketTypes.set(validTypeId1, {
        id: validTypeId1,
        museumId: validMuseumId,
        name: 'Sold Out Ticket',
        price: '100000.00',
        isAvailable: false,
      });

      const res = await request(app)
        .post('/api/v1/ticket-orders')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          museum_id: validMuseumId,
          visit_date: '2099-12-31',
          time_slot: '09:00-11:00',
          items: [{ ticket_type_id: validTypeId1, quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('ticket_type_unavailable');
    });

    it('returns 400 ticket_type_unavailable when ticket type belongs to another museum', async () => {
      mockState.ticketTypes.set(validTypeId1, {
        id: validTypeId1,
        museumId: otherMuseumId,
        name: 'Other Museum Ticket',
        price: '100000.00',
        isAvailable: true,
      });

      const res = await request(app)
        .post('/api/v1/ticket-orders')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          museum_id: validMuseumId,
          visit_date: '2099-12-31',
          time_slot: '09:00-11:00',
          items: [{ ticket_type_id: validTypeId1, quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('ticket_type_unavailable');
    });

    it('creates order, items and invoice in a transaction', async () => {
      const today = getTodayVN();
      const res = await request(app)
        .post('/api/v1/ticket-orders')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          museum_id: validMuseumId,
          visit_date: today,
          time_slot: '14:00-16:00',
          items: [
            { ticket_type_id: validTypeId1, quantity: 2 },
            { ticket_type_id: validTypeId2, quantity: 1 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeDefined();

      const { order, invoice, items } = res.body.data;
      expect(order).toBeDefined();
      expect(order.status).toBe('confirmed');
      expect(order.payment_status ?? order.paymentStatus).toBe('paid');
      expect(order.entry_code ?? order.entryCode).toBeDefined();
      expect(typeof (order.entry_code ?? order.entryCode)).toBe('string');
      expect((order.entry_code ?? order.entryCode).length).toBe(32);
      expect(order.total_amount ?? order.totalAmount).toBe('250000.00');

      expect(invoice).toBeDefined();
      expect((invoice.invoice_number ?? invoice.invoiceNumber).startsWith('TKT-')).toBe(true);
      expect(invoice.total_amount ?? invoice.totalAmount).toBe('250000.00');

      const returnedItems = items ?? order.items;
      expect(returnedItems).toHaveLength(2);
      expect(returnedItems[0].quantity).toBe(2);
      expect(returnedItems[0].unit_price ?? returnedItems[0].unitPrice).toBe('100000.00');
    });
  });

  describe('GET /api/v1/ticket-orders', () => {
    it('returns 401 when no token is provided', async () => {
      const res = await request(app).get('/api/v1/ticket-orders');
      expect(res.status).toBe(401);
    });

    it('returns only caller orders with pagination', async () => {
      // Seed orders for validUserId and otherUserId
      const now = new Date();
      mockState.ticketOrders.set('order-1', {
        id: 'order-1',
        userId: validUserId,
        museumId: validMuseumId,
        visitDate: '2099-12-01',
        timeSlot: '09:00-11:00',
        status: 'confirmed',
        paymentStatus: 'paid',
        totalAmount: '100000.00',
        currency: 'VND',
        createdAt: now,
      });
      mockState.ticketOrders.set('order-2', {
        id: 'order-2',
        userId: otherUserId,
        museumId: validMuseumId,
        visitDate: '2099-12-02',
        timeSlot: '11:00-13:00',
        status: 'confirmed',
        paymentStatus: 'paid',
        totalAmount: '50000.00',
        currency: 'VND',
        createdAt: now,
      });

      const res = await request(app)
        .get('/api/v1/ticket-orders')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('order-1');
      expect(res.body.pagination.total).toBe(1);
    });
  });

  describe('GET /api/v1/ticket-orders/:id', () => {
    const orderId = '55555555-5555-4555-8555-555555555555';

    beforeEach(() => {
      const now = new Date();
      mockState.ticketOrders.set(orderId, {
        id: orderId,
        userId: validUserId,
        museumId: validMuseumId,
        visitDate: '2099-12-01',
        timeSlot: '09:00-11:00',
        status: 'confirmed',
        paymentStatus: 'paid',
        totalAmount: '100000.00',
        currency: 'VND',
        createdAt: now,
      });
      mockState.ticketOrderItems.push({
        id: 'item-1',
        ticketOrderId: orderId,
        ticketTypeId: validTypeId1,
        quantity: 1,
        unitPrice: '100000.00',
        lineTotal: '100000.00',
      });
      mockState.ticketInvoices.set('inv-1', {
        id: 'inv-1',
        ticketOrderId: orderId,
        invoiceNumber: 'TKT-100',
        issuedAt: now,
        billingName: 'Nguyen Van A',
        billingEmail: 'user@example.com',
        totalAmount: '100000.00',
        currency: 'VND',
      });
    });

    it('returns 404 order_not_found for unknown order', async () => {
      const res = await request(app)
        .get('/api/v1/ticket-orders/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('order_not_found');
    });

    it('returns order with items and invoice for owner', async () => {
      const res = await request(app)
        .get(`/api/v1/ticket-orders/${orderId}`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(orderId);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.invoice?.invoice_number ?? res.body.data.invoice?.invoiceNumber).toBe('TKT-100');
    });

    it('returns order for museum admin', async () => {
      const res = await request(app)
        .get(`/api/v1/ticket-orders/${orderId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(orderId);
    });

    it('returns 403 for another user without museum access', async () => {
      const res = await request(app)
        .get(`/api/v1/ticket-orders/${orderId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('not_owner_or_admin');
    });
  });

  describe('POST /api/v1/ticket-orders/:id/cancel', () => {
    const orderId = '66666666-6666-4666-8666-666666666666';

    beforeEach(() => {
      mockState.ticketOrders.set(orderId, {
        id: orderId,
        userId: validUserId,
        museumId: validMuseumId,
        visitDate: '2099-12-01',
        timeSlot: '09:00-11:00',
        status: 'confirmed',
        paymentStatus: 'paid',
        totalAmount: '100000.00',
        currency: 'VND',
      });
    });

    it('returns 404 order_not_found for an unknown order', async () => {
      const res = await request(app)
        .post('/api/v1/ticket-orders/00000000-0000-4000-8000-000000000000/cancel')
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('order_not_found');
    });

    it('returns 400 order_not_cancellable when status is not confirmed', async () => {
      const order = mockState.ticketOrders.get(orderId);
      order.status = 'cancelled';
      mockState.ticketOrders.set(orderId, order);

      const res = await request(app)
        .post(`/api/v1/ticket-orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('order_not_cancellable');
    });

    it('returns 400 visit_date_passed when visit_date is today or past in Vietnam', async () => {
      const order = mockState.ticketOrders.get(orderId);
      order.visitDate = getTodayVN();
      mockState.ticketOrders.set(orderId, order);

      const res = await request(app)
        .post(`/api/v1/ticket-orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('visit_date_passed');
    });

    it('returns 403 when caller is neither owner nor museum admin', async () => {
      const res = await request(app)
        .post(`/api/v1/ticket-orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('not_owner_or_admin');
    });

    it('cancels successfully for owner', async () => {
      const res = await request(app)
        .post(`/api/v1/ticket-orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
      expect(mockState.ticketOrders.get(orderId).status).toBe('cancelled');
    });

    it('cancels successfully for museum admin', async () => {
      const res = await request(app)
        .post(`/api/v1/ticket-orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
    });
  });

  describe('GET /api/v1/admin/museums/:museumId/ticket-orders', () => {
    it('returns 403 when caller does not manage the museum', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/museums/${validMuseumId}/ticket-orders`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('not_museum_admin');
    });

    it('filters by visit_date and status and paginates for an authorized admin', async () => {
      const now = new Date();
      mockState.ticketOrders.set('order-a', {
        id: 'order-a',
        userId: validUserId,
        museumId: validMuseumId,
        visitDate: '2099-12-01',
        status: 'confirmed',
        createdAt: now,
      });
      mockState.ticketOrders.set('order-b', {
        id: 'order-b',
        userId: otherUserId,
        museumId: validMuseumId,
        visitDate: '2099-12-02',
        status: 'cancelled',
        createdAt: now,
      });

      const res = await request(app)
        .get(`/api/v1/admin/museums/${validMuseumId}/ticket-orders?visit_date=2099-12-01&status=confirmed`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('order-a');
      expect(res.body.pagination.total).toBe(1);
    });

    it('loses access immediately after the museum membership is revoked', async () => {
      mockState.memberships[0].status = 'revoked';

      const res = await request(app)
        .get(`/api/v1/admin/museums/${validMuseumId}/ticket-orders`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('not_museum_admin');
    });
  });

  describe('POST /api/v1/admin/ticket-orders/redeem', () => {
    const entryCode = 'entry-code-12345678901234567890';
    const redeemOrderId = 'redeem-order-id';

    beforeEach(() => {
      mockState.ticketOrders.set(redeemOrderId, {
        id: redeemOrderId,
        userId: validUserId,
        museumId: validMuseumId,
        visitDate: getTodayVN(),
        status: 'confirmed',
        paymentStatus: 'paid',
        totalAmount: '100000.00',
        currency: 'VND',
        entryCode,
      });
    });

    it('returns 404 entry_code_not_found for unknown code', async () => {
      const res = await request(app)
        .post('/api/v1/admin/ticket-orders/redeem')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entry_code: 'unknown-code' });

      expect(res.status).toBe(404);
      expect(res.body.error?.code).toBe('entry_code_not_found');
    });

    it('returns 403 not_museum_admin for an admin scoped to another museum', async () => {
      // Modify order to belong to otherMuseumId where admin is not a member
      const order = mockState.ticketOrders.get(redeemOrderId);
      order.museumId = otherMuseumId;
      mockState.ticketOrders.set(redeemOrderId, order);

      const res = await request(app)
        .post('/api/v1/admin/ticket-orders/redeem')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entry_code: entryCode });

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('not_museum_admin');
    });

    it('checks museum authorization before revealing order status or visit date', async () => {
      // Order belongs to other museum and has wrong date and bad status
      const order = mockState.ticketOrders.get(redeemOrderId);
      order.museumId = otherMuseumId;
      order.status = 'cancelled';
      order.visitDate = '2020-01-01';
      mockState.ticketOrders.set(redeemOrderId, order);

      const res = await request(app)
        .post('/api/v1/admin/ticket-orders/redeem')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entry_code: entryCode });

      expect(res.status).toBe(403);
      expect(res.body.error?.code).toBe('not_museum_admin');
    });

    it('returns 400 order_not_confirmed when status is not confirmed', async () => {
      const order = mockState.ticketOrders.get(redeemOrderId);
      order.status = 'pending';
      mockState.ticketOrders.set(redeemOrderId, order);

      const res = await request(app)
        .post('/api/v1/admin/ticket-orders/redeem')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entry_code: entryCode });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('order_not_confirmed');
    });

    it('returns 400 wrong_visit_date when visit_date is not today VN', async () => {
      const order = mockState.ticketOrders.get(redeemOrderId);
      order.visitDate = '2099-12-31'; // Future date
      mockState.ticketOrders.set(redeemOrderId, order);

      const res = await request(app)
        .post('/api/v1/admin/ticket-orders/redeem')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entry_code: entryCode });

      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('wrong_visit_date');
    });

    it('sets status to used and records used_at', async () => {
      const res = await request(app)
        .post('/api/v1/admin/ticket-orders/redeem')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ entry_code: entryCode });

      expect(res.status).toBe(200);
      expect(res.body.data.ok).toBe(true);

      const updated = mockState.ticketOrders.get(redeemOrderId);
      expect(updated.status).toBe('used');
      expect(updated.usedAt).toBeDefined();
    });

    it('allows only one concurrent redeem; the second request returns already_used', async () => {
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/admin/ticket-orders/redeem')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ entry_code: entryCode }),
        request(app)
          .post('/api/v1/admin/ticket-orders/redeem')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ entry_code: entryCode }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 400]);

      const successRes = res1.status === 200 ? res1 : res2;
      const errorRes = res1.status === 400 ? res1 : res2;

      expect(successRes.body.data.ok).toBe(true);
      expect(errorRes.body.error?.code).toBe('already_used');
    });
  });
});
