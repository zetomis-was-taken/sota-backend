import { Router } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetUser, mockState, mockTxInsert, mockDb } = vi.hoisted(() => {
  const mockGetUser = vi.fn();

  const mockState = {
    roles: [] as Array<'normal_user' | 'admin_user' | 'super_admin'>,
    activeMemberships: [] as string[],
  };

  const mockTxInsert = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(async () => undefined),
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
        where: vi.fn(() => {
          if ('role' in fields) {
            const rows = mockState.roles.map((role) => ({ role }));
            return Object.assign(Promise.resolve(rows), {
              limit: vi.fn(async () =>
                mockState.roles.includes('super_admin')
                  ? [{ role: 'super_admin' }]
                  : []
              ),
            });
          }
          const membershipRows = mockState.activeMemberships.map(
            (museumId) => ({
              museumId,
            })
          );
          return Object.assign(Promise.resolve(membershipRows), {
            limit: vi.fn(async () => membershipRows.slice(0, 1)),
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
import { sendSuccess } from '../../src/lib/response';
import {
  requireAuth,
  requireMuseumAdmin,
  requireSuperAdmin,
} from '../../src/middleware/auth';

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

  testRouter.get(
    '/museums/:museumId/admin',
    requireAuth,
    requireMuseumAdmin(),
    (req, res) => {
      sendSuccess(res, { museumId: req.params.museumId });
    }
  );

  const app = createApp({ extraV1Router: testRouter });

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.roles = ['normal_user'];
    mockState.activeMemberships = [];
  });

  it('rejects missing, malformed, or invalid bearer tokens with 401', async () => {
    const noHeader = await request(app).get('/api/v1/protected');
    expect(noHeader.status).toBe(401);
    expect(noHeader.body.error.code).toBe('unauthorized');

    const badScheme = await request(app)
      .get('/api/v1/protected')
      .set('Authorization', 'Basic abc123');
    expect(badScheme.status).toBe(401);

    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'JWT expired' },
    });
    const expired = await request(app)
      .get('/api/v1/protected')
      .set('Authorization', 'Bearer expired-token');
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('unauthorized');
  });

  it('attaches req.auth and idempotently provisions user on valid token', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'user-1', email: 'visitor@example.com' } },
      error: null,
    });

    const res = await request(app)
      .get('/api/v1/protected')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { userId: 'user-1', email: 'visitor@example.com' },
    });
    expect(mockGetUser).toHaveBeenCalledWith('valid-token');
    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(mockTxInsert).toHaveBeenCalledTimes(2);
  });

  it('enforces requireSuperAdmin for super_admin vs normal_user/admin_user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-2', email: 'admin@example.com' } },
      error: null,
    });

    mockState.roles = ['normal_user', 'admin_user'];
    const denied = await request(app)
      .get('/api/v1/super-only')
      .set('Authorization', 'Bearer token');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('forbidden');

    mockState.roles = ['normal_user', 'super_admin'];
    const allowed = await request(app)
      .get('/api/v1/super-only')
      .set('Authorization', 'Bearer token');
    expect(allowed.status).toBe(200);
    expect(allowed.body.data).toEqual({ ok: true });
  });

  it('enforces requireMuseumAdmin across normal_user, revoked/active admin_user, and super_admin', async () => {
    const museumId = '550e8400-e29b-41d4-a716-446655440000';
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-3', email: 'staff@example.com' } },
      error: null,
    });

    // normal_user without admin_user role -> 403 not_museum_admin
    mockState.roles = ['normal_user'];
    mockState.activeMemberships = [museumId];
    const normalDenied = await request(app)
      .get(`/api/v1/museums/${museumId}/admin`)
      .set('Authorization', 'Bearer token');
    expect(normalDenied.status).toBe(403);
    expect(normalDenied.body.error.code).toBe('not_museum_admin');

    // admin_user whose museum_admins row was revoked/missing -> 403 not_museum_admin
    mockState.roles = ['normal_user', 'admin_user'];
    mockState.activeMemberships = [];
    const revokedDenied = await request(app)
      .get(`/api/v1/museums/${museumId}/admin`)
      .set('Authorization', 'Bearer token');
    expect(revokedDenied.status).toBe(403);
    expect(revokedDenied.body.error.code).toBe('not_museum_admin');

    // admin_user with active museum_admins row -> 200
    mockState.activeMemberships = [museumId];
    const activeAllowed = await request(app)
      .get(`/api/v1/museums/${museumId}/admin`)
      .set('Authorization', 'Bearer token');
    expect(activeAllowed.status).toBe(200);
    expect(activeAllowed.body.data).toEqual({ museumId });

    // super_admin without museum_admins row -> 200
    mockState.roles = ['super_admin'];
    mockState.activeMemberships = [];
    const superAllowed = await request(app)
      .get(`/api/v1/museums/${museumId}/admin`)
      .set('Authorization', 'Bearer token');
    expect(superAllowed.status).toBe(200);
  });
});
