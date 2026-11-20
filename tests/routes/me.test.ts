import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface UserProfile {
  id: string;
  displayName: string | null;
  phone: string | null;
}

interface MembershipRecord {
  museumId: string;
  userId: string;
  status: 'active' | 'suspended' | 'revoked';
}

const { mockGetUser, mockState, mockTxInsert, mockDb } = vi.hoisted(() => {
  const mockGetUser = vi.fn();

  const mockState = {
    users: new Map<string, UserProfile>(),
    userRoles: new Map<string, Set<string>>(),
    memberships: [] as MembershipRecord[],
  };

  function extractEqFilters(
    node: unknown,
    out: Record<string, unknown> = {}
  ): Record<string, unknown> {
    if (!node || typeof node !== 'object') {
      return out;
    }
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (!Array.isArray(chunks)) {
      return out;
    }

    let currentColumn: string | null = null;
    for (const chunk of chunks) {
      if (chunk && typeof chunk === 'object') {
        const candidate = chunk as {
          queryChunks?: unknown[];
          name?: unknown;
          table?: unknown;
          encoder?: unknown;
          value?: unknown;
        };
        if (Array.isArray(candidate.queryChunks)) {
          extractEqFilters(candidate, out);
        } else if (typeof candidate.name === 'string' && candidate.table) {
          currentColumn = candidate.name;
        } else if ('encoder' in candidate && currentColumn) {
          out[currentColumn] = candidate.value;
          currentColumn = null;
        }
      }
    }
    return out;
  }

  const mockTxInsert = vi.fn(() => ({
    values: vi.fn((val: { id?: string; userId?: string; role?: string }) => ({
      onConflictDoNothing: vi.fn(async () => {
        if (val.id && !mockState.users.has(val.id)) {
          mockState.users.set(val.id, {
            id: val.id,
            displayName: null,
            phone: null,
          });
        }
        if (val.userId && val.role) {
          const roles = mockState.userRoles.get(val.userId) ?? new Set<string>();
          roles.add(val.role);
          mockState.userRoles.set(val.userId, roles);
        }
      }),
    })),
  }));

  const mockDb = {
    transaction: vi.fn(
      async (fn: (tx: { insert: typeof mockTxInsert }) => Promise<void>) => {
        await fn({ insert: mockTxInsert });
      }
    ),
    update: vi.fn((_table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn((condition: unknown) => {
          const filters = extractEqFilters(condition);
          const userId = String(filters.id ?? '');
          const user = mockState.users.get(userId);

          const doUpdate = () => {
            if (!user) return [];
            if (values.displayName !== undefined) {
              user.displayName = values.displayName as string | null;
            }
            if (values.phone !== undefined) {
              user.phone = values.phone as string | null;
            }
            mockState.users.set(userId, user);
            return [
              {
                id: user.id,
                display_name: user.displayName,
                phone: user.phone,
              },
            ];
          };

          return {
            returning: vi.fn(async () => doUpdate()),
          };
        }),
      })),
    })),
    select: vi.fn((fields: Record<string, unknown>) => {
      let initialRows: any[] = [];
      if ('total' in fields) {
        initialRows = [{ total: mockState.users.size }];
      } else if ('userId' in fields && 'role' in fields) {
        const rows: { userId: string; role: string }[] = [];
        for (const [uid, rSet] of mockState.userRoles.entries()) {
          for (const r of rSet) {
            rows.push({ userId: uid, role: r });
          }
        }
        initialRows = rows;
      } else if ('userId' in fields && 'museum_id' in fields) {
        initialRows = mockState.memberships.map((m) => ({
          userId: m.userId,
          museum_id: m.museumId,
          status: m.status,
        }));
      }

      const createQueryPromise = (
        rows: any[],
        options = { limit: Infinity, offset: 0 }
      ) => {
        const getSlice = () =>
          rows.slice(options.offset, options.offset + options.limit);
        const promise = Promise.resolve().then(() => getSlice());

        return Object.assign(promise, {
          orderBy: vi.fn(() => createQueryPromise(rows, options)),
          where: vi.fn((condition: unknown) => {
            const filters = extractEqFilters(condition);

            if ('display_name' in fields) {
              const userId = String(filters.id ?? '');
              const user = mockState.users.get(userId);
              const matched = user
                ? [
                    {
                      id: user.id,
                      display_name: user.displayName,
                      phone: user.phone,
                    },
                  ]
                : [];
              return createQueryPromise(matched, options);
            }

            if ('role' in fields && !('userId' in fields)) {
              const userId = String(filters.user_id ?? '');
              const roles = Array.from(mockState.userRoles.get(userId) ?? []);
              const filtered = filters.role
                ? roles.filter((role) => role === filters.role)
                : roles;
              const matched = filtered.map((role) => ({ role }));
              return createQueryPromise(matched, options);
            }

            if ('museum_id' in fields && !('userId' in fields)) {
              const matched = mockState.memberships
                .filter((m) => {
                  if (filters.user_id && m.userId !== filters.user_id) {
                    return false;
                  }
                  if (filters.museum_id && m.museumId !== filters.museum_id) {
                    return false;
                  }
                  if (filters.status && m.status !== filters.status) {
                    return false;
                  }
                  return true;
                })
                .map((m) => ({ museum_id: m.museumId, status: m.status }));
              return createQueryPromise(matched, options);
            }

            return createQueryPromise(rows, options);
          }),
          limit: vi.fn((n: number) => {
            return createQueryPromise(rows, { ...options, limit: n });
          }),
          offset: vi.fn((o: number) => {
            return createQueryPromise(rows, { ...options, offset: o });
          }),
        });
      };

      return {
        from: vi.fn(() => {
          if ('display_name' in fields) {
            const allUsers = Array.from(mockState.users.values()).map((u) => ({
              id: u.id,
              display_name: u.displayName,
              phone: u.phone,
            }));
            return createQueryPromise(allUsers);
          }
          return createQueryPromise(initialRows);
        }),
      };
    }),
  };

  return { mockGetUser, mockState, mockTxInsert, mockDb };
});

vi.mock('../../src/config/supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

vi.mock('../../src/db', () => ({
  db: mockDb,
  closeDb: vi.fn(),
}));

import { createApp } from '../../src/app';

describe('GET /api/v1/me', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.users.clear();
    mockState.userRoles.clear();
    mockState.memberships = [];
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/v1/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('returns 401 when token is invalid or expired', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'jwt expired' },
    });

    const res = await request(app)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer expired-token');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('provisions new user and returns default profile with normal_user role', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          email: 'visitor@museum.vn',
        },
      },
      error: null,
    });

    const res = await request(app)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        id: '11111111-1111-4111-8111-111111111111',
        display_name: null,
        phone: null,
        roles: ['normal_user'],
        managed_museums: [],
      },
    });
  });

  it('returns profile with custom name and active managed_museums for admin_user', async () => {
    const adminId = '22222222-2222-4222-8222-222222222222';
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: adminId,
          email: 'admin@museum.vn',
        },
      },
      error: null,
    });

    mockState.users.set(adminId, {
      id: adminId,
      displayName: 'Nguyen Van A',
      phone: '0901234567',
    });
    mockState.userRoles.set(adminId, new Set(['normal_user', 'admin_user']));
    mockState.memberships.push(
      {
        museumId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        userId: adminId,
        status: 'active',
      },
      {
        museumId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        userId: adminId,
        status: 'revoked',
      }
    );

    const res = await request(app)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: adminId,
      display_name: 'Nguyen Van A',
      phone: '0901234567',
      roles: expect.arrayContaining(['normal_user', 'admin_user']),
      managed_museums: [
        {
          museum_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'active',
        },
      ],
    });
  });

  it('returns empty managed_museums for normal_user even if membership rows exist', async () => {
    const userId = '33333333-3333-4333-8333-333333333333';
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: userId,
          email: 'user@museum.vn',
        },
      },
      error: null,
    });

    mockState.users.set(userId, {
      id: userId,
      displayName: 'Normal User',
      phone: null,
    });
    mockState.userRoles.set(userId, new Set(['normal_user']));
    mockState.memberships.push({
      museumId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      userId: userId,
      status: 'active',
    });

    const res = await request(app)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(200);
    expect(res.body.data.managed_museums).toEqual([]);
  });

  it('returns 404 when user profile is not found in database', async () => {
    const missingUserId = '44444444-4444-4444-8444-444444444444';
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: missingUserId,
          email: 'missing@museum.vn',
        },
      },
      error: null,
    });

    // Ensure mockState does not have this user
    mockState.users.delete(missingUserId);

    // Override mockTxInsert temporarily so ensureUserProvisioned does not add the user
    mockTxInsert.mockReturnValueOnce({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(async () => {}),
      })),
    });

    const res = await request(app)
      .get('/api/v1/me')
      .set('Authorization', 'Bearer missing-user-token');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('PATCH /api/v1/me', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.users.clear();
    mockState.userRoles.clear();
    mockState.memberships = [];
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .patch('/api/v1/me')
      .send({ display_name: 'Duy' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('updates display_name and phone', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: userId, email: 'duy@museum.vn' } },
      error: null,
    });

    mockState.users.set(userId, {
      id: userId,
      displayName: 'Old Name',
      phone: '0900000000',
    });

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', 'Bearer valid-token')
      .send({
        display_name: 'Duy Nguyen',
        phone: '0901234567',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        id: userId,
        display_name: 'Duy Nguyen',
        phone: '0901234567',
      },
    });

    expect(mockState.users.get(userId)).toEqual({
      id: userId,
      displayName: 'Duy Nguyen',
      phone: '0901234567',
    });
  });

  it('rejects a sensitive field with 400 and performs no partial update', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: userId, email: 'duy@museum.vn' } },
      error: null,
    });

    mockState.users.set(userId, {
      id: userId,
      displayName: 'Old Name',
      phone: '0900000000',
    });

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', 'Bearer valid-token')
      .send({
        display_name: 'Duy Nguyen',
        role: 'super_admin',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');

    // Confirm no update occurred
    expect(mockState.users.get(userId)).toEqual({
      id: userId,
      displayName: 'Old Name',
      phone: '0900000000',
    });
  });

  it('allows null to clear a nullable profile field', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: userId, email: 'duy@museum.vn' } },
      error: null,
    });

    mockState.users.set(userId, {
      id: userId,
      displayName: 'Old Name',
      phone: '0900000000',
    });

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', 'Bearer valid-token')
      .send({
        display_name: null,
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: userId,
      display_name: null,
      phone: '0900000000',
    });

    expect(mockState.users.get(userId)).toEqual({
      id: userId,
      displayName: null,
      phone: '0900000000',
    });
  });

  it('updates only display_name without altering existing phone', async () => {
    const userId = '22222222-2222-4222-8222-222222222222';
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: userId, email: 'user@museum.vn' } },
      error: null,
    });

    mockState.users.set(userId, {
      id: userId,
      displayName: 'Old Name',
      phone: '0988888888',
    });

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ display_name: 'New Name' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      id: userId,
      display_name: 'New Name',
      phone: '0988888888',
    });
  });

  it('returns 400 validation_error when body contains only unknown fields', async () => {
    const userId = '33333333-3333-4333-8333-333333333333';
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: userId, email: 'user@museum.vn' } },
      error: null,
    });

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ role: 'super_admin' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('returns 400 validation_error when body is empty', async () => {
    const userId = '33333333-3333-4333-8333-333333333333';
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: userId, email: 'user@museum.vn' } },
      error: null,
    });

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('returns 400 validation_error when display_name is empty string', async () => {
    const userId = '33333333-3333-4333-8333-333333333333';
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: userId, email: 'user@museum.vn' } },
      error: null,
    });

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ display_name: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('returns 400 validation_error when phone exceeds 20 characters', async () => {
    const userId = '33333333-3333-4333-8333-333333333333';
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: userId, email: 'user@museum.vn' } },
      error: null,
    });

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ phone: '123456789012345678901' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('returns 404 when user is not found in database', async () => {
    const missingUserId = '99999999-9999-4999-8999-999999999999';
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: missingUserId, email: 'missing@museum.vn' } },
      error: null,
    });

    mockState.users.delete(missingUserId);
    mockTxInsert.mockReturnValueOnce({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(async () => {}),
      })),
    });

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ display_name: 'Duy' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('GET /api/v1/admin/users', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.users.clear();
    mockState.userRoles.clear();
    mockState.memberships = [];
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/v1/admin/users');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('returns 401 when token is invalid or expired', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'jwt expired' },
    });

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('returns 403 when user is normal_user', async () => {
    const normalUserId = '11111111-1111-4111-8111-111111111111';
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: normalUserId, email: 'user@museum.vn' } },
      error: null,
    });

    mockState.users.set(normalUserId, {
      id: normalUserId,
      displayName: 'Normal User',
      phone: null,
    });
    mockState.userRoles.set(normalUserId, new Set(['normal_user']));

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer user-token');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('returns 403 when user is admin_user (not super_admin)', async () => {
    const adminUserId = '22222222-2222-4222-8222-222222222222';
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: adminUserId, email: 'admin@museum.vn' } },
      error: null,
    });

    mockState.users.set(adminUserId, {
      id: adminUserId,
      displayName: 'Museum Admin',
      phone: null,
    });
    mockState.userRoles.set(adminUserId, new Set(['normal_user', 'admin_user']));

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer admin-token');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('returns paginated users with roles and active managed_museums for super_admin', async () => {
    const superAdminId = '33333333-3333-4333-8333-333333333333';
    const museumAdminId = '44444444-4444-4444-8444-444444444444';
    const normalUserId = '55555555-5555-4555-8555-555555555555';

    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: superAdminId, email: 'super@museum.vn' } },
      error: null,
    });

    mockState.users.set(superAdminId, {
      id: superAdminId,
      displayName: 'Super Admin',
      phone: '0901111111',
    });
    mockState.userRoles.set(
      superAdminId,
      new Set(['normal_user', 'super_admin'])
    );

    mockState.users.set(museumAdminId, {
      id: museumAdminId,
      displayName: 'Museum Admin',
      phone: '0902222222',
    });
    mockState.userRoles.set(
      museumAdminId,
      new Set(['normal_user', 'admin_user'])
    );
    mockState.memberships.push(
      {
        museumId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        userId: museumAdminId,
        status: 'active',
      },
      {
        museumId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        userId: museumAdminId,
        status: 'revoked',
      }
    );

    mockState.users.set(normalUserId, {
      id: normalUserId,
      displayName: 'Normal Visitor',
      phone: null,
    });
    mockState.userRoles.set(normalUserId, new Set(['normal_user']));

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer super-token');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      limit: 24,
      offset: 0,
      total: 3,
    });
    expect(res.body.data).toHaveLength(3);

    const superAdminRow = res.body.data.find(
      (u: any) => u.id === superAdminId
    );
    expect(superAdminRow).toMatchObject({
      id: superAdminId,
      display_name: 'Super Admin',
      phone: '0901111111',
      roles: expect.arrayContaining(['normal_user', 'super_admin']),
      managed_museums: [],
    });

    const museumAdminRow = res.body.data.find(
      (u: any) => u.id === museumAdminId
    );
    expect(museumAdminRow).toMatchObject({
      id: museumAdminId,
      display_name: 'Museum Admin',
      phone: '0902222222',
      roles: expect.arrayContaining(['normal_user', 'admin_user']),
      managed_museums: expect.arrayContaining([
        {
          museum_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          status: 'active',
        },
        {
          museum_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          status: 'revoked',
        },
      ]),
    });
    expect(museumAdminRow.managed_museums).toHaveLength(2);

    const normalUserRow = res.body.data.find(
      (u: any) => u.id === normalUserId
    );
    expect(normalUserRow).toMatchObject({
      id: normalUserId,
      display_name: 'Normal Visitor',
      phone: null,
      roles: ['normal_user'],
      managed_museums: [],
    });
  });

  it('supports custom limit and offset query parameters', async () => {
    const superAdminId = '33333333-3333-4333-8333-333333333333';
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: superAdminId, email: 'super@museum.vn' } },
      error: null,
    });

    mockState.users.set(superAdminId, {
      id: superAdminId,
      displayName: 'Super Admin',
      phone: null,
    });
    mockState.userRoles.set(
      superAdminId,
      new Set(['normal_user', 'super_admin'])
    );

    for (let i = 1; i <= 5; i++) {
      const uid = `00000000-0000-4000-8000-00000000000${i}`;
      mockState.users.set(uid, {
        id: uid,
        displayName: `User ${i}`,
        phone: null,
      });
      mockState.userRoles.set(uid, new Set(['normal_user']));
    }

    const res = await request(app)
      .get('/api/v1/admin/users?limit=2&offset=1')
      .set('Authorization', 'Bearer super-token');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({
      limit: 2,
      offset: 1,
      total: 6,
    });
    expect(res.body.data).toHaveLength(2);
  });

  it('returns 400 validation_error when limit or offset is invalid', async () => {
    const superAdminId = '33333333-3333-4333-8333-333333333333';
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: superAdminId, email: 'super@museum.vn' } },
      error: null,
    });

    mockState.users.set(superAdminId, {
      id: superAdminId,
      displayName: 'Super Admin',
      phone: null,
    });
    mockState.userRoles.set(
      superAdminId,
      new Set(['normal_user', 'super_admin'])
    );

    const res = await request(app)
      .get('/api/v1/admin/users?limit=-5')
      .set('Authorization', 'Bearer super-token');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });
});


