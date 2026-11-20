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

const { mockGetUser, mockState, mockDb } = vi.hoisted(() => {
  const mockGetUser = vi.fn();

  const mockState = {
    users: new Map<string, UserProfile>(),
    userRoles: new Map<string, Set<string>>(),
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
      const rows: any[] = [];
      for (const [uid, rSet] of mockState.userRoles.entries()) {
        for (const r of rSet) {
          rows.push({ userId: uid, role: r });
        }
      }
      return rows;
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

  const createQueryChain = (table: any, cond?: any) => {
    const chain: any = {
      for: vi.fn(() => chain),
      limit: vi.fn((n: number) => {
        const rows = handleSelectRows(table, cond);
        return Promise.resolve(rows.slice(0, n));
      }),
      then: (resolve: any, reject?: any) => {
        const rows = handleSelectRows(table, cond);
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain;
  };

  const txObject: any = {
    select: vi.fn((_fields?: any) => ({
      from: vi.fn((table: any) => ({
        where: vi.fn((cond: any) => createQueryChain(table, cond)),
      })),
    })),
    insert: vi.fn(handleInsert),
    execute: vi.fn(async () => {
      const seq = String(mockState.invoiceSeq++);
      return [{ seq }];
    }),
  };

  const mockDb = {
    transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(txObject)),
    select: vi.fn((_fields?: any) => ({
      from: vi.fn((table: any) => ({
        where: vi.fn((cond: any) => createQueryChain(table, cond)),
      })),
    })),
    insert: vi.fn(handleInsert),
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

describe('POST /api/v1/ticket-orders', () => {
  const validUserId = '11111111-1111-4111-8111-111111111111';
  const validMuseumId = '22222222-2222-4222-8222-222222222222';
  const validTypeId1 = '33333333-3333-4333-8333-333333333333';
  const validTypeId2 = '44444444-4444-4444-8444-444444444444';
  const validToken = 'valid-token';

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.users.clear();
    mockState.userRoles.clear();
    mockState.museums.clear();
    mockState.ticketTypes.clear();
    mockState.ticketOrders.clear();
    mockState.ticketOrderItems = [];
    mockState.ticketInvoices.clear();
    mockState.invoiceSeq = 1;

    // Seed authenticated user
    mockState.users.set(validUserId, {
      id: validUserId,
      displayName: 'Nguyen Van A',
      email: 'user@example.com',
    });
    mockState.userRoles.set(validUserId, new Set(['normal_user']));

    mockGetUser.mockImplementation(async (token: string) => {
      if (token === validToken) {
        return {
          data: {
            user: {
              id: validUserId,
              email: 'user@example.com',
              user_metadata: { full_name: 'Nguyen Van A' },
            },
          },
          error: null,
        };
      }
      return { data: { user: null }, error: new Error('Invalid token') };
    });

    // Seed published museum
    mockState.museums.set(validMuseumId, {
      id: validMuseumId,
      name: 'Vietnam National History Museum',
      status: 'published',
    });

    // Seed ticket types for this museum
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
        time_slot: '08:00-10:00', // Invalid slot
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
    const otherMuseumId = '99999999-9999-4999-8999-999999999999';
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

  it('rejects quantities that exceed the PostgreSQL integer range', async () => {
    const res = await request(app)
      .post('/api/v1/ticket-orders')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        museum_id: validMuseumId,
        visit_date: '2099-12-31',
        time_slot: '09:00-11:00',
        items: [{ ticket_type_id: validTypeId1, quantity: 2147483648 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('invalid_items');
    expect(mockState.ticketOrders.size).toBe(0);
  });

  it('rejects order totals that exceed numeric(12,2) before inserting', async () => {
    mockState.ticketTypes.set(validTypeId1, {
      id: validTypeId1,
      museumId: validMuseumId,
      name: 'Maximum Price Ticket',
      price: '9999999999.99',
      isAvailable: true,
    });

    const res = await request(app)
      .post('/api/v1/ticket-orders')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        museum_id: validMuseumId,
        visit_date: '2099-12-31',
        time_slot: '09:00-11:00',
        items: [{ ticket_type_id: validTypeId1, quantity: 2 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('invalid_items');
    expect(mockState.ticketOrders.size).toBe(0);
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
          { ticket_type_id: validTypeId1, quantity: 2 }, // 2 * 100,000 = 200,000
          { ticket_type_id: validTypeId2, quantity: 1 }, // 1 * 50,000 = 50,000
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
    expect(returnedItems[1].quantity).toBe(1);
    expect(returnedItems[1].unit_price ?? returnedItems[1].unitPrice).toBe('50000.00');
  });
});
