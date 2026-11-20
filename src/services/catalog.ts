import { and, asc, count, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { artifacts, museums, souvenirProducts, ticketTypes } from '../db/schema';
import { NotFoundError } from '../lib/errors';

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
