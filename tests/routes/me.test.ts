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
    select: vi.fn((fields: Record<string, unknown>) => ({
      from: vi.fn(() => ({
        where: vi.fn((condition: unknown) => {
          const filters = extractEqFilters(condition);

          if ('display_name' in fields) {
            const userId = String(filters.id ?? '');
            const user = mockState.users.get(userId);
            const rows = user
              ? [{ id: user.id, display_name: user.displayName, phone: user.phone }]
              : [];
            return Object.assign(Promise.resolve(rows), {
              limit: vi.fn(async (n: number) => rows.slice(0, n)),
            });
          }

          if ('role' in fields) {
            const userId = String(filters.user_id ?? '');
            const roles = Array.from(mockState.userRoles.get(userId) ?? []);
            const filtered = filters.role
              ? roles.filter((role) => role === filters.role)
              : roles;
            const rows = filtered.map((role) => ({ role }));
            return Object.assign(Promise.resolve(rows), {
              limit: vi.fn(async (n: number) => rows.slice(0, n)),
            });
          }

          if ('museum_id' in fields) {
            const rows = mockState.memberships
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

            return Object.assign(Promise.resolve(rows), {
              limit: vi.fn(async (n: number) => rows.slice(0, n)),
            });
          }

          return Object.assign(Promise.resolve([]), {
            limit: vi.fn(async () => []),
          });
        }),
      })),
    })),
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
