import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableName } from 'drizzle-orm';
import type { AppRole } from '../../src/lib/auth';

type MembershipStatus = 'active' | 'suspended' | 'revoked';

interface MembershipRecord {
  museumId: string;
  userId: string;
  status: MembershipStatus;
}

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

interface MediaAssetRecord {
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

interface OrderByClause {
  column: string;
  direction: 'asc' | 'desc';
}

const { mockGetUser, mockState, mockDb } = vi.hoisted(() => {
  const mockGetUser = vi.fn();

  const mockState = {
    users: new Set<string>(),
    userRoles: new Map<string, Set<AppRole>>(),
    memberships: [] as MembershipRecord[],
    museums: [] as MuseumRecord[],
    artifacts: [] as ArtifactRecord[],
    souvenirProducts: [] as SouvenirProductRecord[],
    ticketTypes: [] as TicketTypeRecord[],
    mediaAssets: [] as MediaAssetRecord[],
  };

  interface FilterConditions {
    eq: Record<string, unknown>;
    ne: Record<string, unknown>;
    in: Record<string, unknown[]>;
  }

  function extractFilters(
    node: unknown,
    out: FilterConditions = { eq: {}, ne: {}, in: {} }
  ): FilterConditions {
    if (!node || typeof node !== 'object') {
      return out;
    }
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (!Array.isArray(chunks)) {
      return out;
    }

    let currentCol: string | null = null;
    let isNe = false;
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
            (v: any) => typeof v === 'string' && v.includes('<>')
          )
        ) {
          isNe = true;
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
          if (isNe) {
            out.ne[currentCol] = candidate.value;
            isNe = false;
          } else {
            out.eq[currentCol] = candidate.value;
          }
          currentCol = null;
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
    transaction: vi.fn(async (fn: (tx: any) => Promise<void>) => {
      await fn({
        insert: vi.fn((_table: unknown) => ({
          values: vi.fn((val: any) => ({
            onConflictDoNothing: vi.fn(async () => {
              if (val.id) {
                mockState.users.add(val.id);
              }
              if (val.userId && val.role) {
                const roles =
                  mockState.userRoles.get(val.userId) ?? new Set<AppRole>();
                roles.add(val.role);
                mockState.userRoles.set(val.userId, roles);
              }
            }),
          })),
        })),
      });
    }),
    insert: vi.fn((table: any) => {
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

      return {
        values: vi.fn((val: any) => {
          const now = new Date();
          if (tableName === 'artifacts') {
            const newArtifact: ArtifactRecord = {
              id:
                val.id ??
                `a1111111-1111-4111-8111-${Math.floor(
                  100000000000 + Math.random() * 900000000000
                )}`,
              museumId: val.museumId,
              name: val.name,
              description: val.description ?? null,
              period: val.period ?? null,
              inventoryCode: val.inventoryCode ?? null,
              status: val.status ?? 'draft',
              createdBy: val.createdBy ?? null,
              createdAt: now,
              updatedAt: now,
            };
            mockState.artifacts.push(newArtifact);
            return {
              returning: vi.fn(async () => [
                {
                  id: newArtifact.id,
                  museum_id: newArtifact.museumId,
                  name: newArtifact.name,
                  description: newArtifact.description,
                  period: newArtifact.period,
                  inventory_code: newArtifact.inventoryCode,
                  status: newArtifact.status,
                  created_by: newArtifact.createdBy,
                  created_at: newArtifact.createdAt,
                  updated_at: newArtifact.updatedAt,
                },
              ]),
            };
          }

          if (tableName === 'souvenir_products') {
            const newProduct: SouvenirProductRecord = {
              id:
                val.id ??
                `p1111111-1111-4111-8111-${Math.floor(
                  100000000000 + Math.random() * 900000000000
                )}`,
              museumId: val.museumId,
              name: val.name,
              description: val.description ?? null,
              sku: val.sku ?? null,
              price: val.price,
              currency: val.currency ?? 'VND',
              stockQuantity: val.stockQuantity ?? 0,
              status: val.status ?? 'draft',
              createdBy: val.createdBy ?? null,
              createdAt: now,
              updatedAt: now,
            };
            mockState.souvenirProducts.push(newProduct);
            return {
              returning: vi.fn(async () => [
                {
                  id: newProduct.id,
                  museum_id: newProduct.museumId,
                  name: newProduct.name,
                  description: newProduct.description,
                  sku: newProduct.sku,
                  price: newProduct.price,
                  currency: newProduct.currency,
                  stock_quantity: newProduct.stockQuantity,
                  status: newProduct.status,
                  created_by: newProduct.createdBy,
                  created_at: newProduct.createdAt,
                  updated_at: newProduct.updatedAt,
                },
              ]),
            };
          }

          if (tableName === 'ticket_types') {
            const newTicketType: TicketTypeRecord = {
              id:
                val.id ??
                `t1111111-1111-4111-8111-${Math.floor(
                  100000000000 + Math.random() * 900000000000
                )}`,
              museumId: val.museumId,
              name: val.name,
              description: val.description ?? null,
              price: val.price,
              currency: val.currency ?? 'VND',
              isAvailable: val.isAvailable ?? true,
              createdAt: now,
              updatedAt: now,
            };
            mockState.ticketTypes.push(newTicketType);
            return {
              returning: vi.fn(async () => [
                {
                  id: newTicketType.id,
                  museum_id: newTicketType.museumId,
                  name: newTicketType.name,
                  description: newTicketType.description,
                  price: newTicketType.price,
                  currency: newTicketType.currency,
                  is_available: newTicketType.isAvailable,
                  created_at: newTicketType.createdAt,
                  updated_at: newTicketType.updatedAt,
                },
              ]),
            };
          }

          const newMuseum: MuseumRecord = {
            id:
              val.id ??
              '11111111-1111-4111-8111-999999999999',
            name: val.name,
            slug: val.slug,
            description: val.description ?? null,
            address: val.address ?? null,
            city: val.city ?? null,
            coverImagePath: val.coverImagePath ?? null,
            status: val.status ?? 'draft',
            createdBy: val.createdBy ?? null,
            createdAt: now,
            updatedAt: now,
          };
          mockState.museums.push(newMuseum);
          return {
            returning: vi.fn(async () => [
              {
                id: newMuseum.id,
                name: newMuseum.name,
                slug: newMuseum.slug,
                description: newMuseum.description,
                address: newMuseum.address,
                city: newMuseum.city,
                cover_image_path: newMuseum.coverImagePath,
                status: newMuseum.status,
                created_by: newMuseum.createdBy,
                created_at: newMuseum.createdAt,
                updated_at: newMuseum.updatedAt,
              },
            ]),
          };
        }),
      };
    }),
    update: vi.fn((table: any) => {
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

      return {
        set: vi.fn((values: Record<string, unknown>) => ({
          where: vi.fn((condition: unknown) => {
            const filters = extractFilters(condition);
            const targetId = String(filters.eq.id ?? '');

            if (tableName === 'artifacts') {
              const a = mockState.artifacts.find((item) => item.id === targetId);
              return {
                returning: vi.fn(async () => {
                  if (!a) return [];
                  if (values.name !== undefined) a.name = values.name as string;
                  if (values.description !== undefined)
                    a.description = values.description as string | null;
                  if (values.period !== undefined)
                    a.period = values.period as string | null;
                  if (values.inventoryCode !== undefined)
                    a.inventoryCode = values.inventoryCode as string | null;
                  if (values.status !== undefined) a.status = values.status as any;
                  if (values.updatedAt instanceof Date)
                    a.updatedAt = values.updatedAt;
                  return [
                    {
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
                    },
                  ];
                }),
              };
            }

            if (tableName === 'souvenir_products') {
              const p = mockState.souvenirProducts.find((item) => item.id === targetId);
              return {
                returning: vi.fn(async () => {
                  if (!p) return [];
                  if (values.name !== undefined) p.name = values.name as string;
                  if (values.description !== undefined)
                    p.description = values.description as string | null;
                  if (values.sku !== undefined)
                    p.sku = values.sku as string | null;
                  if (values.price !== undefined)
                    p.price = values.price as string;
                  if (values.stockQuantity !== undefined)
                    p.stockQuantity = values.stockQuantity as number;
                  if (values.status !== undefined) p.status = values.status as any;
                  if (values.updatedAt instanceof Date)
                    p.updatedAt = values.updatedAt;
                  return [
                    {
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
                    },
                  ];
                }),
              };
            }

            if (tableName === 'ticket_types') {
              const t = mockState.ticketTypes.find((item) => item.id === targetId);
              return {
                returning: vi.fn(async () => {
                  if (!t) return [];
                  if (values.name !== undefined) t.name = values.name as string;
                  if (values.description !== undefined)
                    t.description = values.description as string | null;
                  if (values.price !== undefined)
                    t.price = values.price as string;
                  if (values.isAvailable !== undefined)
                    t.isAvailable = values.isAvailable as boolean;
                  if (values.updatedAt instanceof Date)
                    t.updatedAt = values.updatedAt;
                  return [
                    {
                      id: t.id,
                      museum_id: t.museumId,
                      name: t.name,
                      description: t.description,
                      price: t.price,
                      currency: t.currency,
                      is_available: t.isAvailable,
                      created_at: t.createdAt,
                      updated_at: t.updatedAt,
                    },
                  ];
                }),
              };
            }

            const m = mockState.museums.find((item) => item.id === targetId);
            return {
              returning: vi.fn(async () => {
                if (!m) return [];
                if (values.name !== undefined) m.name = values.name as string;
                if (values.slug !== undefined) m.slug = values.slug as string;
                if (values.description !== undefined)
                  m.description = values.description as string | null;
                if (values.address !== undefined)
                  m.address = values.address as string | null;
                if (values.city !== undefined)
                  m.city = values.city as string | null;
                if (values.coverImagePath !== undefined)
                  m.coverImagePath = values.coverImagePath as string | null;
                if (values.status !== undefined)
                  m.status = values.status as any;
                if (values.updatedAt instanceof Date)
                  m.updatedAt = values.updatedAt;
                return [
                  {
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
                  },
                ];
              }),
            };
          }),
        })),
      };
    }),
    select: vi.fn((fields: Record<string, unknown>) => {
      let activeTable = '';

      const createQueryPromise = (
        getRows: () => any[],
        options = {
          limit: Infinity,
          offset: 0,
          filters: { eq: {}, ne: {}, in: {} } as FilterConditions,
          orderBy: [] as OrderByClause[],
        }
      ) => {
        const execute = () => {
          let rows = getRows();

          if (activeTable === 'museums') {
            if (options.filters.eq.status) {
              rows = rows.filter(
                (m) => m.status === options.filters.eq.status
              );
            }
            if (options.filters.eq.slug) {
              rows = rows.filter((m) => m.slug === options.filters.eq.slug);
            }
            if (options.filters.eq.id) {
              rows = rows.filter((m) => m.id === options.filters.eq.id);
            }
            if (options.filters.ne.id) {
              rows = rows.filter((m) => m.id !== options.filters.ne.id);
            }
            if (options.filters.in.id) {
              rows = rows.filter((m) =>
                options.filters.in.id.includes(m.id)
              );
            }
          } else if (activeTable === 'user_roles') {
            const targetUserId =
              options.filters.eq.user_id ?? options.filters.eq.userId;
            if (targetUserId) {
              rows = rows.filter((r) => r.user_id === targetUserId);
            }
            if (options.filters.eq.role) {
              rows = rows.filter(
                (r) => r.role === options.filters.eq.role
              );
            }
          } else if (activeTable === 'museum_admins') {
            const targetUserId =
              options.filters.eq.user_id ?? options.filters.eq.userId;
            if (targetUserId) {
              rows = rows.filter((m) => m.user_id === targetUserId);
            }
            const targetMuseumId =
              options.filters.eq.museum_id ?? options.filters.eq.museumId;
            if (targetMuseumId) {
              rows = rows.filter((m) => m.museum_id === targetMuseumId);
            }
            if (options.filters.eq.status) {
              rows = rows.filter(
                (m) => m.status === options.filters.eq.status
              );
            }
          } else if (activeTable === 'users') {
            if (options.filters.eq.id) {
              rows = rows.filter((u) => u.id === options.filters.eq.id);
            }
          } else if (activeTable === 'artifacts') {
            const targetMuseumId =
              options.filters.eq.museum_id ?? options.filters.eq.museumId;
            if (targetMuseumId) {
              rows = rows.filter((a) => a.museum_id === targetMuseumId);
            }
            if (options.filters.eq.status) {
              rows = rows.filter(
                (a) => a.status === options.filters.eq.status
              );
            }
            if (options.filters.eq.id) {
              rows = rows.filter((a) => a.id === options.filters.eq.id);
            }
            if (options.filters.ne.id) {
              rows = rows.filter((a) => a.id !== options.filters.ne.id);
            }
            const targetInvCode =
              options.filters.eq.inventory_code ??
              options.filters.eq.inventoryCode;
            if (targetInvCode !== undefined) {
              rows = rows.filter((a) => a.inventory_code === targetInvCode);
            }
          } else if (activeTable === 'souvenir_products') {
            const targetMuseumId =
              options.filters.eq.museum_id ?? options.filters.eq.museumId;
            if (targetMuseumId) {
              rows = rows.filter(
                (p) => p.museum_id === targetMuseumId
              );
            }
            if (options.filters.eq.status) {
              rows = rows.filter(
                (p) => p.status === options.filters.eq.status
              );
            }
            if (options.filters.eq.id) {
              rows = rows.filter((p) => p.id === options.filters.eq.id);
            }
            if (options.filters.ne.id) {
              rows = rows.filter((p) => p.id !== options.filters.ne.id);
            }
            if (options.filters.eq.sku !== undefined) {
              rows = rows.filter((p) => p.sku === options.filters.eq.sku);
            }
          } else if (activeTable === 'ticket_types') {
            const targetMuseumId =
              options.filters.eq.museum_id ?? options.filters.eq.museumId;
            if (targetMuseumId) {
              rows = rows.filter(
                (t) => t.museum_id === targetMuseumId
              );
            }
            const isAvail =
              options.filters.eq.is_available ??
              options.filters.eq.isAvailable;
            if (isAvail !== undefined) {
              rows = rows.filter(
                (t) => t.is_available === isAvail
              );
            }
            if (options.filters.eq.id) {
              rows = rows.filter((t) => t.id === options.filters.eq.id);
            }
            if (options.filters.ne.id) {
              rows = rows.filter((t) => t.id !== options.filters.ne.id);
            }
          } else if (activeTable === 'media_assets') {
            if (options.filters.eq.museum_id) {
              rows = rows.filter(
                (m) => m.museum_id === options.filters.eq.museum_id
              );
            }
            if (options.filters.eq.entity_type) {
              rows = rows.filter(
                (m) => m.entity_type === options.filters.eq.entity_type
              );
            }
            if (options.filters.eq.entity_id) {
              rows = rows.filter(
                (m) => m.entity_id === options.filters.eq.entity_id
              );
            }
            if (options.filters.eq.id) {
              rows = rows.filter((m) => m.id === options.filters.eq.id);
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
            const filters = extractFilters(condition);
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
            if (tableName === 'user_roles') {
              const rows: { user_id: string; userId: string; role: string }[] = [];
              for (const [uid, rSet] of mockState.userRoles.entries()) {
                for (const r of rSet) {
                  rows.push({ user_id: uid, userId: uid, role: r });
                }
              }
              return rows;
            }
            if (tableName === 'museum_admins') {
              return mockState.memberships.map((m) => ({
                museum_id: m.museumId,
                museumId: m.museumId,
                user_id: m.userId,
                userId: m.userId,
                status: m.status,
              }));
            }
            if (tableName === 'users') {
              return Array.from(mockState.users).map((uid) => ({ id: uid }));
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
            if (tableName === 'media_assets') {
              return mockState.mediaAssets.map((m) => ({
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
              }));
            }
            return [];
          };

          return createQueryPromise(getBaseRows);
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
  getSupabaseClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

import { createApp } from '../../src/app';

const app = createApp();

describe('Phase 2 — Catalog Public Reads', () => {
  const defaultDate = new Date('2026-01-01T10:00:00Z');
  const superAdminId = '00000000-0000-4000-8000-000000000001';
  const adminUserId = '00000000-0000-4000-8000-000000000002';
  const normalUserId = '00000000-0000-4000-8000-000000000003';

  function fakeMuseum(overrides: Partial<MuseumRecord> = {}): MuseumRecord {
    const createdAt = overrides.createdAt ?? defaultDate;
    return {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Museum',
      slug: 'museum-slug',
      description: null,
      address: null,
      city: null,
      coverImagePath: null,
      status: 'published',
      createdBy: null,
      createdAt,
      updatedAt: overrides.updatedAt ?? createdAt,
      ...overrides,
    };
  }

  function fakeArtifact(overrides: Partial<ArtifactRecord> = {}): ArtifactRecord {
    const createdAt = overrides.createdAt ?? defaultDate;
    return {
      id: 'a1111111-1111-1111-1111-111111111111',
      museumId: '11111111-1111-1111-1111-111111111111',
      name: 'Artifact',
      description: null,
      period: null,
      inventoryCode: null,
      status: 'published',
      createdBy: null,
      createdAt,
      updatedAt: overrides.updatedAt ?? createdAt,
      ...overrides,
    };
  }

  function fakeProduct(overrides: Partial<SouvenirProductRecord> = {}): SouvenirProductRecord {
    const createdAt = overrides.createdAt ?? defaultDate;
    return {
      id: 'p1111111-1111-1111-1111-111111111111',
      museumId: '11111111-1111-1111-1111-111111111111',
      name: 'Souvenir Product',
      description: null,
      sku: null,
      price: '100000',
      currency: 'VND',
      stockQuantity: 10,
      status: 'published',
      createdBy: null,
      createdAt,
      updatedAt: overrides.updatedAt ?? createdAt,
      ...overrides,
    };
  }

  function fakeTicketType(overrides: Partial<TicketTypeRecord> = {}): TicketTypeRecord {
    const createdAt = overrides.createdAt ?? defaultDate;
    return {
      id: 't1111111-1111-1111-1111-111111111111',
      museumId: '11111111-1111-1111-1111-111111111111',
      name: 'Standard Ticket',
      description: null,
      price: '50000',
      currency: 'VND',
      isAvailable: true,
      createdAt,
      updatedAt: overrides.updatedAt ?? createdAt,
      ...overrides,
    };
  }

  function fakeMedia(overrides: Partial<MediaAssetRecord> = {}): MediaAssetRecord {
    const createdAt = overrides.createdAt ?? defaultDate;
    return {
      id: 'm1111111-1111-1111-1111-111111111111',
      museumId: '11111111-1111-1111-1111-111111111111',
      entityType: 'artifact',
      entityId: 'a1111111-1111-1111-1111-111111111111',
      mediaType: 'image',
      storageBucket: 'museum-media',
      storagePath: 'artifacts/sample.jpg',
      mimeType: 'image/jpeg',
      sortOrder: 0,
      isPrimary: false,
      createdBy: null,
      createdAt,
      updatedAt: overrides.updatedAt ?? createdAt,
      ...overrides,
    };
  }

  function authAsSuperAdmin(userId = superAdminId) {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: userId, email: 'super@museum.vn' } },
    });
    mockState.userRoles.set(userId, new Set(['super_admin', 'normal_user']));
    mockState.users.add(userId);
    return userId;
  }

  function authAsAdminUser(
    userId = adminUserId,
    memberships: { museumId: string; status?: MembershipStatus }[] = []
  ) {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: userId, email: 'admin@museum.vn' } },
    });
    mockState.userRoles.set(userId, new Set(['admin_user', 'normal_user']));
    mockState.users.add(userId);
    for (const m of memberships) {
      mockState.memberships.push({
        userId,
        museumId: m.museumId,
        status: m.status ?? 'active',
      });
    }
    return userId;
  }

  function authAsNormalUser(userId = normalUserId) {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: userId, email: 'user@museum.vn' } },
    });
    mockState.userRoles.set(userId, new Set(['normal_user']));
    mockState.users.add(userId);
    return userId;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockReset();
    mockState.users.clear();
    mockState.userRoles.clear();
    mockState.memberships = [];
    mockState.museums = [];
    mockState.artifacts = [];
    mockState.souvenirProducts = [];
    mockState.ticketTypes = [];
    mockState.mediaAssets = [];
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
          fakeMuseum({ id: '11111111-1111-1111-1111-111111111111', name: 'Published Museum A', slug: 'museum-a', description: 'Desc A', address: '123 St', city: 'Hanoi', coverImagePath: '/covers/a.jpg' }),
          fakeMuseum({ id: '22222222-2222-2222-2222-222222222222', name: 'Draft Museum B', slug: 'museum-b', description: 'Desc B', status: 'draft', createdAt: new Date('2026-01-02T10:00:00Z') }),
          fakeMuseum({ id: '33333333-3333-3333-3333-333333333333', name: 'Archived Museum C', slug: 'museum-c', status: 'archived', createdAt: new Date('2026-01-03T10:00:00Z') }),
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
          fakeMuseum({ id: '11111111-1111-1111-1111-111111111111', name: 'Oldest Museum', slug: 'oldest-museum' }),
          fakeMuseum({ id: '22222222-2222-2222-2222-222222222222', name: 'Middle Museum', slug: 'middle-museum', createdAt: new Date('2026-01-15T10:00:00Z') }),
          fakeMuseum({ id: '33333333-3333-3333-3333-333333333333', name: 'Newest Museum', slug: 'newest-museum', createdAt: new Date('2026-02-01T10:00:00Z') }),
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
          fakeMuseum({ id: '11111111-1111-1111-1111-111111111111', name: 'Museum 1 (Oldest)', slug: 'museum-1' }),
          fakeMuseum({ id: '22222222-2222-2222-2222-222222222222', name: 'Museum 2 (Middle)', slug: 'museum-2', createdAt: new Date('2026-01-02T10:00:00Z') }),
          fakeMuseum({ id: '33333333-3333-3333-3333-333333333333', name: 'Museum 3 (Newest)', slug: 'museum-3', createdAt: new Date('2026-01-03T10:00:00Z') }),
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
        mockState.museums.push(fakeMuseum({ id: '11111111-1111-1111-1111-111111111111', name: 'Draft Museum', slug: 'draft-museum', status: 'draft' }));

        const res = await request(app).get('/api/v1/museums/draft-museum');

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 for archived museum', async () => {
        mockState.museums.push(fakeMuseum({ id: '11111111-1111-1111-1111-111111111111', name: 'Archived Museum', slug: 'archived-museum', status: 'archived' }));

        const res = await request(app).get('/api/v1/museums/archived-museum');

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('does not expose published children when the parent museum is draft or archived', async () => {
        const draftMuseumId = '11111111-1111-1111-1111-111111111111';
        const archivedMuseumId = '22222222-2222-2222-2222-222222222222';

        mockState.museums.push(
          fakeMuseum({ id: draftMuseumId, name: 'Draft Museum With Children', slug: 'draft-with-children', status: 'draft' }),
          fakeMuseum({ id: archivedMuseumId, name: 'Archived Museum With Children', slug: 'archived-with-children', status: 'archived', createdAt: new Date('2026-01-02T10:00:00Z') }),
        );

        mockState.artifacts.push(
          fakeArtifact({ id: 'a1111111-1111-1111-1111-111111111111', museumId: draftMuseumId, name: 'Published Artifact Inside Draft Museum', inventoryCode: 'INV-DRAFT-001' }),
          fakeArtifact({ id: 'a2222222-2222-2222-2222-222222222222', museumId: archivedMuseumId, name: 'Published Artifact Inside Archived Museum', inventoryCode: 'INV-ARCHIVED-001', createdAt: new Date('2026-01-02T10:00:00Z') }),
        );

        mockState.souvenirProducts.push(
          fakeProduct({ id: 'p1111111-1111-1111-1111-111111111111', museumId: draftMuseumId, name: 'Published Product in Draft', sku: 'SKU-DRAFT-PUB', price: '10000.00', stockQuantity: 5 }),
          fakeProduct({ id: 'p2222222-2222-2222-2222-222222222222', museumId: archivedMuseumId, name: 'Published Product in Archived', sku: 'SKU-ARCHIVED-PUB', price: '20000.00', stockQuantity: 10, createdAt: new Date('2026-01-02T10:00:00Z') }),
        );

        mockState.ticketTypes.push(
          fakeTicketType({ id: 't1111111-1111-1111-1111-111111111111', museumId: draftMuseumId, name: 'Available Ticket in Draft', price: '50000.00' }),
          fakeTicketType({ id: 't2222222-2222-2222-2222-222222222222', museumId: archivedMuseumId, name: 'Available Ticket in Archived', price: '60000.00', createdAt: new Date('2026-01-02T10:00:00Z') }),
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
        mockState.museums.push(fakeMuseum({ id: museumId, name: 'Louvre Museum', slug: 'louvre', description: 'World famous museum', address: 'Rue de Rivoli', city: 'Paris', coverImagePath: '/images/louvre.jpg' }));

        mockState.artifacts.push(
          fakeArtifact({ id: 'a1111111-1111-1111-1111-111111111111', museumId, name: 'Mona Lisa', description: 'Portrait by Leonardo da Vinci', period: 'Renaissance', inventoryCode: 'INV-MONA' }),
          fakeArtifact({ id: 'a2222222-2222-2222-2222-222222222222', museumId, name: 'Draft Artifact', inventoryCode: 'INV-DRAFT', status: 'draft' }),
        );

        mockState.souvenirProducts.push(
          fakeProduct({ id: 'p1111111-1111-1111-1111-111111111111', museumId, name: 'Mona Lisa Postcard', description: 'Glossy print', sku: 'SKU-POSTCARD', price: '50000.00', stockQuantity: 100 }),
          fakeProduct({ id: 'p2222222-2222-2222-2222-222222222222', museumId, name: 'Draft Magnet', sku: 'SKU-DRAFT', price: '30000.00', stockQuantity: 10, status: 'draft' }),
        );

        mockState.ticketTypes.push(
          fakeTicketType({ id: 't1111111-1111-1111-1111-111111111111', museumId, name: 'Standard Ticket', description: 'General admission', price: '150000.00' }),
          fakeTicketType({ id: 't2222222-2222-2222-2222-222222222222', museumId, name: 'Unavailable VIP Ticket', description: 'Temporarily paused', price: '500000.00', isAvailable: false }),
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
        mockState.museums.push(fakeMuseum({ id: '11111111-1111-1111-1111-111111111111', name: 'Empty Museum', slug: 'empty-museum' }));

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
        mockState.museums.push(fakeMuseum({ id: '11111111-1111-1111-1111-111111111111', name: 'Public Museum', slug: 'public-museum' }));

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
        mockState.museums.push(fakeMuseum({ id: museumId, name: 'Draft Museum', slug: 'draft-museum', status: 'draft' }));
        mockState.artifacts.push(fakeArtifact({ id: 'a1111111-1111-4111-8111-111111111111', museumId, name: 'Published Artifact in Draft Museum', inventoryCode: 'INV-001' }));

        const res = await request(app).get(`/api/v1/museums/${museumId}/artifacts`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 not_found when museum is archived', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        mockState.museums.push(fakeMuseum({ id: museumId, name: 'Archived Museum', slug: 'archived-museum', status: 'archived' }));
        mockState.artifacts.push(fakeArtifact({ id: 'a1111111-1111-4111-8111-111111111111', museumId, name: 'Published Artifact in Archived Museum', inventoryCode: 'INV-002' }));

        const res = await request(app).get(`/api/v1/museums/${museumId}/artifacts`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 200 with empty list and pagination total=0 when published museum has no artifacts', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        mockState.museums.push(fakeMuseum({ id: museumId, name: 'Empty Published Museum', slug: 'empty-published-museum' }));

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
          fakeMuseum({ id: museum1, name: 'Museum 1', slug: 'museum-1' }),
          fakeMuseum({ id: museum2, name: 'Museum 2', slug: 'museum-2' }),
        );

        mockState.artifacts.push(
          fakeArtifact({ id: 'a1111111-1111-4111-8111-111111111111', museumId: museum1, name: 'Published Artifact M1', description: 'Desc', period: 'Bronze Age', inventoryCode: 'INV-M1-PUB' }),
          fakeArtifact({ id: 'a2222222-2222-4222-8222-222222222222', museumId: museum1, name: 'Draft Artifact M1', inventoryCode: 'INV-M1-DRAFT', status: 'draft', createdAt: new Date('2026-01-02T10:00:00Z') }),
          fakeArtifact({ id: 'a3333333-3333-4333-8333-333333333333', museumId: museum1, name: 'Archived Artifact M1', inventoryCode: 'INV-M1-ARCH', status: 'archived', createdAt: new Date('2026-01-03T10:00:00Z') }),
          fakeArtifact({ id: 'a4444444-4444-4444-8444-444444444444', museumId: museum2, name: 'Published Artifact M2', inventoryCode: 'INV-M2-PUB', createdAt: new Date('2026-01-04T10:00:00Z') }),
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
        mockState.museums.push(fakeMuseum({ id: museumId, name: 'Museum', slug: 'museum' }));

        mockState.artifacts.push(
          fakeArtifact({ id: 'a1111111-1111-4111-8111-111111111111', museumId, name: 'Artifact Oldest', inventoryCode: 'INV-01' }),
          fakeArtifact({ id: 'a2222222-2222-4222-8222-222222222222', museumId, name: 'Artifact Middle', inventoryCode: 'INV-02', createdAt: new Date('2026-01-02T10:00:00Z') }),
          fakeArtifact({ id: 'a3333333-3333-4333-8333-333333333333', museumId, name: 'Artifact Newest', inventoryCode: 'INV-03', createdAt: new Date('2026-01-03T10:00:00Z') }),
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
        mockState.museums.push(fakeMuseum({ id: museumId, name: 'Museum', slug: 'museum' }));

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
        mockState.museums.push(fakeMuseum({ id: museumId, name: 'Published Museum', slug: 'published-museum' }));
        mockState.artifacts.push(fakeArtifact({ id: artifactId, museumId, name: 'Draft Artifact', inventoryCode: 'INV-DRAFT', status: 'draft' }));

        const res = await request(app).get(`/api/v1/artifacts/${artifactId}`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 not_found when artifact is archived', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        const artifactId = 'a1111111-1111-4111-8111-111111111111';
        mockState.museums.push(fakeMuseum({ id: museumId, name: 'Published Museum', slug: 'published-museum' }));
        mockState.artifacts.push(fakeArtifact({ id: artifactId, museumId, name: 'Archived Artifact', inventoryCode: 'INV-ARCHIVED', status: 'archived' }));

        const res = await request(app).get(`/api/v1/artifacts/${artifactId}`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 when parent museum is draft', async () => {
        const draftMuseumId = '11111111-1111-4111-8111-111111111111';
        const artifactId = 'a1111111-1111-4111-8111-111111111111';
        mockState.museums.push(fakeMuseum({ id: draftMuseumId, name: 'Draft Museum', slug: 'draft-museum', status: 'draft' }));
        mockState.artifacts.push(fakeArtifact({ id: artifactId, museumId: draftMuseumId, name: 'Published Artifact in Draft Museum', inventoryCode: 'INV-PUB-IN-DRAFT' }));

        const res = await request(app).get(`/api/v1/artifacts/${artifactId}`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 when parent museum is archived', async () => {
        const archivedMuseumId = '11111111-1111-4111-8111-111111111111';
        const artifactId = 'a1111111-1111-4111-8111-111111111111';
        mockState.museums.push(fakeMuseum({ id: archivedMuseumId, name: 'Archived Museum', slug: 'archived-museum', status: 'archived' }));
        mockState.artifacts.push(fakeArtifact({ id: artifactId, museumId: archivedMuseumId, name: 'Published Artifact in Archived Museum', inventoryCode: 'INV-PUB-IN-ARCHIVED' }));

        const res = await request(app).get(`/api/v1/artifacts/${artifactId}`);
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns artifact when both artifact and museum are published', async () => {
        const museumId = '11111111-1111-4111-8111-111111111111';
        const artifactId = 'a1111111-1111-4111-8111-111111111111';
        mockState.museums.push(fakeMuseum({ id: museumId, name: 'Published Museum', slug: 'published-museum', description: 'Museum description', address: '123 Street', city: 'Hanoi', coverImagePath: '/covers/museum.jpg' }));
        mockState.artifacts.push(fakeArtifact({ id: artifactId, museumId, name: 'Dong Son Drum', description: 'Ancient bronze drum', period: 'Bronze Age', inventoryCode: 'INV-DONG-SON' }));

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
        mockState.museums.push(fakeMuseum({ id: museumId, name: 'Museum', slug: 'museum' }));
        mockState.artifacts.push(fakeArtifact({ id: artifactId, museumId, name: 'Artifact', inventoryCode: 'INV-01' }));

        const res = await request(app).get(`/api/v1/artifacts/${artifactId}`);
        expect(res.status).toBe(200);
      });
    });
  });

  describe('Phase 2.3 — Public Reads: GET /api/v1/media', () => {
    const validMuseumId = '11111111-1111-4111-8111-111111111111';
    const validArtifactId = 'a1111111-1111-4111-8111-111111111111';
    const validProductId = 'b1111111-1111-4111-8111-111111111111';

    describe('Validation (400 validation_error)', () => {
      it('returns 400 when entity_type is missing', async () => {
        const res = await request(app).get(
          `/api/v1/media?entity_id=${validArtifactId}`
        );
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 400 when entity_id is missing', async () => {
        const res = await request(app).get('/api/v1/media?entity_type=artifact');
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 400 when entity_type is invalid', async () => {
        const res = await request(app).get(
          `/api/v1/media?entity_type=gallery&entity_id=${validArtifactId}`
        );
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 400 when entity_id is not a valid UUID', async () => {
        const res = await request(app).get(
          '/api/v1/media?entity_type=artifact&entity_id=not-a-valid-uuid'
        );
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 400 when limit is invalid', async () => {
        const res1 = await request(app).get(
          `/api/v1/media?entity_type=artifact&entity_id=${validArtifactId}&limit=0`
        );
        expect(res1.status).toBe(400);
        expect(res1.body.error.code).toBe('validation_error');

        const res2 = await request(app).get(
          `/api/v1/media?entity_type=artifact&entity_id=${validArtifactId}&limit=101`
        );
        expect(res2.status).toBe(400);
        expect(res2.body.error.code).toBe('validation_error');

        const res3 = await request(app).get(
          `/api/v1/media?entity_type=artifact&entity_id=${validArtifactId}&limit=abc`
        );
        expect(res3.status).toBe(400);
        expect(res3.body.error.code).toBe('validation_error');
      });

      it('returns 400 when offset is negative or not a number', async () => {
        const res1 = await request(app).get(
          `/api/v1/media?entity_type=artifact&entity_id=${validArtifactId}&offset=-1`
        );
        expect(res1.status).toBe(400);
        expect(res1.body.error.code).toBe('validation_error');

        const res2 = await request(app).get(
          `/api/v1/media?entity_type=artifact&entity_id=${validArtifactId}&offset=foo`
        );
        expect(res2.status).toBe(400);
        expect(res2.body.error.code).toBe('validation_error');
      });
    });

    describe('Visibility & Parent Guard (404 not_found)', () => {
      it('returns 404 when target artifact does not exist', async () => {
        const unknownId = '99999999-9999-4999-8999-999999999999';
        const res = await request(app).get(
          `/api/v1/media?entity_type=artifact&entity_id=${unknownId}`
        );
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 when target souvenir product does not exist', async () => {
        const unknownId = '99999999-9999-4999-8999-999999999999';
        const res = await request(app).get(
          `/api/v1/media?entity_type=souvenir&entity_id=${unknownId}`
        );
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 404 when artifact is draft or archived', async () => {
        mockState.museums.push(fakeMuseum({ id: validMuseumId, name: 'Published Museum', slug: 'published-museum' }));

        const draftArtifactId = 'a2222222-2222-4222-8222-222222222222';
        const archivedArtifactId = 'a3333333-3333-4333-8333-333333333333';

        mockState.artifacts.push(
          fakeArtifact({ id: draftArtifactId, museumId: validMuseumId, name: 'Draft Artifact', inventoryCode: 'INV-DRAFT', status: 'draft' }),
          fakeArtifact({ id: archivedArtifactId, museumId: validMuseumId, name: 'Archived Artifact', inventoryCode: 'INV-ARCHIVED', status: 'archived' }),
        );

        const res1 = await request(app).get(
          `/api/v1/media?entity_type=artifact&entity_id=${draftArtifactId}`
        );
        expect(res1.status).toBe(404);
        expect(res1.body.error.code).toBe('not_found');

        const res2 = await request(app).get(
          `/api/v1/media?entity_type=artifact&entity_id=${archivedArtifactId}`
        );
        expect(res2.status).toBe(404);
        expect(res2.body.error.code).toBe('not_found');
      });

      it('returns 404 when souvenir product is draft or archived', async () => {
        mockState.museums.push(fakeMuseum({ id: validMuseumId, name: 'Published Museum', slug: 'published-museum' }));

        const draftProductId = 'b2222222-2222-4222-8222-222222222222';
        const archivedProductId = 'b3333333-3333-4333-8333-333333333333';

        mockState.souvenirProducts.push(
          fakeProduct({ id: draftProductId, museumId: validMuseumId, name: 'Draft Product', sku: 'SKU-DRAFT', price: '10000.00', stockQuantity: 10, status: 'draft' }),
          fakeProduct({ id: archivedProductId, museumId: validMuseumId, name: 'Archived Product', sku: 'SKU-ARCHIVED', price: '20000.00', stockQuantity: 10, status: 'archived' }),
        );

        const res1 = await request(app).get(
          `/api/v1/media?entity_type=souvenir&entity_id=${draftProductId}`
        );
        expect(res1.status).toBe(404);
        expect(res1.body.error.code).toBe('not_found');

        const res2 = await request(app).get(
          `/api/v1/media?entity_type=souvenir&entity_id=${archivedProductId}`
        );
        expect(res2.status).toBe(404);
        expect(res2.body.error.code).toBe('not_found');
      });

      it('returns 404 when published artifact has draft or archived parent museum', async () => {
        const draftMuseumId = '22222222-2222-4222-8222-222222222222';
        const archivedMuseumId = '33333333-3333-4333-8333-333333333333';

        mockState.museums.push(
          fakeMuseum({ id: draftMuseumId, name: 'Draft Museum', slug: 'draft-museum', status: 'draft' }),
          fakeMuseum({ id: archivedMuseumId, name: 'Archived Museum', slug: 'archived-museum', status: 'archived' }),
        );

        const artifactInDraftId = 'a4444444-4444-4444-8444-444444444444';
        const artifactInArchivedId = 'a5555555-5555-4555-8555-555555555555';

        mockState.artifacts.push(
          fakeArtifact({ id: artifactInDraftId, museumId: draftMuseumId, name: 'Published Artifact In Draft Museum', inventoryCode: 'INV-04' }),
          fakeArtifact({ id: artifactInArchivedId, museumId: archivedMuseumId, name: 'Published Artifact In Archived Museum', inventoryCode: 'INV-05' }),
        );

        const res1 = await request(app).get(
          `/api/v1/media?entity_type=artifact&entity_id=${artifactInDraftId}`
        );
        expect(res1.status).toBe(404);
        expect(res1.body.error.code).toBe('not_found');

        const res2 = await request(app).get(
          `/api/v1/media?entity_type=artifact&entity_id=${artifactInArchivedId}`
        );
        expect(res2.status).toBe(404);
        expect(res2.body.error.code).toBe('not_found');
      });

      it('returns 404 when published souvenir product has draft or archived parent museum', async () => {
        const draftMuseumId = '22222222-2222-4222-8222-222222222222';
        const archivedMuseumId = '33333333-3333-4333-8333-333333333333';

        mockState.museums.push(
          fakeMuseum({ id: draftMuseumId, name: 'Draft Museum', slug: 'draft-museum', status: 'draft' }),
          fakeMuseum({ id: archivedMuseumId, name: 'Archived Museum', slug: 'archived-museum', status: 'archived' }),
        );

        const productInDraftId = 'b4444444-4444-4444-8444-444444444444';
        const productInArchivedId = 'b5555555-5555-4555-8555-555555555555';

        mockState.souvenirProducts.push(
          fakeProduct({ id: productInDraftId, museumId: draftMuseumId, name: 'Published Product In Draft Museum', sku: 'SKU-04', price: '50000.00', stockQuantity: 10 }),
          fakeProduct({ id: productInArchivedId, museumId: archivedMuseumId, name: 'Published Product In Archived Museum', sku: 'SKU-05', price: '60000.00', stockQuantity: 10 }),
        );

        const res1 = await request(app).get(
          `/api/v1/media?entity_type=souvenir&entity_id=${productInDraftId}`
        );
        expect(res1.status).toBe(404);
        expect(res1.body.error.code).toBe('not_found');

        const res2 = await request(app).get(
          `/api/v1/media?entity_type=souvenir&entity_id=${productInArchivedId}`
        );
        expect(res2.status).toBe(404);
        expect(res2.body.error.code).toBe('not_found');
      });
    });

    describe('Listing, Ordering & Pagination (200 OK)', () => {
      it('returns empty array with pagination total=0 when published entity has no media', async () => {
        mockState.museums.push(fakeMuseum({ id: validMuseumId, name: 'Published Museum', slug: 'published-museum' }));

        mockState.artifacts.push(fakeArtifact({ id: validArtifactId, museumId: validMuseumId, name: 'Artifact Without Media', inventoryCode: 'INV-NO-MEDIA' }));

        const res = await request(app).get(
          `/api/v1/media?entity_type=artifact&entity_id=${validArtifactId}`
        );

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

      it('returns media ordered by sort_order ASC with deterministic secondary sort', async () => {
        mockState.museums.push(fakeMuseum({ id: validMuseumId, name: 'Published Museum', slug: 'published-museum' }));

        mockState.artifacts.push(fakeArtifact({ id: validArtifactId, museumId: validMuseumId, name: 'Artifact With Media', inventoryCode: 'INV-MEDIA' }));

        const media1 = 'm1111111-1111-4111-8111-111111111111';
        const media2 = 'm2222222-2222-4222-8222-222222222222';
        const media3 = 'm3333333-3333-4333-8333-333333333333';

        mockState.mediaAssets.push(
          fakeMedia({ id: media3, museumId: validMuseumId, entityType: 'artifact', entityId: validArtifactId, mediaType: 'image', storageBucket: 'museum-media', storagePath: 'path3.jpg', mimeType: 'image/jpeg', sortOrder: 20, isPrimary: false, createdAt: new Date('2026-01-03T10:00:00Z') }),
          fakeMedia({ id: media1, museumId: validMuseumId, entityType: 'artifact', entityId: validArtifactId, mediaType: 'image', storageBucket: 'museum-media', storagePath: 'path1.jpg', mimeType: 'image/jpeg', sortOrder: 1, isPrimary: true }),
          fakeMedia({ id: media2, museumId: validMuseumId, entityType: 'artifact', entityId: validArtifactId, mediaType: 'video', storageBucket: 'museum-media', storagePath: 'path2.mp4', mimeType: 'video/mp4', sortOrder: 10, isPrimary: false, createdAt: new Date('2026-01-02T10:00:00Z') }),
        );

        const res = await request(app).get(
          `/api/v1/media?entity_type=artifact&entity_id=${validArtifactId}`
        );

        expect(res.status).toBe(200);
        expect(res.body.pagination.total).toBe(3);
        expect(res.body.data).toHaveLength(3);
        expect(res.body.data.map((m: any) => m.id)).toEqual([
          media1,
          media2,
          media3,
        ]);
        expect(res.body.data[0]).toEqual({
          id: media1,
          museum_id: validMuseumId,
          entity_type: 'artifact',
          entity_id: validArtifactId,
          media_type: 'image',
          storage_bucket: 'museum-media',
          storage_path: 'path1.jpg',
          mime_type: 'image/jpeg',
          sort_order: 1,
          is_primary: true,
          created_by: null,
          created_at: '2026-01-01T10:00:00.000Z',
          updated_at: '2026-01-01T10:00:00.000Z',
        });
      });

      it('works for souvenir products and respects pagination parameters', async () => {
        mockState.museums.push(fakeMuseum({ id: validMuseumId, name: 'Published Museum', slug: 'published-museum' }));

        mockState.souvenirProducts.push(fakeProduct({ id: validProductId, museumId: validMuseumId, name: 'Mug', sku: 'MUG-01', price: '80000.00', stockQuantity: 20 }));

        const m1 = 'm1111111-1111-4111-8111-111111111111';
        const m2 = 'm2222222-2222-4222-8222-222222222222';
        const m3 = 'm3333333-3333-4333-8333-333333333333';

        mockState.mediaAssets.push(
          fakeMedia({ id: m1, museumId: validMuseumId, entityType: 'souvenir', entityId: validProductId, mediaType: 'image', storageBucket: 'souvenir-media', storagePath: 'p1.jpg', mimeType: 'image/jpeg', sortOrder: 1, isPrimary: true }),
          fakeMedia({ id: m2, museumId: validMuseumId, entityType: 'souvenir', entityId: validProductId, mediaType: 'image', storageBucket: 'souvenir-media', storagePath: 'p2.jpg', mimeType: 'image/jpeg', sortOrder: 2, isPrimary: false, createdAt: new Date('2026-01-02T10:00:00Z') }),
          fakeMedia({ id: m3, museumId: validMuseumId, entityType: 'souvenir', entityId: validProductId, mediaType: 'image', storageBucket: 'souvenir-media', storagePath: 'p3.jpg', mimeType: 'image/jpeg', sortOrder: 3, isPrimary: false, createdAt: new Date('2026-01-03T10:00:00Z') }),
        );

        const res = await request(app).get(
          `/api/v1/media?entity_type=souvenir&entity_id=${validProductId}&limit=2&offset=1`
        );

        expect(res.status).toBe(200);
        expect(res.body.pagination).toEqual({
          limit: 2,
          offset: 1,
          total: 3,
        });
        expect(res.body.data).toHaveLength(2);
        expect(res.body.data[0].id).toBe(m2);
        expect(res.body.data[1].id).toBe(m3);
      });

      it('is accessible publicly without an Authorization header', async () => {
        mockState.museums.push(fakeMuseum({ id: validMuseumId, name: 'Published Museum', slug: 'published-museum' }));

        mockState.artifacts.push(fakeArtifact({ id: validArtifactId, museumId: validMuseumId, name: 'Artifact', inventoryCode: 'INV-PUBLIC' }));

        const res = await request(app).get(
          `/api/v1/media?entity_type=artifact&entity_id=${validArtifactId}`
        );
        expect(res.status).toBe(200);
      });
    });
  });

  describe('Phase 2.4 — Admin Reads & Writes: Museums', () => {


    describe('POST /api/v1/admin/museums', () => {
      it('returns 401 for anon and 403 for normal_user', async () => {
        const anonRes = await request(app)
          .post('/api/v1/admin/museums')
          .send({ name: 'New Museum', slug: 'new-museum' });
        expect(anonRes.status).toBe(401);
        expect(anonRes.body.error.code).toBe('unauthorized');

        authAsNormalUser();
        const normalRes = await request(app)
          .post('/api/v1/admin/museums')
          .set('Authorization', 'Bearer user-token')
          .send({ name: 'New Museum', slug: 'new-museum' });
        expect(normalRes.status).toBe(403);
        expect(normalRes.body.error.code).toBe('forbidden');
      });

      it('returns 403 for admin_user (not super_admin)', async () => {
        authAsAdminUser();
        const res = await request(app)
          .post('/api/v1/admin/museums')
          .set('Authorization', 'Bearer admin-token')
          .send({ name: 'New Museum', slug: 'new-museum' });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('forbidden');
      });

      it('returns 400 validation_error when name or slug is empty or missing', async () => {
        authAsSuperAdmin();
        const res1 = await request(app)
          .post('/api/v1/admin/museums')
          .set('Authorization', 'Bearer super-token')
          .send({ name: '', slug: 'valid-slug' });
        expect(res1.status).toBe(400);
        expect(res1.body.error.code).toBe('validation_error');

        authAsSuperAdmin();
        const res2 = await request(app)
          .post('/api/v1/admin/museums')
          .set('Authorization', 'Bearer super-token')
          .send({ name: 'Museum Name' });
        expect(res2.status).toBe(400);
        expect(res2.body.error.code).toBe('validation_error');
      });

      it('returns 400 validation_error when unknown fields like id or created_by are passed', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .post('/api/v1/admin/museums')
          .set('Authorization', 'Bearer super-token')
          .send({
            name: 'Valid Name',
            slug: 'valid-slug',
            id: '11111111-1111-4111-8111-111111111111',
            created_by: 'hacker-id',
          });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 409 on duplicate slug', async () => {
        mockState.museums.push(fakeMuseum({ id: '11111111-1111-4111-8111-111111111111', name: 'Existing Museum', slug: 'existing-museum' }));

        authAsSuperAdmin();
        const res = await request(app)
          .post('/api/v1/admin/museums')
          .set('Authorization', 'Bearer super-token')
          .send({
            name: 'Another Museum',
            slug: 'existing-museum',
          });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('duplicate_slug');
      });

      it('creates museum and returns 201 with created_by populated for super_admin', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .post('/api/v1/admin/museums')
          .set('Authorization', 'Bearer super-token')
          .send({
            name: 'National Fine Arts Museum',
            slug: 'fine-arts',
            description: 'A museum of fine arts',
            address: '66 Nguyen Thai Hoc',
            city: 'Hanoi',
            cover_image_path: '/fine-arts.jpg',
          });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
          name: 'National Fine Arts Museum',
          slug: 'fine-arts',
          description: 'A museum of fine arts',
          address: '66 Nguyen Thai Hoc',
          city: 'Hanoi',
          cover_image_path: '/fine-arts.jpg',
          status: 'draft',
          created_by: superAdminId,
        });
        expect(res.body.data.id).toBeDefined();
        expect(res.body.data.created_at).toBeDefined();
      });

      it('creates museum with explicit status', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .post('/api/v1/admin/museums')
          .set('Authorization', 'Bearer super-token')
          .send({
            name: 'Published Museum',
            slug: 'published-museum',
            status: 'published',
          });

        expect(res.status).toBe(201);
        expect(res.body.data.status).toBe('published');
      });
    });

    describe('GET /api/v1/admin/museums', () => {
      const museum1 = '11111111-1111-4111-8111-111111111111';
      const museum2 = '22222222-2222-4222-8222-222222222222';
      const museum3 = '33333333-3333-4333-8333-333333333333';

      beforeEach(() => {
        mockState.museums.push(
          fakeMuseum({ id: museum1, name: 'Draft Museum 1', slug: 'draft-1', status: 'draft' }),
          fakeMuseum({ id: museum2, name: 'Published Museum 2', slug: 'published-2', createdAt: new Date('2026-01-02T10:00:00Z') }),
          fakeMuseum({ id: museum3, name: 'Archived Museum 3', slug: 'archived-3', status: 'archived', createdAt: new Date('2026-01-03T10:00:00Z') }),
        );
      });

      it('returns 401 for anon and 403 for normal_user', async () => {
        const anonRes = await request(app).get('/api/v1/admin/museums');
        expect(anonRes.status).toBe(401);
        expect(anonRes.body.error.code).toBe('unauthorized');

        authAsNormalUser();
        const normalRes = await request(app)
          .get('/api/v1/admin/museums')
          .set('Authorization', 'Bearer user-token');
        expect(normalRes.status).toBe(403);
        expect(normalRes.body.error.code).toBe('forbidden');
      });

      it('returns only active managed museums for admin_user', async () => {
        authAsAdminUser(adminUserId, [
          { museumId: museum1, status: 'active' },
          { museumId: museum3, status: 'active' },
        ]);

        const res = await request(app)
          .get('/api/v1/admin/museums')
          .set('Authorization', 'Bearer admin-token');

        expect(res.status).toBe(200);
        expect(res.body.pagination.total).toBe(2);
        expect(res.body.data.map((m: any) => m.id)).toEqual([
          museum3,
          museum1,
        ]);
      });

      it('returns empty list and total=0 for admin_user with no active managed museums', async () => {
        authAsAdminUser(adminUserId, []);

        const res = await request(app)
          .get('/api/v1/admin/museums')
          .set('Authorization', 'Bearer admin-token');

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

      it('returns all museums for super_admin across all statuses', async () => {
        authAsSuperAdmin();

        const res = await request(app)
          .get('/api/v1/admin/museums')
          .set('Authorization', 'Bearer super-token');

        expect(res.status).toBe(200);
        expect(res.body.pagination.total).toBe(3);
        expect(res.body.data).toHaveLength(3);
        expect(res.body.data.map((m: any) => m.id)).toEqual([
          museum3,
          museum2,
          museum1,
        ]);
      });

      it('respects limit and offset pagination parameters', async () => {
        authAsSuperAdmin();

        const res = await request(app)
          .get('/api/v1/admin/museums?limit=2&offset=1')
          .set('Authorization', 'Bearer super-token');

        expect(res.status).toBe(200);
        expect(res.body.pagination).toEqual({
          limit: 2,
          offset: 1,
          total: 3,
        });
        expect(res.body.data).toHaveLength(2);
        expect(res.body.data[0].id).toBe(museum2);
        expect(res.body.data[1].id).toBe(museum1);
      });

      it('loses access on the next request after museum_admins membership is revoked', async () => {
        authAsAdminUser(adminUserId, [
          { museumId: museum1, status: 'active' },
        ]);

        const res1 = await request(app)
          .get('/api/v1/admin/museums')
          .set('Authorization', 'Bearer admin-token');
        expect(res1.status).toBe(200);
        expect(res1.body.pagination.total).toBe(1);

        // Revoke membership
        mockState.memberships[0].status = 'revoked';

        authAsAdminUser(adminUserId);
        const res2 = await request(app)
          .get('/api/v1/admin/museums')
          .set('Authorization', 'Bearer admin-token');
        expect(res2.status).toBe(200);
        expect(res2.body.pagination.total).toBe(0);
        expect(res2.body.data).toEqual([]);
      });
    });

    describe('PATCH /api/v1/admin/museums/:id', () => {
      const museumId = '11111111-1111-4111-8111-111111111111';
      const otherMuseumId = '22222222-2222-4222-8222-222222222222';

      beforeEach(() => {
        mockState.museums.push(
          fakeMuseum({ id: museumId, name: 'Original Museum', slug: 'original-museum', description: 'Original desc', address: '123 St', city: 'Hue', coverImagePath: '/covers/orig.jpg', status: 'draft', createdBy: superAdminId }),
          fakeMuseum({ id: otherMuseumId, name: 'Other Museum', slug: 'other-museum', createdAt: new Date('2026-01-02T10:00:00Z') }),
        );
      });

      it('returns 401 for anon and 403 for normal_user', async () => {
        const anonRes = await request(app)
          .patch(`/api/v1/admin/museums/${museumId}`)
          .send({ name: 'Updated' });
        expect(anonRes.status).toBe(401);

        authAsNormalUser();
        const normalRes = await request(app)
          .patch(`/api/v1/admin/museums/${museumId}`)
          .set('Authorization', 'Bearer user-token')
          .send({ name: 'Updated' });
        expect(normalRes.status).toBe(403);
      });

      it('returns 400 validation_error when id is not a valid UUID', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .patch('/api/v1/admin/museums/not-a-valid-uuid')
          .set('Authorization', 'Bearer super-token')
          .send({ name: 'Updated' });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 400 validation_error when body is empty', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .patch(`/api/v1/admin/museums/${museumId}`)
          .set('Authorization', 'Bearer super-token')
          .send({});
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 400 validation_error when body has unknown fields like id or created_by', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .patch(`/api/v1/admin/museums/${museumId}`)
          .set('Authorization', 'Bearer super-token')
          .send({
            id: '99999999-9999-4999-8999-999999999999',
            created_by: 'new-creator',
          });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 404 for a museum that does not exist', async () => {
        const nonExistentId = '99999999-9999-4999-8999-999999999999';

        authAsSuperAdmin();
        const res1 = await request(app)
          .patch(`/api/v1/admin/museums/${nonExistentId}`)
          .set('Authorization', 'Bearer super-token')
          .send({ name: 'Updated' });
        expect(res1.status).toBe(404);
        expect(res1.body.error.code).toBe('not_found');

        authAsAdminUser();
        const res2 = await request(app)
          .patch(`/api/v1/admin/museums/${nonExistentId}`)
          .set('Authorization', 'Bearer admin-token')
          .send({ name: 'Updated' });
        expect(res2.status).toBe(404);
        expect(res2.body.error.code).toBe('not_found');
      });

      it('returns 403 when admin_user does not manage this museum', async () => {
        authAsAdminUser(adminUserId, [
          { museumId: otherMuseumId, status: 'active' },
        ]);

        const res = await request(app)
          .patch(`/api/v1/admin/museums/${museumId}`)
          .set('Authorization', 'Bearer admin-token')
          .send({ name: 'Unauthorized Update' });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('not_museum_admin');
      });

      it('returns 409 when slug conflicts with another museum', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .patch(`/api/v1/admin/museums/${museumId}`)
          .set('Authorization', 'Bearer super-token')
          .send({ slug: 'other-museum' });

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('duplicate_slug');
      });

      it('updates museum for authorized museum admin', async () => {
        authAsAdminUser(adminUserId, [
          { museumId, status: 'active' },
        ]);

        const res = await request(app)
          .patch(`/api/v1/admin/museums/${museumId}`)
          .set('Authorization', 'Bearer admin-token')
          .send({
            name: 'Updated By Admin',
            status: 'published',
            city: 'Da Nang',
          });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
          id: museumId,
          name: 'Updated By Admin',
          slug: 'original-museum',
          status: 'published',
          city: 'Da Nang',
          created_by: superAdminId,
        });
      });

      it('updates museum for super_admin', async () => {
        authAsSuperAdmin();

        const res = await request(app)
          .patch(`/api/v1/admin/museums/${museumId}`)
          .set('Authorization', 'Bearer super-token')
          .send({
            name: 'Updated By Super Admin',
            status: 'archived',
          });

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('Updated By Super Admin');
        expect(res.body.data.status).toBe('archived');
      });
    });
  });

  describe('Phase 2.5 — Admin Reads & Writes: Artifacts', () => {
    const museumId = '11111111-1111-4111-8111-111111111111';
    const otherMuseumId = '22222222-2222-4222-8222-222222222222';
    const artifactId1 = 'a1111111-1111-4111-8111-111111111111';
    const artifactId2 = 'a2222222-2222-4222-8222-222222222222';
    const artifactId3 = 'a3333333-3333-4333-8333-333333333333';
    const otherArtifactId = 'a4444444-4444-4444-8444-444444444444';

    describe('GET /api/v1/admin/museums/:museumId/artifacts', () => {
      beforeEach(() => {
        mockState.museums.push(
          fakeMuseum({ id: museumId, name: 'Museum A', slug: 'museum-a', status: 'draft', createdBy: superAdminId }),
          fakeMuseum({ id: otherMuseumId, name: 'Museum B', slug: 'museum-b', createdBy: superAdminId, createdAt: new Date('2026-01-02T10:00:00Z') }),
        );

        mockState.artifacts.push(
          fakeArtifact({ id: artifactId1, museumId, name: 'Bronze Drum', description: 'Ancient bronze drum', period: 'Dong Son', inventoryCode: 'ART-001', status: 'draft', createdBy: adminUserId }),
          fakeArtifact({ id: artifactId2, museumId, name: 'Ceramic Vase', description: 'Glazed vase', period: 'Ly Dynasty', inventoryCode: 'ART-002', createdBy: adminUserId, createdAt: new Date('2026-01-02T10:00:00Z') }),
          fakeArtifact({ id: artifactId3, museumId, name: 'Ancient Sword', description: 'Iron sword', period: 'Tran Dynasty', inventoryCode: 'ART-003', status: 'archived', createdBy: adminUserId, createdAt: new Date('2026-01-03T10:00:00Z') }),
          fakeArtifact({ id: otherArtifactId, museumId: otherMuseumId, name: 'Other Artifact', description: 'Different museum artifact', inventoryCode: 'ART-999', createdBy: superAdminId, createdAt: new Date('2026-01-04T10:00:00Z') }),
        );
      });

      it('returns 401 for anon and 403 for normal_user', async () => {
        const anonRes = await request(app).get(
          `/api/v1/admin/museums/${museumId}/artifacts`
        );
        expect(anonRes.status).toBe(401);
        expect(anonRes.body.error.code).toBe('unauthorized');

        authAsNormalUser();
        const normalRes = await request(app)
          .get(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer user-token');
        expect(normalRes.status).toBe(403);
        expect(normalRes.body.error.code).toBe('not_museum_admin');
      });

      it('returns 400 validation_error when museumId is not a valid UUID', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .get('/api/v1/admin/museums/not-a-valid-uuid/artifacts')
          .set('Authorization', 'Bearer super-token');
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 404 when museum does not exist', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .get(
            '/api/v1/admin/museums/99999999-9999-4999-8999-999999999999/artifacts'
          )
          .set('Authorization', 'Bearer super-token');
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 403 when admin_user is not assigned to the museum', async () => {
        authAsAdminUser(adminUserId, [
          { museumId: otherMuseumId, status: 'active' },
        ]);

        const res = await request(app)
          .get(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer admin-token');
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('not_museum_admin');
      });

      it('returns 403 when admin_user membership is revoked', async () => {
        authAsAdminUser(adminUserId, [
          { museumId, status: 'revoked' },
        ]);

        const res = await request(app)
          .get(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer admin-token');
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('not_museum_admin');
      });

      it('lists all artifacts including draft, published, and archived for authorized admin', async () => {
        authAsAdminUser(adminUserId, [
          { museumId, status: 'active' },
        ]);

        const res = await request(app)
          .get(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer admin-token');

        expect(res.status).toBe(200);
        expect(res.body.pagination).toEqual({
          total: 3,
          limit: 24,
          offset: 0,
        });
        expect(res.body.data).toHaveLength(3);
        const statuses = res.body.data.map((a: any) => a.status);
        expect(statuses).toContain('draft');
        expect(statuses).toContain('published');
        expect(statuses).toContain('archived');
        // Ensure other museum's artifact is not leaked
        const ids = res.body.data.map((a: any) => a.id);
        expect(ids).not.toContain(otherArtifactId);
      });

      it('respects limit and offset pagination', async () => {
        authAsAdminUser(adminUserId, [
          { museumId, status: 'active' },
        ]);

        const res = await request(app)
          .get(`/api/v1/admin/museums/${museumId}/artifacts?limit=1&offset=1`)
          .set('Authorization', 'Bearer admin-token');

        expect(res.status).toBe(200);
        expect(res.body.pagination).toEqual({
          total: 3,
          limit: 1,
          offset: 1,
        });
        expect(res.body.data).toHaveLength(1);
      });

      it('returns artifacts for super_admin without museum membership', async () => {
        authAsSuperAdmin();

        const res = await request(app)
          .get(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer super-token');

        expect(res.status).toBe(200);
        expect(res.body.pagination.total).toBe(3);
      });
    });

    describe('POST /api/v1/admin/museums/:museumId/artifacts', () => {
      beforeEach(() => {
        mockState.museums.push(
          fakeMuseum({ id: museumId, name: 'Museum A', slug: 'museum-a', status: 'draft', createdBy: superAdminId }),
          fakeMuseum({ id: otherMuseumId, name: 'Museum B', slug: 'museum-b', createdBy: superAdminId, createdAt: new Date('2026-01-02T10:00:00Z') }),
        );

        mockState.artifacts.push(
          fakeArtifact({ id: artifactId1, museumId, name: 'Existing Artifact A', inventoryCode: 'INV-100', status: 'draft', createdBy: adminUserId }),
          fakeArtifact({ id: otherArtifactId, museumId: otherMuseumId, name: 'Existing Artifact B', inventoryCode: 'INV-200', createdBy: superAdminId, createdAt: new Date('2026-01-02T10:00:00Z') }),
        );
      });

      it('returns 401 for anon and 403 for normal_user', async () => {
        const anonRes = await request(app)
          .post(`/api/v1/admin/museums/${museumId}/artifacts`)
          .send({ name: 'New Artifact' });
        expect(anonRes.status).toBe(401);
        expect(anonRes.body.error.code).toBe('unauthorized');

        authAsNormalUser();
        const normalRes = await request(app)
          .post(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer user-token')
          .send({ name: 'New Artifact' });
        expect(normalRes.status).toBe(403);
        expect(normalRes.body.error.code).toBe('not_museum_admin');
      });

      it('returns 400 validation_error when museumId is not a valid UUID', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .post('/api/v1/admin/museums/not-a-valid-uuid/artifacts')
          .set('Authorization', 'Bearer super-token')
          .send({ name: 'New Artifact' });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 404 when museum does not exist', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .post(
            '/api/v1/admin/museums/99999999-9999-4999-8999-999999999999/artifacts'
          )
          .set('Authorization', 'Bearer super-token')
          .send({ name: 'New Artifact' });
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('not_found');
      });

      it('returns 403 when admin_user does not manage the target museum', async () => {
        authAsAdminUser(adminUserId, [
          { museumId: otherMuseumId, status: 'active' },
        ]);

        const res = await request(app)
          .post(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer admin-token')
          .send({ name: 'Unauthorized Artifact' });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('not_museum_admin');
      });

      it('returns 400 validation_error on missing name', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .post(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer super-token')
          .send({ description: 'No name provided' });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 400 validation_error on invalid status enum', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .post(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer super-token')
          .send({ name: 'Artifact', status: 'invalid_status' });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 400 validation_error when body contains unknown fields', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .post(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer super-token')
          .send({
            name: 'Artifact',
            id: '88888888-8888-4888-8888-888888888888',
            created_by: 'someone',
          });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 409 duplicate_inventory_code when inventory_code already exists in the same museum', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .post(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer super-token')
          .send({
            name: 'Duplicate Inventory Artifact',
            inventory_code: 'INV-100',
          });
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('duplicate_inventory_code');
      });

      it('creates artifact with server-derived museum_id and created_by for authorized admin', async () => {
        authAsAdminUser(adminUserId, [
          { museumId, status: 'active' },
        ]);

        const res = await request(app)
          .post(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer admin-token')
          .send({
            name: 'Dong Son Bell',
            description: 'Ancient bronze bell',
            period: 'Dong Son',
            inventory_code: 'INV-NEW-01',
          });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
          museum_id: museumId,
          name: 'Dong Son Bell',
          description: 'Ancient bronze bell',
          period: 'Dong Son',
          inventory_code: 'INV-NEW-01',
          status: 'draft',
          created_by: adminUserId,
        });
      });

      it('allows creating artifact with an inventory_code that belongs to another museum', async () => {
        authAsAdminUser(adminUserId, [
          { museumId, status: 'active' },
        ]);

        // INV-200 exists in otherMuseumId, should be allowed in museumId
        const res = await request(app)
          .post(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer admin-token')
          .send({
            name: 'Cross-Museum Inventory Code Artifact',
            inventory_code: 'INV-200',
          });

        expect(res.status).toBe(201);
        expect(res.body.data.inventory_code).toBe('INV-200');
        expect(res.body.data.museum_id).toBe(museumId);
      });

      it('creates artifact for super_admin with published status', async () => {
        authAsSuperAdmin();

        const res = await request(app)
          .post(`/api/v1/admin/museums/${museumId}/artifacts`)
          .set('Authorization', 'Bearer super-token')
          .send({
            name: 'Super Artifact',
            status: 'published',
          });

        expect(res.status).toBe(201);
        expect(res.body.data.status).toBe('published');
        expect(res.body.data.created_by).toBe(superAdminId);
      });
    });

    describe('PATCH /api/v1/admin/artifacts/:id', () => {
      beforeEach(() => {
        mockState.museums.push(
          fakeMuseum({ id: museumId, name: 'Museum A', slug: 'museum-a', status: 'draft', createdBy: superAdminId }),
          fakeMuseum({ id: otherMuseumId, name: 'Museum B', slug: 'museum-b', createdBy: superAdminId, createdAt: new Date('2026-01-02T10:00:00Z') }),
        );

        mockState.artifacts.push(
          fakeArtifact({ id: artifactId1, museumId, name: 'Original Artifact 1', description: 'Original description', period: 'Period 1', inventoryCode: 'INV-A1', status: 'draft', createdBy: superAdminId }),
          fakeArtifact({ id: artifactId2, museumId, name: 'Original Artifact 2', inventoryCode: 'INV-A2', createdBy: superAdminId, createdAt: new Date('2026-01-02T10:00:00Z') }),
          fakeArtifact({ id: otherArtifactId, museumId: otherMuseumId, name: 'Other Museum Artifact', inventoryCode: 'INV-B1', createdBy: superAdminId, createdAt: new Date('2026-01-03T10:00:00Z') }),
        );
      });

      it('returns 401 for anon and 403 for normal_user', async () => {
        const anonRes = await request(app)
          .patch(`/api/v1/admin/artifacts/${artifactId1}`)
          .send({ name: 'Updated' });
        expect(anonRes.status).toBe(401);

        authAsNormalUser();
        const normalRes = await request(app)
          .patch(`/api/v1/admin/artifacts/${artifactId1}`)
          .set('Authorization', 'Bearer user-token')
          .send({ name: 'Updated' });
        expect(normalRes.status).toBe(403);
      });

      it('returns 400 validation_error when id is not a valid UUID', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .patch('/api/v1/admin/artifacts/not-a-valid-uuid')
          .set('Authorization', 'Bearer super-token')
          .send({ name: 'Updated' });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 400 validation_error when body is empty', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .patch(`/api/v1/admin/artifacts/${artifactId1}`)
          .set('Authorization', 'Bearer super-token')
          .send({});
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 400 validation_error when body contains unknown fields', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .patch(`/api/v1/admin/artifacts/${artifactId1}`)
          .set('Authorization', 'Bearer super-token')
          .send({
            museum_id: otherMuseumId,
            created_by: 'someone-else',
          });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('validation_error');
      });

      it('returns 404 when artifact does not exist', async () => {
        const nonExistentId = '99999999-9999-4999-8999-999999999999';

        authAsSuperAdmin();
        const res1 = await request(app)
          .patch(`/api/v1/admin/artifacts/${nonExistentId}`)
          .set('Authorization', 'Bearer super-token')
          .send({ name: 'Updated' });
        expect(res1.status).toBe(404);
        expect(res1.body.error.code).toBe('not_found');

        authAsAdminUser();
        const res2 = await request(app)
          .patch(`/api/v1/admin/artifacts/${nonExistentId}`)
          .set('Authorization', 'Bearer admin-token')
          .send({ name: 'Updated' });
        expect(res2.status).toBe(404);
        expect(res2.body.error.code).toBe('not_found');
      });

      it('returns 403 when admin_user does not manage the museum the artifact belongs to', async () => {
        authAsAdminUser(adminUserId, [
          { museumId: otherMuseumId, status: 'active' },
        ]);

        const res = await request(app)
          .patch(`/api/v1/admin/artifacts/${artifactId1}`)
          .set('Authorization', 'Bearer admin-token')
          .send({ name: 'Unauthorized Update' });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('not_museum_admin');
      });

      it('returns 409 duplicate_inventory_code when inventory_code conflicts with another artifact in same museum', async () => {
        authAsSuperAdmin();
        const res = await request(app)
          .patch(`/api/v1/admin/artifacts/${artifactId1}`)
          .set('Authorization', 'Bearer super-token')
          .send({ inventory_code: 'INV-A2' });

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('duplicate_inventory_code');
      });

      it('allows updating artifact with same inventory_code without conflict error', async () => {
        authAsAdminUser(adminUserId, [
          { museumId, status: 'active' },
        ]);

        const res = await request(app)
          .patch(`/api/v1/admin/artifacts/${artifactId1}`)
          .set('Authorization', 'Bearer admin-token')
          .send({ inventory_code: 'INV-A1', description: 'Updated description' });

        expect(res.status).toBe(200);
        expect(res.body.data.inventory_code).toBe('INV-A1');
        expect(res.body.data.description).toBe('Updated description');
      });

      it('updates mutable fields for authorized museum admin', async () => {
        authAsAdminUser(adminUserId, [
          { museumId, status: 'active' },
        ]);

        const res = await request(app)
          .patch(`/api/v1/admin/artifacts/${artifactId1}`)
          .set('Authorization', 'Bearer admin-token')
          .send({
            name: 'Updated Artifact Name',
            description: 'Updated artifact desc',
            period: 'Champa',
            inventory_code: 'INV-A1-NEW',
            status: 'published',
          });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
          id: artifactId1,
          museum_id: museumId,
          name: 'Updated Artifact Name',
          description: 'Updated artifact desc',
          period: 'Champa',
          inventory_code: 'INV-A1-NEW',
          status: 'published',
          created_by: superAdminId,
        });
      });

      it('allows clearing nullable fields (description, period, inventory_code) by setting them to null', async () => {
        authAsAdminUser(adminUserId, [
          { museumId, status: 'active' },
        ]);

        const res = await request(app)
          .patch(`/api/v1/admin/artifacts/${artifactId1}`)
          .set('Authorization', 'Bearer admin-token')
          .send({
            description: null,
            period: null,
            inventory_code: null,
          });

        expect(res.status).toBe(200);
        expect(res.body.data.description).toBeNull();
        expect(res.body.data.period).toBeNull();
        expect(res.body.data.inventory_code).toBeNull();
      });

      it('archives artifact via status: archived', async () => {
        authAsAdminUser(adminUserId, [
          { museumId, status: 'active' },
        ]);

        const res = await request(app)
          .patch(`/api/v1/admin/artifacts/${artifactId1}`)
          .set('Authorization', 'Bearer admin-token')
          .send({ status: 'archived' });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('archived');
      });

      it('updates artifact for super_admin', async () => {
        authAsSuperAdmin();

        const res = await request(app)
          .patch(`/api/v1/admin/artifacts/${artifactId1}`)
          .set('Authorization', 'Bearer super-token')
          .send({ name: 'Updated By Super' });

        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('Updated By Super');
      });
    });
  });

  describe('Phase 2.6 — Public & Admin: Souvenir Products', () => {
    const museumId = '11111111-1111-4111-8111-111111111111';
    const draftMuseumId = '22222222-2222-4222-8222-222222222222';
    const otherMuseumId = '33333333-3333-4333-8333-333333333333';
    const productId1 = 'ca111111-1111-4111-8111-111111111111';
    const productId2 = 'ca222222-2222-4222-8222-222222222222';
    const productInDraftId = 'ca333333-3333-4333-8333-333333333333';

    beforeEach(() => {
      mockState.museums.push(
        fakeMuseum({ id: museumId, name: 'Louvre', slug: 'louvre', status: 'published' }),
        fakeMuseum({ id: draftMuseumId, name: 'Draft Museum', slug: 'draft-museum', status: 'draft' }),
        fakeMuseum({ id: otherMuseumId, name: 'Other Museum', slug: 'other-museum', status: 'published' })
      );

      mockState.souvenirProducts.push(
        fakeProduct({
          id: productId1,
          museumId,
          name: 'Mona Lisa Magnet',
          sku: 'SKU-MAG-01',
          price: '50000.00',
          stockQuantity: 100,
          status: 'published',
        }),
        fakeProduct({
          id: productId2,
          museumId,
          name: 'Draft Postcard',
          sku: 'SKU-CARD-01',
          price: '20000.00',
          stockQuantity: 50,
          status: 'draft',
        }),
        fakeProduct({
          id: productInDraftId,
          museumId: draftMuseumId,
          name: 'Published Product in Draft Museum',
          sku: 'SKU-DRAFT-M',
          price: '30000.00',
          stockQuantity: 10,
          status: 'published',
        })
      );
    });

    describe('GET /api/v1/museums/:museumId/products', () => {
      it('returns 404 when museum does not exist or is not published', async () => {
        const notFound = await request(app).get('/api/v1/museums/99999999-9999-4999-8999-999999999999/products');
        expect(notFound.status).toBe(404);

        const draftRes = await request(app).get(`/api/v1/museums/${draftMuseumId}/products`);
        expect(draftRes.status).toBe(404);
      });

      it('returns only published products for published museum', async () => {
        const res = await request(app).get(`/api/v1/museums/${museumId}/products`);
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].id).toBe(productId1);
        expect(res.body.pagination.total).toBe(1);
      });
    });

    describe('GET /api/v1/products/:id', () => {
      it('returns 404 when product does not exist or is not published', async () => {
        const notFound = await request(app).get('/api/v1/products/99999999-9999-4999-8999-999999999999');
        expect(notFound.status).toBe(404);

        const draftProd = await request(app).get(`/api/v1/products/${productId2}`);
        expect(draftProd.status).toBe(404);
      });

      it('returns 404 when product is published but parent museum is draft', async () => {
        const res = await request(app).get(`/api/v1/products/${productInDraftId}`);
        expect(res.status).toBe(404);
      });

      it('returns 200 with product details when published and museum is published', async () => {
        const res = await request(app).get(`/api/v1/products/${productId1}`);
        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe('Mona Lisa Magnet');
        expect(res.body.data.price).toBe('50000.00');
        expect(res.body.data.stock_quantity).toBe(100);
      });
    });

    describe('Admin Products: GET, POST, PATCH', () => {
      it('GET /api/v1/admin/museums/:museumId/products returns 401 for anon and 403 for normal_user', async () => {
        const anonRes = await request(app).get(`/api/v1/admin/museums/${museumId}/products`);
        expect(anonRes.status).toBe(401);

        authAsNormalUser();
        const normalRes = await request(app)
          .get(`/api/v1/admin/museums/${museumId}/products`)
          .set('Authorization', 'Bearer normal-token');
        expect(normalRes.status).toBe(403);
      });

      it('GET /api/v1/admin/museums/:museumId/products returns all products for authorized admin', async () => {
        authAsAdminUser(adminUserId, [{ museumId, status: 'active' }]);

        const res = await request(app)
          .get(`/api/v1/admin/museums/${museumId}/products`)
          .set('Authorization', 'Bearer admin-token');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(2); // published + draft
        expect(res.body.pagination.total).toBe(2);
      });

      it('POST /api/v1/admin/museums/:museumId/products creates product for authorized admin', async () => {
        authAsAdminUser(adminUserId, [{ museumId, status: 'active' }]);

        const res = await request(app)
          .post(`/api/v1/admin/museums/${museumId}/products`)
          .set('Authorization', 'Bearer admin-token')
          .send({
            name: 'Louvre Scarf',
            description: 'Silk scarf',
            sku: 'SKU-SCARF-01',
            price: '250000.00',
            stock_quantity: 20,
            status: 'draft',
          });

        expect(res.status).toBe(201);
        expect(res.body.data.name).toBe('Louvre Scarf');
        expect(res.body.data.price).toBe('250000.00');
        expect(res.body.data.stock_quantity).toBe(20);
      });

      it('POST /api/v1/admin/museums/:museumId/products returns 409 on duplicate SKU in same museum', async () => {
        authAsAdminUser(adminUserId, [{ museumId, status: 'active' }]);

        const res = await request(app)
          .post(`/api/v1/admin/museums/${museumId}/products`)
          .set('Authorization', 'Bearer admin-token')
          .send({
            name: 'Another Magnet',
            sku: 'SKU-MAG-01', // already used in museumId
            price: '60000.00',
          });

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('duplicate_sku');
      });

      it('PATCH /api/v1/admin/products/:id updates price and restocks product', async () => {
        authAsAdminUser(adminUserId, [{ museumId, status: 'active' }]);

        const res = await request(app)
          .patch(`/api/v1/admin/products/${productId1}`)
          .set('Authorization', 'Bearer admin-token')
          .send({
            price: '55000.00',
            stock_quantity: 150,
            status: 'published',
          });

        expect(res.status).toBe(200);
        expect(res.body.data.price).toBe('55000.00');
        expect(res.body.data.stock_quantity).toBe(150);
      });

      it('PATCH /api/v1/admin/products/:id returns 409 on SKU conflict', async () => {
        authAsAdminUser(adminUserId, [{ museumId, status: 'active' }]);

        const res = await request(app)
          .patch(`/api/v1/admin/products/${productId2}`)
          .set('Authorization', 'Bearer admin-token')
          .send({
            sku: 'SKU-MAG-01', // conflict with productId1
          });

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('duplicate_sku');
      });
    });
  });

  describe('Phase 2.7 — Public & Admin: Ticket Types', () => {
    const museumId = '11111111-1111-4111-8111-111111111111';
    const draftMuseumId = '22222222-2222-4222-8222-222222222222';
    const ticketTypeId1 = 'ba111111-1111-4111-8111-111111111111';
    const ticketTypeId2 = 'ba222222-2222-4222-8222-222222222222';

    beforeEach(() => {
      mockState.museums.push(
        fakeMuseum({ id: museumId, name: 'Louvre', slug: 'louvre', status: 'published' }),
        fakeMuseum({ id: draftMuseumId, name: 'Draft Museum', slug: 'draft-museum', status: 'draft' })
      );

      mockState.ticketTypes.push(
        fakeTicketType({
          id: ticketTypeId1,
          museumId,
          name: 'Adult Standard',
          price: '200000.00',
          isAvailable: true,
        }),
        fakeTicketType({
          id: ticketTypeId2,
          museumId,
          name: 'VIP Guided Tour',
          price: '500000.00',
          isAvailable: false,
        }),
        fakeTicketType({
          id: 'ba333333-3333-4333-8333-333333333333',
          museumId: draftMuseumId,
          name: 'Draft Museum Ticket',
          price: '100000.00',
          isAvailable: true,
        })
      );
    });

    describe('GET /api/v1/museums/:museumId/ticket-types', () => {
      it('returns 404 when museum does not exist or is not published', async () => {
        const notFound = await request(app).get('/api/v1/museums/99999999-9999-4999-8999-999999999999/ticket-types');
        expect(notFound.status).toBe(404);

        const draftRes = await request(app).get(`/api/v1/museums/${draftMuseumId}/ticket-types`);
        expect(draftRes.status).toBe(404);
      });

      it('returns only available ticket types for published museum', async () => {
        const res = await request(app).get(`/api/v1/museums/${museumId}/ticket-types`);
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].id).toBe(ticketTypeId1);
        expect(res.body.data[0].is_available).toBe(true);
        expect(res.body.pagination.total).toBe(1);
      });
    });

    describe('Admin Ticket Types: GET, POST, PATCH', () => {
      it('GET /api/v1/admin/museums/:museumId/ticket-types returns 401 for anon and 403 for normal_user', async () => {
        const anonRes = await request(app).get(`/api/v1/admin/museums/${museumId}/ticket-types`);
        expect(anonRes.status).toBe(401);

        authAsNormalUser();
        const normalRes = await request(app)
          .get(`/api/v1/admin/museums/${museumId}/ticket-types`)
          .set('Authorization', 'Bearer normal-token');
        expect(normalRes.status).toBe(403);
      });

      it('GET /api/v1/admin/museums/:museumId/ticket-types returns all types including unavailable', async () => {
        authAsAdminUser(adminUserId, [{ museumId, status: 'active' }]);

        const res = await request(app)
          .get(`/api/v1/admin/museums/${museumId}/ticket-types`)
          .set('Authorization', 'Bearer admin-token');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(2); // available + unavailable
        expect(res.body.pagination.total).toBe(2);
      });

      it('POST /api/v1/admin/museums/:museumId/ticket-types creates ticket type', async () => {
        authAsAdminUser(adminUserId, [{ museumId, status: 'active' }]);

        const res = await request(app)
          .post(`/api/v1/admin/museums/${museumId}/ticket-types`)
          .set('Authorization', 'Bearer admin-token')
          .send({
            name: 'Student Ticket',
            description: 'Valid ID required',
            price: '100000.00',
            is_available: true,
          });

        expect(res.status).toBe(201);
        expect(res.body.data.name).toBe('Student Ticket');
        expect(res.body.data.price).toBe('100000.00');
        expect(res.body.data.is_available).toBe(true);
      });

      it('PATCH /api/v1/admin/ticket-types/:id updates price and availability', async () => {
        authAsAdminUser(adminUserId, [{ museumId, status: 'active' }]);

        const res = await request(app)
          .patch(`/api/v1/admin/ticket-types/${ticketTypeId2}`)
          .set('Authorization', 'Bearer admin-token')
          .send({
            price: '450000.00',
            is_available: true,
          });

        expect(res.status).toBe(200);
        expect(res.body.data.price).toBe('450000.00');
        expect(res.body.data.is_available).toBe(true);
      });
    });
  });
});



