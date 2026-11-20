import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableName } from 'drizzle-orm';

interface MuseumRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  city: string | null;
  coverImagePath: string | null;
  status: 'draft' | 'published' | 'archived';
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ArtifactRecord {
  id: string;
  museumId: string;
  name: string;
  description: string | null;
  period: string | null;
  inventoryCode: string | null;
  status: 'draft' | 'published' | 'archived';
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SouvenirProductRecord {
  id: string;
  museumId: string;
  name: string;
  description: string | null;
  sku: string | null;
  price: string;
  currency: string;
  stockQuantity: number;
  status: 'draft' | 'published' | 'archived';
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TicketTypeRecord {
  id: string;
  museumId: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface OrderByClause {
  column: string;
  direction: 'asc' | 'desc';
}

const { mockState, mockDb } = vi.hoisted(() => {
  const mockState = {
    museums: [] as MuseumRecord[],
    artifacts: [] as ArtifactRecord[],
    souvenirProducts: [] as SouvenirProductRecord[],
    ticketTypes: [] as TicketTypeRecord[],
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

  function extractOrderBy(clauses: unknown[]): OrderByClause[] {
    const result: OrderByClause[] = [];
    for (const clause of clauses) {
      if (!clause || typeof clause !== 'object') continue;
      const chunks = (clause as { queryChunks?: unknown[] }).queryChunks;
      if (!Array.isArray(chunks)) continue;

      let colName: string | null = null;
      let direction: 'asc' | 'desc' = 'asc';

      for (const chunk of chunks) {
        if (chunk && typeof chunk === 'object') {
          const c = chunk as { name?: string; value?: unknown };
          if (typeof c.name === 'string') {
            colName = c.name;
          } else if (
            Array.isArray(c.value) &&
            c.value.some((v) => typeof v === 'string' && v.includes('desc'))
          ) {
            direction = 'desc';
          } else if (
            Array.isArray(c.value) &&
            c.value.some((v) => typeof v === 'string' && v.includes('asc'))
          ) {
            direction = 'asc';
          }
        }
      }

      if (colName) {
        result.push({ column: colName, direction });
      }
    }
    return result;
  }

  const mockDb = {
    select: vi.fn((fields: Record<string, unknown>) => {
      let activeTable = '';

      const createQueryPromise = (
        getRows: () => any[],
        options = {
          limit: Infinity,
          offset: 0,
          filters: {} as Record<string, unknown>,
          orderBy: [] as OrderByClause[],
        }
      ) => {
        const execute = () => {
          let rows = getRows();

          if (activeTable === 'museums') {
            if (options.filters.status) {
              rows = rows.filter((m) => m.status === options.filters.status);
            }
            if (options.filters.slug) {
              rows = rows.filter((m) => m.slug === options.filters.slug);
            }
            if (options.filters.id) {
              rows = rows.filter((m) => m.id === options.filters.id);
            }
          } else if (activeTable === 'artifacts') {
            if (options.filters.museum_id) {
              rows = rows.filter((a) => a.museum_id === options.filters.museum_id);
            }
            if (options.filters.status) {
              rows = rows.filter((a) => a.status === options.filters.status);
            }
            if (options.filters.id) {
              rows = rows.filter((a) => a.id === options.filters.id);
            }
          } else if (activeTable === 'souvenir_products') {
            if (options.filters.museum_id) {
              rows = rows.filter((p) => p.museum_id === options.filters.museum_id);
            }
            if (options.filters.status) {
              rows = rows.filter((p) => p.status === options.filters.status);
            }
            if (options.filters.id) {
              rows = rows.filter((p) => p.id === options.filters.id);
            }
          } else if (activeTable === 'ticket_types') {
            if (options.filters.museum_id) {
              rows = rows.filter((t) => t.museum_id === options.filters.museum_id);
            }
            if (options.filters.is_available !== undefined) {
              rows = rows.filter((t) => t.is_available === options.filters.is_available);
            }
            if (options.filters.id) {
              rows = rows.filter((t) => t.id === options.filters.id);
            }
          }

          if (options.orderBy.length > 0) {
            rows.sort((a, b) => {
              for (const clause of options.orderBy) {
                const aVal = a[clause.column];
                const bVal = b[clause.column];
                if (aVal === bVal) continue;
                if (aVal instanceof Date && bVal instanceof Date) {
                  const diff = aVal.getTime() - bVal.getTime();
                  if (diff !== 0) {
                    return clause.direction === 'desc' ? -diff : diff;
                  }
                  continue;
                }
                if (aVal < bVal) return clause.direction === 'desc' ? 1 : -1;
                if (aVal > bVal) return clause.direction === 'desc' ? -1 : 1;
              }
              return 0;
            });
          }

          if ('total' in fields) {
            return [{ total: rows.length }];
          }

          return rows.slice(options.offset, options.offset + options.limit);
        };

        const promise = Promise.resolve().then(execute);

        return Object.assign(promise, {
          orderBy: vi.fn((...orderClauses: unknown[]) => {
            const orderBy = extractOrderBy(orderClauses);
            return createQueryPromise(getRows, { ...options, orderBy });
          }),
          where: vi.fn((condition: unknown) => {
            const filters = extractEqFilters(condition);
            return createQueryPromise(getRows, { ...options, filters });
          }),
          limit: vi.fn((n: number) => {
            return createQueryPromise(getRows, { ...options, limit: n });
          }),
          offset: vi.fn((o: number) => {
            return createQueryPromise(getRows, { ...options, offset: o });
          }),
        });
      };

      return {
        from: vi.fn((table: any) => {
          let tableName = 'museums';
          try {
            if (typeof table === 'object' && table !== null) {
              const drizzleName = (table as any)[Symbol.for('drizzle:Name')];
              if (typeof drizzleName === 'string') {
                tableName = drizzleName;
              } else {
                tableName = getTableName(table);
              }
            }
          } catch {
            tableName = 'museums';
          }

          activeTable = tableName;

          const getBaseRows = () => {
            if (tableName === 'museums') {
              return mockState.museums.map((m) => ({
                id: m.id,
                name: m.name,
                slug: m.slug,
                description: m.description,
                address: m.address,
                city: m.city,
                cover_image_path: m.coverImagePath,
                status: m.status,
                created_by: m.createdBy,
                created_at: m.createdAt,
                updated_at: m.updatedAt,
              }));
            }
            if (tableName === 'artifacts') {
              return mockState.artifacts.map((a) => ({
                id: a.id,
                museum_id: a.museumId,
                name: a.name,
                description: a.description,
                period: a.period,
                inventory_code: a.inventoryCode,
                status: a.status,
                created_by: a.createdBy,
                created_at: a.createdAt,
                updated_at: a.updatedAt,
              }));
            }
            if (tableName === 'souvenir_products') {
              return mockState.souvenirProducts.map((p) => ({
                id: p.id,
                museum_id: p.museumId,
                name: p.name,
                description: p.description,
                sku: p.sku,
                price: p.price,
                currency: p.currency,
                stock_quantity: p.stockQuantity,
                status: p.status,
                created_by: p.createdBy,
                created_at: p.createdAt,
                updated_at: p.updatedAt,
              }));
            }
            if (tableName === 'ticket_types') {
              return mockState.ticketTypes.map((t) => ({
                id: t.id,
                museum_id: t.museumId,
                name: t.name,
                description: t.description,
                price: t.price,
                currency: t.currency,
                is_available: t.isAvailable,
                created_at: t.createdAt,
                updated_at: t.updatedAt,
              }));
            }
            return [];
          };

          return createQueryPromise(getBaseRows);
        }),
      };
    }),
  };

  return { mockState, mockDb };
});

vi.mock('../../src/db', () => ({
  db: mockDb,
}));

import { createApp } from '../../src/app';

const app = createApp();

describe('Phase 2 — Catalog Public Reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.museums = [];
    mockState.artifacts = [];
    mockState.souvenirProducts = [];
    mockState.ticketTypes = [];
  });

  describe('Phase 2.1 — Public Reads: Museums', () => {
    describe('GET /api/v1/museums', () => {
      it('returns 200 with empty list and pagination total=0 when no museums exist', async () => {
        const res = await request(app).get('/api/v1/museums');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          data: [],
          pagination: {
            limit: 24,
            offset: 0,
            total: 0,
          },
        });
      });

      it('returns only published museums and omits draft and archived museums', async () => {
        mockState.museums.push(
          {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Published Museum A',
            slug: 'museum-a',
            description: 'Desc A',
            address: '123 St',
            city: 'Hanoi',
            coverImagePath: '/covers/a.jpg',
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: '22222222-2222-2222-2222-222222222222',
            name: 'Draft Museum B',
            slug: 'museum-b',
            description: 'Desc B',
            address: null,
            city: null,
            coverImagePath: null,
            status: 'draft',
            createdBy: null,
            createdAt: new Date('2026-01-02T10:00:00Z'),
            updatedAt: new Date('2026-01-02T10:00:00Z'),
          },
          {
            id: '33333333-3333-3333-3333-333333333333',
            name: 'Archived Museum C',
            slug: 'museum-c',
            description: null,
            address: null,
            city: null,
            coverImagePath: null,
            status: 'archived',
            createdBy: null,
            createdAt: new Date('2026-01-03T10:00:00Z'),
            updatedAt: new Date('2026-01-03T10:00:00Z'),
          }
        );

        const res = await request(app).get('/api/v1/museums');

        expect(res.status).toBe(200);
        expect(res.body.pagination.total).toBe(1);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].slug).toBe('museum-a');
        expect(res.body.data[0].cover_image_path).toBe('/covers/a.jpg');
      });

      it('returns published museums ordered by created_at DESC (newest first)', async () => {
        mockState.museums.push(
          {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Oldest Museum',
            slug: 'oldest-museum',
            description: null,
            address: null,
            city: null,
            coverImagePath: null,
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: '22222222-2222-2222-2222-222222222222',
            name: 'Middle Museum',
            slug: 'middle-museum',
            description: null,
            address: null,
            city: null,
            coverImagePath: null,
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-15T10:00:00Z'),
            updatedAt: new Date('2026-01-15T10:00:00Z'),
          },
          {
            id: '33333333-3333-3333-3333-333333333333',
            name: 'Newest Museum',
            slug: 'newest-museum',
            description: null,
            address: null,
            city: null,
            coverImagePath: null,
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-02-01T10:00:00Z'),
            updatedAt: new Date('2026-02-01T10:00:00Z'),
          }
        );

        const res = await request(app).get('/api/v1/museums');

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(3);
        expect(res.body.data.map((m: any) => m.slug)).toEqual([
          'newest-museum',
          'middle-museum',
          'oldest-museum',
        ]);
      });

      it('respects limit and offset pagination parameters with created_at DESC order', async () => {
        mockState.museums.push(
          {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Museum 1 (Oldest)',
            slug: 'museum-1',
            description: null,
            address: null,
            city: null,
            coverImagePath: null,
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: '22222222-2222-2222-2222-222222222222',
            name: 'Museum 2 (Middle)',
            slug: 'museum-2',
            description: null,
            address: null,
            city: null,
            coverImagePath: null,
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-02T10:00:00Z'),
            updatedAt: new Date('2026-01-02T10:00:00Z'),
          },
          {
            id: '33333333-3333-3333-3333-333333333333',
            name: 'Museum 3 (Newest)',
            slug: 'museum-3',
            description: null,
            address: null,
            city: null,
            coverImagePath: null,
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-03T10:00:00Z'),
            updatedAt: new Date('2026-01-03T10:00:00Z'),
          }
        );

        const resPage1 = await request(app).get('/api/v1/museums?limit=1&offset=0');
        expect(resPage1.status).toBe(200);
        expect(resPage1.body.pagination).toEqual({
          limit: 1,
          offset: 0,
          total: 3,
        });
        expect(resPage1.body.data).toHaveLength(1);
        expect(resPage1.body.data[0].slug).toBe('museum-3');

        const resPage2 = await request(app).get('/api/v1/museums?limit=1&offset=1');
        expect(resPage2.status).toBe(200);
        expect(resPage2.body.pagination).toEqual({
          limit: 1,
          offset: 1,
          total: 3,
        });
        expect(resPage2.body.data).toHaveLength(1);
        expect(resPage2.body.data[0].slug).toBe('museum-2');

        const resPage3 = await request(app).get('/api/v1/museums?limit=1&offset=2');
        expect(resPage3.status).toBe(200);
        expect(resPage3.body.pagination).toEqual({
          limit: 1,
          offset: 2,
          total: 3,
        });
        expect(resPage3.body.data).toHaveLength(1);
        expect(resPage3.body.data[0].slug).toBe('museum-1');
      });

      it('returns 400 validation_error on invalid pagination query', async () => {
        const res1 = await request(app).get('/api/v1/museums?limit=0');
        expect(res1.status).toBe(400);
        expect(res1.body.error.code).toBe('validation_error');

        const res2 = await request(app).get('/api/v1/museums?limit=101');
        expect(res2.status).toBe(400);
        expect(res2.body.error.code).toBe('validation_error');

        const res3 = await request(app).get('/api/v1/museums?offset=-1');
        expect(res3.status).toBe(400);
        expect(res3.body.error.code).toBe('validation_error');
      });

      it('is accessible publicly without an Authorization header', async () => {
        const res = await request(app).get('/api/v1/museums');
        expect(res.status).toBe(200);
      });
    });

    describe('GET /api/v1/museums/:slug', () => {
      it('returns 404 for unknown slug', async () => {
        const res = await request(app).get('/api/v1/museums/non-existent-museum');

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 for draft museum', async () => {
        mockState.museums.push({
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Draft Museum',
          slug: 'draft-museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'draft',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get('/api/v1/museums/draft-museum');

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 for archived museum', async () => {
        mockState.museums.push({
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Archived Museum',
          slug: 'archived-museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'archived',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get('/api/v1/museums/archived-museum');

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('does not expose published children when the parent museum is draft or archived', async () => {
        const draftMuseumId = '11111111-1111-1111-1111-111111111111';
        const archivedMuseumId = '22222222-2222-2222-2222-222222222222';

        mockState.museums.push(
          {
            id: draftMuseumId,
            name: 'Draft Museum With Children',
            slug: 'draft-with-children',
            description: null,
            address: null,
            city: null,
            coverImagePath: null,
            status: 'draft',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: archivedMuseumId,
            name: 'Archived Museum With Children',
            slug: 'archived-with-children',
            description: null,
            address: null,
            city: null,
            coverImagePath: null,
            status: 'archived',
            createdBy: null,
            createdAt: new Date('2026-01-02T10:00:00Z'),
            updatedAt: new Date('2026-01-02T10:00:00Z'),
          }
        );

        mockState.artifacts.push(
          {
            id: 'a1111111-1111-1111-1111-111111111111',
            museumId: draftMuseumId,
            name: 'Published Artifact Inside Draft Museum',
            description: null,
            period: null,
            inventoryCode: 'INV-DRAFT-001',
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: 'a2222222-2222-2222-2222-222222222222',
            museumId: archivedMuseumId,
            name: 'Published Artifact Inside Archived Museum',
            description: null,
            period: null,
            inventoryCode: 'INV-ARCHIVED-001',
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-02T10:00:00Z'),
            updatedAt: new Date('2026-01-02T10:00:00Z'),
          }
        );

        mockState.souvenirProducts.push(
          {
            id: 'p1111111-1111-1111-1111-111111111111',
            museumId: draftMuseumId,
            name: 'Published Product in Draft',
            description: null,
            sku: 'SKU-DRAFT-PUB',
            price: '10000.00',
            currency: 'VND',
            stockQuantity: 5,
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: 'p2222222-2222-2222-2222-222222222222',
            museumId: archivedMuseumId,
            name: 'Published Product in Archived',
            description: null,
            sku: 'SKU-ARCHIVED-PUB',
            price: '20000.00',
            currency: 'VND',
            stockQuantity: 10,
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-02T10:00:00Z'),
            updatedAt: new Date('2026-01-02T10:00:00Z'),
          }
        );

        mockState.ticketTypes.push(
          {
            id: 't1111111-1111-1111-1111-111111111111',
            museumId: draftMuseumId,
            name: 'Available Ticket in Draft',
            description: null,
            price: '50000.00',
            currency: 'VND',
            isAvailable: true,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: 't2222222-2222-2222-2222-222222222222',
            museumId: archivedMuseumId,
            name: 'Available Ticket in Archived',
            description: null,
            price: '60000.00',
            currency: 'VND',
            isAvailable: true,
            createdAt: new Date('2026-01-02T10:00:00Z'),
            updatedAt: new Date('2026-01-02T10:00:00Z'),
          }
        );

        const draftRes = await request(app).get('/api/v1/museums/draft-with-children');
        expect(draftRes.status).toBe(404);
        expect(draftRes.body.error.code).toBe('not_found');

        const archivedRes = await request(app).get('/api/v1/museums/archived-with-children');
        expect(archivedRes.status).toBe(404);
        expect(archivedRes.body.error.code).toBe('not_found');
      });

      it('returns museum with embedded published children', async () => {
        const museumId = '11111111-1111-1111-1111-111111111111';
        mockState.museums.push({
          id: museumId,
          name: 'Louvre Museum',
          slug: 'louvre',
          description: 'World famous museum',
          address: 'Rue de Rivoli',
          city: 'Paris',
          coverImagePath: '/images/louvre.jpg',
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        mockState.artifacts.push(
          {
            id: 'a1111111-1111-1111-1111-111111111111',
            museumId,
            name: 'Mona Lisa',
            description: 'Portrait by Leonardo da Vinci',
            period: 'Renaissance',
            inventoryCode: 'INV-MONA',
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: 'a2222222-2222-2222-2222-222222222222',
            museumId,
            name: 'Draft Artifact',
            description: null,
            period: null,
            inventoryCode: 'INV-DRAFT',
            status: 'draft',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          }
        );

        mockState.souvenirProducts.push(
          {
            id: 'p1111111-1111-1111-1111-111111111111',
            museumId,
            name: 'Mona Lisa Postcard',
            description: 'Glossy print',
            sku: 'SKU-POSTCARD',
            price: '50000.00',
            currency: 'VND',
            stockQuantity: 100,
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: 'p2222222-2222-2222-2222-222222222222',
            museumId,
            name: 'Draft Magnet',
            description: null,
            sku: 'SKU-DRAFT',
            price: '30000.00',
            currency: 'VND',
            stockQuantity: 10,
            status: 'draft',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          }
        );

        mockState.ticketTypes.push(
          {
            id: 't1111111-1111-1111-1111-111111111111',
            museumId,
            name: 'Standard Ticket',
            description: 'General admission',
            price: '150000.00',
            currency: 'VND',
            isAvailable: true,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: 't2222222-2222-2222-2222-222222222222',
            museumId,
            name: 'Unavailable VIP Ticket',
            description: 'Temporarily paused',
            price: '500000.00',
            currency: 'VND',
            isAvailable: false,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          }
        );

        const res = await request(app).get('/api/v1/museums/louvre');

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(museumId);
        expect(res.body.data.name).toBe('Louvre Museum');
        expect(res.body.data.slug).toBe('louvre');
        expect(res.body.data.status).toBe('published');
        expect(res.body.data.cover_image_path).toBe('/images/louvre.jpg');

        expect(res.body.data.artifacts).toHaveLength(1);
        expect(res.body.data.artifacts[0].name).toBe('Mona Lisa');
        expect(res.body.data.artifacts[0].inventory_code).toBe('INV-MONA');

        expect(res.body.data.souvenir_products).toHaveLength(1);
        expect(res.body.data.souvenir_products[0].name).toBe('Mona Lisa Postcard');
        expect(res.body.data.souvenir_products[0].sku).toBe('SKU-POSTCARD');
        expect(res.body.data.souvenir_products[0].price).toBe('50000.00');

        expect(res.body.data.ticket_types).toHaveLength(1);
        expect(res.body.data.ticket_types[0].name).toBe('Standard Ticket');
        expect(res.body.data.ticket_types[0].price).toBe('150000.00');
        expect(res.body.data.ticket_types[0].is_available).toBe(true);
      });

      it('returns empty arrays when published museum has no children', async () => {
        mockState.museums.push({
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Empty Museum',
          slug: 'empty-museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get('/api/v1/museums/empty-museum');

        expect(res.status).toBe(200);
        expect(res.body.data.artifacts).toEqual([]);
        expect(res.body.data.souvenir_products).toEqual([]);
        expect(res.body.data.ticket_types).toEqual([]);
      });

      it('returns 400 validation_error when slug is whitespace', async () => {
        const res = await request(app).get('/api/v1/museums/%20');

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('is accessible publicly without an Authorization header', async () => {
        mockState.museums.push({
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Public Museum',
          slug: 'public-museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get('/api/v1/museums/public-museum');
        expect(res.status).toBe(200);
      });
    });
  });

  describe('Phase 2.2 — Public Reads: Artifacts', () => {
    describe('GET /api/v1/museums/:museumId/artifacts', () => {
      it('returns 400 validation_error when museumId is not a valid UUID', async () => {
        const res = await request(app).get('/api/v1/museums/not-a-uuid/artifacts');
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 404 not_found when museum does not exist', async () => {
        const res = await request(app).get(
          '/api/v1/museums/00000000-0000-0000-0000-000000000000/artifacts'
        );
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 not_found when museum is draft', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        mockState.museums.push({
          id: museumId,
          name: 'Draft Museum',
          slug: 'draft-museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'draft',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });
        mockState.artifacts.push({
          id: 'a1111111-1111-4111-8111-111111111111',
          museumId,
          name: 'Published Artifact in Draft Museum',
          description: null,
          period: null,
          inventoryCode: 'INV-001',
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get(`/api/v1/museums/${museumId}/artifacts`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 not_found when museum is archived', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        mockState.museums.push({
          id: museumId,
          name: 'Archived Museum',
          slug: 'archived-museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'archived',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });
        mockState.artifacts.push({
          id: 'a1111111-1111-4111-8111-111111111111',
          museumId,
          name: 'Published Artifact in Archived Museum',
          description: null,
          period: null,
          inventoryCode: 'INV-002',
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get(`/api/v1/museums/${museumId}/artifacts`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 200 with empty list and pagination total=0 when published museum has no artifacts', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        mockState.museums.push({
          id: museumId,
          name: 'Empty Published Museum',
          slug: 'empty-published-museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get(`/api/v1/museums/${museumId}/artifacts`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          data: [],
          pagination: {
            limit: 24,
            offset: 0,
            total: 0,
          },
        });
      });

      it('returns only published artifacts of the specified museum, omitting draft/archived and other museums', async () => {
        const museum1 = '11111111-1111-4111-8111-111111111111';
        const museum2 = '22222222-2222-4222-8222-222222222222';
        mockState.museums.push(
          {
            id: museum1,
            name: 'Museum 1',
            slug: 'museum-1',
            description: null,
            address: null,
            city: null,
            coverImagePath: null,
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: museum2,
            name: 'Museum 2',
            slug: 'museum-2',
            description: null,
            address: null,
            city: null,
            coverImagePath: null,
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          }
        );

        mockState.artifacts.push(
          {
            id: 'a1111111-1111-4111-8111-111111111111',
            museumId: museum1,
            name: 'Published Artifact M1',
            description: 'Desc',
            period: 'Bronze Age',
            inventoryCode: 'INV-M1-PUB',
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: 'a2222222-2222-4222-8222-222222222222',
            museumId: museum1,
            name: 'Draft Artifact M1',
            description: null,
            period: null,
            inventoryCode: 'INV-M1-DRAFT',
            status: 'draft',
            createdBy: null,
            createdAt: new Date('2026-01-02T10:00:00Z'),
            updatedAt: new Date('2026-01-02T10:00:00Z'),
          },
          {
            id: 'a3333333-3333-4333-8333-333333333333',
            museumId: museum1,
            name: 'Archived Artifact M1',
            description: null,
            period: null,
            inventoryCode: 'INV-M1-ARCH',
            status: 'archived',
            createdBy: null,
            createdAt: new Date('2026-01-03T10:00:00Z'),
            updatedAt: new Date('2026-01-03T10:00:00Z'),
          },
          {
            id: 'a4444444-4444-4444-8444-444444444444',
            museumId: museum2,
            name: 'Published Artifact M2',
            description: null,
            period: null,
            inventoryCode: 'INV-M2-PUB',
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-04T10:00:00Z'),
            updatedAt: new Date('2026-01-04T10:00:00Z'),
          }
        );

        const res = await request(app).get(`/api/v1/museums/${museum1}/artifacts`);
        expect(res.status).toBe(200);
        expect(res.body.pagination.total).toBe(1);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].id).toBe('a1111111-1111-4111-8111-111111111111');
        expect(res.body.data[0].museum_id).toBe(museum1);
        expect(res.body.data[0].name).toBe('Published Artifact M1');
        expect(res.body.data[0].inventory_code).toBe('INV-M1-PUB');
        expect(res.body.data[0].period).toBe('Bronze Age');
      });

      it('returns artifacts ordered by created_at DESC with pagination', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        mockState.museums.push({
          id: museumId,
          name: 'Museum',
          slug: 'museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        mockState.artifacts.push(
          {
            id: 'a1111111-1111-4111-8111-111111111111',
            museumId,
            name: 'Artifact Oldest',
            description: null,
            period: null,
            inventoryCode: 'INV-01',
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-01T10:00:00Z'),
            updatedAt: new Date('2026-01-01T10:00:00Z'),
          },
          {
            id: 'a2222222-2222-4222-8222-222222222222',
            museumId,
            name: 'Artifact Middle',
            description: null,
            period: null,
            inventoryCode: 'INV-02',
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-02T10:00:00Z'),
            updatedAt: new Date('2026-01-02T10:00:00Z'),
          },
          {
            id: 'a3333333-3333-4333-8333-333333333333',
            museumId,
            name: 'Artifact Newest',
            description: null,
            period: null,
            inventoryCode: 'INV-03',
            status: 'published',
            createdBy: null,
            createdAt: new Date('2026-01-03T10:00:00Z'),
            updatedAt: new Date('2026-01-03T10:00:00Z'),
          }
        );

        const resPage1 = await request(app).get(
          `/api/v1/museums/${museumId}/artifacts?limit=1&offset=0`
        );
        expect(resPage1.status).toBe(200);
        expect(resPage1.body.pagination).toEqual({ limit: 1, offset: 0, total: 3 });
        expect(resPage1.body.data[0].id).toBe('a3333333-3333-4333-8333-333333333333');

        const resPage2 = await request(app).get(
          `/api/v1/museums/${museumId}/artifacts?limit=1&offset=1`
        );
        expect(resPage2.status).toBe(200);
        expect(resPage2.body.pagination).toEqual({ limit: 1, offset: 1, total: 3 });
        expect(resPage2.body.data[0].id).toBe('a2222222-2222-4222-8222-222222222222');

        const resPage3 = await request(app).get(
          `/api/v1/museums/${museumId}/artifacts?limit=1&offset=2`
        );
        expect(resPage3.status).toBe(200);
        expect(resPage3.body.pagination).toEqual({ limit: 1, offset: 2, total: 3 });
        expect(resPage3.body.data[0].id).toBe('a1111111-1111-4111-8111-111111111111');
      });

      it('returns 400 validation_error on invalid pagination query', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        const res1 = await request(app).get(`/api/v1/museums/${museumId}/artifacts?limit=0`);
        expect(res1.status).toBe(400);
        expect(res1.body.error.code).toBe('validation_error');

        const res2 = await request(app).get(
          `/api/v1/museums/${museumId}/artifacts?offset=-1`
        );
        expect(res2.status).toBe(400);
        expect(res2.body.error.code).toBe('validation_error');
      });

      it('is accessible publicly without an Authorization header', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        mockState.museums.push({
          id: museumId,
          name: 'Museum',
          slug: 'museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get(`/api/v1/museums/${museumId}/artifacts`);
        expect(res.status).toBe(200);
      });
    });

    describe('GET /api/v1/artifacts/:id', () => {
      it('returns 400 validation_error when id is not a valid UUID', async () => {
        const res = await request(app).get('/api/v1/artifacts/not-a-valid-uuid');
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 404 not_found when artifact does not exist', async () => {
        const res = await request(app).get(
          '/api/v1/artifacts/00000000-0000-0000-0000-000000000000'
        );
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 not_found when artifact is draft', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        const artifactId = 'a1111111-1111-4111-8111-111111111111';
        mockState.museums.push({
          id: museumId,
          name: 'Published Museum',
          slug: 'published-museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });
        mockState.artifacts.push({
          id: artifactId,
          museumId,
          name: 'Draft Artifact',
          description: null,
          period: null,
          inventoryCode: 'INV-DRAFT',
          status: 'draft',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get(`/api/v1/artifacts/${artifactId}`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 not_found when artifact is archived', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        const artifactId = 'a1111111-1111-4111-8111-111111111111';
        mockState.museums.push({
          id: museumId,
          name: 'Published Museum',
          slug: 'published-museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });
        mockState.artifacts.push({
          id: artifactId,
          museumId,
          name: 'Archived Artifact',
          description: null,
          period: null,
          inventoryCode: 'INV-ARCHIVED',
          status: 'archived',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get(`/api/v1/artifacts/${artifactId}`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 when parent museum is draft', async () => {
        const draftMuseumId = '11111111-1111-4111-8111-111111111111';
        const artifactId = 'a1111111-1111-4111-8111-111111111111';
        mockState.museums.push({
          id: draftMuseumId,
          name: 'Draft Museum',
          slug: 'draft-museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'draft',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });
        mockState.artifacts.push({
          id: artifactId,
          museumId: draftMuseumId,
          name: 'Published Artifact in Draft Museum',
          description: null,
          period: null,
          inventoryCode: 'INV-PUB-IN-DRAFT',
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get(`/api/v1/artifacts/${artifactId}`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 when parent museum is archived', async () => {
        const archivedMuseumId = '11111111-1111-4111-8111-111111111111';
        const artifactId = 'a1111111-1111-4111-8111-111111111111';
        mockState.museums.push({
          id: archivedMuseumId,
          name: 'Archived Museum',
          slug: 'archived-museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'archived',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });
        mockState.artifacts.push({
          id: artifactId,
          museumId: archivedMuseumId,
          name: 'Published Artifact in Archived Museum',
          description: null,
          period: null,
          inventoryCode: 'INV-PUB-IN-ARCHIVED',
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get(`/api/v1/artifacts/${artifactId}`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns artifact when both artifact and museum are published', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        const artifactId = 'a1111111-1111-4111-8111-111111111111';
        mockState.museums.push({
          id: museumId,
          name: 'Published Museum',
          slug: 'published-museum',
          description: 'Museum description',
          address: '123 Street',
          city: 'Hanoi',
          coverImagePath: '/covers/museum.jpg',
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });
        mockState.artifacts.push({
          id: artifactId,
          museumId,
          name: 'Dong Son Drum',
          description: 'Ancient bronze drum',
          period: 'Bronze Age',
          inventoryCode: 'INV-DONG-SON',
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get(`/api/v1/artifacts/${artifactId}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({
          id: artifactId,
          museum_id: museumId,
          name: 'Dong Son Drum',
          description: 'Ancient bronze drum',
          period: 'Bronze Age',
          inventory_code: 'INV-DONG-SON',
          status: 'published',
          created_by: null,
          created_at: '2026-01-01T10:00:00.000Z',
          updated_at: '2026-01-01T10:00:00.000Z',
        });
      });

      it('is accessible publicly without an Authorization header', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        const artifactId = 'a1111111-1111-4111-8111-111111111111';
        mockState.museums.push({
          id: museumId,
          name: 'Museum',
          slug: 'museum',
          description: null,
          address: null,
          city: null,
          coverImagePath: null,
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });
        mockState.artifacts.push({
          id: artifactId,
          museumId,
          name: 'Artifact',
          description: null,
          period: null,
          inventoryCode: 'INV-01',
          status: 'published',
          createdBy: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
          updatedAt: new Date('2026-01-01T10:00:00Z'),
        });

        const res = await request(app).get(`/api/v1/artifacts/${artifactId}`);
        expect(res.status).toBe(200);
      });
    });
  });
});
