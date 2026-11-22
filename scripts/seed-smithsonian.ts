import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '../src/db';
import { artifacts, museums } from '../src/db/schema';
import { uuidSchema } from '../src/lib/validation';

export interface SeedConfig {
  apiKey: string;
  museumId: string;
  targetCount: number;
}

export interface ValidatedSmithsonianArtifact {
  sourceId: string;
  name: string;
  description: string | null;
  period: string | null;
  sourceUrl: string | null;
  sourceRights: string;
  sourceCredit: string | null;
  imageUrl?: string | null;
}

export interface SmithsonianFetchResult {
  rows: unknown[];
  rowCount: number;
}

export interface EligibleFetchResult {
  records: ValidatedSmithsonianArtifact[];
  hitPageLimit: boolean;
  isExhausted: boolean;
  totalAvailableInApi: number;
  pagesFetched: number;
}

export interface SeedResult {
  totalEligible: number;
  inserted: number;
  skipped: number;
  hitPageLimit: boolean;
  isPartial: boolean;
}

export interface RunSeedOptions {
  apiKey: string;
  museumId: string;
  targetCount?: number;
  query?: string;
  dbClient?: typeof db;
  fetchFn?: typeof fetch;
  maxPages?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates environment variables and prerequisites before attempting any network or DB calls.
 */
export function validateSeedConfig(envConfig: {
  apiKey?: string | null;
  museumId?: string | null;
  nodeEnv?: string | null;
  targetCount?: number;
}): SeedConfig {
  const nodeEnv = envConfig.nodeEnv?.trim() || 'development';
  if (nodeEnv === 'production') {
    throw new Error('Refusing to run seed script in production environment.');
  }

  const apiKey = envConfig.apiKey?.trim();
  if (!apiKey) {
    throw new Error('SMITHSONIAN_API_KEY is required in environment configuration.');
  }

  const museumId = envConfig.museumId?.trim();
  if (!museumId) {
    throw new Error('SEED_MUSEUM_ID is required in environment configuration.');
  }

  const parseResult = uuidSchema.safeParse(museumId);
  if (!parseResult.success) {
    throw new Error('SEED_MUSEUM_ID must be a valid UUID.');
  }

  const targetCount = envConfig.targetCount && envConfig.targetCount > 0 ? envConfig.targetCount : 50;

  return {
    apiKey,
    museumId,
    targetCount,
  };
}

/**
 * Sanitizes URLs for logging so the API key is never exposed.
 */
export function maskApiKeyInUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    if (url.searchParams.has('api_key')) {
      url.searchParams.set('api_key', '***');
    }
    return url.toString();
  } catch {
    return urlString.replace(/api_key=[^&]+/gi, 'api_key=***');
  }
}

/**
 * Validates a Smithsonian EDAN record and extracts metadata if eligible under CC0 metadata terms.
 *
 * NOTE: Per the Smithsonian EDAN field guide, descriptiveNonRepeating.metadata_usage.access is the
 * authoritative required rights field for metadata, while text is optional.
 * To be eligible, access MUST strictly be "CC0". If text is also present, it must not contradict CC0.
 *
 * Returns null if record is missing required fields, lacks explicit CC0 access, or has conflicting rights.
 */
export function parseSmithsonianRecord(item: unknown): ValidatedSmithsonianArtifact | null {
  if (!isRecord(item)) {
    return null;
  }

  const content = isRecord(item.content) ? item.content : null;
  const descriptive = content && isRecord(content.descriptiveNonRepeating)
    ? content.descriptiveNonRepeating
    : null;
  const indexed = content && isRecord(content.indexedStructured)
    ? content.indexedStructured
    : null;
  const freetext = content && isRecord(content.freetext)
    ? content.freetext
    : null;

  // 1. Source ID
  const rawId = typeof item.id === 'string' && item.id.trim()
    ? item.id.trim()
    : descriptive && typeof descriptive.record_ID === 'string' && descriptive.record_ID.trim()
    ? descriptive.record_ID.trim()
    : null;

  if (!rawId) {
    return null;
  }

  // 2. Validate metadata rights
  // Per the Smithsonian EDAN field guide, descriptiveNonRepeating.metadata_usage.access is the
  // authoritative required controlled-vocabulary field for metadata rights, while text is optional.
  // access === "CC0" is the sufficient condition for metadata eligibility.
  const metadataUsage = descriptive && isRecord(descriptive.metadata_usage)
    ? descriptive.metadata_usage
    : null;

  if (!metadataUsage) {
    return null;
  }

  const access = typeof metadataUsage.access === 'string' && metadataUsage.access.trim()
    ? metadataUsage.access.trim()
    : null;
  const textVal = typeof metadataUsage.text === 'string' && metadataUsage.text.trim()
    ? metadataUsage.text.trim()
    : null;

  const accessUpper = access ? access.toUpperCase() : '';

  // Canonical access field must be explicitly CC0
  if (accessUpper !== 'CC0') {
    return null;
  }

  // Store verbatim text if provided, otherwise fallback to canonical access value ('CC0')
  const sourceRights = textVal ?? access;
  if (!sourceRights) {
    return null;
  }

  // 3. Name / Title
  let name: string | null = null;
  if (typeof item.title === 'string' && item.title.trim()) {
    name = item.title.trim();
  } else if (
    descriptive &&
    isRecord(descriptive.title) &&
    typeof descriptive.title.content === 'string' &&
    descriptive.title.content.trim()
  ) {
    name = descriptive.title.content.trim();
  }

  if (!name) {
    return null;
  }

  // 4. Description
  let description: string | null = null;
  if (freetext && Array.isArray(freetext.notes)) {
    const descNote = freetext.notes.find(
      (n): n is Record<string, unknown> =>
        isRecord(n) && typeof n.content === 'string' && n.content.trim().length > 0
    );
    if (descNote && typeof descNote.content === 'string') {
      description = descNote.content.trim();
    }
  }

  // 5. Period
  let period: string | null = null;
  if (freetext && Array.isArray(freetext.date)) {
    const dateItem = freetext.date.find(
      (d): d is Record<string, unknown> =>
        isRecord(d) && typeof d.content === 'string' && d.content.trim().length > 0
    );
    if (dateItem && typeof dateItem.content === 'string') {
      period = dateItem.content.trim();
    }
  } else if (
    indexed &&
    Array.isArray(indexed.date) &&
    typeof indexed.date[0] === 'string' &&
    indexed.date[0].trim()
  ) {
    period = indexed.date[0].trim();
  }

  // 6. Source URL
  let sourceUrl: string | null = null;
  if (
    descriptive &&
    typeof descriptive.record_link === 'string' &&
    descriptive.record_link.trim().startsWith('http')
  ) {
    sourceUrl = descriptive.record_link.trim();
  }

  // 7. Source Credit
  let sourceCredit: string | null = null;
  if (freetext && Array.isArray(freetext.creditLine)) {
    const credit = freetext.creditLine.find(
      (c): c is Record<string, unknown> =>
        isRecord(c) && typeof c.content === 'string' && c.content.trim().length > 0
    );
    if (credit && typeof credit.content === 'string') {
      sourceCredit = credit.content.trim();
    }
  } else if (descriptive && typeof descriptive.data_source === 'string' && descriptive.data_source.trim()) {
    sourceCredit = descriptive.data_source.trim();
  }

  // 8. Image URL
  let imageUrl: string | null = null;
  if (
    descriptive &&
    isRecord(descriptive.online_media) &&
    Array.isArray(descriptive.online_media.media)
  ) {
    for (const m of descriptive.online_media.media) {
      if (!isRecord(m)) continue;
      if (typeof m.idsId === 'string' && m.idsId.trim()) {
        imageUrl = `https://ids.si.edu/ids/deliveryService?id=${m.idsId.trim()}&max=800`;
        break;
      }
      if (typeof m.content === 'string' && m.content.trim().startsWith('http')) {
        const c = m.content.trim();
        imageUrl = c.includes('ids.si.edu') && !c.includes('max=') ? `${c}&max=800` : c;
        break;
      }
      if (typeof m.thumbnail === 'string' && m.thumbnail.trim().startsWith('http')) {
        imageUrl = m.thumbnail.trim();
        break;
      }
    }
  }

  return {
    sourceId: rawId,
    name,
    description,
    period,
    sourceUrl,
    sourceRights,
    sourceCredit,
    imageUrl,
  };
}

/**
 * Fetches a single page of results from the Smithsonian Open Access API.
 * Rejects with an error if the HTTP status is not 2xx or response JSON shape is invalid.
 */
export async function fetchSmithsonianPage(
  apiKey: string,
  query: string,
  start: number,
  rows: number,
  fetchFn = fetch
): Promise<SmithsonianFetchResult> {
  const url = new URL('https://api.si.edu/openaccess/api/v1.0/search');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('start', String(start));
  url.searchParams.set('rows', String(rows));

  const safeUrl = maskApiKeyInUrl(url.toString());

  const response = await fetchFn(url.toString(), {
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(
      `Smithsonian API returned HTTP ${response.status} (${response.statusText}) for request: ${safeUrl}`
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Failed to parse JSON response from Smithsonian API for request: ${safeUrl}`);
  }

  if (!isRecord(json) || !isRecord(json.response)) {
    throw new Error(`Malformed response structure from Smithsonian API for request: ${safeUrl}`);
  }

  const responsePayload = json.response;
  if (
    !Array.isArray(responsePayload.rows) ||
    typeof responsePayload.rowCount !== 'number' ||
    Number.isNaN(responsePayload.rowCount) ||
    responsePayload.rowCount < 0
  ) {
    throw new Error(`Malformed response structure from Smithsonian API for request: ${safeUrl}`);
  }

  return {
    rows: responsePayload.rows,
    rowCount: responsePayload.rowCount,
  };
}

/**
 * Paginates through Smithsonian Open Access search API until targetCount eligible records are collected
 * or API rowCount is exhausted, bounded by a hard maxPages request limit.
 */
export async function fetchEligibleRecords(
  apiKey: string,
  targetCount = 50,
  query = 'online_media_type:Images',
  fetchFn = fetch,
  maxPages = 10
): Promise<EligibleFetchResult> {
  const pageSize = 50;
  let start = 0;
  let pageCount = 0;
  let totalAvailableInApi = 0;
  let hitPageLimit = false;
  let isExhausted = false;
  const eligibleMap = new Map<string, ValidatedSmithsonianArtifact>();

  while (eligibleMap.size < targetCount) {
    if (pageCount >= maxPages) {
      hitPageLimit = true;
      break;
    }

    pageCount++;
    const page = await fetchSmithsonianPage(apiKey, query, start, pageSize, fetchFn);
    totalAvailableInApi = page.rowCount;

    if (page.rows.length === 0) {
      isExhausted = true;
      break;
    }

    for (const rawItem of page.rows) {
      const validated = parseSmithsonianRecord(rawItem);
      if (validated && !eligibleMap.has(validated.sourceId)) {
        eligibleMap.set(validated.sourceId, validated);
        if (eligibleMap.size >= targetCount) {
          break;
        }
      }
    }

    start += page.rows.length;
    if (start >= page.rowCount) {
      isExhausted = true;
      break;
    }
  }

  const records = Array.from(eligibleMap.values());
  return {
    records,
    hitPageLimit: hitPageLimit && records.length < targetCount,
    isExhausted,
    totalAvailableInApi,
    pagesFetched: pageCount,
  };
}

/**
 * Confirms target museum exists in database before any downstream network or insert operations.
 */
export async function verifyMuseumExists(museumId: string, dbClient = db): Promise<void> {
  const [museum] = await dbClient
    .select({ id: museums.id })
    .from(museums)
    .where(eq(museums.id, museumId))
    .limit(1);

  if (!museum) {
    throw new Error(`Target museum not found: ${museumId}`);
  }
}

/**
 * Inserts eligible Smithsonian artifacts into the target museum with ON CONFLICT DO NOTHING.
 */
export async function seedSmithsonianArtifacts(
  params: {
    museumId: string;
    records: ValidatedSmithsonianArtifact[];
    hitPageLimit?: boolean;
    targetCount?: number;
    status?: 'draft' | 'published';
    createdBy?: string | null;
  },
  dbClient = db
): Promise<SeedResult> {
  const {
    museumId,
    records,
    hitPageLimit = false,
    targetCount = records.length,
    status = 'draft',
    createdBy = null,
  } = params;

  await verifyMuseumExists(museumId, dbClient);

  let inserted = 0;
  let skipped = 0;

  for (const record of records) {
    const result = await dbClient
      .insert(artifacts)
      .values({
        museumId,
        name: record.name,
        description: record.description,
        period: record.period,
        inventoryCode: null,
        status,
        createdBy,
        sourceSystem: 'smithsonian',
        sourceId: record.sourceId,
        sourceUrl: record.sourceUrl,
        sourceRights: record.sourceRights,
        sourceCredit: record.sourceCredit,
      })
      .onConflictDoNothing()
      .returning({ id: artifacts.id });

    if (result.length > 0) {
      inserted++;
    } else {
      skipped++;
    }
  }

  return {
    totalEligible: records.length,
    inserted,
    skipped,
    hitPageLimit,
    isPartial: hitPageLimit && records.length < targetCount,
  };
}

/**
 * Orchestrates the full seed process: museum verification -> fetch -> database persistence.
 */
export async function runSeed(options: RunSeedOptions): Promise<SeedResult> {
  const {
    apiKey,
    museumId,
    targetCount = 50,
    query = 'online_media_type:Images',
    dbClient = db,
    fetchFn = fetch,
    maxPages = 10,
  } = options;

  // 1. Verify target museum exists BEFORE initiating external API requests
  await verifyMuseumExists(museumId, dbClient);

  // 2. Fetch eligible records with hard page limit
  const fetchResult = await fetchEligibleRecords(apiKey, targetCount, query, fetchFn, maxPages);
  if (fetchResult.records.length === 0) {
    return {
      totalEligible: 0,
      inserted: 0,
      skipped: 0,
      hitPageLimit: fetchResult.hitPageLimit,
      isPartial: fetchResult.hitPageLimit && targetCount > 0,
    };
  }

  // 3. Insert artifacts
  return seedSmithsonianArtifacts(
    {
      museumId,
      records: fetchResult.records,
      hitPageLimit: fetchResult.hitPageLimit,
      targetCount,
    },
    dbClient
  );
}

/**
 * CLI entrypoint for npm run seed:smithsonian.
 */
export async function run(): Promise<void> {
  try {
    const cliMuseumId = process.argv[2]?.trim();
    const config = validateSeedConfig({
      apiKey: process.env.SMITHSONIAN_API_KEY,
      museumId: cliMuseumId || process.env.SEED_MUSEUM_ID,
      nodeEnv: process.env.NODE_ENV,
      targetCount: 50,
    });

    console.log(`Starting Smithsonian Open Access seed for museum: ${config.museumId}`);
    const result = await runSeed({
      apiKey: config.apiKey,
      museumId: config.museumId,
      targetCount: config.targetCount,
    });

    if (result.totalEligible === 0) {
      if (result.hitPageLimit) {
        console.warn('No eligible records found before reaching maximum page limit.');
      } else {
        console.log('No eligible records found to seed (API results exhausted).');
      }
      return;
    }

    if (result.isPartial) {
      console.warn(
        `Warning: Seed completed partially (${result.totalEligible}/${config.targetCount} records) because hard page limit was reached before exhausting available API records.`
      );
    } else {
      console.log(
        `Seed completed: ${result.inserted} artifacts inserted, ${result.skipped} skipped (already existed). Total eligible: ${result.totalEligible}.`
      );
    }
  } catch (error) {
    console.error('Seed process failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

if (require.main === module) {
  void run();
}
