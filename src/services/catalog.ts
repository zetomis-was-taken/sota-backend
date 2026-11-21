import { and, asc, count, desc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db';
import {
  artifacts,
  mediaAssets,
  museums,
  souvenirProducts,
  ticketTypes,
} from '../db/schema';
import {
  canManageMuseum,
  getManagedMuseumIds,
  getUserRoles,
} from '../lib/auth';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors';
import type {
  CreateArtifactBody,
  CreateMuseumBody,
  CreateProductBody,
  CreateTicketTypeBody,
  PatchArtifactBody,
  PatchMuseumBody,
  PatchProductBody,
  PatchTicketTypeBody,
} from '../lib/validation';

export interface PublicMuseumItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  city: string | null;
  cover_image_path: string | null;
  status: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublicArtifactItem {
  id: string;
  museum_id: string;
  name: string;
  description: string | null;
  period: string | null;
  inventory_code: string | null;
  status: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublicSouvenirProductItem {
  id: string;
  museum_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  price: string;
  currency: string;
  stock_quantity: number;
  status: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PublicTicketTypeItem {
  id: string;
  museum_id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  is_available: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PublicMuseumDetail extends PublicMuseumItem {
  artifacts: PublicArtifactItem[];
  souvenir_products: PublicSouvenirProductItem[];
  ticket_types: PublicTicketTypeItem[];
}

export interface ListPublicMuseumsResult {
  museums: PublicMuseumItem[];
  total: number;
}

export interface ListPublicArtifactsResult {
  artifacts: PublicArtifactItem[];
  total: number;
}

export interface ListPublicProductsResult {
  products: PublicSouvenirProductItem[];
  total: number;
}

export interface ListPublicTicketTypesResult {
  ticket_types: PublicTicketTypeItem[];
  total: number;
}

export interface PublicMediaItem {
  id: string;
  museum_id: string;
  entity_type: 'artifact' | 'souvenir';
  entity_id: string;
  media_type: 'image' | 'video';
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  sort_order: number;
  is_primary: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ListPublicMediaResult {
  media: PublicMediaItem[];
  total: number;
}

export interface ListAdminMuseumsResult {
  museums: PublicMuseumItem[];
  total: number;
}

const publicMuseumFields = {
  id: museums.id,
  name: museums.name,
  slug: museums.slug,
  description: museums.description,
  address: museums.address,
  city: museums.city,
  cover_image_path: museums.coverImagePath,
  status: museums.status,
  created_by: museums.createdBy,
  created_at: museums.createdAt,
  updated_at: museums.updatedAt,
};

const publicArtifactFields = {
  id: artifacts.id,
  museum_id: artifacts.museumId,
  name: artifacts.name,
  description: artifacts.description,
  period: artifacts.period,
  inventory_code: artifacts.inventoryCode,
  status: artifacts.status,
  created_by: artifacts.createdBy,
  created_at: artifacts.createdAt,
  updated_at: artifacts.updatedAt,
};

const publicSouvenirProductFields = {
  id: souvenirProducts.id,
  museum_id: souvenirProducts.museumId,
  name: souvenirProducts.name,
  description: souvenirProducts.description,
  sku: souvenirProducts.sku,
  price: souvenirProducts.price,
  currency: souvenirProducts.currency,
  stock_quantity: souvenirProducts.stockQuantity,
  status: souvenirProducts.status,
  created_by: souvenirProducts.createdBy,
  created_at: souvenirProducts.createdAt,
  updated_at: souvenirProducts.updatedAt,
};

const publicTicketTypeFields = {
  id: ticketTypes.id,
  museum_id: ticketTypes.museumId,
  name: ticketTypes.name,
  description: ticketTypes.description,
  price: ticketTypes.price,
  currency: ticketTypes.currency,
  is_available: ticketTypes.isAvailable,
  created_at: ticketTypes.createdAt,
  updated_at: ticketTypes.updatedAt,
};

const publicMediaFields = {
  id: mediaAssets.id,
  museum_id: mediaAssets.museumId,
  entity_type: mediaAssets.entityType,
  entity_id: mediaAssets.entityId,
  media_type: mediaAssets.mediaType,
  storage_bucket: mediaAssets.storageBucket,
  storage_path: mediaAssets.storagePath,
  mime_type: mediaAssets.mimeType,
  sort_order: mediaAssets.sortOrder,
  is_primary: mediaAssets.isPrimary,
  created_by: mediaAssets.createdBy,
  created_at: mediaAssets.createdAt,
  updated_at: mediaAssets.updatedAt,
};

/** Lists published museums with limit and offset. */
export async function listPublicMuseums(
  limit: number,
  offset: number
): Promise<ListPublicMuseumsResult> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(museums)
    .where(eq(museums.status, 'published'));

  const museumRows = await db
    .select(publicMuseumFields)
    .from(museums)
    .where(eq(museums.status, 'published'))
    .orderBy(desc(museums.createdAt), asc(museums.id))
    .limit(limit)
    .offset(offset);

  return {
    museums: museumRows,
    total: Number(total),
  };
}

/** Fetches a published museum by slug with its published artifacts, published souvenir products, and available ticket types. */
export async function getPublicMuseumBySlug(
  slug: string
): Promise<PublicMuseumDetail> {
  const [museum] = await db
    .select(publicMuseumFields)
    .from(museums)
    .where(and(eq(museums.slug, slug), eq(museums.status, 'published')));

  if (!museum) {
    throw new NotFoundError('Museum not found');
  }

  const [artifactRows, productRows, ticketTypeRows] = await Promise.all([
    db
      .select(publicArtifactFields)
      .from(artifacts)
      .where(
        and(eq(artifacts.museumId, museum.id), eq(artifacts.status, 'published'))
      )
      .orderBy(desc(artifacts.createdAt), asc(artifacts.id)),
    db
      .select(publicSouvenirProductFields)
      .from(souvenirProducts)
      .where(
        and(
          eq(souvenirProducts.museumId, museum.id),
          eq(souvenirProducts.status, 'published')
        )
      )
      .orderBy(desc(souvenirProducts.createdAt), asc(souvenirProducts.id)),
    db
      .select(publicTicketTypeFields)
      .from(ticketTypes)
      .where(
        and(
          eq(ticketTypes.museumId, museum.id),
          eq(ticketTypes.isAvailable, true)
        )
      )
      .orderBy(desc(ticketTypes.createdAt), asc(ticketTypes.id)),
  ]);

  return {
    ...museum,
    artifacts: artifactRows,
    souvenir_products: productRows,
    ticket_types: ticketTypeRows,
  };
}

/** Lists published artifacts of a published museum with limit and offset. */
export async function listPublicMuseumArtifacts(
  museumId: string,
  limit: number,
  offset: number
): Promise<ListPublicArtifactsResult> {
  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(and(eq(museums.id, museumId), eq(museums.status, 'published')));

  if (!museum) {
    throw new NotFoundError('Museum not found');
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(artifacts)
    .where(
      and(
        eq(artifacts.museumId, museumId),
        eq(artifacts.status, 'published')
      )
    );

  const artifactRows = await db
    .select(publicArtifactFields)
    .from(artifacts)
    .where(
      and(
        eq(artifacts.museumId, museumId),
        eq(artifacts.status, 'published')
      )
    )
    .orderBy(desc(artifacts.createdAt), asc(artifacts.id))
    .limit(limit)
    .offset(offset);

  return {
    artifacts: artifactRows,
    total: Number(total),
  };
}

/** Fetches a published artifact by id. Throws 404 if the artifact or its parent museum is not published. */
export async function getPublicArtifactById(
  id: string
): Promise<PublicArtifactItem> {
  const [artifact] = await db
    .select(publicArtifactFields)
    .from(artifacts)
    .where(and(eq(artifacts.id, id), eq(artifacts.status, 'published')));

  if (!artifact) {
    throw new NotFoundError('Artifact not found');
  }

  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(
      and(
        eq(museums.id, artifact.museum_id),
        eq(museums.status, 'published')
      )
    );

  if (!museum) {
    throw new NotFoundError('Artifact not found');
  }

  return artifact;
}

/** Lists published media assets for a published artifact or souvenir product. */
export async function listPublicMedia(
  entityType: 'artifact' | 'souvenir',
  entityId: string,
  limit: number,
  offset: number
): Promise<ListPublicMediaResult> {
  let museumId: string;

  if (entityType === 'artifact') {
    const [artifact] = await db
      .select({ museumId: artifacts.museumId })
      .from(artifacts)
      .where(and(eq(artifacts.id, entityId), eq(artifacts.status, 'published')));

    if (!artifact) {
      throw new NotFoundError('Entity not found');
    }
    museumId = artifact.museumId;
  } else {
    const [product] = await db
      .select({ museumId: souvenirProducts.museumId })
      .from(souvenirProducts)
      .where(and(eq(souvenirProducts.id, entityId), eq(souvenirProducts.status, 'published')));

    if (!product) {
      throw new NotFoundError('Entity not found');
    }
    museumId = product.museumId;
  }

  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(and(eq(museums.id, museumId), eq(museums.status, 'published')));

  if (!museum) {
    throw new NotFoundError('Entity not found');
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.museumId, museumId),
        eq(mediaAssets.entityType, entityType),
        eq(mediaAssets.entityId, entityId)
      )
    );

  const mediaRows = await db
    .select(publicMediaFields)
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.museumId, museumId),
        eq(mediaAssets.entityType, entityType),
        eq(mediaAssets.entityId, entityId)
      )
    )
    .orderBy(asc(mediaAssets.sortOrder), asc(mediaAssets.id))
    .limit(limit)
    .offset(offset);

  return {
    media: mediaRows,
    total: Number(total),
  };
}

/** Lists museums managed by the caller, or all museums if super_admin. */
export async function listAdminMuseums(
  userId: string,
  limit: number,
  offset: number
): Promise<ListAdminMuseumsResult> {
  const roles = await getUserRoles(userId);

  if (!roles.includes('super_admin') && !roles.includes('admin_user')) {
    throw new ForbiddenError('Admin access required');
  }

  if (roles.includes('super_admin')) {
    const [{ total }] = await db
      .select({ total: count() })
      .from(museums);

    const rows = await db
      .select(publicMuseumFields)
      .from(museums)
      .orderBy(desc(museums.createdAt), asc(museums.id))
      .limit(limit)
      .offset(offset);

    return {
      museums: rows,
      total: Number(total),
    };
  }

  const managedIds = await getManagedMuseumIds(userId);
  if (managedIds.length === 0) {
    return {
      museums: [],
      total: 0,
    };
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(museums)
    .where(inArray(museums.id, managedIds));

  const rows = await db
    .select(publicMuseumFields)
    .from(museums)
    .where(inArray(museums.id, managedIds))
    .orderBy(desc(museums.createdAt), asc(museums.id))
    .limit(limit)
    .offset(offset);

  return {
    museums: rows,
    total: Number(total),
  };
}

/** Creates a museum. Caller must be super_admin. */
export async function createAdminMuseum(
  userId: string,
  data: CreateMuseumBody
): Promise<PublicMuseumItem> {
  const [existing] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(eq(museums.slug, data.slug))
    .limit(1);

  if (existing) {
    throw new ConflictError('Museum slug already exists', 'duplicate_slug');
  }

  const [created] = await db
    .insert(museums)
    .values({
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      address: data.address ?? null,
      city: data.city ?? null,
      coverImagePath: data.cover_image_path ?? null,
      status: data.status ?? 'draft',
      createdBy: userId,
    })
    .returning(publicMuseumFields);

  return created;
}

/** Updates a museum. Caller must be super_admin or active museum admin. */
export async function updateAdminMuseum(
  userId: string,
  museumId: string,
  data: PatchMuseumBody
): Promise<PublicMuseumItem> {
  const [existing] = await db
    .select(publicMuseumFields)
    .from(museums)
    .where(eq(museums.id, museumId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError('Museum not found');
  }

  const allowed = await canManageMuseum(userId, museumId);
  if (!allowed) {
    throw new ForbiddenError('Museum admin access required', 'not_museum_admin');
  }

  if (data.slug !== undefined && data.slug !== existing.slug) {
    const [duplicate] = await db
      .select({ id: museums.id })
      .from(museums)
      .where(and(eq(museums.slug, data.slug), ne(museums.id, museumId)))
      .limit(1);

    if (duplicate) {
      throw new ConflictError('Museum slug already exists', 'duplicate_slug');
    }
  }

  const updateValues: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updateValues.name = data.name;
  if (data.slug !== undefined) updateValues.slug = data.slug;
  if (data.description !== undefined) updateValues.description = data.description;
  if (data.address !== undefined) updateValues.address = data.address;
  if (data.city !== undefined) updateValues.city = data.city;
  if (data.cover_image_path !== undefined) updateValues.coverImagePath = data.cover_image_path;
  if (data.status !== undefined) updateValues.status = data.status;

  const [updated] = await db
    .update(museums)
    .set(updateValues)
    .where(eq(museums.id, museumId))
    .returning(publicMuseumFields);

  return updated;
}

/** Lists all artifacts of a museum regardless of status for an authorized admin. */
export async function listAdminMuseumArtifacts(
  userId: string,
  museumId: string,
  limit: number,
  offset: number
): Promise<ListPublicArtifactsResult> {
  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(eq(museums.id, museumId))
    .limit(1);

  if (!museum) {
    throw new NotFoundError('Museum not found');
  }

  const allowed = await canManageMuseum(userId, museumId);
  if (!allowed) {
    throw new ForbiddenError('Museum admin access required', 'not_museum_admin');
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(artifacts)
    .where(eq(artifacts.museumId, museumId));

  const rows = await db
    .select(publicArtifactFields)
    .from(artifacts)
    .where(eq(artifacts.museumId, museumId))
    .orderBy(desc(artifacts.createdAt), asc(artifacts.id))
    .limit(limit)
    .offset(offset);

  return {
    artifacts: rows,
    total: Number(total),
  };
}

/** Creates an artifact in a museum. Caller must manage the museum. */
export async function createAdminMuseumArtifact(
  userId: string,
  museumId: string,
  data: CreateArtifactBody
): Promise<PublicArtifactItem> {
  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(eq(museums.id, museumId))
    .limit(1);

  if (!museum) {
    throw new NotFoundError('Museum not found');
  }

  const allowed = await canManageMuseum(userId, museumId);
  if (!allowed) {
    throw new ForbiddenError('Museum admin access required', 'not_museum_admin');
  }

  if (data.inventory_code) {
    const [existing] = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.museumId, museumId),
          eq(artifacts.inventoryCode, data.inventory_code)
        )
      )
      .limit(1);

    if (existing) {
      throw new ConflictError(
        'Inventory code already exists for this museum',
        'duplicate_inventory_code'
      );
    }
  }

  const [created] = await db
    .insert(artifacts)
    .values({
      museumId,
      name: data.name,
      description: data.description ?? null,
      period: data.period ?? null,
      inventoryCode: data.inventory_code ?? null,
      status: data.status ?? 'draft',
      createdBy: userId,
    })
    .returning(publicArtifactFields);

  return created;
}

/** Updates an artifact. First queries artifact to get museum_id, then checks permissions. */
export async function updateAdminArtifact(
  userId: string,
  artifactId: string,
  data: PatchArtifactBody
): Promise<PublicArtifactItem> {
  const [artifact] = await db
    .select(publicArtifactFields)
    .from(artifacts)
    .where(eq(artifacts.id, artifactId))
    .limit(1);

  if (!artifact) {
    throw new NotFoundError('Artifact not found');
  }

  const allowed = await canManageMuseum(userId, artifact.museum_id);
  if (!allowed) {
    throw new ForbiddenError('Museum admin access required', 'not_museum_admin');
  }

  if (
    data.inventory_code !== undefined &&
    data.inventory_code !== null &&
    data.inventory_code !== artifact.inventory_code
  ) {
    const [conflict] = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.museumId, artifact.museum_id),
          eq(artifacts.inventoryCode, data.inventory_code),
          ne(artifacts.id, artifactId)
        )
      )
      .limit(1);

    if (conflict) {
      throw new ConflictError(
        'Inventory code already exists for this museum',
        'duplicate_inventory_code'
      );
    }
  }

  const updateValues: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updateValues.name = data.name;
  if (data.description !== undefined) updateValues.description = data.description;
  if (data.period !== undefined) updateValues.period = data.period;
  if (data.inventory_code !== undefined) updateValues.inventoryCode = data.inventory_code;
  if (data.status !== undefined) updateValues.status = data.status;

  const [updated] = await db
    .update(artifacts)
    .set(updateValues)
    .where(eq(artifacts.id, artifactId))
    .returning(publicArtifactFields);

  return updated;
}

/** Lists published souvenir products of a published museum. */
export async function listPublicMuseumProducts(
  museumId: string,
  limit: number,
  offset: number
): Promise<ListPublicProductsResult> {
  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(and(eq(museums.id, museumId), eq(museums.status, 'published')))
    .limit(1);

  if (!museum) {
    throw new NotFoundError('Museum not found');
  }

  const whereCondition = and(
    eq(souvenirProducts.museumId, museumId),
    eq(souvenirProducts.status, 'published')
  );

  const [{ total }] = await db
    .select({ total: count() })
    .from(souvenirProducts)
    .where(whereCondition);

  const rows = await db
    .select(publicSouvenirProductFields)
    .from(souvenirProducts)
    .where(whereCondition)
    .orderBy(desc(souvenirProducts.createdAt), asc(souvenirProducts.id))
    .limit(limit)
    .offset(offset);

  return {
    products: rows,
    total: Number(total),
  };
}

/** Gets a published souvenir product by ID. Also requires parent museum to be published. */
export async function getPublicProductById(
  productId: string
): Promise<PublicSouvenirProductItem> {
  const [product] = await db
    .select(publicSouvenirProductFields)
    .from(souvenirProducts)
    .where(eq(souvenirProducts.id, productId))
    .limit(1);

  if (!product || product.status !== 'published') {
    throw new NotFoundError('Product not found');
  }

  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(and(eq(museums.id, product.museum_id), eq(museums.status, 'published')))
    .limit(1);

  if (!museum) {
    throw new NotFoundError('Product not found');
  }

  return product;
}

/** Lists available ticket types of a published museum. */
export async function listPublicMuseumTicketTypes(
  museumId: string,
  limit: number,
  offset: number
): Promise<ListPublicTicketTypesResult> {
  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(and(eq(museums.id, museumId), eq(museums.status, 'published')))
    .limit(1);

  if (!museum) {
    throw new NotFoundError('Museum not found');
  }

  const whereCondition = and(
    eq(ticketTypes.museumId, museumId),
    eq(ticketTypes.isAvailable, true)
  );

  const [{ total }] = await db
    .select({ total: count() })
    .from(ticketTypes)
    .where(whereCondition);

  const rows = await db
    .select(publicTicketTypeFields)
    .from(ticketTypes)
    .where(whereCondition)
    .orderBy(desc(ticketTypes.createdAt), asc(ticketTypes.id))
    .limit(limit)
    .offset(offset);

  return {
    ticket_types: rows,
    total: Number(total),
  };
}

/** Lists all souvenir products of a museum regardless of status for an authorized admin. */
export async function listAdminMuseumProducts(
  userId: string,
  museumId: string,
  limit: number,
  offset: number
): Promise<ListPublicProductsResult> {
  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(eq(museums.id, museumId))
    .limit(1);

  if (!museum) {
    throw new NotFoundError('Museum not found');
  }

  const allowed = await canManageMuseum(userId, museumId);
  if (!allowed) {
    throw new ForbiddenError('Museum admin access required', 'not_museum_admin');
  }

  const whereCondition = eq(souvenirProducts.museumId, museumId);

  const [{ total }] = await db
    .select({ total: count() })
    .from(souvenirProducts)
    .where(whereCondition);

  const rows = await db
    .select(publicSouvenirProductFields)
    .from(souvenirProducts)
    .where(whereCondition)
    .orderBy(desc(souvenirProducts.createdAt), asc(souvenirProducts.id))
    .limit(limit)
    .offset(offset);

  return {
    products: rows,
    total: Number(total),
  };
}

/** Creates a souvenir product in a museum. Caller must manage the museum. */
export async function createAdminMuseumProduct(
  userId: string,
  museumId: string,
  data: CreateProductBody
): Promise<PublicSouvenirProductItem> {
  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(eq(museums.id, museumId))
    .limit(1);

  if (!museum) {
    throw new NotFoundError('Museum not found');
  }

  const allowed = await canManageMuseum(userId, museumId);
  if (!allowed) {
    throw new ForbiddenError('Museum admin access required', 'not_museum_admin');
  }

  if (data.sku) {
    const [existing] = await db
      .select({ id: souvenirProducts.id })
      .from(souvenirProducts)
      .where(
        and(
          eq(souvenirProducts.museumId, museumId),
          eq(souvenirProducts.sku, data.sku)
        )
      )
      .limit(1);

    if (existing) {
      throw new ConflictError(
        'SKU already exists for this museum',
        'duplicate_sku'
      );
    }
  }

  const [created] = await db
    .insert(souvenirProducts)
    .values({
      museumId,
      name: data.name,
      description: data.description ?? null,
      sku: data.sku ?? null,
      price: data.price,
      currency: 'VND',
      stockQuantity: data.stock_quantity ?? 0,
      status: data.status ?? 'draft',
      createdBy: userId,
    })
    .returning(publicSouvenirProductFields);

  return created;
}

/** Updates a souvenir product. First queries product to get museum_id, then checks permissions. */
export async function updateAdminProduct(
  userId: string,
  productId: string,
  data: PatchProductBody
): Promise<PublicSouvenirProductItem> {
  const [product] = await db
    .select(publicSouvenirProductFields)
    .from(souvenirProducts)
    .where(eq(souvenirProducts.id, productId))
    .limit(1);

  if (!product) {
    throw new NotFoundError('Product not found');
  }

  const allowed = await canManageMuseum(userId, product.museum_id);
  if (!allowed) {
    throw new ForbiddenError('Museum admin access required', 'not_museum_admin');
  }

  if (
    data.sku !== undefined &&
    data.sku !== null &&
    data.sku !== product.sku
  ) {
    const [conflict] = await db
      .select({ id: souvenirProducts.id })
      .from(souvenirProducts)
      .where(
        and(
          eq(souvenirProducts.museumId, product.museum_id),
          eq(souvenirProducts.sku, data.sku),
          ne(souvenirProducts.id, productId)
        )
      )
      .limit(1);

    if (conflict) {
      throw new ConflictError(
        'SKU already exists for this museum',
        'duplicate_sku'
      );
    }
  }

  const updateValues: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updateValues.name = data.name;
  if (data.description !== undefined) updateValues.description = data.description;
  if (data.sku !== undefined) updateValues.sku = data.sku;
  if (data.price !== undefined) updateValues.price = data.price;
  if (data.stock_quantity !== undefined) updateValues.stockQuantity = data.stock_quantity;
  if (data.status !== undefined) updateValues.status = data.status;

  const [updated] = await db
    .update(souvenirProducts)
    .set(updateValues)
    .where(eq(souvenirProducts.id, productId))
    .returning(publicSouvenirProductFields);

  return updated;
}

/** Lists all ticket types of a museum regardless of availability for an authorized admin. */
export async function listAdminMuseumTicketTypes(
  userId: string,
  museumId: string,
  limit: number,
  offset: number
): Promise<ListPublicTicketTypesResult> {
  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(eq(museums.id, museumId))
    .limit(1);

  if (!museum) {
    throw new NotFoundError('Museum not found');
  }

  const allowed = await canManageMuseum(userId, museumId);
  if (!allowed) {
    throw new ForbiddenError('Museum admin access required', 'not_museum_admin');
  }

  const whereCondition = eq(ticketTypes.museumId, museumId);

  const [{ total }] = await db
    .select({ total: count() })
    .from(ticketTypes)
    .where(whereCondition);

  const rows = await db
    .select(publicTicketTypeFields)
    .from(ticketTypes)
    .where(whereCondition)
    .orderBy(desc(ticketTypes.createdAt), asc(ticketTypes.id))
    .limit(limit)
    .offset(offset);

  return {
    ticket_types: rows,
    total: Number(total),
  };
}

/** Creates a ticket type in a museum. Caller must manage the museum. */
export async function createAdminMuseumTicketType(
  userId: string,
  museumId: string,
  data: CreateTicketTypeBody
): Promise<PublicTicketTypeItem> {
  const [museum] = await db
    .select({ id: museums.id })
    .from(museums)
    .where(eq(museums.id, museumId))
    .limit(1);

  if (!museum) {
    throw new NotFoundError('Museum not found');
  }

  const allowed = await canManageMuseum(userId, museumId);
  if (!allowed) {
    throw new ForbiddenError('Museum admin access required', 'not_museum_admin');
  }

  const [created] = await db
    .insert(ticketTypes)
    .values({
      museumId,
      name: data.name,
      description: data.description ?? null,
      price: data.price,
      currency: 'VND',
      isAvailable: data.is_available ?? true,
    })
    .returning(publicTicketTypeFields);

  return created;
}

/** Updates a ticket type. First queries ticket type to get museum_id, then checks permissions. */
export async function updateAdminTicketType(
  userId: string,
  ticketTypeId: string,
  data: PatchTicketTypeBody
): Promise<PublicTicketTypeItem> {
  const [type] = await db
    .select(publicTicketTypeFields)
    .from(ticketTypes)
    .where(eq(ticketTypes.id, ticketTypeId))
    .limit(1);

  if (!type) {
    throw new NotFoundError('Ticket type not found');
  }

  const allowed = await canManageMuseum(userId, type.museum_id);
  if (!allowed) {
    throw new ForbiddenError('Museum admin access required', 'not_museum_admin');
  }

  const updateValues: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updateValues.name = data.name;
  if (data.description !== undefined) updateValues.description = data.description;
  if (data.price !== undefined) updateValues.price = data.price;
  if (data.is_available !== undefined) updateValues.isAvailable = data.is_available;

  const [updated] = await db
    .update(ticketTypes)
    .set(updateValues)
    .where(eq(ticketTypes.id, ticketTypeId))
    .returning(publicTicketTypeFields);

  return updated;
}




