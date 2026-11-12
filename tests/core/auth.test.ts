import { Router } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRole } from '../../src/lib/auth';

type MembershipStatus = 'active' | 'suspended' | 'revoked';

interface MembershipRecord {
  museumId: string;
  userId: string;
  status: MembershipStatus;
}

const { mockGetUser, mockState, mockTxInsert, mockDb } = vi.hoisted(() => {
  const mockGetUser = vi.fn();

  const mockState = {
    users: new Set<string>(),
    userRoles: new Map<string, Set<AppRole>>(),
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
    values: vi.fn((val: { id?: string; userId?: string; role?: AppRole }) => ({
      onConflictDoNothing: vi.fn(async () => {
        if (val.id) {
          mockState.users.add(val.id);
        }
        if (val.userId && val.role) {
          const roles = mockState.userRoles.get(val.userId) ?? new Set<AppRole>();
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
            .map((m) => ({ museumId: m.museumId }));

          return Object.assign(Promise.resolve(rows), {
            limit: vi.fn(async (n: number) => rows.slice(0, n)),
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
import {
  canManageMuseum,
  ensureUserProvisioned,
  getManagedMuseumIds,
  getUserRoles,
  isSuperAdmin,
} from '../../src/lib/auth';
import { sendSuccess } from '../../src/lib/response';
import {
  requireAuth,
  requireMuseumAdmin,
  requireSuperAdmin,
} from '../../src/middleware/auth';

const MUSEUM_A = '550e8400-e29b-41d4-a716-446655440000';
const MUSEUM_B = '660e8400-e29b-41d4-a716-446655440001';

describe('centralized auth & permission helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.users.clear();
    mockState.userRoles.clear();
    mockState.memberships = [];
  });

  it('idempotently provisions public.users and normal_user without duplicating or stripping roles', async () => {
    await ensureUserProvisioned('user-1');
    expect(mockState.users.has('user-1')).toBe(true);
    expect(await getUserRoles('user-1')).toEqual(['normal_user']);

    mockState.userRoles.get('user-1')?.add('admin_user');
    await ensureUserProvisioned('user-1');
    expect(await getUserRoles('user-1')).toEqual(['normal_user', 'admin_user']);
  });

  it('evaluates isSuperAdmin against Postgres per call', async () => {
    expect(await isSuperAdmin('')).toBe(false);
    expect(await isSuperAdmin('user-1')).toBe(false);

    mockState.userRoles.set('user-1', new Set(['normal_user', 'admin_user']));
    expect(await isSuperAdmin('user-1')).toBe(false);

    mockState.userRoles.set('user-1', new Set(['normal_user', 'super_admin']));
    expect(await isSuperAdmin('user-1')).toBe(true);

    mockState.userRoles.set('user-1', new Set(['normal_user']));
    expect(await isSuperAdmin('user-1')).toBe(false);
  });

  it('requires both admin_user role and active museum_admins row in canManageMuseum (unless super_admin)', async () => {
    expect(await canManageMuseum('', MUSEUM_A)).toBe(false);
    expect(await canManageMuseum('user-1', '')).toBe(false);

    // normal_user with active membership row cannot manage
    mockState.userRoles.set('user-1', new Set(['normal_user']));
    mockState.memberships = [
      { museumId: MUSEUM_A, userId: 'user-1', status: 'active' },
    ];
    expect(await canManageMuseum('user-1', MUSEUM_A)).toBe(false);

    // admin_user active for MUSEUM_A can manage MUSEUM_A, not MUSEUM_B
    mockState.userRoles.set('user-1', new Set(['normal_user', 'admin_user']));
    expect(await canManageMuseum('user-1', MUSEUM_A)).toBe(true);
    expect(await canManageMuseum('user-1', MUSEUM_B)).toBe(false);

    // suspended or revoked membership denies access immediately
    mockState.memberships = [
      { museumId: MUSEUM_A, userId: 'user-1', status: 'suspended' },
    ];
    expect(await canManageMuseum('user-1', MUSEUM_A)).toBe(false);

    mockState.memberships = [
      { museumId: MUSEUM_A, userId: 'user-1', status: 'revoked' },
    ];
    expect(await canManageMuseum('user-1', MUSEUM_A)).toBe(false);

    // super_admin can manage any museum even with no membership row
    mockState.userRoles.set('user-1', new Set(['super_admin']));
    mockState.memberships = [];
    expect(await canManageMuseum('user-1', MUSEUM_B)).toBe(true);
  });

  it('returns active managed museum IDs only when user holds admin_user role', async () => {
    mockState.userRoles.set('user-1', new Set(['normal_user']));
    mockState.memberships = [
      { museumId: MUSEUM_A, userId: 'user-1', status: 'active' },
      { museumId: MUSEUM_B, userId: 'user-1', status: 'revoked' },
    ];
    expect(await getManagedMuseumIds('user-1')).toEqual([]);

    mockState.userRoles.set('user-1', new Set(['normal_user', 'admin_user']));
    expect(await getManagedMuseumIds('user-1')).toEqual([MUSEUM_A]);
  });
});

describe('auth and RBAC middleware', () => {
  const testRouter = Router();

  testRouter.get('/protected', requireAuth, (req, res) => {
    sendSuccess(res, { userId: req.auth?.userId, email: req.auth?.email });
  });

  testRouter.get(
    '/super-only',
    requireAuth,
    requireSuperAdmin,
    (_req, res) => {
      sendSuccess(res, { ok: true });
    }
  );

  testRouter.get('/super-without-auth', requireSuperAdmin, (_req, res) => {
    sendSuccess(res, { ok: true });
  });

  testRouter.get(
    '/museums/:museumId/admin',
    requireAuth,
    requireMuseumAdmin(),
    (req, res) => {
      sendSuccess(res, { museumId: req.params.museumId });
    }
  );

  testRouter.get(
    '/museum-admin-without-auth/:museumId',
    requireMuseumAdmin(),
    (_req, res) => {
      sendSuccess(res, { ok: true });
    }
  );

  testRouter.post(
    '/museum-admin-from-body',
    requireAuth,
    requireMuseumAdmin((req) =>
      typeof req.body?.museum_id === 'string' ? req.body.museum_id : undefined
    ),
    (req, res) => {
      sendSuccess(res, { museumId: req.body.museum_id });
    }
  );

  const app = createApp({ extraV1Router: testRouter });

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.users.clear();
    mockState.userRoles.clear();
    mockState.memberships = [];
  });

  it('rejects missing, malformed, expired, or unverified bearer tokens with 401', async () => {
    const noHeader = await request(app).get('/api/v1/protected');
    expect(noHeader.status).toBe(401);
    expect(noHeader.body.error.code).toBe('unauthorized');

    const badScheme = await request(app)
      .get('/api/v1/protected')
      .set('Authorization', 'Basic abc123');
    expect(badScheme.status).toBe(401);

    const emptyBearer = await request(app)
      .get('/api/v1/protected')
      .set('Authorization', 'Bearer   ');
    expect(emptyBearer.status).toBe(401);

    const multiPartBearer = await request(app)
      .get('/api/v1/protected')
      .set('Authorization', 'Bearer token-1 extra');
    expect(multiPartBearer.status).toBe(401);

    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'JWT expired' },
    });
    const expired = await request(app)
      .get('/api/v1/protected')
      .set('Authorization', 'Bearer expired-token');
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('unauthorized');

    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });
    const missingUser = await request(app)
      .get('/api/v1/protected')
      .set('Authorization', 'Bearer orphan-token');
    expect(missingUser.status).toBe(401);
    expect(missingUser.body.error.code).toBe('unauthorized');
  });

  it('attaches req.auth and idempotently provisions user across repeated requests', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: undefined } },
      error: null,
    });

    const first = await request(app)
      .get('/api/v1/protected')
      .set('Authorization', 'bearer valid-token');

    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      data: { userId: 'user-1', email: null },
    });
    expect(mockGetUser).toHaveBeenCalledWith('valid-token');
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockTxInsert).toHaveBeenCalledTimes(2);
    expect(mockState.users.has('user-1')).toBe(true);
    expect(await getUserRoles('user-1')).toEqual(['normal_user']);

    const second = await request(app)
      .get('/api/v1/protected')
      .set('Authorization', 'Bearer valid-token');

    expect(second.status).toBe(200);
    expect(mockDb.transaction).toHaveBeenCalledTimes(2);
    expect(await getUserRoles('user-1')).toEqual(['normal_user']);
  });

  it('enforces requireSuperAdmin and applies role revocation on the very next request', async () => {
    const noAuth = await request(app).get('/api/v1/super-without-auth');
    expect(noAuth.status).toBe(401);

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-2', email: 'admin@example.com' } },
      error: null,
    });

    mockState.userRoles.set('user-2', new Set(['normal_user', 'admin_user']));
    const denied = await request(app)
      .get('/api/v1/super-only')
      .set('Authorization', 'Bearer same-token');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('forbidden');

    mockState.userRoles.set('user-2', new Set(['normal_user', 'super_admin']));
    const allowed = await request(app)
      .get('/api/v1/super-only')
      .set('Authorization', 'Bearer same-token');
    expect(allowed.status).toBe(200);
    expect(allowed.body.data).toEqual({ ok: true });

    // Revoke super_admin in Postgres; the same token must fail immediately
    mockState.userRoles.set('user-2', new Set(['normal_user']));
    const afterRevoke = await request(app)
      .get('/api/v1/super-only')
      .set('Authorization', 'Bearer same-token');
    expect(afterRevoke.status).toBe(403);
    expect(afterRevoke.body.error.code).toBe('forbidden');
  });

  it('enforces requireMuseumAdmin, custom resolvers, museum scoping, and immediate revocation', async () => {
    const noAuth = await request(app).get(
      `/api/v1/museum-admin-without-auth/${MUSEUM_A}`
    );
    expect(noAuth.status).toBe(401);

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-3', email: 'staff@example.com' } },
      error: null,
    });

    const missingMuseumId = await request(app)
      .post('/api/v1/museum-admin-from-body')
      .set('Authorization', 'Bearer staff-token')
      .send({ museum_id: '   ' });
    expect(missingMuseumId.status).toBe(400);
    expect(missingMuseumId.body.error.code).toBe('validation_error');

    // normal_user without admin_user role -> 403 not_museum_admin
    mockState.userRoles.set('user-3', new Set(['normal_user']));
    mockState.memberships = [
      { museumId: MUSEUM_A, userId: 'user-3', status: 'active' },
    ];
    const normalDenied = await request(app)
      .get(`/api/v1/museums/${MUSEUM_A}/admin`)
      .set('Authorization', 'Bearer staff-token');
    expect(normalDenied.status).toBe(403);
    expect(normalDenied.body.error.code).toBe('not_museum_admin');

    // admin_user active for MUSEUM_A -> 200 on MUSEUM_A, 403 on MUSEUM_B
    mockState.userRoles.set('user-3', new Set(['normal_user', 'admin_user']));
    const activeAllowed = await request(app)
      .get(`/api/v1/museums/${MUSEUM_A}/admin`)
      .set('Authorization', 'Bearer staff-token');
    expect(activeAllowed.status).toBe(200);
    expect(activeAllowed.body.data).toEqual({ museumId: MUSEUM_A });

    const bodyAllowed = await request(app)
      .post('/api/v1/museum-admin-from-body')
      .set('Authorization', 'Bearer staff-token')
      .send({ museum_id: MUSEUM_A });
    expect(bodyAllowed.status).toBe(200);

    const otherMuseumDenied = await request(app)
      .get(`/api/v1/museums/${MUSEUM_B}/admin`)
      .set('Authorization', 'Bearer staff-token');
    expect(otherMuseumDenied.status).toBe(403);
    expect(otherMuseumDenied.body.error.code).toBe('not_museum_admin');

    // Revoking museum_admins takes effect on the very next request with same token
    mockState.memberships = [
      { museumId: MUSEUM_A, userId: 'user-3', status: 'revoked' },
    ];
    const revokedDenied = await request(app)
      .get(`/api/v1/museums/${MUSEUM_A}/admin`)
      .set('Authorization', 'Bearer staff-token');
    expect(revokedDenied.status).toBe(403);
    expect(revokedDenied.body.error.code).toBe('not_museum_admin');

    // super_admin without museum_admins row -> 200
    mockState.userRoles.set('user-3', new Set(['super_admin']));
    mockState.memberships = [];
    const superAllowed = await request(app)
      .get(`/api/v1/museums/${MUSEUM_B}/admin`)
      .set('Authorization', 'Bearer staff-token');
    expect(superAllowed.status).toBe(200);
  });
});
