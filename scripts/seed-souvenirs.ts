import 'dotenv/config';
import { and, eq, inArray, or } from 'drizzle-orm';
import { env } from '../src/config/env';
import { closeDb, db } from '../src/db';
import {
  cartItems,
  mediaAssets,
  museumAdmins,
  museums,
  shopOrderItems,
  souvenirProducts,
  userRoles,
  users,
} from '../src/db/schema';
import {
  buildStoragePath,
  deleteMedia,
  getSupabaseStorageClient,
  uploadMedia,
} from '../src/lib/storage';
import { uuidSchema } from '../src/lib/validation';
import { detectMimeType } from '../src/services/media';
import souvenirFixturesData from './fixtures/souvenirs.json';
import { SEED_MUSEUMS } from './seed-museums';

export interface SouvenirFixtureItem {
  sku: string;
  name: string;
  description: string;
  price: string; // Positive VND numeric(12, 2) format e.g. "250000.00"
  currency: 'VND'; // Strict VND currency compliance
  stockQuantity: number;
  imageUrl: string;
  imageMimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sourcePageUrl: string; // Authoritative provenance/file page to trace and verify asset rights
  mediaCredit: string;
  mediaRights: 'CC0' | 'Public Domain';
  rawLicense?: string;
}

export interface MuseumSouvenirsDefinition {
  museumSlug: string;
  museumName: string;
  items: SouvenirFixtureItem[];
}

export interface ResolveProductSeedOptions {
  status?: 'draft' | 'published';
  createdBy?: string | null;
}

/**
 * Builds database-ready souvenir product payload with strict VND currency and default published status.
 */
export function buildProductSeedData(
  item: SouvenirFixtureItem,
  museumId: string,
  options?: ResolveProductSeedOptions
) {
  return {
    museumId,
    name: item.name,
    description: item.description,
    sku: item.sku,
    price: item.price,
    currency: item.currency, // Strictly 'VND'
    stockQuantity: item.stockQuantity,
    status: options?.status ?? 'published', // Default to published per Issue #14
    createdBy: options?.createdBy ?? null,
  };
}

export const SOUVENIR_FIXTURES: MuseumSouvenirsDefinition[] =
  souvenirFixturesData as unknown as MuseumSouvenirsDefinition[];

export const MANAGED_SKUS: ReadonlySet<string> = new Set(
  SOUVENIR_FIXTURES.flatMap((m) => m.items.map((i) => i.sku))
);

export function getManagedSkus(): string[] {
  return Array.from(MANAGED_SKUS);
}

export interface StoragePreflightResult {
  skipped: boolean;
  bucketName: string;
  isPublic?: boolean;
}

export interface FindOrCreateMuseumOptions {
  superadminId: string;
  newMuseumStatus?: 'draft' | 'published';
}

export interface MuseumRecordInfo {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  isCreated: boolean;
}

/**
 * Validates Supabase Storage configuration environment variables.
 */
export function validateStorageConfig(): {
  supabaseUrl: string;
  supabaseSecretKey: string;
  souvenirMediaBucket: string;
} {
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new Error(
      'Missing Supabase Storage configuration. Required: SUPABASE_URL and SUPABASE_SECRET_KEY.'
    );
  }
  return {
    supabaseUrl: env.supabaseUrl,
    supabaseSecretKey: env.supabaseSecretKey,
    souvenirMediaBucket: env.souvenirMediaBucket,
  };
}

/**
 * Preflight check ensuring the souvenir-media storage bucket exists and is public.
 */
export async function checkStorageBucketPreflight(
  bucketName: string,
  storageClient?: any
): Promise<{ ok: boolean; bucketName: string; isPublic: boolean }> {
  const client = storageClient ?? getSupabaseStorageClient();
  const { data: bucket, error } = await client.storage.getBucket(bucketName);

  if (error || !bucket) {
    throw new Error(
      `Bucket "${bucketName}" does not exist on Supabase Storage (${
        error?.message || 'Not found'
      }). Please create public bucket "${bucketName}" following TODO.md (line 97) before running seed.`
    );
  }

  if (!bucket.public) {
    throw new Error(
      `Bucket "${bucketName}" exists but is not public (public: false). Please update bucket "${bucketName}" configuration to Public (public: true) so the catalog can serve public media.`
    );
  }

  return { ok: true, bucketName, isPublic: bucket.public };
}

/**
 * Runs storage preflight check unless skipMedia option is active.
 */
export async function runStoragePreflight(
  options: { skipMedia?: boolean; bucketName?: string } = {},
  storageClient?: any
): Promise<StoragePreflightResult> {
  const bucketName = options.bucketName || env.souvenirMediaBucket;
  if (options.skipMedia) {
    return { skipped: true, bucketName };
  }
  const result = await checkStorageBucketPreflight(bucketName, storageClient);
  return {
    skipped: false,
    bucketName: result.bucketName,
    isPublic: result.isPublic,
  };
}

/**
 * Finds an existing museum by slug/name preserving its existing status,
 * or creates a new museum with default status 'published' and assigns the superadmin.
 */
export async function findOrCreateMuseum(
  def: {
    museumSlug?: string;
    slug?: string;
    museumName?: string;
    name?: string;
  },
  options: FindOrCreateMuseumOptions,
  dbClient: any = db
): Promise<MuseumRecordInfo> {
  const slug = def.museumSlug || def.slug;
  const name = def.museumName || def.name;

  if (!slug || !name) {
    throw new Error('Both museum slug and name must be provided');
  }

  const [existing] = await dbClient
    .select({
      id: museums.id,
      name: museums.name,
      slug: museums.slug,
      status: museums.status,
    })
    .from(museums)
    .where(or(eq(museums.slug, slug), eq(museums.name, name)))
    .limit(1);

  if (existing) {
    // Preserve existing museum status without silently changing it.
    // Ensure superadmin has active membership (reactivate if previously revoked).
    await dbClient
      .insert(museumAdmins)
      .values({
        museumId: existing.id,
        userId: options.superadminId,
        status: 'active',
        assignedBy: options.superadminId,
      })
      .onConflictDoUpdate({
        target: [museumAdmins.museumId, museumAdmins.userId],
        set: {
          status: 'active',
          revokedAt: null,
          assignedBy: options.superadminId,
        },
      });

    return {
      id: existing.id,
      name: existing.name,
      slug: existing.slug,
      status: existing.status,
      isCreated: false,
    };
  }

  const canonical = SEED_MUSEUMS.find((m) => m.slug === slug);
  const [created] = await dbClient
    .insert(museums)
    .values({
      name: canonical?.name ?? name,
      slug,
      description: canonical?.description ?? name,
      address: canonical?.address ?? '1000 Jefferson Dr SW',
      city: canonical?.city ?? 'Washington',
      status: options.newMuseumStatus ?? 'published',
      createdBy: options.superadminId,
    })
    .returning({
      id: museums.id,
      name: museums.name,
      slug: museums.slug,
      status: museums.status,
    });

  // Assign superadmin active membership for the new museum
  await dbClient
    .insert(museumAdmins)
    .values({
      museumId: created.id,
      userId: options.superadminId,
      status: 'active',
      assignedBy: options.superadminId,
    })
    .onConflictDoUpdate({
      target: [museumAdmins.museumId, museumAdmins.userId],
      set: {
        status: 'active',
        revokedAt: null,
        assignedBy: options.superadminId,
      },
    });

  return {
    id: created.id,
    name: created.name,
    slug: created.slug,
    status: created.status,
    isCreated: true,
  };
}

/**
 * Checks if a museum's draft or archived status hides published products from the Public Catalog API (404).
 */
export function checkCatalogVisibilityWarning(
  museum: { name: string; status: 'draft' | 'published' | 'archived' },
  productStatus: 'draft' | 'published' = 'published'
): string | null {
  if (
    (museum.status === 'draft' || museum.status === 'archived') &&
    productStatus === 'published'
  ) {
    return `[Warning] Museum "${museum.name}" is in "${museum.status}" status. Per API contract, published products will be hidden from the Public Catalog API (404) until the museum is transitioned to 'published'.`;
  }
  return null;
}

export interface SafeCleanEnvironmentOptions {
  nodeEnv?: string | null;
  databaseUrl?: string | null;
}

/**
 * Validates that --clean is running in an explicit development or test environment
 * and that the database URL points to an allowed local/test host (localhost, 127.0.0.1, ::1, 0.0.0.0, *.local, *.test).
 * Fails fast to prevent accidental data deletion on remote, staging, or production databases.
 */
export function assertSafeCleanEnvironment(
  options?: SafeCleanEnvironmentOptions
): void {
  const nodeEnv =
    options && 'nodeEnv' in options ? options.nodeEnv : process.env.NODE_ENV;

  if (!nodeEnv || (nodeEnv !== 'development' && nodeEnv !== 'test')) {
    throw new Error(
      `Refusing to clean database: NODE_ENV must be explicitly set to 'development' or 'test' (received: ${JSON.stringify(
        nodeEnv
      )}).`
    );
  }

  const rawUrl =
    options && 'databaseUrl' in options
      ? options.databaseUrl
      : (process.env.DATABASE_URL || env.databaseUrl);

  if (!rawUrl || !rawUrl.trim()) {
    throw new Error(
      'Refusing to clean database: DATABASE_URL is not configured.'
    );
  }

  let hostname: string;
  try {
    const parsed = new URL(rawUrl.trim());
    hostname = parsed.hostname.toLowerCase();
  } catch {
    throw new Error(
      'Refusing to clean database: Invalid DATABASE_URL format.'
    );
  }

  const normalizedHost = hostname.replace(/^\[|\]$/g, '');
  const isLocal =
    normalizedHost === 'localhost' ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost === '::1' ||
    normalizedHost === '0.0.0.0' ||
    normalizedHost.endsWith('.local') ||
    normalizedHost.endsWith('.test');

  if (!isLocal) {
    throw new Error(
      `Refusing to clean database: DATABASE_URL host "${hostname}" is not in the local/test allowlist (localhost, 127.0.0.1, ::1, 0.0.0.0, *.local, *.test). Remote/production databases cannot be cleaned.`
    );
  }
}

export interface ForeignKeyCheckResult {
  hasReferences: boolean;
  cartCount: number;
  orderCount: number;
  referencedProductIds: string[];
}

/**
 * Pre-checks whether any target product IDs are referenced by cart_items or shop_order_items (which have onDelete: 'restrict').
 * If references are found, aborts immediately by throwing a detailed error before any partial changes can occur.
 */
export async function checkForeignKeyReferences(
  productIds: string[],
  dbClient: any = db
): Promise<ForeignKeyCheckResult> {
  if (productIds.length === 0) {
    return {
      hasReferences: false,
      cartCount: 0,
      orderCount: 0,
      referencedProductIds: [],
    };
  }

  const referencedInCarts = await dbClient
    .select({ productId: cartItems.productId })
    .from(cartItems)
    .where(inArray(cartItems.productId, productIds));

  const referencedInOrders = await dbClient
    .select({ productId: shopOrderItems.productId })
    .from(shopOrderItems)
    .where(inArray(shopOrderItems.productId, productIds));

  const uniqueReferencedIds = Array.from(
    new Set([
      ...referencedInCarts.map((r: { productId: string }) => r.productId),
      ...referencedInOrders.map((r: { productId: string }) => r.productId),
    ])
  );

  if (uniqueReferencedIds.length > 0) {
    throw new Error(
      `Cannot clean souvenirs: ${referencedInCarts.length} cart item(s) and ${referencedInOrders.length} order item(s) reference ${uniqueReferencedIds.length} managed product(s) (${uniqueReferencedIds.join(', ')}). Delete aborted to respect foreign key restrictions.`
    );
  }

  return {
    hasReferences: false,
    cartCount: referencedInCarts.length,
    orderCount: referencedInOrders.length,
    referencedProductIds: [],
  };
}

/**
 * Scoped, read-only foreign key pre-check: resolves existing target museums and verifies whether any
 * existing managed souvenir products are referenced by cart_items or shop_order_items.
 * Runs BEFORE any museum creation or admin membership writes to guarantee zero partial mutations.
 */
export async function precheckManagedSouvenirsForeignKeys(
  definitions: MuseumSouvenirsDefinition[],
  dbClient: any = db
): Promise<ForeignKeyCheckResult> {
  const targetSlugs = definitions.map((d) => d.museumSlug);
  const targetNames = definitions.map((d) => d.museumName);

  // 1. Read-only query for existing museums matching target slugs or names
  const existingMuseums = await dbClient
    .select({
      id: museums.id,
      slug: museums.slug,
      name: museums.name,
    })
    .from(museums)
    .where(
      or(
        inArray(museums.slug, targetSlugs),
        inArray(museums.name, targetNames)
      )
    );

  if (existingMuseums.length === 0) {
    return {
      hasReferences: false,
      cartCount: 0,
      orderCount: 0,
      referencedProductIds: [],
    };
  }

  // 2. Build scoped conditions matching each existing museum with its fixture SKUs
  const targetConditions = existingMuseums
    .map((museum: { id: string; slug: string; name: string }) => {
      const def = definitions.find(
        (d) => d.museumSlug === museum.slug || d.museumName === museum.name
      );
      const skus = def ? def.items.map((i) => i.sku) : [];
      return skus.length > 0
        ? and(
            eq(souvenirProducts.museumId, museum.id),
            inArray(souvenirProducts.sku, skus)
          )
        : null;
    })
    .filter((cond: any): cond is NonNullable<typeof cond> => cond !== null);

  if (targetConditions.length === 0) {
    return {
      hasReferences: false,
      cartCount: 0,
      orderCount: 0,
      referencedProductIds: [],
    };
  }

  const whereClause =
    targetConditions.length === 1
      ? targetConditions[0]
      : or(...targetConditions);

  // 3. Read-only query for existing managed products in those museums
  const existingProducts = await dbClient
    .select({ id: souvenirProducts.id })
    .from(souvenirProducts)
    .where(whereClause);

  if (existingProducts.length === 0) {
    return {
      hasReferences: false,
      cartCount: 0,
      orderCount: 0,
      referencedProductIds: [],
    };
  }

  const productIds = existingProducts.map((p: { id: string }) => p.id);

  // 4. Verify no cart_items or shop_order_items reference these products
  return checkForeignKeyReferences(productIds, dbClient);
}

export interface CleanExistingSouvenirsResult {
  deletedProductsCount: number;
  deletedMediaCount: number;
}

export interface CleanTargetMuseum {
  museumId: string;
  museumName?: string;
  managedSkus: string[];
}

export type CleanManagedSouvenirsResult = CleanExistingSouvenirsResult;

/**
 * Safely removes existing managed souvenirs across multiple museums in a single atomic transaction.
 * Scoped strictly to the target museums and their corresponding managed SKUs.
 * Pre-checks foreign keys (cart_items and shop_order_items) across all target products before touching DB.
 * Deletes DB rows in one transaction (media_assets then souvenir_products),
 * then cleans associated Supabase Storage objects best-effort after commit.
 */
export async function cleanAllManagedSouvenirs(
  targets: CleanTargetMuseum[],
  dbClient: any = db,
  deleteMediaFn: (bucket: string, path: string) => Promise<void> = deleteMedia
): Promise<CleanExistingSouvenirsResult> {
  const validTargets = targets.filter((t) => t.managedSkus.length > 0);
  if (validTargets.length === 0) {
    return { deletedProductsCount: 0, deletedMediaCount: 0 };
  }

  // 1. Construct scoped query condition matching each museum with its respective SKUs
  const targetConditions = validTargets.map((t) =>
    and(
      eq(souvenirProducts.museumId, t.museumId),
      inArray(souvenirProducts.sku, t.managedSkus)
    )
  );

  const whereClause =
    targetConditions.length === 1
      ? targetConditions[0]
      : or(...targetConditions);

  const existingProducts = await dbClient
    .select({
      id: souvenirProducts.id,
      sku: souvenirProducts.sku,
      museumId: souvenirProducts.museumId,
    })
    .from(souvenirProducts)
    .where(whereClause);

  if (existingProducts.length === 0) {
    return { deletedProductsCount: 0, deletedMediaCount: 0 };
  }

  const productIds = existingProducts.map(
    (p: { id: string; sku: string | null; museumId: string }) => p.id
  );

  // 2. Pre-check foreign key references across all target products before touching database
  await checkForeignKeyReferences(productIds, dbClient);

  // 3. Perform database deletion within a single transaction across all target museums
  let storagePathsToDelete: string[] = [];
  let deletedMediaCount = 0;
  let deletedProductsCount = 0;

  await dbClient.transaction(async (tx: any) => {
    // 3a. Retrieve storage paths of associated media assets
    const mediaRows = await tx
      .select({
        id: mediaAssets.id,
        storagePath: mediaAssets.storagePath,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.entityType, 'souvenir'),
          inArray(mediaAssets.entityId, productIds)
        )
      );

    storagePathsToDelete = mediaRows
      .map((m: { storagePath: string | null }) => m.storagePath)
      .filter((p: string | null): p is string => typeof p === 'string' && p.length > 0);

    // 3b. Delete all associated media assets
    if (mediaRows.length > 0) {
      await tx
        .delete(mediaAssets)
        .where(
          and(
            eq(mediaAssets.entityType, 'souvenir'),
            inArray(mediaAssets.entityId, productIds)
          )
        );
      deletedMediaCount = mediaRows.length;
    }

    // 3c. Delete all souvenir products
    await tx
      .delete(souvenirProducts)
      .where(inArray(souvenirProducts.id, productIds));

    deletedProductsCount = existingProducts.length;
  });

  // 4. Best-effort Supabase Storage object cleanup after successful DB transaction commit
  const bucketName = env.souvenirMediaBucket;
  for (const path of storagePathsToDelete) {
    try {
      await deleteMediaFn(bucketName, path);
    } catch (storageErr) {
      console.warn(
        `[seed:souvenirs] Warning: Failed to delete storage object "${path}" (best-effort):`,
        storageErr
      );
    }
  }

  return {
    deletedProductsCount,
    deletedMediaCount,
  };
}

/**
 * Safely removes existing managed souvenirs for a single museum.
 * Scoped strictly to managed SKUs. Delegates to cleanAllManagedSouvenirs.
 */
export async function cleanExistingManagedSouvenirs(
  museumId: string,
  managedSkus: string[],
  dbClient: any = db,
  deleteMediaFn: (bucket: string, path: string) => Promise<void> = deleteMedia
): Promise<CleanExistingSouvenirsResult> {
  return cleanAllManagedSouvenirs(
    [{ museumId, managedSkus }],
    dbClient,
    deleteMediaFn
  );
}

// ---------------------------------------------------------------------------
// Phase 4: Memory-Guarded Media Fetch, Validation, and Storage Upload
// ---------------------------------------------------------------------------

export const MAX_MEDIA_BYTES = 10 * 1024 * 1024; // 10 MB limit
export const MIN_MEDIA_BYTES = 100; // Minimum 100 bytes

export const ALLOWED_SOUVENIR_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedSouvenirImageMime =
  (typeof ALLOWED_SOUVENIR_IMAGE_MIMES)[number];

const EXTENSION_BY_MIME: Record<AllowedSouvenirImageMime, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export interface ValidatedMediaResult {
  buffer: Buffer;
  mimeType: AllowedSouvenirImageMime;
  extension: string;
  size: number;
}

/**
 * Downloads media from URL with strict memory guard (<= 10MB) and validates image MIME type via magic bytes.
 */
export async function fetchAndValidateMedia(
  url: string,
  options: {
    fetchFn?: typeof fetch;
    signal?: AbortSignal;
  } = {}
): Promise<ValidatedMediaResult> {
  const fetcher = options.fetchFn ?? fetch;

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: {
        'User-Agent':
          'SotaSouvenirSeeder/1.0 (https://github.com/zetomis-was-taken/sota-backend)',
        Accept: 'image/jpeg,image/png,image/webp,*/*',
      },
      signal: options.signal,
    });
  } catch (err: any) {
    throw new Error(
      `Failed to fetch media from "${url}": ${err?.message || 'Network error'}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch media from "${url}": HTTP ${response.status} ${response.statusText}`
    );
  }

  // 1. Upfront content-length header check
  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(contentLength) && contentLength > MAX_MEDIA_BYTES) {
      throw new Error(
        `Media size (${contentLength} bytes) exceeds maximum allowed limit of ${MAX_MEDIA_BYTES} bytes (10 MB).`
      );
    }
  }

  // 2. Stream chunk accumulation with memory guard
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_MEDIA_BYTES) {
            try {
              await reader.cancel();
            } catch {}
            throw new Error(
              `Media size exceeded maximum allowed limit of ${MAX_MEDIA_BYTES} bytes (10 MB) during download.`
            );
          }
          chunks.push(Buffer.from(value));
        }
      }
    } catch (err) {
      try {
        await reader.cancel();
      } catch {}
      throw err;
    }
  } else if (
    response.body &&
    typeof (response.body as any)[Symbol.asyncIterator] === 'function'
  ) {
    for await (const chunk of response.body as any) {
      const bufChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += bufChunk.length;
      if (totalBytes > MAX_MEDIA_BYTES) {
        throw new Error(
          `Media size exceeded maximum allowed limit of ${MAX_MEDIA_BYTES} bytes (10 MB) during download.`
        );
      }
      chunks.push(bufChunk);
    }
  } else {
    const arrayBuf = await response.arrayBuffer();
    if (arrayBuf.byteLength > MAX_MEDIA_BYTES) {
      throw new Error(
        `Media size (${arrayBuf.byteLength} bytes) exceeds maximum allowed limit of ${MAX_MEDIA_BYTES} bytes (10 MB).`
      );
    }
    chunks.push(Buffer.from(arrayBuf));
  }

  const buffer = Buffer.concat(chunks);

  // 3. Minimum buffer length check (guard against empty or truncated response)
  if (buffer.length < MIN_MEDIA_BYTES) {
    throw new Error(
      `Media size (${buffer.length} bytes) is below minimum allowed limit of ${MIN_MEDIA_BYTES} bytes.`
    );
  }

  // 4. Magic-byte MIME type inspection
  const detectedMime = detectMimeType(buffer);
  if (
    !detectedMime ||
    !ALLOWED_SOUVENIR_IMAGE_MIMES.includes(
      detectedMime as AllowedSouvenirImageMime
    )
  ) {
    throw new Error(
      `Unsupported media format for souvenir image: detected "${
        detectedMime || 'unknown'
      }". Allowed formats: image/jpeg, image/png, image/webp.`
    );
  }

  const mimeType = detectedMime as AllowedSouvenirImageMime;
  const extension = EXTENSION_BY_MIME[mimeType];

  return {
    buffer,
    mimeType,
    extension,
    size: buffer.length,
  };
}

export interface UploadAndInsertMediaParams {
  museumId: string;
  productId: string;
  imageUrl: string;
  superadminId: string;
  bucketName?: string;
}

export interface UploadAndInsertMediaDependencies {
  fetchFn?: typeof fetch;
  uploadMediaFn?: (
    bucket: string,
    storagePath: string,
    buffer: Buffer,
    mimeType: string
  ) => Promise<void>;
  deleteMediaFn?: (bucket: string, storagePath: string) => Promise<void>;
  dbClient?: any;
}

export interface UploadAndInsertMediaResult {
  created: boolean;
  storagePath: string;
  mediaId: string | null;
}

/**
 * Downloads image, uploads to Supabase Storage with canonical path, inserts media_assets row,
 * and performs best-effort cleanup of orphan storage object if DB insert fails.
 */
export async function uploadAndInsertSouvenirMedia(
  params: UploadAndInsertMediaParams,
  deps: UploadAndInsertMediaDependencies = {}
): Promise<UploadAndInsertMediaResult> {
  const bucketName =
    params.bucketName || env.souvenirMediaBucket || 'souvenir-media';
  const uploadFn = deps.uploadMediaFn ?? uploadMedia;
  const deleteFn = deps.deleteMediaFn ?? deleteMedia;
  const dbClient = deps.dbClient ?? db;

  // 1. Fetch and validate binary data
  const validated = await fetchAndValidateMedia(params.imageUrl, {
    fetchFn: deps.fetchFn,
  });

  // 2. Build unguessable canonical storage path
  const storagePath = buildStoragePath(
    params.museumId,
    'souvenir',
    params.productId,
    validated.extension
  );

  // 3. Upload to storage
  await uploadFn(bucketName, storagePath, validated.buffer, validated.mimeType);

  // 4. Insert into media_assets table
  let mediaRow: { id: string } | undefined;
  try {
    const inserted = await dbClient
      .insert(mediaAssets)
      .values({
        museumId: params.museumId,
        entityType: 'souvenir',
        entityId: params.productId,
        mediaType: 'image',
        storageBucket: bucketName,
        storagePath,
        mimeType: validated.mimeType,
        sortOrder: 0,
        isPrimary: true,
        createdBy: params.superadminId,
      })
      .onConflictDoNothing()
      .returning({ id: mediaAssets.id });

    mediaRow = inserted[0];
  } catch (dbError) {
    console.warn(
      `[seed:souvenirs] DB insert failed for product "${params.productId}". Cleaning up orphan storage object at "${storagePath}"...`
    );
    await deleteFn(bucketName, storagePath);
    throw dbError;
  }

  if (!mediaRow) {
    console.warn(
      `[seed:souvenirs] No media asset row inserted for product "${params.productId}". Cleaning up orphan storage object at "${storagePath}"...`
    );
    await deleteFn(bucketName, storagePath);
    return {
      created: false,
      storagePath,
      mediaId: null,
    };
  }

  return {
    created: true,
    storagePath,
    mediaId: mediaRow.id,
  };
}

/**
 * Checks if a primary media asset already exists for the given souvenir product.
 */
export async function getExistingPrimaryMedia(
  productId: string,
  dbClient: any = db
): Promise<{ id: string; storagePath: string } | null> {
  const [existing] = await dbClient
    .select({
      id: mediaAssets.id,
      storagePath: mediaAssets.storagePath,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.entityType, 'souvenir'),
        eq(mediaAssets.entityId, productId),
        eq(mediaAssets.isPrimary, true)
      )
    )
    .limit(1);

  return existing ?? null;
}

export interface ProcessProductMediaParams {
  museumId: string;
  productId: string;
  sku?: string;
  imageUrl: string;
  superadminId: string;
  skipMedia?: boolean;
  bucketName?: string;
}

export interface ProcessProductMediaResult {
  status: 'created' | 'skipped' | 'existing';
  storagePath?: string;
  mediaId?: string;
}

/**
 * High-level media processor: checks existing primary media, respects skipMedia,
 * or invokes uploadAndInsertSouvenirMedia.
 */
export async function processProductMedia(
  params: ProcessProductMediaParams,
  deps: UploadAndInsertMediaDependencies = {}
): Promise<ProcessProductMediaResult> {
  if (params.skipMedia) {
    return { status: 'skipped' };
  }

  const dbClient = deps.dbClient ?? db;
  const existing = await getExistingPrimaryMedia(params.productId, dbClient);
  if (existing) {
    return {
      status: 'existing',
      storagePath: existing.storagePath,
      mediaId: existing.id,
    };
  }

  try {
    const res = await uploadAndInsertSouvenirMedia(
      {
        museumId: params.museumId,
        productId: params.productId,
        imageUrl: params.imageUrl,
        superadminId: params.superadminId,
        bucketName: params.bucketName,
      },
      deps
    );

    return {
      status: res.created ? 'created' : 'skipped',
      storagePath: res.storagePath,
      mediaId: res.mediaId ?? undefined,
    };
  } catch (err: any) {
    console.error(
      `[seed:souvenirs] Media error for product "${params.productId}" (SKU: ${params.sku || 'unknown'}): ${
        err?.message || err
      }`
    );
    throw err;
  }
}

export interface UpsertProductResult {
  id: string;
  action: 'created' | 'existing';
}

/**
 * Inserts a souvenir product with superadmin createdBy, preserving existing product on conflict.
 */
export async function upsertSouvenirProduct(
  museumId: string,
  item: SouvenirFixtureItem,
  status: 'draft' | 'published',
  superadminId: string,
  dbClient: any = db
): Promise<UpsertProductResult> {
  const [inserted] = await dbClient
    .insert(souvenirProducts)
    .values({
      museumId,
      name: item.name,
      description: item.description,
      sku: item.sku,
      price: item.price,
      currency: 'VND',
      stockQuantity: item.stockQuantity,
      status,
      createdBy: superadminId,
    })
    .onConflictDoNothing()
    .returning({ id: souvenirProducts.id });

  if (inserted) {
    return { id: inserted.id, action: 'created' };
  }

  // Conflict on unique (museum_id, sku) constraint -> look up existing product
  const [existing] = await dbClient
    .select({ id: souvenirProducts.id })
    .from(souvenirProducts)
    .where(
      and(
        eq(souvenirProducts.museumId, museumId),
        eq(souvenirProducts.sku, item.sku)
      )
    )
    .limit(1);

  if (!existing) {
    throw new Error(
      `Unexpected conflict when inserting product with SKU "${item.sku}" in museum "${museumId}": no existing product found.`
    );
  }

  return { id: existing.id, action: 'existing' };
}

export interface MediaStats {
  uploadedCount: number;
  skippedCount: number;
  existingCount: number;
  errorCount: number;
}

export interface ProductsSummary {
  createdCount: number;
  existingCount: number;
  totalItems: number;
}

export interface SeedSouvenirsCliOptions {
  superadminId?: string;
  status?: 'draft' | 'published';
  clean?: boolean;
  skipMedia?: boolean;
  help?: boolean;
}

export interface SeedSouvenirsConfig {
  superadminId: string;
  status: 'draft' | 'published';
  clean: boolean;
  skipMedia: boolean;
}

export interface SeedRunDependencies {
  dbClient?: any;
  storageClient?: any;
  deleteMediaFn?: (bucket: string, path: string) => Promise<void>;
  nodeEnv?: string | null;
  databaseUrl?: string | null;
  fetchFn?: typeof fetch;
  uploadMediaFn?: (
    bucket: string,
    storagePath: string,
    buffer: Buffer,
    mimeType: string
  ) => Promise<void>;
}

export interface SeedRunResult {
  museums: MuseumRecordInfo[];
  warnings: string[];
  storagePreflight: StoragePreflightResult;
  cleanSummary?: {
    deletedProductsCount: number;
    deletedMediaCount: number;
  };
  mediaStats: MediaStats;
  mediaErrors: number;
  productsSummary: ProductsSummary;
}

/**
 * Parses command-line arguments for seed-souvenirs.
 */
export function parseCliArgs(
  args: string[] = process.argv.slice(2)
): SeedSouvenirsCliOptions {
  const options: SeedSouvenirsCliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--superadmin' || arg === '--superadmin-id' || arg === '-s') {
      options.superadminId = args[++i]?.trim();
    } else if (arg.startsWith('--superadmin=')) {
      options.superadminId = arg.slice('--superadmin='.length).trim();
    } else if (arg.startsWith('--superadmin-id=')) {
      options.superadminId = arg.slice('--superadmin-id='.length).trim();
    } else if (arg === '--status') {
      const val = args[++i]?.trim();
      if (val === 'draft' || val === 'published') {
        options.status = val;
      } else {
        throw new Error(
          `Invalid status "${val}". Allowed values: 'draft' | 'published'.`
        );
      }
    } else if (arg.startsWith('--status=')) {
      const val = arg.slice('--status='.length).trim();
      if (val === 'draft' || val === 'published') {
        options.status = val;
      } else {
        throw new Error(
          `Invalid status "${val}". Allowed values: 'draft' | 'published'.`
        );
      }
    } else if (arg === '--skip-media') {
      options.skipMedia = true;
    } else if (arg === '--clean') {
      options.clean = true;
    } else if (!arg.startsWith('-') && !options.superadminId) {
      options.superadminId = arg.trim();
    }
  }

  return options;
}

/**
 * Validates configuration before database/network operations.
 */
export function validateSeedConfig(envConfig: {
  superadminId?: string | null;
  nodeEnv?: string | null;
  databaseUrl?: string | null;
  status?: 'draft' | 'published';
  clean?: boolean;
  skipMedia?: boolean;
}): SeedSouvenirsConfig {
  const nodeEnv = envConfig.nodeEnv?.trim() || 'development';
  if (nodeEnv === 'production') {
    throw new Error('Refusing to run seed script in production environment.');
  }

  const clean = Boolean(envConfig.clean);
  if (clean) {
    assertSafeCleanEnvironment({
      nodeEnv: envConfig.nodeEnv,
      databaseUrl: envConfig.databaseUrl,
    });
  }

  const rawSuperadminId = envConfig.superadminId?.trim();
  if (!rawSuperadminId) {
    throw new Error(
      'Superadmin ID is required. Pass it via flag: --superadmin <uuid> (or -s <uuid>, or as first argument).'
    );
  }

  const parseResult = uuidSchema.safeParse(rawSuperadminId);
  if (!parseResult.success) {
    throw new Error(
      `Superadmin ID must be a valid UUID. Received: "${rawSuperadminId}"`
    );
  }

  const status = envConfig.status === 'draft' ? 'draft' : 'published';

  return {
    superadminId: rawSuperadminId,
    status,
    clean,
    skipMedia: Boolean(envConfig.skipMedia),
  };
}

/**
 * Confirms superadmin exists in users table and verifies super_admin role.
 */
export async function verifySuperadminExists(
  superadminId: string,
  dbClient: any = db
): Promise<void> {
  const [user] = await dbClient
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, superadminId))
    .limit(1);

  if (!user) {
    throw new Error(
      `Superadmin user with ID "${superadminId}" was not found in database. Please run "npm run seed:superadmins" first or provide an existing user ID.`
    );
  }

  const [role] = await dbClient
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, superadminId),
        eq(userRoles.role, 'super_admin')
      )
    )
    .limit(1);

  if (!role) {
    throw new Error(
      `User "${superadminId}" does not have the 'super_admin' role in user_roles. Please assign the role or run "npm run seed:superadmins".`
    );
  }
}

/**
 * Executes the seed souvenirs orchestration pipeline.
 */
export async function run(
  config: SeedSouvenirsConfig,
  deps: SeedRunDependencies = {}
): Promise<SeedRunResult> {
  const dbClient = deps.dbClient ?? db;

  console.log(
    `[seed:souvenirs] Starting orchestration with status="${config.status}", skipMedia=${config.skipMedia}, clean=${config.clean}...`
  );

  // If clean requested, enforce safety environment guard and run read-only foreign key pre-check
  // BEFORE any museum creation or admin membership writes to guarantee zero partial changes.
  if (config.clean) {
    assertSafeCleanEnvironment({
      nodeEnv: deps.nodeEnv,
      databaseUrl: deps.databaseUrl,
    });
    console.log(
      '[seed:souvenirs] Safe clean environment verified (local/test host and explicit dev/test NODE_ENV).'
    );

    await precheckManagedSouvenirsForeignKeys(SOUVENIR_FIXTURES, dbClient);
  }

  // 1. Storage Preflight
  const storagePreflight = await runStoragePreflight(
    { skipMedia: config.skipMedia, bucketName: env.souvenirMediaBucket },
    deps.storageClient
  );

  if (storagePreflight.skipped) {
    console.log(
      '[seed:souvenirs] Storage preflight skipped (--skip-media is active).'
    );
  } else {
    console.log(
      `[seed:souvenirs] Storage preflight verified: bucket "${storagePreflight.bucketName}" exists and is public.`
    );
  }

  // 2. Discover/Create Museums & Check Visibility
  const processedMuseums: MuseumRecordInfo[] = [];
  const warnings: string[] = [];

  for (const def of SOUVENIR_FIXTURES) {
    const museum = await findOrCreateMuseum(
      def,
      {
        superadminId: config.superadminId,
        newMuseumStatus: 'published', // Always default newly created museums to 'published' independent of product status
      },
      dbClient
    );
    processedMuseums.push(museum);

    const warning = checkCatalogVisibilityWarning(museum, config.status);
    if (warning) {
      warnings.push(warning);
      console.warn(`[seed:souvenirs] ${warning}`);
    }
  }

  console.log(
    `[seed:souvenirs] Verified ${processedMuseums.length} target Smithsonian museums.`
  );

  // 3. If clean is enabled, execute scoped cleanup across all target museums in a single atomic transaction
  let cleanSummary:
    | { deletedProductsCount: number; deletedMediaCount: number }
    | undefined;
  if (config.clean) {
    const cleanTargets: CleanTargetMuseum[] = SOUVENIR_FIXTURES.map(
      (def, idx) => ({
        museumId: processedMuseums[idx].id,
        museumName: processedMuseums[idx].name,
        managedSkus: def.items.map((i) => i.sku),
      })
    );

    const cleanResult = await cleanAllManagedSouvenirs(
      cleanTargets,
      dbClient,
      deps.deleteMediaFn ?? deleteMedia
    );

    cleanSummary = {
      deletedProductsCount: cleanResult.deletedProductsCount,
      deletedMediaCount: cleanResult.deletedMediaCount,
    };

    console.log(
      `[seed:souvenirs] Clean summary: ${cleanResult.deletedProductsCount} products and ${cleanResult.deletedMediaCount} media assets deleted across all target museums in a single transaction.`
    );
  }

  // 4. Seed products and process media across all target museums
  const mediaStats: MediaStats = {
    uploadedCount: 0,
    skippedCount: 0,
    existingCount: 0,
    errorCount: 0,
  };

  const productsSummary: ProductsSummary = {
    createdCount: 0,
    existingCount: 0,
    totalItems: 0,
  };

  for (let mIdx = 0; mIdx < SOUVENIR_FIXTURES.length; mIdx++) {
    const def = SOUVENIR_FIXTURES[mIdx];
    const museum = processedMuseums[mIdx];

    for (const item of def.items) {
      productsSummary.totalItems++;

      const productResult = await upsertSouvenirProduct(
        museum.id,
        item,
        config.status,
        config.superadminId,
        dbClient
      );

      if (productResult.action === 'created') {
        productsSummary.createdCount++;
      } else {
        productsSummary.existingCount++;
      }

      try {
        const mediaResult = await processProductMedia(
          {
            museumId: museum.id,
            productId: productResult.id,
            sku: item.sku,
            imageUrl: item.imageUrl,
            superadminId: config.superadminId,
            skipMedia: config.skipMedia,
            bucketName: env.souvenirMediaBucket,
          },
          {
            fetchFn: deps.fetchFn,
            uploadMediaFn: deps.uploadMediaFn,
            deleteMediaFn: deps.deleteMediaFn,
            dbClient,
          }
        );

        if (mediaResult.status === 'created') {
          mediaStats.uploadedCount++;
        } else if (mediaResult.status === 'existing') {
          mediaStats.existingCount++;
        } else if (mediaResult.status === 'skipped') {
          mediaStats.skippedCount++;
        }
      } catch {
        mediaStats.errorCount++;
      }
    }
  }

  console.log(
    `[seed:souvenirs] Products summary: ${productsSummary.createdCount} created, ${productsSummary.existingCount} existing out of ${productsSummary.totalItems} items across ${processedMuseums.length} museums.`
  );
  console.log(
    `[seed:souvenirs] Media summary: ${mediaStats.uploadedCount} uploaded, ${mediaStats.existingCount} existing, ${mediaStats.skippedCount} skipped, ${mediaStats.errorCount} error(s).`
  );

  return {
    museums: processedMuseums,
    warnings,
    storagePreflight,
    cleanSummary,
    mediaStats,
    mediaErrors: mediaStats.errorCount,
    productsSummary,
  };
}

/**
 * Formats and prints an execution summary table and details to standard output.
 */
export function printSeedSummary(result: SeedRunResult): void {
  console.log('\n=====================================================');
  console.log('       SOUVENIR & MEDIA SEED EXECUTION SUMMARY       ');
  console.log('=====================================================');
  console.log(`Museums Processed (${result.museums?.length ?? 0}):`);
  for (const m of result.museums ?? []) {
    console.log(
      `  - [${m.status?.toUpperCase() ?? 'UNKNOWN'}] ${m.name} (${m.slug})`
    );
  }

  if (result.cleanSummary) {
    console.log('\nClean Summary:');
    console.log(
      `  - Products deleted: ${result.cleanSummary.deletedProductsCount}`
    );
    console.log(
      `  - Media deleted:    ${result.cleanSummary.deletedMediaCount}`
    );
  }

  if (result.productsSummary) {
    console.log('\nProducts Summary:');
    console.log(`  - Created (new):    ${result.productsSummary.createdCount}`);
    console.log(`  - Existing (kept):  ${result.productsSummary.existingCount}`);
    console.log(`  - Total processed:  ${result.productsSummary.totalItems}`);
  }

  if (result.mediaStats) {
    console.log('\nMedia Assets Summary:');
    console.log(`  - Uploaded:         ${result.mediaStats.uploadedCount}`);
    console.log(`  - Existing (kept):  ${result.mediaStats.existingCount}`);
    console.log(`  - Skipped:          ${result.mediaStats.skippedCount}`);
    console.log(`  - Errors:           ${result.mediaStats.errorCount}`);
  }

  if (result.warnings && result.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of result.warnings) {
      console.log(`  - ${w}`);
    }
  }
  console.log('=====================================================\n');
}

export interface MainDependencies {
  runFn?: typeof run;
  verifySuperadminFn?: typeof verifySuperadminExists;
  closeDbFn?: typeof closeDb;
}

export async function main(
  args: string[] = process.argv.slice(2),
  deps: MainDependencies = {}
): Promise<SeedRunResult> {
  const verifyFn = deps.verifySuperadminFn ?? verifySuperadminExists;
  const runFn = deps.runFn ?? run;
  const closeFn = deps.closeDbFn ?? closeDb;

  try {
    const rawOptions = parseCliArgs(args);
    if (rawOptions.help) {
      console.log(`
SOTA Museum Management - Souvenir Products & Media Seeder

Usage:
  npm run seed:souvenirs -- [options]

Options:
  -s, --superadmin, --superadmin-id <uuid>  ID of existing superadmin user (or pass SUPERADMIN_ID env)
  --status <draft|published>               Product status (default: 'published')
  --skip-media                             Skip media bucket preflight and media uploads
  --clean                                  Clean existing managed souvenir products and media first
  -h, --help                               Show this help message
`);
      return undefined as any;
    }
    const config = validateSeedConfig({
      superadminId: rawOptions.superadminId || process.env.SUPERADMIN_ID,
      status: rawOptions.status,
      clean: rawOptions.clean,
      skipMedia: rawOptions.skipMedia,
      nodeEnv: process.env.NODE_ENV,
      databaseUrl: process.env.DATABASE_URL || env.databaseUrl,
    });

    await verifyFn(config.superadminId);
    const result = await runFn(config, {
      nodeEnv: process.env.NODE_ENV,
      databaseUrl: process.env.DATABASE_URL || env.databaseUrl,
    });

    printSeedSummary(result);

    if (result.mediaErrors > 0) {
      console.error(
        `[seed:souvenirs] Seeding finished with ${result.mediaErrors} media error(s). Setting exit code 1.`
      );
      process.exitCode = 1;
    }

    return result;
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    console.error(`[seed:souvenirs] Fatal seed error: ${rawMsg}`);
    process.exitCode = 1;
    throw error;
  } finally {
    await closeFn();
  }
}

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  main().catch(() => {
    process.exit(1);
  });
}
