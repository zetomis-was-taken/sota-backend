import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableName } from 'drizzle-orm';
import type { AppRole } from '../../src/lib/auth';

interface ArtifactRecord {
  id: string;
  museumId: string;
  name: string;
}

interface SouvenirRecord {
  id: string;
  museumId: string;
  name: string;
}

interface MediaRecord {
  id: string;
  museumId: string;
  entityType: 'artifact' | 'souvenir';
  entityId: string;
  mediaType: 'image' | 'video';
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  sortOrder: number;
  isPrimary: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const {
  mockGetUser,
  mockState,
  mockUploadMedia,
  mockDeleteMedia,
  mockDb,
} = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  const mockUploadMedia = vi.fn().mockResolvedValue(undefined);
  const mockDeleteMedia = vi.fn().mockResolvedValue(undefined);

  const mockState = {
    users: new Set<string>(),
    userRoles: new Map<string, Set<AppRole>>(),
    museumAdmins: new Map<string, Set<string>>(), // userId -> Set<museumId>
    artifacts: new Map<string, ArtifactRecord>(),
    souvenirProducts: new Map<string, SouvenirRecord>(),
    mediaAssets: new Map<string, MediaRecord>(),
    dbInsertThrows: false,
  };

  function getTableNameSafe(table: any): string {
    try {
      if (typeof table === 'object' && table !== null) {
        const drizzleName = (table as any)[Symbol.for('drizzle:Name')];
        if (typeof drizzleName === 'string') return drizzleName;
        return getTableName(table);
      }
    } catch {}
    return 'unknown';
  }

  function extractEqFilters(node: unknown, out: Record<string, unknown> = {}): Record<string, unknown> {
    if (!node || typeof node !== 'object') return out;
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (!Array.isArray(chunks)) return out;

    let currentColumn: string | null = null;
    for (const chunk of chunks) {
      if (chunk && typeof chunk === 'object') {
        const candidate = chunk as {
          queryChunks?: unknown[];
          name?: unknown;
          table?: unknown;
          value?: unknown;
        };
        if (Array.isArray(candidate.queryChunks)) {
          extractEqFilters(candidate, out);
        } else if (typeof candidate.name === 'string' && candidate.table) {
          currentColumn = candidate.name;
        } else if ('encoder' in candidate && currentColumn) {
          out[currentColumn] = (candidate as any).value;
          currentColumn = null;
        }
      }
    }
    return out;
  }

  const makeQuery = (dataFn: () => any[]) => {
    let whereClause: any = null;
    let limitNum: number | null = null;

    const builder: any = {
      where: vi.fn((clause: any) => {
        whereClause = clause;
        return builder;
      }),
      limit: vi.fn((num: number) => {
        limitNum = num;
        return builder;
      }),
      for: vi.fn(() => builder),
      then: (resolve: (v: any) => void) => {
        let results = dataFn();
        if (whereClause) {
          const filters = extractEqFilters(whereClause);
          results = results.filter((item) => {
            for (const [key, val] of Object.entries(filters)) {
              const camelKey = key.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
              const itemVal = item[key] ?? item[camelKey];
              if (itemVal !== undefined && itemVal !== val) {
                return false;
              }
            }
            return true;
          });
        }
        if (limitNum !== null) {
          results = results.slice(0, limitNum);
        }
        return Promise.resolve(results).then(resolve);
      },
    };
    return builder;
  };

  const createDbOps = () => ({
    select: vi.fn((_selection?: any) => ({
      from: vi.fn((table: any) => {
        const tableName = getTableNameSafe(table);
        return makeQuery(() => {
          if (tableName === 'users') {
            return Array.from(mockState.users).map((id) => ({ id }));
          }
          if (tableName === 'user_roles') {
            const rows: any[] = [];
            mockState.userRoles.forEach((roles, userId) => {
              roles.forEach((role) => rows.push({ user_id: userId, userId, role }));
            });
            return rows;
          }
          if (tableName === 'museum_admins') {
            const rows: any[] = [];
            mockState.museumAdmins.forEach((museums, userId) => {
              museums.forEach((mId) =>
                rows.push({
                  user_id: userId,
                  userId,
                  museum_id: mId,
                  museumId: mId,
                  status: 'active',
                })
              );
            });
            return rows;
          }
          if (tableName === 'artifacts') {
            return Array.from(mockState.artifacts.values()).map((a) => ({
              id: a.id,
              museum_id: a.museumId,
              museumId: a.museumId,
              name: a.name,
            }));
          }
          if (tableName === 'souvenir_products') {
            return Array.from(mockState.souvenirProducts.values()).map((p) => ({
              id: p.id,
              museum_id: p.museumId,
              museumId: p.museumId,
              name: p.name,
            }));
          }
          if (tableName === 'media_assets') {
            return Array.from(mockState.mediaAssets.values()).map((m) => ({
              id: m.id,
              museum_id: m.museumId,
              museumId: m.museumId,
              entity_type: m.entityType,
              entityType: m.entityType,
              entity_id: m.entityId,
              entityId: m.entityId,
              media_type: m.mediaType,
              mediaType: m.mediaType,
              storage_bucket: m.storageBucket,
              storageBucket: m.storageBucket,
              storage_path: m.storagePath,
              storagePath: m.storagePath,
              mime_type: m.mimeType,
              mimeType: m.mimeType,
              sort_order: m.sortOrder,
              sortOrder: m.sortOrder,
              is_primary: m.isPrimary,
              isPrimary: m.isPrimary,
              created_by: m.createdBy,
              createdBy: m.createdBy,
              created_at: m.createdAt,
              createdAt: m.createdAt,
              updated_at: m.updatedAt,
              updatedAt: m.updatedAt,
            }));
          }
          return [];
        });
      }),
    })),

    insert: vi.fn((table: any) => ({
      values: vi.fn((vals: any) => {
        const tableName = getTableNameSafe(table);
        return {
          onConflictDoNothing: vi.fn(async () => {
            if (tableName === 'users' && vals.id) {
              mockState.users.add(vals.id);
            }
            if (tableName === 'user_roles' && vals.userId && vals.role) {
              const roles = mockState.userRoles.get(vals.userId) ?? new Set<AppRole>();
              roles.add(vals.role);
              mockState.userRoles.set(vals.userId, roles);
            }
          }),
          returning: vi.fn(async () => {
            if (mockState.dbInsertThrows) {
              throw new Error('DB insert failure simulated');
            }
            if (tableName === 'media_assets') {
              const id = vals.id ?? '33333333-3333-4333-8333-333333333333';
              const record: MediaRecord = {
                id,
                museumId: vals.museumId,
                entityType: vals.entityType,
                entityId: vals.entityId,
                mediaType: vals.mediaType,
                storageBucket: vals.storageBucket,
                storagePath: vals.storagePath,
                mimeType: vals.mimeType,
                sortOrder: vals.sortOrder ?? 0,
                isPrimary: Boolean(vals.isPrimary),
                createdBy: vals.createdBy ?? null,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              mockState.mediaAssets.set(id, record);
              return [
                {
                  id: record.id,
                  museum_id: record.museumId,
                  entity_type: record.entityType,
                  entity_id: record.entityId,
                  media_type: record.mediaType,
                  storage_bucket: record.storageBucket,
                  storage_path: record.storagePath,
                  mime_type: record.mimeType,
                  sort_order: record.sortOrder,
                  is_primary: record.isPrimary,
                  created_by: record.createdBy,
                  created_at: record.createdAt,
                  updated_at: record.updatedAt,
                },
              ];
            }
            return [vals];
          }),
        };
      }),
    })),

    update: vi.fn((table: any) => ({
      set: vi.fn((updates: any) => ({
        where: vi.fn((clause: any) => {
          const tableName = getTableNameSafe(table);
          const filters = extractEqFilters(clause);

          const applyUpdates = () => {
            if (tableName === 'media_assets') {
              const updatedRows: any[] = [];
              for (const [id, m] of mockState.mediaAssets.entries()) {
                let match = true;
                if (filters.id && filters.id !== id) match = false;
                if (filters.entity_type && filters.entity_type !== m.entityType) match = false;
                if (filters.entity_id && filters.entity_id !== m.entityId) match = false;
                if (filters.is_primary !== undefined && filters.is_primary !== m.isPrimary)
                  match = false;

                if (match) {
                  if (updates.isPrimary !== undefined) m.isPrimary = updates.isPrimary;
                  if (updates.sortOrder !== undefined) m.sortOrder = updates.sortOrder;
                  m.updatedAt = new Date();
                  updatedRows.push({
                    id: m.id,
                    museum_id: m.museumId,
                    entity_type: m.entityType,
                    entity_id: m.entityId,
                    media_type: m.mediaType,
                    storage_bucket: m.storageBucket,
                    storage_path: m.storagePath,
                    mime_type: m.mimeType,
                    sort_order: m.sortOrder,
                    is_primary: m.isPrimary,
                    created_by: m.createdBy,
                    created_at: m.createdAt,
                    updated_at: m.updatedAt,
                  });
                }
              }
              return updatedRows;
            }
            return [];
          };

          return {
            returning: vi.fn(async () => applyUpdates()),
            then: (resolve: (v: any) => void) => Promise.resolve(applyUpdates()).then(resolve),
          };
        }),
      })),
    })),

    delete: vi.fn((table: any) => ({
      where: vi.fn(async (clause: any) => {
        const tableName = getTableNameSafe(table);
        const filters = extractEqFilters(clause);
        if (tableName === 'media_assets' && filters.id) {
          mockState.mediaAssets.delete(filters.id as string);
        }
      }),
    })),
  });

  const ops = createDbOps();

  const mockDb = {
    ...ops,
    transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(createDbOps())),
  };

  return { mockGetUser, mockState, mockUploadMedia, mockDeleteMedia, mockDb };
});

vi.mock('../../src/db', () => ({
  db: mockDb,
}));

vi.mock('../../src/lib/storage', () => ({
  uploadMedia: mockUploadMedia,
  deleteMedia: mockDeleteMedia,
  buildStoragePath: (
    museumId: string,
    entityType: string,
    entityId: string,
    extension: string
  ) => `${museumId}/${entityType}/${entityId}/randomhex${extension}`,
}));

vi.mock('../../src/config/supabase', () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

import { createApp } from '../../src/app';

const app = createApp();

describe('Phase 5.2 — Media Endpoints', () => {
  const superAdminId = '00000000-0000-4000-8000-000000000001';
  const museumAdminId = '00000000-0000-4000-8000-000000000002';
  const normalUserId = '00000000-0000-4000-8000-000000000003';

  const museumId = '11111111-1111-4111-8111-111111111111';
  const otherMuseumId = '22222222-2222-4222-8222-222222222222';
  const artifactId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const souvenirId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  // Magic bytes fixtures
  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
  ]);
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.users.clear();
    mockState.userRoles.clear();
    mockState.museumAdmins.clear();
    mockState.artifacts.clear();
    mockState.souvenirProducts.clear();
    mockState.mediaAssets.clear();
    mockState.dbInsertThrows = false;

    // Set up roles
    mockState.userRoles.set(superAdminId, new Set(['super_admin']));
    mockState.userRoles.set(museumAdminId, new Set(['admin_user']));
    mockState.userRoles.set(normalUserId, new Set(['normal_user']));

    // Set up museum membership
    mockState.museumAdmins.set(museumAdminId, new Set([museumId]));

    // Seed test artifact and souvenir in museumId
    mockState.artifacts.set(artifactId, {
      id: artifactId,
      museumId,
      name: 'Ancient Vase',
    });
    mockState.souvenirProducts.set(souvenirId, {
      id: souvenirId,
      museumId,
      name: 'Vase Postcard',
    });

    // Mock supabase auth: map bearer token to userId
    mockGetUser.mockImplementation(async (token: string) => {
      if (token === 'super_admin_token') {
        return { data: { user: { id: superAdminId, email: 'super@example.com' } }, error: null };
      }
      if (token === 'museum_admin_token') {
        return { data: { user: { id: museumAdminId, email: 'admin@example.com' } }, error: null };
      }
      if (token === 'normal_token') {
        return { data: { user: { id: normalUserId, email: 'user@example.com' } }, error: null };
      }
      return { data: { user: null }, error: new Error('Invalid token') };
    });
  });

  describe('POST /api/v1/admin/media', () => {
    it('returns 401 for anon and 403 for normal_user', async () => {
      const anonRes = await request(app)
        .post('/api/v1/admin/media')
        .attach('file', validJpegBuffer, 'photo.jpg')
        .field('museum_id', museumId)
        .field('entity_type', 'artifact')
        .field('entity_id', artifactId)
        .field('media_type', 'image');

      expect(anonRes.status).toBe(401);

      const userRes = await request(app)
        .post('/api/v1/admin/media')
        .set('Authorization', 'Bearer normal_token')
        .attach('file', validJpegBuffer, 'photo.jpg')
        .field('museum_id', museumId)
        .field('entity_type', 'artifact')
        .field('entity_id', artifactId)
        .field('media_type', 'image');

      expect(userRes.status).toBe(403);
    });

    it('allows super_admin without a museum membership', async () => {
      const res = await request(app)
        .post('/api/v1/admin/media')
        .set('Authorization', 'Bearer super_admin_token')
        .attach('file', validJpegBuffer, 'photo.jpg')
        .field('museum_id', museumId)
        .field('entity_type', 'artifact')
        .field('entity_id', artifactId)
        .field('media_type', 'image');

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        museum_id: museumId,
        entity_type: 'artifact',
        entity_id: artifactId,
        media_type: 'image',
        mime_type: 'image/jpeg',
      });
      expect(mockUploadMedia).toHaveBeenCalled();
    });

    it('returns 400 for unsupported MIME type', async () => {
      const badBuffer = Buffer.from('plain text file');
      const res = await request(app)
        .post('/api/v1/admin/media')
        .set('Authorization', 'Bearer museum_admin_token')
        .attach('file', badBuffer, 'note.txt')
        .field('museum_id', museumId)
        .field('entity_type', 'artifact')
        .field('entity_id', artifactId)
        .field('media_type', 'image');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('invalid_file_signature');
    });

    it('rejects a spoofed MIME type or extension that does not match file signature', async () => {
      // JPEG binary signature but named .png and claiming image/png
      const res = await request(app)
        .post('/api/v1/admin/media')
        .set('Authorization', 'Bearer museum_admin_token')
        .attach('file', validJpegBuffer, {
          filename: 'spoofed.png',
          contentType: 'image/png',
        })
        .field('museum_id', museumId)
        .field('entity_type', 'artifact')
        .field('entity_id', artifactId)
        .field('media_type', 'image');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('spoofed_mime_type');
    });

    it('returns 400 when the required file field is missing', async () => {
      const res = await request(app)
        .post('/api/v1/admin/media')
        .set('Authorization', 'Bearer museum_admin_token')
        .field('museum_id', museumId)
        .field('entity_type', 'artifact')
        .field('entity_id', artifactId)
        .field('media_type', 'image');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('file_required');
    });

    it('returns 400 when extension does not match MIME type', async () => {
      // Real PNG buffer but given .jpg extension
      const res = await request(app)
        .post('/api/v1/admin/media')
        .set('Authorization', 'Bearer museum_admin_token')
        .attach('file', validPngBuffer, {
          filename: 'mismatch.jpg',
          contentType: 'image/png',
        })
        .field('museum_id', museumId)
        .field('entity_type', 'artifact')
        .field('entity_id', artifactId)
        .field('media_type', 'image');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('invalid_extension');
    });

    it('returns 413 payload_too_large for file size exceeding limit', async () => {
      // Create a 10.5 MB buffer (limit is 10 MB)
      const oversizedBuffer = Buffer.alloc(10.5 * 1024 * 1024);
      oversizedBuffer[0] = 0xff;
      oversizedBuffer[1] = 0xd8;
      oversizedBuffer[2] = 0xff;

      const res = await request(app)
        .post('/api/v1/admin/media')
        .set('Authorization', 'Bearer museum_admin_token')
        .attach('file', oversizedBuffer, 'huge.jpg')
        .field('museum_id', museumId)
        .field('entity_type', 'artifact')
        .field('entity_id', artifactId)
        .field('media_type', 'image');

      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('payload_too_large');
    });

    it('returns 403 when uploading media for entity of another museum', async () => {
      // User is admin of museumId, but entity belongs to otherMuseumId
      const otherArtifactId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      mockState.artifacts.set(otherArtifactId, {
        id: otherArtifactId,
        museumId: otherMuseumId,
        name: 'Other Museum Art',
      });

      const res = await request(app)
        .post('/api/v1/admin/media')
        .set('Authorization', 'Bearer museum_admin_token')
        .attach('file', validJpegBuffer, 'photo.jpg')
        .field('museum_id', otherMuseumId)
        .field('entity_type', 'artifact')
        .field('entity_id', otherArtifactId)
        .field('media_type', 'image');

      expect(res.status).toBe(403);
    });

    it('rejects a bucket or museum id that does not match the target entity', async () => {
      // Entity belongs to museumId, but client sent otherMuseumId
      const res = await request(app)
        .post('/api/v1/admin/media')
        .set('Authorization', 'Bearer museum_admin_token')
        .attach('file', validJpegBuffer, 'photo.jpg')
        .field('museum_id', otherMuseumId)
        .field('entity_type', 'artifact')
        .field('entity_id', artifactId)
        .field('media_type', 'image');

      expect(res.status).toBe(403);
    });

    it('uploads file and creates media_assets record', async () => {
      const res = await request(app)
        .post('/api/v1/admin/media')
        .set('Authorization', 'Bearer museum_admin_token')
        .attach('file', validJpegBuffer, 'photo.jpg')
        .field('museum_id', museumId)
        .field('entity_type', 'artifact')
        .field('entity_id', artifactId)
        .field('media_type', 'image')
        .field('sort_order', '5')
        .field('is_primary', 'true');

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        museum_id: museumId,
        entity_type: 'artifact',
        entity_id: artifactId,
        storage_bucket: 'museum-media',
        mime_type: 'image/jpeg',
        sort_order: 5,
        is_primary: true,
      });

      expect(mockUploadMedia).toHaveBeenCalledWith(
        'museum-media',
        expect.stringContaining(`${museumId}/artifact/${artifactId}/`),
        expect.any(Buffer),
        'image/jpeg'
      );
    });

    it('unsets previous is_primary before setting new one', async () => {
      // Add existing primary media
      const oldMediaId = '99999999-9999-4999-8999-999999999999';
      mockState.mediaAssets.set(oldMediaId, {
        id: oldMediaId,
        museumId,
        entityType: 'artifact',
        entityId: artifactId,
        mediaType: 'image',
        storageBucket: 'museum-media',
        storagePath: 'old/path.jpg',
        mimeType: 'image/jpeg',
        sortOrder: 0,
        isPrimary: true,
        createdBy: museumAdminId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/admin/media')
        .set('Authorization', 'Bearer museum_admin_token')
        .attach('file', validPngBuffer, 'new-primary.png')
        .field('museum_id', museumId)
        .field('entity_type', 'artifact')
        .field('entity_id', artifactId)
        .field('media_type', 'image')
        .field('is_primary', 'true');

      expect(res.status).toBe(201);
      expect(res.body.data.is_primary).toBe(true);

      // Verify old primary was set to false
      const oldMedia = mockState.mediaAssets.get(oldMediaId);
      expect(oldMedia?.isPrimary).toBe(false);
    });

    it('removes the uploaded object best-effort when DB insert fails', async () => {
      mockState.dbInsertThrows = true;

      const res = await request(app)
        .post('/api/v1/admin/media')
        .set('Authorization', 'Bearer museum_admin_token')
        .attach('file', validJpegBuffer, 'photo.jpg')
        .field('museum_id', museumId)
        .field('entity_type', 'artifact')
        .field('entity_id', artifactId)
        .field('media_type', 'image');

      expect(res.status).toBe(500);
      expect(mockUploadMedia).toHaveBeenCalled();
      expect(mockDeleteMedia).toHaveBeenCalledWith(
        'museum-media',
        expect.stringContaining(`${museumId}/artifact/${artifactId}/`)
      );
    });
  });

  describe('PATCH /api/v1/admin/media/:id', () => {
    const mediaId = '44444444-4444-4444-8444-444444444444';

    beforeEach(() => {
      mockState.mediaAssets.set(mediaId, {
        id: mediaId,
        museumId,
        entityType: 'artifact',
        entityId: artifactId,
        mediaType: 'image',
        storageBucket: 'museum-media',
        storagePath: 'path/photo.jpg',
        mimeType: 'image/jpeg',
        sortOrder: 0,
        isPrimary: false,
        createdBy: museumAdminId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('returns 401 for anon and 403 for normal_user', async () => {
      const anonRes = await request(app)
        .patch(`/api/v1/admin/media/${mediaId}`)
        .send({ sort_order: 3 });

      expect(anonRes.status).toBe(401);

      const userRes = await request(app)
        .patch(`/api/v1/admin/media/${mediaId}`)
        .set('Authorization', 'Bearer normal_token')
        .send({ sort_order: 3 });

      expect(userRes.status).toBe(403);
    });

    it('allows super_admin without a museum membership', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/media/${mediaId}`)
        .set('Authorization', 'Bearer super_admin_token')
        .send({ sort_order: 10, is_primary: true });

      expect(res.status).toBe(200);
      expect(res.body.data.sort_order).toBe(10);
      expect(res.body.data.is_primary).toBe(true);
    });

    it('updates sort_order and is_primary only for a managed museum', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/media/${mediaId}`)
        .set('Authorization', 'Bearer museum_admin_token')
        .send({ sort_order: 2, is_primary: true });

      expect(res.status).toBe(200);
      expect(res.body.data.sort_order).toBe(2);
      expect(res.body.data.is_primary).toBe(true);

      const saved = mockState.mediaAssets.get(mediaId);
      expect(saved?.sortOrder).toBe(2);
      expect(saved?.isPrimary).toBe(true);
    });

    it('rejects negative, non-integer, null, or empty sort_order', async () => {
      const negRes = await request(app)
        .patch(`/api/v1/admin/media/${mediaId}`)
        .set('Authorization', 'Bearer museum_admin_token')
        .send({ sort_order: -1 });

      expect(negRes.status).toBe(400);

      const floatRes = await request(app)
        .patch(`/api/v1/admin/media/${mediaId}`)
        .set('Authorization', 'Bearer museum_admin_token')
        .send({ sort_order: 1.5 });

      expect(floatRes.status).toBe(400);

      const nullRes = await request(app)
        .patch(`/api/v1/admin/media/${mediaId}`)
        .set('Authorization', 'Bearer museum_admin_token')
        .send({ sort_order: null });

      expect(nullRes.status).toBe(400);
      expect(nullRes.body.error.code).toBe('validation_error');

      const emptyRes = await request(app)
        .patch(`/api/v1/admin/media/${mediaId}`)
        .set('Authorization', 'Bearer museum_admin_token')
        .send({ sort_order: '' });

      expect(emptyRes.status).toBe(400);
      expect(emptyRes.body.error.code).toBe('validation_error');
    });

    it('returns 404 for unknown media and 403 for an unmanaged museum', async () => {
      const unknownId = '55555555-5555-4555-8555-555555555555';
      const notFoundRes = await request(app)
        .patch(`/api/v1/admin/media/${unknownId}`)
        .set('Authorization', 'Bearer museum_admin_token')
        .send({ sort_order: 1 });

      expect(notFoundRes.status).toBe(404);

      // Media belongs to otherMuseumId
      const unmanagedMediaId = '66666666-6666-4666-8666-666666666666';
      mockState.mediaAssets.set(unmanagedMediaId, {
        id: unmanagedMediaId,
        museumId: otherMuseumId,
        entityType: 'artifact',
        entityId: artifactId,
        mediaType: 'image',
        storageBucket: 'museum-media',
        storagePath: 'other/photo.jpg',
        mimeType: 'image/jpeg',
        sortOrder: 0,
        isPrimary: false,
        createdBy: superAdminId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const forbiddenRes = await request(app)
        .patch(`/api/v1/admin/media/${unmanagedMediaId}`)
        .set('Authorization', 'Bearer museum_admin_token')
        .send({ sort_order: 1 });

      expect(forbiddenRes.status).toBe(403);
    });
  });

  describe('DELETE /api/v1/admin/media/:id', () => {
    const mediaId = '77777777-7777-4777-8777-777777777777';

    beforeEach(() => {
      mockState.mediaAssets.set(mediaId, {
        id: mediaId,
        museumId,
        entityType: 'artifact',
        entityId: artifactId,
        mediaType: 'image',
        storageBucket: 'museum-media',
        storagePath: 'path/photo.jpg',
        mimeType: 'image/jpeg',
        sortOrder: 0,
        isPrimary: false,
        createdBy: museumAdminId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('returns 401 for anon and 403 for normal_user', async () => {
      const anonRes = await request(app).delete(`/api/v1/admin/media/${mediaId}`);
      expect(anonRes.status).toBe(401);

      const userRes = await request(app)
        .delete(`/api/v1/admin/media/${mediaId}`)
        .set('Authorization', 'Bearer normal_token');
      expect(userRes.status).toBe(403);
    });

    it('allows super_admin without a museum membership', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/media/${mediaId}`)
        .set('Authorization', 'Bearer super_admin_token');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: mediaId, deleted: true });
      expect(mockState.mediaAssets.has(mediaId)).toBe(false);
      expect(mockDeleteMedia).toHaveBeenCalledWith('museum-media', 'path/photo.jpg');
    });

    it('returns 404 for unknown media and 403 for an unmanaged museum', async () => {
      const unknownId = '88888888-8888-4888-8888-888888888888';
      const notFoundRes = await request(app)
        .delete(`/api/v1/admin/media/${unknownId}`)
        .set('Authorization', 'Bearer museum_admin_token');
      expect(notFoundRes.status).toBe(404);

      const unmanagedMediaId = '66666666-6666-4666-8666-666666666666';
      mockState.mediaAssets.set(unmanagedMediaId, {
        id: unmanagedMediaId,
        museumId: otherMuseumId,
        entityType: 'artifact',
        entityId: artifactId,
        mediaType: 'image',
        storageBucket: 'museum-media',
        storagePath: 'other/photo.jpg',
        mimeType: 'image/jpeg',
        sortOrder: 0,
        isPrimary: false,
        createdBy: superAdminId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const forbiddenRes = await request(app)
        .delete(`/api/v1/admin/media/${unmanagedMediaId}`)
        .set('Authorization', 'Bearer museum_admin_token');
      expect(forbiddenRes.status).toBe(403);
    });

    it('deletes media_assets record and calls storage delete', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/media/${mediaId}`)
        .set('Authorization', 'Bearer museum_admin_token');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: mediaId, deleted: true });
      expect(mockState.mediaAssets.has(mediaId)).toBe(false);
      expect(mockDeleteMedia).toHaveBeenCalledWith('museum-media', 'path/photo.jpg');
    });

    it('still deletes DB record even when storage delete fails (best-effort)', async () => {
      mockDeleteMedia.mockRejectedValueOnce(new Error('Storage failure'));

      const res = await request(app)
        .delete(`/api/v1/admin/media/${mediaId}`)
        .set('Authorization', 'Bearer museum_admin_token');

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ id: mediaId, deleted: true });
      expect(mockState.mediaAssets.has(mediaId)).toBe(false);
    });
  });
});
