import 'dotenv/config';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { closeDb, db } from '../src/db';
import {
  artifacts,
  mediaAssets,
  museumAdmins,
  museums,
  userRoles,
  users,
} from '../src/db/schema';
import { buildStoragePath, uploadMedia } from '../src/lib/storage';
import { uuidSchema } from '../src/lib/validation';
import {
  ALLOWED_MIME_TYPES,
  detectMimeType,
  MIME_EXTENSIONS,
  type AllowedMimeType,
} from '../src/services/media';
import {
  fetchEligibleRecords,
  maskApiKeyInUrl,
  type ValidatedSmithsonianArtifact,
} from './seed-smithsonian';

export interface SeedMuseumDefinition {
  name: string;
  slug: string;
  description: string;
  address: string;
  city: string;
  smithsonianQuery: string;
}

export const SEED_MUSEUMS: SeedMuseumDefinition[] = [
  {
    name: 'National Museum of Natural History',
    slug: 'national-museum-of-natural-history',
    description:
      'The National Museum of Natural History inspires curiosity, discovery, and learning about the natural world through its unparalleled research, collections, exhibitions, and educational outreach programs.',
    address: '10th St. & Constitution Ave. NW',
    city: 'Washington, D.C.',
    smithsonianQuery:
      'unit_code:NMNH* AND online_media_type:Images AND media_usage:CC0',
  },
  {
    name: 'National Air and Space Museum',
    slug: 'national-air-and-space-museum',
    description:
      "The National Air and Space Museum maintains the world's largest and most significant collection of aviation and space artifacts, encompassing all aspects of human flight, as well as related art and archival materials.",
    address: '600 Independence Ave SW',
    city: 'Washington, D.C.',
    smithsonianQuery:
      'unit_code:NASM AND online_media_type:Images AND media_usage:CC0',
  },
  {
    name: 'National Museum of American History',
    slug: 'national-museum-of-american-history',
    description:
      'The National Museum of American History collects, preserves, and displays the heritage of the United States in the areas of social, political, cultural, scientific, and military history.',
    address: '1300 Constitution Ave. NW',
    city: 'Washington, D.C.',
    smithsonianQuery:
      'unit_code:NMAH AND online_media_type:Images AND media_usage:CC0',
  },
  {
    name: 'National Portrait Gallery',
    slug: 'national-portrait-gallery',
    description:
      'The National Portrait Gallery tells the multifaceted story of America through the individuals who have shaped its culture. Through the visual arts, performing arts, and new media, the Portrait Gallery presents poets and presidents, visionaries and villains, actors and activists.',
    address: '8th and G Streets NW',
    city: 'Washington, D.C.',
    smithsonianQuery:
      'unit_code:NPG AND online_media_type:Images AND media_usage:CC0',
  },
  {
    name: 'Hirshhorn Museum and Sculpture Garden',
    slug: 'hirshhorn-museum-and-sculpture-garden',
    description:
      'The Hirshhorn Museum and Sculpture Garden is the national museum of modern and contemporary art and a leading voice for 21st-century art and culture.',
    address: 'Independence Ave SW & 7th St SW',
    city: 'Washington, D.C.',
    smithsonianQuery:
      'unit_code:HMSG AND online_media_type:Images AND media_usage:CC0',
  },
  {
    name: 'National Museum of Asian Art',
    slug: 'national-museum-of-asian-art',
    description:
      'The National Museum of Asian Art preserves, exhibits, and interprets Asian art from ancient times to the present day, housing the collections of the Freer Gallery of Art and Arthur M. Sackler Gallery.',
    address: '1050 Independence Ave SW',
    city: 'Washington, D.C.',
    smithsonianQuery:
      'unit_code:NMAA AND online_media_type:Images AND media_usage:CC0',
  },
];

export interface SeedMuseumsCliOptions {
  superadminId?: string;
  targetCount?: number;
  status?: 'draft' | 'published';
  apiKey?: string;
  skipMedia?: boolean;
  clean?: boolean;
}

export interface SeedMuseumsConfig {
  superadminId: string;
  targetCount: number;
  status: 'draft' | 'published';
  apiKey: string;
  skipMedia: boolean;
  clean: boolean;
}

export interface MuseumSeedResult {
  museumId: string;
  museumName: string;
  isCreated: boolean;
  artifactsInserted: number;
  artifactsSkipped: number;
  artifactsTotal: number;
  mediaUploaded: number;
}

export interface RunSeedMuseumsOptions {
  superadminId: string;
  targetCount?: number;
  status?: 'draft' | 'published';
  apiKey: string;
  skipMedia?: boolean;
  clean?: boolean;
  museumsList?: SeedMuseumDefinition[];
  dbClient?: typeof db;
  fetchFn?: typeof fetch;
  uploadMediaFn?: typeof uploadMedia;
  maxPages?: number;
}

/**
 * Parses command line arguments:
 * --superadmin <uuid>, --superadmin-id <uuid>, -s <uuid>, or positional arg
 * --target-count <number>, -c <number>
 * --status <draft|published>
 * --api-key <key>
 * --skip-media
 * --clean
 */
export function parseCliArgs(args: string[]): SeedMuseumsCliOptions {
  const options: SeedMuseumsCliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--superadmin' || arg === '--superadmin-id' || arg === '-s') {
      options.superadminId = args[++i]?.trim();
    } else if (arg.startsWith('--superadmin=')) {
      options.superadminId = arg.slice('--superadmin='.length).trim();
    } else if (arg.startsWith('--superadmin-id=')) {
      options.superadminId = arg.slice('--superadmin-id='.length).trim();
    } else if (arg === '--target-count' || arg === '-c') {
      const val = parseInt(args[++i], 10);
      if (!Number.isNaN(val)) options.targetCount = val;
    } else if (arg.startsWith('--target-count=')) {
      const val = parseInt(arg.slice('--target-count='.length), 10);
      if (!Number.isNaN(val)) options.targetCount = val;
    } else if (arg === '--status') {
      const val = args[++i]?.trim();
      if (val === 'draft' || val === 'published') options.status = val;
    } else if (arg.startsWith('--status=')) {
      const val = arg.slice('--status='.length).trim();
      if (val === 'draft' || val === 'published') options.status = val;
    } else if (arg === '--api-key') {
      options.apiKey = args[++i]?.trim();
    } else if (arg.startsWith('--api-key=')) {
      options.apiKey = arg.slice('--api-key='.length).trim();
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
 * Validates configuration parameters before database/network operations.
 */
export function validateSeedMuseumsConfig(envConfig: {
  apiKey?: string | null;
  superadminId?: string | null;
  nodeEnv?: string | null;
  targetCount?: number;
  status?: 'draft' | 'published';
  skipMedia?: boolean;
  clean?: boolean;
}): SeedMuseumsConfig {
  const nodeEnv = envConfig.nodeEnv?.trim() || 'development';
  if (nodeEnv === 'production') {
    throw new Error('Refusing to run seed script in production environment.');
  }

  const apiKey = envConfig.apiKey?.trim();
  if (!apiKey) {
    throw new Error(
      'SMITHSONIAN_API_KEY is required in environment configuration or --api-key flag.'
    );
  }

  const rawSuperadminId = envConfig.superadminId?.trim();
  if (!rawSuperadminId) {
    throw new Error(
      'Superadmin ID is required. Pass it via flag: --superadmin <uuid> (or -s <uuid>, or as first argument).'
    );
  }

  const parseResult = uuidSchema.safeParse(rawSuperadminId);
  if (!parseResult.success) {
    throw new Error(`Superadmin ID must be a valid UUID. Received: "${rawSuperadminId}"`);
  }

  const targetCount =
    envConfig.targetCount && envConfig.targetCount > 0 ? envConfig.targetCount : 50;

  const status = envConfig.status === 'draft' ? 'draft' : 'published';

  return {
    apiKey,
    superadminId: rawSuperadminId,
    targetCount,
    status,
    skipMedia: Boolean(envConfig.skipMedia),
    clean: Boolean(envConfig.clean),
  };
}

/**
 * Confirms superadmin exists in public.users and checks role.
 */
export async function verifySuperadminExists(
  superadminId: string,
  dbClient = db
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
      and(eq(userRoles.userId, superadminId), eq(userRoles.role, 'super_admin'))
    )
    .limit(1);

  if (!role) {
    console.warn(
      `Notice: User "${superadminId}" is in users table but does not have the 'super_admin' role in user_roles.`
    );
  }
}

/**
 * Finds an existing museum by slug or name, or creates a new one.
 * Also assigns the superadmin as an active administrator in museum_admins.
 */
export async function findOrCreateMuseum(
  def: SeedMuseumDefinition,
  options: {
    superadminId: string;
    status: 'draft' | 'published';
  },
  dbClient = db
): Promise<{ id: string; name: string; isCreated: boolean }> {
  const [existing] = await dbClient
    .select({ id: museums.id, name: museums.name })
    .from(museums)
    .where(or(eq(museums.slug, def.slug), eq(museums.name, def.name)))
    .limit(1);

  if (existing) {
    await dbClient
      .insert(museumAdmins)
      .values({
        museumId: existing.id,
        userId: options.superadminId,
        status: 'active',
        assignedBy: options.superadminId,
      })
      .onConflictDoNothing();

    return { id: existing.id, name: existing.name, isCreated: false };
  }

  const [created] = await dbClient
    .insert(museums)
    .values({
      name: def.name,
      slug: def.slug,
      description: def.description,
      address: def.address,
      city: def.city,
      status: options.status,
      createdBy: options.superadminId,
    })
    .returning({ id: museums.id, name: museums.name });

  await dbClient
    .insert(museumAdmins)
    .values({
      museumId: created.id,
      userId: options.superadminId,
      status: 'active',
      assignedBy: options.superadminId,
    })
    .onConflictDoNothing();

  return { id: created.id, name: created.name, isCreated: true };
}

/**
 * Downloads an image from URL and uploads it to Supabase Storage, then creates a media_assets row.
 */
export async function processArtifactMedia(
  params: {
    museumId: string;
    artifactId: string;
    imageUrl: string;
    superadminId: string;
  },
  fetchFn = fetch,
  uploadMediaFn = uploadMedia,
  dbClient = db
): Promise<string | null> {
  const { museumId, artifactId, imageUrl, superadminId } = params;

  try {
    const res = await fetchFn(imageUrl, {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return null;
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    if (buffer.length < 100) {
      return null;
    }

    const detectedMime = detectMimeType(buffer) || 'image/jpeg';
    if (!ALLOWED_MIME_TYPES.includes(detectedMime as AllowedMimeType)) {
      return null;
    }

    const ext = MIME_EXTENSIONS[detectedMime as AllowedMimeType]?.[0] || '.jpg';
    const storagePath = buildStoragePath(museumId, 'artifact', artifactId, ext);

    await uploadMediaFn('museum-media', storagePath, buffer, detectedMime);

    await dbClient
      .insert(mediaAssets)
      .values({
        museumId,
        entityType: 'artifact',
        entityId: artifactId,
        mediaType: 'image',
        storageBucket: 'museum-media',
        storagePath,
        mimeType: detectedMime,
        sortOrder: 0,
        isPrimary: true,
        createdBy: superadminId,
      })
      .onConflictDoNothing();

    return storagePath;
  } catch (err) {
    console.warn(
      `    [Media] Warning: Failed to process image for artifact (${artifactId}):`,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Orchestrates seeding of all hardcoded museums, artifacts, and accompanying media.
 */
export async function runSeedMuseums(
  options: RunSeedMuseumsOptions
): Promise<MuseumSeedResult[]> {
  const {
    superadminId,
    targetCount = 50,
    status = 'published',
    apiKey,
    skipMedia = false,
    clean = false,
    museumsList = SEED_MUSEUMS,
    dbClient = db,
    fetchFn = fetch,
    uploadMediaFn = uploadMedia,
    maxPages = 10,
  } = options;

  await verifySuperadminExists(superadminId, dbClient);

  const results: MuseumSeedResult[] = [];

  for (const museumDef of museumsList) {
    console.log(`\n--- Processing Museum: "${museumDef.name}" ---`);

    const { id: museumId, name: museumName, isCreated } =
      await findOrCreateMuseum(museumDef, { superadminId, status }, dbClient);

    if (isCreated) {
      console.log(`  -> Created new museum (ID: ${museumId}, status: ${status})`);
    } else {
      console.log(`  -> Found existing museum (ID: ${museumId})`);
    }

    // Clean existing artifacts if requested
    if (clean) {
      console.log(`  -> Cleaning existing artifacts for museum: "${museumName}"...`);
      await dbClient.delete(artifacts).where(eq(artifacts.museumId, museumId));
      await dbClient
        .delete(mediaAssets)
        .where(
          and(
            eq(mediaAssets.museumId, museumId),
            eq(mediaAssets.entityType, 'artifact')
          )
        );
    }

    // Check existing count
    const [countRow] = await dbClient
      .select({ count: sql<number>`count(*)::int` })
      .from(artifacts)
      .where(eq(artifacts.museumId, museumId));

    const existingArtifactsCount = countRow?.count ?? 0;
    console.log(
      `  -> Museum currently has ${existingArtifactsCount} artifacts in database.`
    );

    if (existingArtifactsCount >= targetCount && !clean) {
      // Check if media needs backfilling
      const [mediaCountRow] = await dbClient
        .select({ count: sql<number>`count(*)::int` })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.museumId, museumId),
            eq(mediaAssets.entityType, 'artifact')
          )
        );
      const mediaCount = mediaCountRow?.count ?? 0;

      if (mediaCount >= targetCount || skipMedia) {
        console.log(
          `  -> Already satisfies target count of ${targetCount} artifacts and media. Skipping.`
        );
        results.push({
          museumId,
          museumName,
          isCreated,
          artifactsInserted: 0,
          artifactsSkipped: existingArtifactsCount,
          artifactsTotal: existingArtifactsCount,
          mediaUploaded: 0,
        });
        continue;
      }
    }

    // Fetch eligible CC0 records from Smithsonian API
    console.log(
      `  -> Fetching up to ${targetCount} artifacts with query: "${museumDef.smithsonianQuery}"...`
    );
    const fetchResult = await fetchEligibleRecords(
      apiKey,
      targetCount,
      museumDef.smithsonianQuery,
      fetchFn,
      maxPages
    );

    console.log(
      `  -> Fetched ${fetchResult.records.length} eligible CC0 artifacts from Smithsonian API.`
    );

    let inserted = 0;
    let skipped = 0;
    let mediaUploaded = 0;
    let firstCoverPath: string | null = null;

    // Process artifacts and their media in concurrent batches
    const concurrency = 5;
    for (let i = 0; i < fetchResult.records.length; i += concurrency) {
      const chunk = fetchResult.records.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async (record) => {
          // Insert artifact
          const [insertedRow] = await dbClient
            .insert(artifacts)
            .values({
              museumId,
              name: record.name,
              description: record.description,
              period: record.period,
              inventoryCode: null,
              status,
              createdBy: superadminId,
              sourceSystem: 'smithsonian',
              sourceId: record.sourceId,
              sourceUrl: record.sourceUrl,
              sourceRights: record.sourceRights,
              sourceCredit: record.sourceCredit,
            })
            .onConflictDoNothing()
            .returning({ id: artifacts.id });

          let artifactId = insertedRow?.id;
          if (insertedRow) {
            inserted++;
          } else {
            skipped++;
            const [existingRow] = await dbClient
              .select({ id: artifacts.id })
              .from(artifacts)
              .where(
                and(
                  eq(artifacts.museumId, museumId),
                  eq(artifacts.sourceSystem, 'smithsonian'),
                  eq(artifacts.sourceId, record.sourceId)
                )
              )
              .limit(1);
            artifactId = existingRow?.id;
          }

          // Process Media if not skipped and artifactId exists
          if (!skipMedia && artifactId && record.imageUrl) {
            const [existingMedia] = await dbClient
              .select({ id: mediaAssets.id, storagePath: mediaAssets.storagePath })
              .from(mediaAssets)
              .where(
                and(
                  eq(mediaAssets.entityType, 'artifact'),
                  eq(mediaAssets.entityId, artifactId)
                )
              )
              .limit(1);

            if (!existingMedia) {
              const uploadedPath = await processArtifactMedia(
                {
                  museumId,
                  artifactId,
                  imageUrl: record.imageUrl,
                  superadminId,
                },
                fetchFn,
                uploadMediaFn,
                dbClient
              );

              if (uploadedPath) {
                mediaUploaded++;
                if (!firstCoverPath) {
                  firstCoverPath = uploadedPath;
                }
              }
            } else if (!firstCoverPath && existingMedia.storagePath) {
              firstCoverPath = existingMedia.storagePath;
            }
          }
        })
      );
    }

    // Set museum coverImagePath if not already set
    if (firstCoverPath) {
      await dbClient
        .update(museums)
        .set({ coverImagePath: firstCoverPath })
        .where(and(eq(museums.id, museumId), isNull(museums.coverImagePath)));
    }

    console.log(
      `  -> Done: ${inserted} artifacts inserted (${skipped} skipped), ${mediaUploaded} media assets uploaded.`
    );

    results.push({
      museumId,
      museumName,
      isCreated,
      artifactsInserted: inserted,
      artifactsSkipped: skipped,
      artifactsTotal: existingArtifactsCount + inserted,
      mediaUploaded,
    });
  }

  return results;
}

/**
 * CLI Entrypoint
 */
export async function run(): Promise<void> {
  try {
    const cliOptions = parseCliArgs(process.argv.slice(2));

    const config = validateSeedMuseumsConfig({
      apiKey: cliOptions.apiKey || process.env.SMITHSONIAN_API_KEY,
      superadminId: cliOptions.superadminId || process.env.SUPERADMIN_ID,
      nodeEnv: process.env.NODE_ENV,
      targetCount: cliOptions.targetCount,
      status: cliOptions.status,
      skipMedia: cliOptions.skipMedia,
      clean: cliOptions.clean,
    });

    console.log('=====================================================');
    console.log('   SOTA Museum Management - Multi-Museum Seeder       ');
    console.log('=====================================================');
    console.log(`Superadmin ID: ${config.superadminId}`);
    console.log(`Artifact Target Count per Museum: ${config.targetCount}`);
    console.log(`Publication Status: ${config.status}`);
    console.log(`With Media Upload: ${!config.skipMedia}`);
    console.log(`Clean previous artifacts: ${config.clean}`);
    console.log(`Museums to seed: ${SEED_MUSEUMS.length}`);

    const results = await runSeedMuseums({
      superadminId: config.superadminId,
      targetCount: config.targetCount,
      status: config.status,
      apiKey: config.apiKey,
      skipMedia: config.skipMedia,
      clean: config.clean,
    });

    console.log('\n=====================================================');
    console.log('                   SEED SUMMARY                      ');
    console.log('=====================================================');
    for (const r of results) {
      console.log(
        `- ${r.museumName} (${r.isCreated ? 'Created' : 'Existing'}): ` +
          `${r.artifactsInserted} artifacts inserted (${r.artifactsSkipped} skipped), ` +
          `${r.mediaUploaded} media assets uploaded.`
      );
    }
    console.log('All museums processed successfully.');
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    console.error('\nSeed failed:', maskApiKeyInUrl(rawMsg));
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

if (require.main === module) {
  void run();
}
