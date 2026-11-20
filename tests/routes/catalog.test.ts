import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  const mockDb = {
    select: vi.fn((fields: Record<string, unknown>) => {
      let activeTable = '';

      const createQueryPromise = (
        getRows: () => any[],
        options = { limit: Infinity, offset: 0, filters: {} as Record<string, unknown> }
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
          } else if (activeTable === 'souvenir_products') {
            if (options.filters.museum_id) {
              rows = rows.filter((p) => p.museum_id === options.filters.museum_id);
            }
            if (options.filters.status) {
              rows = rows.filter((p) => p.status === options.filters.status);
            }
          } else if (activeTable === 'ticket_types') {
            if (options.filters.museum_id) {
              rows = rows.filter((t) => t.museum_id === options.filters.museum_id);
            }
            if (options.filters.is_available !== undefined) {
              rows = rows.filter((t) => t.is_available === options.filters.is_available);
            }
          }

          if ('total' in fields) {
            return [{ total: rows.length }];
          }

          return rows.slice(options.offset, options.offset + options.limit);
        };

        const promise = Promise.resolve().then(execute);

        return Object.assign(promise, {
          orderBy: vi.fn(() => createQueryPromise(getRows, options)),
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
          const tableName =
            typeof table?._?.name === 'string'
              ? table._.name
              : 'name' in fields && 'slug' in fields
              ? 'museums'
              : 'inventory_code' in fields
              ? 'artifacts'
              : 'sku' in fields
              ? 'souvenir_products'
              : 'is_available' in fields
              ? 'ticket_types'
              : 'museums';

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

describe('Phase 2.1 — Public Reads: Museums', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.museums = [];
    mockState.artifacts = [];
    mockState.souvenirProducts = [];
    mockState.ticketTypes = [];
  });

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

    it('respects limit and offset pagination parameters', async () => {
      mockState.museums.push(
        {
          id: '11111111-1111-1111-1111-111111111111',
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
          id: '22222222-2222-2222-2222-222222222222',
          name: 'Museum 2',
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
          name: 'Museum 3',
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

      const res = await request(app).get('/api/v1/museums?limit=1&offset=1');

      expect(res.status).toBe(200);
      expect(res.body.pagination).toEqual({
        limit: 1,
        offset: 1,
        total: 3,
      });
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].slug).toBe('museum-2');
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
      mockState.museums.push({
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
      });

      mockState.artifacts.push({
        id: 'a1111111-1111-1111-1111-111111111111',
        museumId: draftMuseumId,
        name: 'Published Artifact Inside Draft Museum',
        description: null,
        period: null,
        inventoryCode: 'INV-001',
        status: 'published',
        createdBy: null,
        createdAt: new Date('2026-01-01T10:00:00Z'),
        updatedAt: new Date('2026-01-01T10:00:00Z'),
      });

      const res = await request(app).get('/api/v1/museums/draft-with-children');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
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

      // Embedded artifacts: only published
      expect(res.body.data.artifacts).toHaveLength(1);
      expect(res.body.data.artifacts[0].name).toBe('Mona Lisa');
      expect(res.body.data.artifacts[0].inventory_code).toBe('INV-MONA');

      // Embedded souvenir_products: only published
      expect(res.body.data.souvenir_products).toHaveLength(1);
      expect(res.body.data.souvenir_products[0].name).toBe('Mona Lisa Postcard');
      expect(res.body.data.souvenir_products[0].sku).toBe('SKU-POSTCARD');
      expect(res.body.data.souvenir_products[0].price).toBe('50000.00');

      // Embedded ticket_types: only is_available = true
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
