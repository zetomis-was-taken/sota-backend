import { describe, expect, it, vi } from 'vitest';
import { SEED_MUSEUMS } from '../../scripts/seed-museums';
import {
  ALLOWED_SOUVENIR_IMAGE_MIMES,
  assertSafeCleanEnvironment,
  buildProductSeedData,
  checkCatalogVisibilityWarning,
  checkForeignKeyReferences,
  checkStorageBucketPreflight,
  cleanAllManagedSouvenirs,
  cleanExistingManagedSouvenirs,
  fetchAndValidateMedia,
  findOrCreateMuseum,
  getExistingPrimaryMedia,
  getManagedSkus,
  main,
  MANAGED_SKUS,
  MAX_MEDIA_BYTES,
  MIN_MEDIA_BYTES,
  parseCliArgs,
  precheckManagedSouvenirsForeignKeys,
  printSeedSummary,
  processProductMedia,
  run,
  runStoragePreflight,
  SOUVENIR_FIXTURES,
  uploadAndInsertSouvenirMedia,
  upsertSouvenirProduct,
  validateSeedConfig,
  validateStorageConfig,
  verifySuperadminExists,
} from '../../scripts/seed-souvenirs';
import { museumAdmins } from '../../src/db/schema';
import { env } from '../../src/config/env';

describe('Seed Souvenirs Script (scripts/seed-souvenirs.ts) - Phase 1 Fixtures', () => {
  describe('Museums and Scope', () => {
    it('defines fixtures for exactly 6 Smithsonian museums', () => {
      expect(SOUVENIR_FIXTURES).toHaveLength(6);
    });

    it('matches the canonical Smithsonian slugs defined in SEED_MUSEUMS', () => {
      const canonicalSlugs = SEED_MUSEUMS.map((m) => m.slug);
      const fixtureSlugs = SOUVENIR_FIXTURES.map((m) => m.museumSlug);

      expect(fixtureSlugs).toEqual(canonicalSlugs);
    });

    it('provides between 5 and 10 distinct souvenir items for every museum', () => {
      for (const museum of SOUVENIR_FIXTURES) {
        expect(
          museum.items.length,
          `Museum "${museum.museumSlug}" should have 5–10 items, but has ${museum.items.length}`
        ).toBeGreaterThanOrEqual(5);
        expect(
          museum.items.length,
          `Museum "${museum.museumSlug}" should have 5–10 items, but has ${museum.items.length}`
        ).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('Item Schema, Currency and Status Constraints', () => {
    it('enforces unique SKUs per museum and across all museums in MANAGED_SKUS', () => {
      const allSkus: string[] = [];

      for (const museum of SOUVENIR_FIXTURES) {
        const museumSkus = new Set<string>();

        for (const item of museum.items) {
          expect(
            museumSkus.has(item.sku),
            `Duplicate SKU "${item.sku}" found in museum "${museum.museumSlug}"`
          ).toBe(false);
          museumSkus.add(item.sku);
          allSkus.push(item.sku);
        }
      }

      expect(MANAGED_SKUS.size).toBe(allSkus.length);
      expect(getManagedSkus()).toEqual(allSkus);
    });

    it('strictly enforces VND currency on all fixture items', () => {
      for (const museum of SOUVENIR_FIXTURES) {
        for (const item of museum.items) {
          expect(
            item.currency,
            `Item with SKU "${item.sku}" must have currency strictly set to "VND"`
          ).toBe('VND');
        }
      }
    });

    it('builds product seed payload with default published status and strict VND currency', () => {
      const museum = SOUVENIR_FIXTURES[0];
      const item = museum.items[0];
      const fakeMuseumId = '11111111-1111-4111-8111-111111111111';
      const fakeSuperadminId = '22222222-2222-4222-8222-222222222222';

      // Default status is 'published'
      const defaultData = buildProductSeedData(item, fakeMuseumId, {
        createdBy: fakeSuperadminId,
      });

      expect(defaultData.museumId).toBe(fakeMuseumId);
      expect(defaultData.sku).toBe(item.sku);
      expect(defaultData.currency).toBe('VND');
      expect(defaultData.status).toBe('published');
      expect(defaultData.createdBy).toBe(fakeSuperadminId);

      // Explicit status override (e.g. 'draft')
      const draftData = buildProductSeedData(item, fakeMuseumId, {
        status: 'draft',
        createdBy: fakeSuperadminId,
      });
      expect(draftData.status).toBe('draft');
      expect(draftData.currency).toBe('VND');
    });

    it('follows standard prefix conventions for SKUs by museum', () => {
      const prefixMap: Record<string, string> = {
        'national-museum-of-natural-history': 'NMNH-',
        'national-air-and-space-museum': 'NASM-',
        'national-museum-of-american-history': 'AME-',
        'national-portrait-gallery': 'NPG-',
        'hirshhorn-museum-and-sculpture-garden': 'HMSG-',
        'national-museum-of-asian-art': 'NMAA-',
      };

      for (const museum of SOUVENIR_FIXTURES) {
        const expectedPrefix = prefixMap[museum.museumSlug];
        expect(expectedPrefix).toBeDefined();

        for (const item of museum.items) {
          expect(
            item.sku.startsWith(expectedPrefix),
            `SKU "${item.sku}" in museum "${museum.museumSlug}" must start with "${expectedPrefix}"`
          ).toBe(true);
        }
      }
    });

    it('enforces positive VND prices matching numeric(12, 2) format', () => {
      for (const museum of SOUVENIR_FIXTURES) {
        for (const item of museum.items) {
          expect(
            /^\d+\.\d{2}$/.test(item.price),
            `Price "${item.price}" for SKU "${item.sku}" must match numeric(12,2) format`
          ).toBe(true);

          const numPrice = parseFloat(item.price);
          expect(
            numPrice,
            `Price for SKU "${item.sku}" must be strictly positive`
          ).toBeGreaterThan(0);
          expect(
            numPrice,
            `Standard souvenir items should stay reasonably priced in VND`
          ).toBeLessThanOrEqual(1500000);
        }
      }
    });

    it('enforces stockQuantity as an integer between 20 and 100', () => {
      for (const museum of SOUVENIR_FIXTURES) {
        for (const item of museum.items) {
          expect(
            Number.isInteger(item.stockQuantity),
            `stockQuantity for SKU "${item.sku}" must be an integer`
          ).toBe(true);
          expect(
            item.stockQuantity,
            `stockQuantity for SKU "${item.sku}" must be >= 20`
          ).toBeGreaterThanOrEqual(20);
          expect(
            item.stockQuantity,
            `stockQuantity for SKU "${item.sku}" must be <= 100`
          ).toBeLessThanOrEqual(100);
        }
      }
    });

    it('has non-empty names and descriptions for all items', () => {
      for (const museum of SOUVENIR_FIXTURES) {
        for (const item of museum.items) {
          expect(item.name.trim().length).toBeGreaterThan(3);
          expect(item.description.trim().length).toBeGreaterThan(10);
        }
      }
    });
  });

  describe('Media Assets and Provenance Verification', () => {
    it('provides valid image URLs and allowed backend MIME types', () => {
      const allowedMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);

      for (const museum of SOUVENIR_FIXTURES) {
        for (const item of museum.items) {
          expect(
            item.imageUrl.startsWith('https://'),
            `Image URL for SKU "${item.sku}" must be an HTTPS URL`
          ).toBe(true);
          expect(
            allowedMimes.has(item.imageMimeType),
            `MIME type "${item.imageMimeType}" for SKU "${item.sku}" must be in allowed list`
          ).toBe(true);
        }
      }
    });

    it('provides verifiable source page URLs pointing to authoritative provenance records', () => {
      const allowedAuthorityDomains = [
        'commons.wikimedia.org',
        'si.edu',
        'nasa.gov',
        'loc.gov',
        'archives.gov',
      ];

      for (const museum of SOUVENIR_FIXTURES) {
        for (const item of museum.items) {
          expect(
            item.sourcePageUrl,
            `Missing sourcePageUrl for SKU "${item.sku}"`
          ).toBeDefined();

          const parsedUrl = new URL(item.sourcePageUrl);
          expect(
            parsedUrl.protocol,
            `sourcePageUrl for SKU "${item.sku}" must use https:`
          ).toBe('https:');

          const matchesAllowedDomain = allowedAuthorityDomains.some(
            (domain) =>
              parsedUrl.hostname === domain ||
              parsedUrl.hostname.endsWith(`.${domain}`)
          );

          expect(
            matchesAllowedDomain,
            `sourcePageUrl "${item.sourcePageUrl}" for SKU "${item.sku}" must point to an authorized provenance domain (${allowedAuthorityDomains.join(', ')})`
          ).toBe(true);
        }
      }
    });

    it('strictly specifies verified CC0 or Public Domain rights with explicit credits', () => {
      for (const museum of SOUVENIR_FIXTURES) {
        for (const item of museum.items) {
          expect(
            ['CC0', 'Public Domain'].includes(item.mediaRights),
            `Rights for SKU "${item.sku}" must be either "CC0" or "Public Domain", received: "${item.mediaRights}"`
          ).toBe(true);
          expect(
            item.mediaRights,
            'Educational Fair Use must not be treated as a license'
          ).not.toBe('Educational Fair Use');
          expect(
            item.mediaCredit.trim().length,
            `Media credit for SKU "${item.sku}" must not be empty`
          ).toBeGreaterThanOrEqual(4);
        }
      }
    });

    it('proves actual usage rights and verified provenance metadata for all fixture items', () => {
      const totalItems = SOUVENIR_FIXTURES.reduce((acc, m) => acc + m.items.length, 0);
      expect(totalItems).toBe(38);

      const uniqueImageUrls = new Set<string>();

      for (const museum of SOUVENIR_FIXTURES) {
        for (const item of museum.items) {
          expect(item.sourcePageUrl).toMatch(/^https:\/\//);
          expect(item.imageUrl).toMatch(/^https:\/\//);
          expect(['image/jpeg', 'image/png', 'image/webp'].includes(item.imageMimeType)).toBe(true);
          expect(['Public Domain', 'CC0'].includes(item.mediaRights)).toBe(true);
          expect(item.mediaCredit.trim().length).toBeGreaterThanOrEqual(4);

          const validRawLicense =
            /public domain/i.test(item.rawLicense || '') ||
            /cc-?0/i.test(item.rawLicense || '');
          expect(
            validRawLicense,
            `Source page for SKU "${item.sku}" must declare Public domain or CC0, got "${item.rawLicense}"`
          ).toBe(true);

          expect(
            uniqueImageUrls.has(item.imageUrl),
            `Duplicate image asset detected for SKU "${item.sku}": ${item.imageUrl}`
          ).toBe(false);
          uniqueImageUrls.add(item.imageUrl);
        }
      }

      expect(uniqueImageUrls.size).toBe(38);
    });
  });
});

describe('Seed Souvenirs Script - Phase 2 Storage Preflight, Museum Find-or-Create, & Visibility', () => {
  describe('Storage Configuration and Preflight Checks', () => {
    it('validates storage config returns required env variables', () => {
      const origUrl = env.supabaseUrl;
      const origKey = env.supabaseSecretKey;

      try {
        (env as any).supabaseUrl = 'https://fake-project.supabase.co';
        (env as any).supabaseSecretKey = 'fake-secret-key';

        const config = validateStorageConfig();
        expect(config.supabaseUrl).toBe('https://fake-project.supabase.co');
        expect(config.supabaseSecretKey).toBe('fake-secret-key');
        expect(config.souvenirMediaBucket).toBeDefined();
      } finally {
        (env as any).supabaseUrl = origUrl;
        (env as any).supabaseSecretKey = origKey;
      }
    });

    it('throws descriptive error when Supabase storage credentials are missing', () => {
      const origUrl = env.supabaseUrl;
      const origKey = env.supabaseSecretKey;

      try {
        (env as any).supabaseUrl = '';
        (env as any).supabaseSecretKey = '';

        expect(() => validateStorageConfig()).toThrow(
          'Missing Supabase Storage configuration. Required: SUPABASE_URL and SUPABASE_SECRET_KEY.'
        );
      } finally {
        (env as any).supabaseUrl = origUrl;
        (env as any).supabaseSecretKey = origKey;
      }
    });

    it('passes preflight check when bucket exists and is public', async () => {
      const mockStorageClient = {
        storage: {
          getBucket: vi.fn().mockResolvedValue({
            data: { id: 'souvenir-media', name: 'souvenir-media', public: true },
            error: null,
          }),
        },
      };

      const result = await checkStorageBucketPreflight(
        'souvenir-media',
        mockStorageClient
      );
      expect(result.ok).toBe(true);
      expect(result.bucketName).toBe('souvenir-media');
      expect(result.isPublic).toBe(true);
      expect(mockStorageClient.storage.getBucket).toHaveBeenCalledWith(
        'souvenir-media'
      );
    });

    it('bypasses preflight check when skipMedia option is active', async () => {
      const mockStorageClient = {
        storage: {
          getBucket: vi.fn(),
        },
      };

      const result = await runStoragePreflight(
        { skipMedia: true },
        mockStorageClient
      );
      expect(result.skipped).toBe(true);
      expect(mockStorageClient.storage.getBucket).not.toHaveBeenCalled();
    });

    it('fails fast when bucket does not exist and gives TODO.md guidance', async () => {
      const mockStorageClient = {
        storage: {
          getBucket: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Bucket not found' },
          }),
        },
      };

      await expect(
        checkStorageBucketPreflight('souvenir-media', mockStorageClient)
      ).rejects.toThrow(/does not exist on Supabase Storage.*TODO\.md/);
    });

    it('fails fast when bucket exists but is private (public: false)', async () => {
      const mockStorageClient = {
        storage: {
          getBucket: vi.fn().mockResolvedValue({
            data: { id: 'souvenir-media', name: 'souvenir-media', public: false },
            error: null,
          }),
        },
      };

      await expect(
        checkStorageBucketPreflight('souvenir-media', mockStorageClient)
      ).rejects.toThrow(
        /exists but is not public \(public: false\)/
      );
    });
  });

  describe('Museum Find-or-Create Logic', () => {
    it('preserves existing museum status and assigns superadmin without updating status', async () => {
      const fakeSuperadminId = '99999999-9999-4999-8999-999999999999';
      const existingMuseum = {
        id: '12345678-1234-4234-8234-123456789abc',
        name: 'National Museum of Natural History',
        slug: 'national-museum-of-natural-history',
        status: 'draft' as const,
      };

      const mockDb: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingMuseum]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue([]),
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'mock-prod-id' }]),
            }),
          }),
        }),
      };

      const result = await findOrCreateMuseum(
        {
          museumSlug: 'national-museum-of-natural-history',
          museumName: 'National Museum of Natural History',
        },
        {
          superadminId: fakeSuperadminId,
          newMuseumStatus: 'published',
        },
        mockDb
      );

      expect(result.id).toBe(existingMuseum.id);
      expect(result.name).toBe(existingMuseum.name);
      expect(result.status).toBe('draft'); // Status is preserved as 'draft', not overridden to 'published'
      expect(result.isCreated).toBe(false);

      expect(mockDb.insert).toHaveBeenCalledTimes(1); // Only museumAdmins inserted
    });

    it('creates a new museum with default status published and assigns superadmin', async () => {
      const fakeSuperadminId = '99999999-9999-4999-8999-999999999999';
      const createdMuseum = {
        id: '87654321-4321-4321-8321-cba987654321',
        name: 'National Air and Space Museum',
        slug: 'national-air-and-space-museum',
        status: 'published' as const,
      };

      const mockDb: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // Does not exist
            }),
          }),
        }),
        insert: vi.fn()
          .mockReturnValueOnce({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([createdMuseum]),
            }),
          })
          .mockReturnValueOnce({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockResolvedValue([]),
            }),
          }),
      };

      const result = await findOrCreateMuseum(
        {
          museumSlug: 'national-air-and-space-museum',
          museumName: 'National Air and Space Museum',
        },
        {
          superadminId: fakeSuperadminId,
        },
        mockDb
      );

      expect(result.id).toBe(createdMuseum.id);
      expect(result.name).toBe(createdMuseum.name);
      expect(result.status).toBe('published');
      expect(result.isCreated).toBe(true);

      expect(mockDb.insert).toHaveBeenCalledTimes(2); // museums and museumAdmins
    });

    it('respects newMuseumStatus override when creating a new museum', async () => {
      const fakeSuperadminId = '99999999-9999-4999-8999-999999999999';
      const createdDraftMuseum = {
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        name: 'Custom New Museum',
        slug: 'custom-new-museum',
        status: 'draft' as const,
      };

      let insertedValues: any = null;

      const mockDb: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        insert: vi.fn()
          .mockReturnValueOnce({
            values: vi.fn().mockImplementation((val) => {
              insertedValues = val;
              return {
                returning: vi.fn().mockResolvedValue([createdDraftMuseum]),
              };
            }),
          })
          .mockReturnValueOnce({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockResolvedValue([]),
            }),
          }),
      };

      const result = await findOrCreateMuseum(
        {
          museumSlug: 'custom-new-museum',
          museumName: 'Custom New Museum',
        },
        {
          superadminId: fakeSuperadminId,
          newMuseumStatus: 'draft',
        },
        mockDb
      );

      expect(result.status).toBe('draft');
      expect(result.isCreated).toBe(true);
      expect(insertedValues.status).toBe('draft');
    });

    it('guarantees active superadmin membership and reactivates revoked records via onConflictDoUpdate', async () => {
      const fakeSuperadminId = '99999999-9999-4999-8999-999999999999';
      const existingMuseum = {
        id: '12345678-1234-4234-8234-123456789abc',
        name: 'National Museum of Natural History',
        slug: 'national-museum-of-natural-history',
        status: 'published' as const,
      };

      const mockOnConflictDoUpdate = vi.fn().mockResolvedValue([]);
      const mockValues = vi.fn().mockReturnValue({
        onConflictDoUpdate: mockOnConflictDoUpdate,
      });

      const mockDb: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([existingMuseum]),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: mockValues,
        }),
      };

      await findOrCreateMuseum(
        {
          museumSlug: 'national-museum-of-natural-history',
          museumName: 'National Museum of Natural History',
        },
        {
          superadminId: fakeSuperadminId,
        },
        mockDb
      );

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          museumId: existingMuseum.id,
          userId: fakeSuperadminId,
          status: 'active',
          assignedBy: fakeSuperadminId,
        })
      );

      expect(mockOnConflictDoUpdate).toHaveBeenCalledWith({
        target: [museumAdmins.museumId, museumAdmins.userId],
        set: {
          status: 'active',
          revokedAt: null,
          assignedBy: fakeSuperadminId,
        },
      });
    });
  });

  describe('Catalog Visibility Checks (api-contract.md:79)', () => {
    it('warns when target museum is draft and product is published', () => {
      const warning = checkCatalogVisibilityWarning(
        { name: 'National Museum of Natural History', status: 'draft' },
        'published'
      );

      expect(warning).not.toBeNull();
      expect(warning).toContain('hidden from the Public Catalog API (404)');
      expect(warning).toContain('draft');
    });

    it('warns when target museum is archived and product is published', () => {
      const warning = checkCatalogVisibilityWarning(
        { name: 'National Air and Space Museum', status: 'archived' },
        'published'
      );

      expect(warning).not.toBeNull();
      expect(warning).toContain('hidden from the Public Catalog API (404)');
      expect(warning).toContain('archived');
    });

    it('returns null (no warning) when museum is published and product is published', () => {
      const warning = checkCatalogVisibilityWarning(
        { name: 'National Portrait Gallery', status: 'published' },
        'published'
      );

      expect(warning).toBeNull();
    });

    it('returns null (no warning) when product itself is draft', () => {
      const warning = checkCatalogVisibilityWarning(
        { name: 'Hirshhorn Museum', status: 'draft' },
        'draft'
      );

      expect(warning).toBeNull();
    });
  });

  describe('CLI Arguments and Configuration Validation', () => {
    it('parses --superadmin, --status, --clean, and --skip-media flags correctly', () => {
      const args = [
        '--superadmin',
        '11111111-2222-4333-8444-555555555555',
        '--status',
        'draft',
        '--clean',
        '--skip-media',
      ];
      const parsed = parseCliArgs(args);

      expect(parsed.superadminId).toBe('11111111-2222-4333-8444-555555555555');
      expect(parsed.status).toBe('draft');
      expect(parsed.clean).toBe(true);
      expect(parsed.skipMedia).toBe(true);
    });

    it('parses short flags -s and --superadmin= format', () => {
      const parsedShort = parseCliArgs(['-s', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee']);
      expect(parsedShort.superadminId).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');

      const parsedEqual = parseCliArgs(['--superadmin=bbbbbbbb-cccc-4ddd-8eee-ffffffffffff']);
      expect(parsedEqual.superadminId).toBe('bbbbbbbb-cccc-4ddd-8eee-ffffffffffff');
    });

    it('parses positional superadmin ID, --superadmin-id, and --status= format', () => {
      const parsedPos = parseCliArgs(['11111111-2222-4333-8444-555555555555']);
      expect(parsedPos.superadminId).toBe('11111111-2222-4333-8444-555555555555');

      const parsedIdFlag = parseCliArgs(['--superadmin-id', '22222222-3333-4444-8555-666666666666']);
      expect(parsedIdFlag.superadminId).toBe('22222222-3333-4444-8555-666666666666');

      const parsedIdEqual = parseCliArgs(['--superadmin-id=33333333-4444-4555-8666-777777777777']);
      expect(parsedIdEqual.superadminId).toBe('33333333-4444-4555-8666-777777777777');

      const parsedStatusEqual = parseCliArgs(['--status=draft']);
      expect(parsedStatusEqual.status).toBe('draft');
    });

    it('throws when an invalid --status flag value is passed', () => {
      expect(() => parseCliArgs(['--status', 'archived'])).toThrow(
        /Invalid status "archived"/
      );
      expect(() => parseCliArgs(['--status=invalid'])).toThrow(
        /Invalid status "invalid"/
      );
    });

    it('rejects execution when NODE_ENV is production', () => {
      expect(() =>
        validateSeedConfig({
          superadminId: '11111111-2222-4333-8444-555555555555',
          nodeEnv: 'production',
        })
      ).toThrow('Refusing to run seed script in production environment.');
    });

    it('triggers assertSafeCleanEnvironment during validateSeedConfig when clean is true', () => {
      expect(() =>
        validateSeedConfig({
          superadminId: '11111111-2222-4333-8444-555555555555',
          nodeEnv: 'development',
          databaseUrl: 'postgres://user:pass@remote.supabase.co:5432/postgres',
          clean: true,
        })
      ).toThrow(/Refusing to clean database: DATABASE_URL host/);
    });

    it('rejects execution when superadmin ID is missing or invalid UUID', () => {
      expect(() => validateSeedConfig({ superadminId: '' })).toThrow(
        /Superadmin ID is required/
      );

      expect(() => validateSeedConfig({ superadminId: 'not-a-uuid' })).toThrow(
        /Superadmin ID must be a valid UUID/
      );
    });

    it('validates and applies defaults correctly', () => {
      const config = validateSeedConfig({
        superadminId: '11111111-2222-4333-8444-555555555555',
      });

      expect(config.status).toBe('published');
      expect(config.clean).toBe(false);
      expect(config.skipMedia).toBe(false);
    });
  });

  describe('Superadmin Verification (verifySuperadminExists)', () => {
    it('throws descriptive error if superadmin is not found in users table', async () => {
      const mockDb: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // User not found
            }),
          }),
        }),
      };

      await expect(
        verifySuperadminExists('11111111-2222-4333-8444-555555555555', mockDb)
      ).rejects.toThrow(/was not found in database.*seed:superadmins/);
    });

    it('throws error if user exists in users table but lacks super_admin role', async () => {
      const mockDb: any = {
        select: vi.fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ id: 'valid-user-id' }]),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]), // No super_admin role
              }),
            }),
          }),
      };

      await expect(
        verifySuperadminExists('valid-user-id', mockDb)
      ).rejects.toThrow(
        /does not have the 'super_admin' role in user_roles/
      );
    });

    it('succeeds without error when user has super_admin role', async () => {
      const mockDb: any = {
        select: vi.fn()
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ id: 'valid-user-id' }]),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ role: 'super_admin' }]),
              }),
            }),
          }),
      };

      await expect(
        verifySuperadminExists('valid-user-id', mockDb)
      ).resolves.toBeUndefined();
    });
  });

  describe('Orchestration Pipeline Execution (run)', () => {
    it('orchestrates storage preflight and verifies all 6 museums', async () => {
      const fakeMuseums = SOUVENIR_FIXTURES.map((m, idx) => ({
        id: `00000000-0000-4000-8000-00000000000${idx}`,
        name: m.museumName,
        slug: m.museumSlug,
        status: (idx === 0 ? 'draft' : 'published') as 'draft' | 'published',
      }));

      let callCount = 0;
      const mockDb: any = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              const wherePromise = Promise.resolve([]) as any;
              wherePromise.limit = vi.fn().mockImplementation(() => {
                const item = fakeMuseums[callCount++];
                return Promise.resolve(
                  item
                    ? [item]
                    : [{ id: 'mock-existing-media', storagePath: 'mock/path.jpg' }]
                );
              });
              return wherePromise;
            }),
          }),
        })),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue([]),
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'mock-prod-id' }]),
            }),
          }),
        }),
      };

      const mockStorageClient = {
        storage: {
          getBucket: vi.fn().mockResolvedValue({
            data: { id: 'souvenir-media', name: 'souvenir-media', public: true },
            error: null,
          }),
        },
      };

      const result = await run(
        {
          superadminId: '11111111-2222-4333-8444-555555555555',
          status: 'published',
          clean: false,
          skipMedia: false,
        },
        {
          dbClient: mockDb,
          storageClient: mockStorageClient,
        }
      );

      expect(result.museums).toHaveLength(6);
      expect(result.storagePreflight.skipped).toBe(false);
      expect(result.storagePreflight.isPublic).toBe(true);
      // Museum 0 is draft and product is published -> 1 warning
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('draft');
    });

    it('orchestrates execution with skipMedia active', async () => {
      let callCount = 0;
      const mockDb: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(() => {
                const idx = callCount++;
                return Promise.resolve([
                  {
                    id: `00000000-0000-4000-8000-00000000000${idx}`,
                    name: `Museum ${idx}`,
                    slug: `museum-${idx}`,
                    status: 'published',
                  },
                ]);
              }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue([]),
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'mock-prod-id' }]),
            }),
          }),
        }),
      };

      const mockStorageClient = {
        storage: {
          getBucket: vi.fn(),
        },
      };

      const result = await run(
        {
          superadminId: '11111111-2222-4333-8444-555555555555',
          status: 'published',
          clean: false,
          skipMedia: true,
        },
        {
          dbClient: mockDb,
          storageClient: mockStorageClient,
        }
      );

      expect(result.museums).toHaveLength(6);
      expect(result.storagePreflight.skipped).toBe(true);
      expect(mockStorageClient.storage.getBucket).not.toHaveBeenCalled();
      expect(result.warnings).toHaveLength(0);
    });

    it('creates museums with default published status even when running with --status draft', async () => {
      const createdMuseum = {
        id: '11111111-2222-4333-8444-555555555555',
        name: 'National Museum of Natural History',
        slug: 'national-museum-of-natural-history',
        status: 'published' as const,
      };

      let insertedMuseumStatus: string | null = null;

      let museumLookupCount = 0;
      const mockDb: any = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              const wherePromise = Promise.resolve([]) as any;
              wherePromise.limit = vi.fn().mockImplementation(() => {
                museumLookupCount++;
                // First 6 calls are museum lookups -> return empty to trigger creation
                if (museumLookupCount <= 6) {
                  return Promise.resolve([]);
                }
                // Subsequent calls are media checks -> return existing media
                return Promise.resolve([
                  { id: 'mock-existing-media', storagePath: 'mock/path.jpg' },
                ]);
              });
              return wherePromise;
            }),
          }),
        })),
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((val) => {
            if (val.slug) {
              insertedMuseumStatus = val.status;
            }
            return {
              returning: vi.fn().mockResolvedValue([createdMuseum]),
              onConflictDoUpdate: vi.fn().mockResolvedValue([]),
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 'mock-prod-id' }]),
              }),
            };
          }),
        })),
      };

      const mockStorageClient = {
        storage: {
          getBucket: vi.fn().mockResolvedValue({
            data: { id: 'souvenir-media', name: 'souvenir-media', public: true },
            error: null,
          }),
        },
      };

      const result = await run(
        {
          superadminId: '99999999-9999-4999-8999-999999999999',
          status: 'draft', // Products should be draft
          clean: false,
          skipMedia: false,
        },
        {
          dbClient: mockDb,
          storageClient: mockStorageClient,
        }
      );

      // Verify newly created museum was created with 'published' status, not product's 'draft'
      expect(insertedMuseumStatus).toBe('published');
      expect(result.museums[0].status).toBe('published');
      // No visibility warning because published museums do not hide draft products
      expect(result.warnings).toHaveLength(0);
    });
  });
});

  describe('Seed Souvenirs Script - Phase 3 Safe Scoped Clean & Foreign Key Pre-check', () => {
    describe('Environment & Database Allowlist Guard (assertSafeCleanEnvironment)', () => {
      it('throws if NODE_ENV is undefined or empty', () => {
        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: undefined,
            databaseUrl: 'postgresql://postgres:pass@localhost:5432/postgres',
          })
        ).toThrow(/NODE_ENV must be explicitly set to 'development' or 'test'/);

        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: '',
            databaseUrl: 'postgresql://postgres:pass@localhost:5432/postgres',
          })
        ).toThrow(/NODE_ENV must be explicitly set to 'development' or 'test'/);
      });

      it('throws if NODE_ENV is production or staging', () => {
        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: 'production',
            databaseUrl: 'postgresql://postgres:pass@localhost:5432/postgres',
          })
        ).toThrow(/NODE_ENV must be explicitly set to 'development' or 'test'/);

        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: 'staging',
            databaseUrl: 'postgresql://postgres:pass@localhost:5432/postgres',
          })
        ).toThrow(/NODE_ENV must be explicitly set to 'development' or 'test'/);
      });

      it('throws if DATABASE_URL is missing or invalid', () => {
        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: 'development',
            databaseUrl: '',
          })
        ).toThrow(/DATABASE_URL is not configured/);

        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: 'development',
            databaseUrl: 'not-a-valid-url',
          })
        ).toThrow('Refusing to clean database: Invalid DATABASE_URL format.');

        // Verify that raw credentials in malformed URLs are omitted from error message
        try {
          assertSafeCleanEnvironment({
            nodeEnv: 'development',
            databaseUrl: 'postgresql://sensitive_user:secret_password@:5432',
          });
          expect.fail('Should have thrown an error');
        } catch (err: any) {
          expect(err.message).toBe(
            'Refusing to clean database: Invalid DATABASE_URL format.'
          );
          expect(err.message).not.toContain('sensitive_user');
          expect(err.message).not.toContain('secret_password');
        }
      });

      it('throws if DATABASE_URL points to a remote/cloud host', () => {
        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: 'development',
            databaseUrl:
              'postgresql://postgres:pass@db.xyz.supabase.co:5432/postgres',
          })
        ).toThrow(
          /DATABASE_URL host "db.xyz.supabase.co" is not in the local\/test allowlist/
        );

        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: 'test',
            databaseUrl:
              'postgresql://postgres:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
          })
        ).toThrow(/not in the local\/test allowlist/);
      });

      it('allows clean on permitted local and test hostnames', () => {
        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: 'development',
            databaseUrl: 'postgresql://postgres:pass@localhost:5432/postgres',
          })
        ).not.toThrow();

        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: 'test',
            databaseUrl: 'postgresql://postgres:pass@127.0.0.1:5432/testdb',
          })
        ).not.toThrow();

        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: 'test',
            databaseUrl: 'postgresql://postgres:pass@[::1]:5432/testdb',
          })
        ).not.toThrow();

        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: 'development',
            databaseUrl: 'postgresql://postgres:pass@0.0.0.0:5432/devdb',
          })
        ).not.toThrow();

        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: 'development',
            databaseUrl: 'postgresql://postgres:pass@postgres.internal.local:5432/db',
          })
        ).not.toThrow();

        expect(() =>
          assertSafeCleanEnvironment({
            nodeEnv: 'test',
            databaseUrl: 'postgresql://postgres:pass@db.service.test:5432/db',
          })
        ).not.toThrow();
      });
    });

    describe('Configuration Validation for --clean', () => {
      it('enforces safe environment when clean flag is enabled', () => {
        expect(() =>
          validateSeedConfig({
            superadminId: '11111111-2222-4333-8444-555555555555',
            clean: true,
            nodeEnv: undefined,
            databaseUrl: 'postgresql://localhost:5432/db',
          })
        ).toThrow(/NODE_ENV must be explicitly set/);

        expect(() =>
          validateSeedConfig({
            superadminId: '11111111-2222-4333-8444-555555555555',
            clean: true,
            nodeEnv: 'development',
            databaseUrl: 'postgresql://db.remote.supabase.co:5432/db',
          })
        ).toThrow(/not in the local\/test allowlist/);

        const validConfig = validateSeedConfig({
          superadminId: '11111111-2222-4333-8444-555555555555',
          clean: true,
          nodeEnv: 'development',
          databaseUrl: 'postgresql://localhost:5432/db',
        });
        expect(validConfig.clean).toBe(true);
      });
    });

    describe('Foreign Key Pre-check (checkForeignKeyReferences)', () => {
      it('returns empty references when productIds array is empty', async () => {
        const mockDb: any = {};
        const result = await checkForeignKeyReferences([], mockDb);
        expect(result.hasReferences).toBe(false);
        expect(result.cartCount).toBe(0);
        expect(result.orderCount).toBe(0);
      });

      it('returns empty references when no cart_items or shop_order_items reference products', async () => {
        const mockDb: any = {
          select: vi.fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]), // cart_items empty
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]), // shop_order_items empty
              }),
            }),
        };

        const result = await checkForeignKeyReferences(['prod-1', 'prod-2'], mockDb);
        expect(result.hasReferences).toBe(false);
        expect(result.referencedProductIds).toHaveLength(0);
      });

      it('aborts and throws descriptive error when cart_items reference target products', async () => {
        const mockDb: any = {
          select: vi.fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ productId: 'prod-1' }]),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            }),
        };

        await expect(
          checkForeignKeyReferences(['prod-1', 'prod-2'], mockDb)
        ).rejects.toThrow(
          /Cannot clean souvenirs: 1 cart item\(s\) and 0 order item\(s\) reference 1 managed product\(s\) \(prod-1\)/
        );
      });

      it('aborts and throws descriptive error when shop_order_items reference target products', async () => {
        const mockDb: any = {
          select: vi.fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([
                  { productId: 'prod-2' },
                  { productId: 'prod-3' },
                ]),
              }),
            }),
        };

        await expect(
          checkForeignKeyReferences(['prod-1', 'prod-2', 'prod-3'], mockDb)
        ).rejects.toThrow(
          /Cannot clean souvenirs: 0 cart item\(s\) and 2 order item\(s\) reference 2 managed product\(s\)/
        );
      });
    });

    describe('Scoped Read-Only Foreign Key Pre-check (precheckManagedSouvenirsForeignKeys)', () => {
      it('returns clean result when no target museums exist in database', async () => {
        const mockDb: any = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]), // no existing museums
            }),
          }),
        };

        const result = await precheckManagedSouvenirsForeignKeys(
          SOUVENIR_FIXTURES,
          mockDb
        );

        expect(result.hasReferences).toBe(false);
        expect(result.cartCount).toBe(0);
        expect(result.orderCount).toBe(0);
      });

      it('returns clean result when target museums exist but have no existing products', async () => {
        const mockDb: any = {
          select: vi.fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([
                  {
                    id: 'mus-1',
                    slug: SOUVENIR_FIXTURES[0].museumSlug,
                    name: SOUVENIR_FIXTURES[0].museumName,
                  },
                ]),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]), // no existing products
              }),
            }),
        };

        const result = await precheckManagedSouvenirsForeignKeys(
          SOUVENIR_FIXTURES,
          mockDb
        );

        expect(result.hasReferences).toBe(false);
      });

      it('aborts and throws error when an existing product in a target museum is in a cart', async () => {
        const mockDb: any = {
          select: vi.fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([
                  {
                    id: 'mus-1',
                    slug: SOUVENIR_FIXTURES[0].museumSlug,
                    name: SOUVENIR_FIXTURES[0].museumName,
                  },
                ]),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ id: 'prod-locked' }]),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ productId: 'prod-locked' }]),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            }),
        };

        await expect(
          precheckManagedSouvenirsForeignKeys(SOUVENIR_FIXTURES, mockDb)
        ).rejects.toThrow(/Cannot clean souvenirs: 1 cart item\(s\)/);
      });
    });

    describe('Scoped Managed Souvenirs Cleanup (cleanExistingManagedSouvenirs)', () => {
      it('returns zero deleted when managedSkus is empty', async () => {
        const mockDb: any = {};
        const result = await cleanExistingManagedSouvenirs('museum-1', [], mockDb);
        expect(result.deletedProductsCount).toBe(0);
        expect(result.deletedMediaCount).toBe(0);
      });

      it('returns zero deleted when no managed products exist in database for the museum', async () => {
        const mockDb: any = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]), // No products found
            }),
          }),
        };

        const result = await cleanExistingManagedSouvenirs(
          'museum-1',
          ['NMNH-MIN-001'],
          mockDb
        );
        expect(result.deletedProductsCount).toBe(0);
        expect(result.deletedMediaCount).toBe(0);
      });

      it('aborts before transaction when foreign keys are locked by cart_items', async () => {
        const existingProds = [{ id: 'prod-1', sku: 'NMNH-MIN-001' }];
        const transactionSpy = vi.fn();

        const mockDb: any = {
          select: vi.fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(existingProds),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ productId: 'prod-1' }]), // In cart
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            }),
          transaction: transactionSpy,
        };

        await expect(
          cleanExistingManagedSouvenirs('museum-1', ['NMNH-MIN-001'], mockDb)
        ).rejects.toThrow(/Cannot clean souvenirs/);

        // Verify transaction was never started because FK check failed first
        expect(transactionSpy).not.toHaveBeenCalled();
      });

      it('deletes media assets and products within transaction and cleans storage best-effort', async () => {
        const existingProds = [
          { id: 'prod-1', sku: 'NMNH-MIN-001' },
          { id: 'prod-2', sku: 'NMNH-MIN-002' },
        ];
        const mediaRows = [
          { id: 'media-1', storagePath: 'museum-1/souvenir/prod-1/img1.jpg' },
          { id: 'media-2', storagePath: 'museum-1/souvenir/prod-2/img2.jpg' },
        ];

        const deleteSpy = vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        });

        const mockTx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(mediaRows),
            }),
          }),
          delete: deleteSpy,
        };

        const mockDb: any = {
          select: vi.fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(existingProds),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]), // cart_items empty
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]), // shop_order_items empty
              }),
            }),
          transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
        };

        const mockDeleteMedia = vi.fn().mockResolvedValue(undefined);

        const result = await cleanExistingManagedSouvenirs(
          'museum-1',
          ['NMNH-MIN-001', 'NMNH-MIN-002'],
          mockDb,
          mockDeleteMedia
        );

        expect(result.deletedProductsCount).toBe(2);
        expect(result.deletedMediaCount).toBe(2);
        expect(deleteSpy).toHaveBeenCalledTimes(2); // Deleted mediaAssets, then souvenirProducts
        expect(mockDeleteMedia).toHaveBeenCalledTimes(2);
        expect(mockDeleteMedia).toHaveBeenCalledWith(
          env.souvenirMediaBucket,
          'museum-1/souvenir/prod-1/img1.jpg'
        );
      });

      it('catches storage deletion errors without failing the cleanup (best-effort)', async () => {
        const existingProds = [{ id: 'prod-1', sku: 'NMNH-MIN-001' }];
        const mediaRows = [
          { id: 'media-1', storagePath: 'museum-1/souvenir/prod-1/img1.jpg' },
        ];

        const mockTx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(mediaRows),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        };

        const mockDb: any = {
          select: vi.fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(existingProds),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            }),
          transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
        };

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const failingDeleteMedia = vi
          .fn()
          .mockRejectedValue(new Error('Storage network timeout'));

        const result = await cleanExistingManagedSouvenirs(
          'museum-1',
          ['NMNH-MIN-001'],
          mockDb,
          failingDeleteMedia
        );

        expect(result.deletedProductsCount).toBe(1);
        expect(result.deletedMediaCount).toBe(1);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to delete storage object'),
          expect.any(Error)
        );

        warnSpy.mockRestore();
      });

      it('scopes batch cleanup strictly to specified museums and their respective SKUs in a single transaction', async () => {
        const targets = [
          { museumId: 'museum-1', managedSkus: ['NMNH-MIN-001', 'NMNH-MIN-002'] },
          { museumId: 'museum-2', managedSkus: ['NASM-MOD-001'] },
        ];

        const existingProds = [
          { id: 'prod-1', sku: 'NMNH-MIN-001', museumId: 'museum-1' },
          { id: 'prod-2', sku: 'NASM-MOD-001', museumId: 'museum-2' },
        ];

        const mediaRows = [
          { id: 'media-1', storagePath: 'museum-1/souvenir/prod-1/img1.jpg' },
          { id: 'media-2', storagePath: 'museum-2/souvenir/prod-2/img2.jpg' },
        ];

        const deleteSpy = vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        });

        const mockTx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(mediaRows),
            }),
          }),
          delete: deleteSpy,
        };

        const transactionSpy = vi
          .fn()
          .mockImplementation(async (cb) => cb(mockTx));

        const mockDb: any = {
          select: vi.fn()
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(existingProds),
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]), // cart_items empty
              }),
            })
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]), // shop_order_items empty
              }),
            }),
          transaction: transactionSpy,
        };

        const mockDeleteMedia = vi.fn().mockResolvedValue(undefined);

        const result = await cleanAllManagedSouvenirs(
          targets,
          mockDb,
          mockDeleteMedia
        );

        expect(result.deletedProductsCount).toBe(2);
        expect(result.deletedMediaCount).toBe(2);
        // Single atomic transaction across all museums
        expect(transactionSpy).toHaveBeenCalledTimes(1);
        expect(deleteSpy).toHaveBeenCalledTimes(2); // mediaAssets and souvenirProducts
        expect(mockDeleteMedia).toHaveBeenCalledTimes(2);
      });
    });

    describe('Orchestration with --clean', () => {
      it('aborts run early before any museum creation or membership writes when products are locked', async () => {
        const fakeMuseum = {
          id: '00000000-0000-4000-8000-000000000000',
          name: SOUVENIR_FIXTURES[0].museumName,
          slug: SOUVENIR_FIXTURES[0].museumSlug,
          status: 'published' as const,
        };

        const insertSpy = vi.fn();
        const transactionSpy = vi.fn();

        const mockDb: any = {
          select: vi.fn()
            // 1. precheck: query existing target museums (read-only)
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([fakeMuseum]),
              }),
            })
            // 2. precheck: query existing products in those museums (read-only)
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([
                  { id: 'locked-prod', sku: 'NMNH-MIN-001', museumId: fakeMuseum.id },
                ]),
              }),
            })
            // 3. checkForeignKeyReferences: cart items check (read-only)
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([{ productId: 'locked-prod' }]),
              }),
            })
            // 4. checkForeignKeyReferences: order items check (read-only)
            .mockReturnValueOnce({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            }),
          insert: insertSpy,
          transaction: transactionSpy,
        };

        await expect(
          run(
            {
              superadminId: '11111111-2222-4333-8444-555555555555',
              status: 'published',
              clean: true,
              skipMedia: true,
            },
            {
              dbClient: mockDb,
              nodeEnv: 'test',
              databaseUrl: 'postgresql://localhost:5432/testdb',
            }
          )
        ).rejects.toThrow(/Cannot clean souvenirs: 1 cart item\(s\)/);

        // Crucial guarantee: verify NO museum or admin membership writes occurred before FK check aborted
        expect(insertSpy).not.toHaveBeenCalled();
        expect(transactionSpy).not.toHaveBeenCalled();
      });

      it('successfully cleans managed souvenirs across museums in clean run', async () => {
        const fakeMuseums = SOUVENIR_FIXTURES.map((m, idx) => ({
          id: `00000000-0000-4000-8000-00000000000${idx}`,
          name: m.museumName,
          slug: m.museumSlug,
          status: 'published' as const,
        }));

        let museumIdx = 0;
        const mockDb: any = {
          select: vi.fn().mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                const wherePromise = Promise.resolve([]) as any;
                wherePromise.limit = vi.fn().mockImplementation(() => {
                  const item = fakeMuseums[museumIdx++];
                  return Promise.resolve(item ? [item] : []);
                });
                return wherePromise;
              }),
            }),
          })),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockResolvedValue([]),
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 'mock-prod-id' }]),
              }),
            }),
          }),
        };

        const result = await run(
          {
            superadminId: '11111111-2222-4333-8444-555555555555',
            status: 'published',
            clean: true,
            skipMedia: true,
          },
          {
            dbClient: mockDb,
            nodeEnv: 'test',
            databaseUrl: 'postgresql://localhost:5432/testdb',
          }
        );

        expect(result.museums).toHaveLength(6);
        expect(result.cleanSummary).toEqual({
          deletedProductsCount: 0,
          deletedMediaCount: 0,
        });
      });
    });
  });

  describe('Seed Souvenirs Script - Phase 4 Media Processing & Storage Upload', () => {
    const createValidJpegBuffer = (length = 120): Buffer => {
      const buf = Buffer.alloc(length, 0x20);
      buf[0] = 0xff;
      buf[1] = 0xd8;
      buf[2] = 0xff;
      return buf;
    };

    const createValidPngBuffer = (length = 120): Buffer => {
      const buf = Buffer.alloc(length, 0x20);
      const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      for (let i = 0; i < header.length; i++) buf[i] = header[i];
      return buf;
    };

    const createValidWebpBuffer = (length = 120): Buffer => {
      const buf = Buffer.alloc(length, 0x20);
      buf.write('RIFF', 0, 'ascii');
      buf.write('WEBP', 8, 'ascii');
      return buf;
    };

    const createMp4Buffer = (length = 120): Buffer => {
      const buf = Buffer.alloc(length, 0x20);
      buf.write('ftyp', 4, 'ascii');
      return buf;
    };

    describe('Media Download & Memory Guard (fetchAndValidateMedia)', () => {
      it('throws error when fetch throws network error', async () => {
        const mockFetch = vi
          .fn()
          .mockRejectedValue(new Error('connection timeout'));

        await expect(
          fetchAndValidateMedia('https://example.com/image.jpg', {
            fetchFn: mockFetch as any,
          })
        ).rejects.toThrow(/Failed to fetch media from.*connection timeout/);
      });

      it('passes AbortSignal to fetch and rejects when signal is aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        const mockFetch = vi.fn().mockImplementation((_url, init) => {
          if (init?.signal?.aborted) {
            const err = new Error('This operation was aborted');
            err.name = 'AbortError';
            return Promise.reject(err);
          }
          return Promise.resolve({ ok: true, status: 200 } as any);
        });

        await expect(
          fetchAndValidateMedia('https://example.com/timeout.jpg', {
            fetchFn: mockFetch as any,
            signal: controller.signal,
          })
        ).rejects.toThrow(/Failed to fetch media from.*aborted/);

        expect(mockFetch).toHaveBeenCalledWith(
          'https://example.com/timeout.jpg',
          expect.objectContaining({ signal: controller.signal })
        );
      });

      it('throws error when HTTP response status is not ok', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Headers(),
        });

        await expect(
          fetchAndValidateMedia('https://example.com/missing.jpg', {
            fetchFn: mockFetch as any,
          })
        ).rejects.toThrow(/Failed to fetch media from.*HTTP 404 Not Found/);
      });

      it('aborts fast when content-length header exceeds 10 MB limit', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({
            'content-length': String(15 * 1024 * 1024), // 15 MB
          }),
        });

        await expect(
          fetchAndValidateMedia('https://example.com/giant.jpg', {
            fetchFn: mockFetch as any,
          })
        ).rejects.toThrow(
          /Media size \(15728640 bytes\) exceeds maximum allowed limit/
        );
      });

      it('aborts stream when accumulated chunks exceed 10 MB during download', async () => {
        const cancelSpy = vi.fn().mockResolvedValue(undefined);
        let readCount = 0;

        // Mock readable stream with two 6MB chunks -> exceeds 10MB on 2nd chunk
        const mockReader = {
          read: vi.fn().mockImplementation(() => {
            readCount++;
            if (readCount === 1) {
              return Promise.resolve({
                done: false,
                value: new Uint8Array(6 * 1024 * 1024),
              });
            }
            if (readCount === 2) {
              return Promise.resolve({
                done: false,
                value: new Uint8Array(6 * 1024 * 1024),
              });
            }
            return Promise.resolve({ done: true, value: undefined });
          }),
          cancel: cancelSpy,
        };

        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          body: {
            getReader: () => mockReader,
          },
        });

        await expect(
          fetchAndValidateMedia('https://example.com/stream-huge.jpg', {
            fetchFn: mockFetch as any,
          })
        ).rejects.toThrow(
          /Media size exceeded maximum allowed limit of 10485760 bytes \(10 MB\) during download/
        );

        expect(cancelSpy).toHaveBeenCalled();
      });

      it('rejects when downloaded buffer is below 100 bytes minimum', async () => {
        const tinyBuffer = createValidJpegBuffer(50);
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(tinyBuffer.buffer),
        });

        await expect(
          fetchAndValidateMedia('https://example.com/tiny.jpg', {
            fetchFn: mockFetch as any,
          })
        ).rejects.toThrow(
          /Media size \(50 bytes\) is below minimum allowed limit of 100 bytes/
        );
      });

      it('rejects unsupported media format (e.g. video/mp4)', async () => {
        const mp4Buffer = createMp4Buffer(120);
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(mp4Buffer.buffer),
        });

        await expect(
          fetchAndValidateMedia('https://example.com/sample.mp4', {
            fetchFn: mockFetch as any,
          })
        ).rejects.toThrow(
          /Unsupported media format for souvenir image: detected "video\/mp4"/
        );
      });

      it('rejects plain text or corrupted binary without recognizable image magic bytes', async () => {
        const plainTextBuffer = Buffer.from(
          '<html><body>404 Not Found HTML page</body></html>'.repeat(4)
        );
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(plainTextBuffer.buffer),
        });

        await expect(
          fetchAndValidateMedia('https://example.com/corrupt.jpg', {
            fetchFn: mockFetch as any,
          })
        ).rejects.toThrow(
          /Unsupported media format for souvenir image: detected "unknown"/
        );
      });

      it('successfully downloads and validates JPEG image', async () => {
        const jpegBuffer = createValidJpegBuffer(150);
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(jpegBuffer.buffer),
        });

        const result = await fetchAndValidateMedia(
          'https://example.com/photo.jpg',
          {
            fetchFn: mockFetch as any,
          }
        );

        expect(result.mimeType).toBe('image/jpeg');
        expect(result.extension).toBe('.jpg');
        expect(result.size).toBe(150);
        expect(result.buffer).toBeInstanceOf(Buffer);
      });

      it('successfully downloads and validates PNG image', async () => {
        const pngBuffer = createValidPngBuffer(200);
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(pngBuffer.buffer),
        });

        const result = await fetchAndValidateMedia(
          'https://example.com/graphic.png',
          {
            fetchFn: mockFetch as any,
          }
        );

        expect(result.mimeType).toBe('image/png');
        expect(result.extension).toBe('.png');
        expect(result.size).toBe(200);
      });

      it('successfully downloads and validates WebP image', async () => {
        const webpBuffer = createValidWebpBuffer(180);
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(webpBuffer.buffer),
        });

        const result = await fetchAndValidateMedia(
          'https://example.com/modern.webp',
          {
            fetchFn: mockFetch as any,
          }
        );

        expect(result.mimeType).toBe('image/webp');
        expect(result.extension).toBe('.webp');
        expect(result.size).toBe(180);
      });
    });

    describe('Storage Upload & Media Assets DB Insert (uploadAndInsertSouvenirMedia)', () => {
      it('uploads validated media to storage and inserts media_assets record', async () => {
        const jpegBuffer = createValidJpegBuffer(150);
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(jpegBuffer.buffer),
        });

        const uploadSpy = vi.fn().mockResolvedValue(undefined);
        const valuesSpy = vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'media-row-1' }]),
          }),
        });
        const insertSpy = vi.fn().mockReturnValue({
          values: valuesSpy,
        });

        const mockDb: any = { insert: insertSpy };

        const result = await uploadAndInsertSouvenirMedia(
          {
            museumId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            productId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            imageUrl: 'https://example.com/valid.jpg',
            superadminId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
            bucketName: 'souvenir-media',
          },
          {
            fetchFn: mockFetch as any,
            uploadMediaFn: uploadSpy,
            dbClient: mockDb,
          }
        );

        expect(result.created).toBe(true);
        expect(result.mediaId).toBe('media-row-1');
        expect(result.storagePath).toMatch(
          /^a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11\/souvenir\/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22\/[a-f0-9]+\.jpg$/
        );

        expect(valuesSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            museumId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            entityType: 'souvenir',
            entityId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            mediaType: 'image',
            storageBucket: 'souvenir-media',
            mimeType: 'image/jpeg',
            isPrimary: true,
            createdBy: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
          })
        );

        expect(uploadSpy).toHaveBeenCalledWith(
          'souvenir-media',
          result.storagePath,
          expect.any(Buffer),
          'image/jpeg'
        );
      });

      it('cleans up orphan storage object via deleteMediaFn when DB insert throws error', async () => {
        const jpegBuffer = createValidJpegBuffer(150);
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(jpegBuffer.buffer),
        });

        const uploadSpy = vi.fn().mockResolvedValue(undefined);
        const deleteSpy = vi.fn().mockResolvedValue(undefined);

        const insertSpy = vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi
                .fn()
                .mockRejectedValue(new Error('DB connection failed')),
            }),
          }),
        });

        const mockDb: any = { insert: insertSpy };

        await expect(
          uploadAndInsertSouvenirMedia(
            {
              museumId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
              productId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
              imageUrl: 'https://example.com/valid.jpg',
              superadminId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
              bucketName: 'souvenir-media',
            },
            {
              fetchFn: mockFetch as any,
              uploadMediaFn: uploadSpy,
              deleteMediaFn: deleteSpy,
              dbClient: mockDb,
            }
          )
        ).rejects.toThrow('DB connection failed');

        expect(uploadSpy).toHaveBeenCalledTimes(1);
        expect(deleteSpy).toHaveBeenCalledTimes(1);
        expect(deleteSpy).toHaveBeenCalledWith(
          'souvenir-media',
          expect.stringMatching(
            /^a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11\/souvenir\/b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22\//
          )
        );
      });

      it('cleans up orphan storage object when DB insert returns empty on conflict', async () => {
        const jpegBuffer = createValidJpegBuffer(150);
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(jpegBuffer.buffer),
        });

        const uploadSpy = vi.fn().mockResolvedValue(undefined);
        const deleteSpy = vi.fn().mockResolvedValue(undefined);

        const insertSpy = vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]), // No row inserted
            }),
          }),
        });

        const mockDb: any = { insert: insertSpy };

        const result = await uploadAndInsertSouvenirMedia(
          {
            museumId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            productId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            imageUrl: 'https://example.com/valid.jpg',
            superadminId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
            bucketName: 'souvenir-media',
          },
          {
            fetchFn: mockFetch as any,
            uploadMediaFn: uploadSpy,
            deleteMediaFn: deleteSpy,
            dbClient: mockDb,
          }
        );

        expect(result.created).toBe(false);
        expect(result.mediaId).toBeNull();
        expect(deleteSpy).toHaveBeenCalledTimes(1);
      });
    });

    describe('Primary Media Detection and High-Level Processor', () => {
      it('returns existing primary media from database when present', async () => {
        const mockDb: any = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: 'media-existing',
                    storagePath: 'mus-1/souvenir/prod-1/file.jpg',
                  },
                ]),
              }),
            }),
          }),
        };

        const result = await getExistingPrimaryMedia('prod-1', mockDb);
        expect(result).toEqual({
          id: 'media-existing',
          storagePath: 'mus-1/souvenir/prod-1/file.jpg',
        });
      });

      it('returns null when no existing primary media is found in database', async () => {
        const mockDb: any = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        };

        const result = await getExistingPrimaryMedia('prod-1', mockDb);
        expect(result).toBeNull();
      });

      it('processProductMedia returns status skipped when skipMedia is true', async () => {
        const uploadSpy = vi.fn();
        const result = await processProductMedia(
          {
            museumId: 'mus-1',
            productId: 'prod-1',
            imageUrl: 'https://example.com/image.jpg',
            superadminId: 'admin-1',
            skipMedia: true,
          },
          { uploadMediaFn: uploadSpy }
        );

        expect(result.status).toBe('skipped');
        expect(uploadSpy).not.toHaveBeenCalled();
      });

      it('processProductMedia returns status existing without uploading when primary media already exists', async () => {
        const uploadSpy = vi.fn();
        const mockDb: any = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: 'media-existing',
                    storagePath: 'mus-1/souvenir/prod-1/file.jpg',
                  },
                ]),
              }),
            }),
          }),
        };

        const result = await processProductMedia(
          {
            museumId: 'mus-1',
            productId: 'prod-1',
            imageUrl: 'https://example.com/image.jpg',
            superadminId: 'admin-1',
            skipMedia: false,
          },
          {
            dbClient: mockDb,
            uploadMediaFn: uploadSpy,
          }
        );

        expect(result.status).toBe('existing');
        expect(result.mediaId).toBe('media-existing');
        expect(result.storagePath).toBe('mus-1/souvenir/prod-1/file.jpg');
        expect(uploadSpy).not.toHaveBeenCalled();
      });

      it('processProductMedia uploads and inserts media when no primary media exists', async () => {
        const jpegBuffer = createValidJpegBuffer(150);
        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers(),
          arrayBuffer: () => Promise.resolve(jpegBuffer.buffer),
        });

        const uploadSpy = vi.fn().mockResolvedValue(undefined);
        const mockDb: any = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]), // No existing media
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 'media-new-1' }]),
              }),
            }),
          }),
        };

        const result = await processProductMedia(
          {
            museumId: 'mus-1',
            productId: 'prod-1',
            imageUrl: 'https://example.com/image.jpg',
            superadminId: 'admin-1',
            skipMedia: false,
          },
          {
            dbClient: mockDb,
            fetchFn: mockFetch as any,
            uploadMediaFn: uploadSpy,
          }
        );

        expect(result.status).toBe('created');
        expect(result.mediaId).toBe('media-new-1');
        expect(uploadSpy).toHaveBeenCalledTimes(1);
      });

      it('logs media error with product ID and SKU and throws when media upload fails', async () => {
        const consoleErrorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const mockFetch = vi
          .fn()
          .mockRejectedValue(new Error('Connection dropped'));

        const mockDb: any = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]), // No existing media
              }),
            }),
          }),
        };

        await expect(
          processProductMedia(
            {
              museumId: 'mus-1',
              productId: 'prod-err-123',
              sku: 'NMNH-MIN-001',
              imageUrl: 'https://example.com/image.jpg',
              superadminId: 'admin-1',
              skipMedia: false,
            },
            {
              dbClient: mockDb,
              fetchFn: mockFetch as any,
            }
          )
        ).rejects.toThrow('Connection dropped');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            '[seed:souvenirs] Media error for product "prod-err-123" (SKU: NMNH-MIN-001)'
          )
        );

        consoleErrorSpy.mockRestore();
      });
    });

    describe('Product Upsert & CreatedBy Guarantee (upsertSouvenirProduct)', () => {
      const sampleItem = SOUVENIR_FIXTURES[0].items[0];

      it('inserts new product with createdBy assigned to superadminId', async () => {
        const valuesSpy = vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'new-prod-id' }]),
          }),
        });
        const insertSpy = vi.fn().mockReturnValue({
          values: valuesSpy,
        });

        const mockDb: any = { insert: insertSpy };

        const result = await upsertSouvenirProduct(
          'mus-uuid-1',
          sampleItem,
          'published',
          'superadmin-uuid-1',
          mockDb
        );

        expect(result).toEqual({ id: 'new-prod-id', action: 'created' });
        expect(valuesSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            museumId: 'mus-uuid-1',
            sku: sampleItem.sku,
            createdBy: 'superadmin-uuid-1',
            status: 'published',
            currency: 'VND',
          })
        );
      });

      it('resolves existing product on conflict without modifying existing data', async () => {
        const insertSpy = vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]), // Conflict -> no returning row
            }),
          }),
        });

        const selectSpy = vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: 'existing-prod-id' }]),
            }),
          }),
        });

        const mockDb: any = {
          insert: insertSpy,
          select: selectSpy,
        };

        const result = await upsertSouvenirProduct(
          'mus-uuid-1',
          sampleItem,
          'published',
          'superadmin-uuid-1',
          mockDb
        );

        expect(result).toEqual({ id: 'existing-prod-id', action: 'existing' });
      });

      it('throws error when conflict occurs but existing product cannot be found', async () => {
        const insertSpy = vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        });

        const selectSpy = vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // Missing!
            }),
          }),
        });

        const mockDb: any = {
          insert: insertSpy,
          select: selectSpy,
        };

        await expect(
          upsertSouvenirProduct(
            'mus-uuid-1',
            sampleItem,
            'published',
            'superadmin-uuid-1',
            mockDb
          )
        ).rejects.toThrow(/Unexpected conflict when inserting product with SKU/);
      });
    });

    describe('End-to-End Orchestration & Media Error Tracking (run)', () => {
      it('seeds 38 products across 6 museums and counts media accurately', async () => {
        const fakeMuseums = SOUVENIR_FIXTURES.map((m, idx) => ({
          id: `00000000-0000-4000-8000-00000000000${idx}`,
          name: m.museumName,
          slug: m.museumSlug,
          status: 'published' as const,
        }));

        let callCount = 0;
        const mockDb: any = {
          select: vi.fn().mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                const wherePromise = Promise.resolve([]) as any;
                wherePromise.limit = vi.fn().mockImplementation(() => {
                  const item = fakeMuseums[callCount++];
                  return Promise.resolve(
                    item
                      ? [item]
                      : [
                          {
                            id: 'mock-existing-media',
                            storagePath: 'mock/path.jpg',
                          },
                        ]
                  );
                });
                return wherePromise;
              }),
            }),
          })),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockResolvedValue([]),
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 'mock-prod-id' }]),
              }),
            }),
          }),
        };

        const mockStorageClient = {
          storage: {
            getBucket: vi.fn().mockResolvedValue({
              data: {
                id: 'souvenir-media',
                name: 'souvenir-media',
                public: true,
              },
              error: null,
            }),
          },
        };

        const result = await run(
          {
            superadminId: '11111111-2222-4333-8444-555555555555',
            status: 'published',
            clean: false,
            skipMedia: false,
          },
          {
            dbClient: mockDb,
            storageClient: mockStorageClient,
          }
        );

        expect(result.museums).toHaveLength(6);
        expect(result.productsSummary.totalItems).toBe(38);
        expect(result.productsSummary.createdCount).toBe(38);
        expect(result.mediaStats.errorCount).toBe(0);
        expect(result.mediaErrors).toBe(0);
      });

      it('logs media errors with product ID and increments mediaErrors when media processing fails', async () => {
        const consoleErrorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});

        const fakeMuseums = SOUVENIR_FIXTURES.map((m, idx) => ({
          id: `00000000-0000-4000-8000-00000000000${idx}`,
          name: m.museumName,
          slug: m.museumSlug,
          status: 'published' as const,
        }));

        let callCount = 0;
        const mockDb: any = {
          select: vi.fn().mockImplementation(() => ({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                const wherePromise = Promise.resolve([]) as any;
                wherePromise.limit = vi.fn().mockImplementation(() => {
                  const item = fakeMuseums[callCount++];
                  return Promise.resolve(item ? [item] : []); // No existing media -> triggers fetch
                });
                return wherePromise;
              }),
            }),
          })),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockResolvedValue([]),
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 'prod-fail-id' }]),
              }),
            }),
          }),
        };

        const mockStorageClient = {
          storage: {
            getBucket: vi.fn().mockResolvedValue({
              data: {
                id: 'souvenir-media',
                name: 'souvenir-media',
                public: true,
              },
              error: null,
            }),
          },
        };

        const mockFetch = vi
          .fn()
          .mockRejectedValue(new Error('Wikimedia timeout'));

        const result = await run(
          {
            superadminId: '11111111-2222-4333-8444-555555555555',
            status: 'published',
            clean: false,
            skipMedia: false,
          },
          {
            dbClient: mockDb,
            storageClient: mockStorageClient,
            fetchFn: mockFetch as any,
          }
        );

        expect(result.productsSummary.totalItems).toBe(38);
        expect(result.mediaStats.errorCount).toBe(38);
        expect(result.mediaErrors).toBe(38);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            '[seed:souvenirs] Media error for product "prod-fail-id"'
          )
        );

        consoleErrorSpy.mockRestore();
      });
    });
  });

  describe('Seed Souvenirs Script - Phase 6 CLI Entrypoint & Execution Orchestration', () => {
    describe('CLI Entrypoint & Process Exit Code (main)', () => {
      it('displays help and exits cleanly when --help or -h is passed', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const closeDbSpy = vi.fn().mockResolvedValue(undefined);
        await main(['--help'], { closeDbFn: closeDbSpy });
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('SOTA Museum Management'));
        consoleSpy.mockRestore();
      });

      it('sets process.exitCode = 1 when run completes with mediaErrors > 0', async () => {
        const consoleErrorSpy = vi
          .spyOn(console, 'error')
          .mockImplementation(() => {});
        const prevExitCode = process.exitCode;
        process.exitCode = undefined;

        try {
          const mockRun = vi.fn().mockResolvedValue({
            museums: [],
            warnings: [],
            storagePreflight: {
              skipped: true,
              bucketName: 'souvenir-media',
              isPublic: true,
            },
            mediaStats: {
              uploadedCount: 0,
              skippedCount: 0,
              existingCount: 0,
              errorCount: 2,
            },
            mediaErrors: 2,
            productsSummary: {
              createdCount: 36,
              existingCount: 0,
              totalItems: 38,
            },
          });

          await main(['--superadmin', '11111111-2222-4333-8444-555555555555'], {
            runFn: mockRun,
            verifySuperadminFn: vi.fn().mockResolvedValue(undefined),
            closeDbFn: vi.fn().mockResolvedValue(undefined),
          });

          expect(process.exitCode).toBe(1);
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(
              'Seeding finished with 2 media error(s). Setting exit code 1.'
            )
          );
        } finally {
          process.exitCode = prevExitCode;
          consoleErrorSpy.mockRestore();
        }
      });

      it('leaves process.exitCode unchanged when run completes with mediaErrors = 0', async () => {
        const prevExitCode = process.exitCode;
        process.exitCode = undefined;

        try {
          const mockRun = vi.fn().mockResolvedValue({
            museums: [],
            warnings: [],
            storagePreflight: {
              skipped: true,
              bucketName: 'souvenir-media',
              isPublic: true,
            },
            mediaStats: {
              uploadedCount: 38,
              skippedCount: 0,
              existingCount: 0,
              errorCount: 0,
            },
            mediaErrors: 0,
            productsSummary: {
              createdCount: 38,
              existingCount: 0,
              totalItems: 38,
            },
          });

          await main(['--superadmin', '11111111-2222-4333-8444-555555555555'], {
            runFn: mockRun,
            verifySuperadminFn: vi.fn().mockResolvedValue(undefined),
            closeDbFn: vi.fn().mockResolvedValue(undefined),
          });

          expect(process.exitCode).toBeUndefined();
        } finally {
          process.exitCode = prevExitCode;
        }
      });

      it('falls back to process.env.SUPERADMIN_ID when no CLI superadmin flag is given', async () => {
        const prevEnv = process.env.SUPERADMIN_ID;
        process.env.SUPERADMIN_ID = '33333333-4444-4555-8666-777777777777';

        try {
          const verifySpy = vi.fn().mockResolvedValue(undefined);
          const runSpy = vi.fn().mockResolvedValue({
            museums: [],
            warnings: [],
            storagePreflight: { skipped: true, bucketName: 'souvenir-media', isPublic: true },
            mediaStats: { uploadedCount: 0, skippedCount: 0, existingCount: 0, errorCount: 0 },
            mediaErrors: 0,
            productsSummary: { createdCount: 0, existingCount: 0, totalItems: 0 },
          });

          await main([], {
            runFn: runSpy,
            verifySuperadminFn: verifySpy,
            closeDbFn: vi.fn().mockResolvedValue(undefined),
          });

          expect(verifySpy).toHaveBeenCalledWith('33333333-4444-4555-8666-777777777777');
          expect(runSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              superadminId: '33333333-4444-4555-8666-777777777777',
            }),
            expect.any(Object)
          );
        } finally {
          process.env.SUPERADMIN_ID = prevEnv;
        }
      });

      it('formats and prints execution summary output via printSeedSummary', () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        try {
          printSeedSummary({
            museums: [
              {
                id: 'mus-1',
                name: 'National Air and Space Museum',
                slug: 'national-air-and-space-museum',
                status: 'published',
              },
            ],
            warnings: ['Sample visibility warning'],
            storagePreflight: {
              skipped: false,
              bucketName: 'souvenir-media',
              isPublic: true,
            },
            cleanSummary: {
              deletedProductsCount: 5,
              deletedMediaCount: 5,
            },
            mediaStats: {
              uploadedCount: 6,
              skippedCount: 1,
              existingCount: 2,
              errorCount: 0,
            },
            mediaErrors: 0,
            productsSummary: {
              createdCount: 6,
              existingCount: 2,
              totalItems: 8,
            },
          });

          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('SOUVENIR & MEDIA SEED EXECUTION SUMMARY')
          );
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('National Air and Space Museum')
          );
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Products deleted: 5')
          );
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Created (new):    6')
          );
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Uploaded:         6')
          );
          expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining('Sample visibility warning')
          );
        } finally {
          logSpy.mockRestore();
        }
      });

      it('catches fatal errors in main, sets process.exitCode = 1, calls closeDb, and rethrows', async () => {
        const prevExitCode = process.exitCode;
        process.exitCode = undefined;
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const closeDbSpy = vi.fn().mockResolvedValue(undefined);

        try {
          const failingVerify = vi.fn().mockRejectedValue(new Error('User not found in database'));

          await expect(
            main(['--superadmin', '11111111-2222-4333-8444-555555555555'], {
              verifySuperadminFn: failingVerify,
              closeDbFn: closeDbSpy,
            })
          ).rejects.toThrow('User not found in database');

          expect(process.exitCode).toBe(1);
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('[seed:souvenirs] Fatal seed error: User not found in database')
          );
          expect(closeDbSpy).toHaveBeenCalledTimes(1);
        } finally {
          process.exitCode = prevExitCode;
          consoleErrorSpy.mockRestore();
        }
      });

      it('registers seed:souvenirs command in package.json', async () => {
        const pkg = await import('../../package.json');
        expect(pkg.scripts['seed:souvenirs']).toBe('tsx scripts/seed-souvenirs.ts');
      });
    });
  });

  describe('Seed Souvenirs Script - Phase 5 Strict Product Idempotency & Media Backfill', () => {
    const createValidJpegBuffer = (length = 120): Buffer => {
      const buf = Buffer.alloc(length, 0x20);
      buf[0] = 0xff;
      buf[1] = 0xd8;
      buf[2] = 0xff;
      return buf;
    };

    const fakeMuseums = SOUVENIR_FIXTURES.map((m, idx) => ({
      id: `00000000-0000-4000-8000-00000000000${idx}`,
      name: m.museumName,
      slug: m.museumSlug,
      status: 'published' as const,
    }));

    const mockStorageClient = {
      storage: {
        getBucket: vi.fn().mockResolvedValue({
          data: {
            id: 'souvenir-media',
            name: 'souvenir-media',
            public: true,
          },
          error: null,
        }),
      },
    };

    it('is fully idempotent: repeat run skips product insertion and media upload without modifying existing data', async () => {
      let museumCallCount = 0;
      const updateSpy = vi.fn();
      const uploadSpy = vi.fn();
      const fetchSpy = vi.fn();

      const mockDb: any = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              const wherePromise = Promise.resolve([]) as any;
              wherePromise.limit = vi.fn().mockImplementation(() => {
                if (museumCallCount < 6) {
                  return Promise.resolve([fakeMuseums[museumCallCount++]]);
                }
                // Product lookup on conflict OR existing primary media check
                return Promise.resolve([
                  {
                    id: 'existing-row-id',
                    storagePath: 'existing/path/image.jpg',
                  },
                ]);
              });
              return wherePromise;
            }),
          }),
        })),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue([]),
            // Conflict occurs on insert for existing product -> returns empty
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        update: updateSpy,
      };

      const result = await run(
        {
          superadminId: '11111111-2222-4333-8444-555555555555',
          status: 'published',
          clean: false,
          skipMedia: false,
        },
        {
          dbClient: mockDb,
          storageClient: mockStorageClient,
          uploadMediaFn: uploadSpy,
          fetchFn: fetchSpy,
        }
      );

      expect(result.productsSummary.totalItems).toBe(38);
      expect(result.productsSummary.createdCount).toBe(0);
      expect(result.productsSummary.existingCount).toBe(38);
      expect(result.mediaStats.uploadedCount).toBe(0);
      expect(result.mediaStats.existingCount).toBe(38);
      expect(result.mediaStats.errorCount).toBe(0);
      expect(uploadSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('automatically backfills missing media for existing products without recreating products', async () => {
      let museumCallCount = 0;
      let isCheckingProduct = true;
      const uploadSpy = vi.fn().mockResolvedValue(undefined);
      const jpegBuffer = createValidJpegBuffer(150);
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(jpegBuffer.buffer),
      });

      const mediaInsertValuesSpy = vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'backfilled-media-id' }]),
        }),
      });

      const mockDb: any = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const wherePromise = Promise.resolve([]) as any;
              wherePromise.limit = vi.fn().mockImplementation(() => {
                if (museumCallCount < 6) {
                  return Promise.resolve([fakeMuseums[museumCallCount++]]);
                }
                // For product lookups on conflict -> return existing product
                if (isCheckingProduct) {
                  isCheckingProduct = false; // Next select call will be for media
                  return Promise.resolve([{ id: 'existing-prod-id' }]);
                }
                // For media check -> return empty array (missing media, triggers backfill!)
                isCheckingProduct = true; // Next select call will be for next product
                return Promise.resolve([]);
              });
              return wherePromise;
            }),
          })),
        })),
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((val) => {
            if (val.entityType === 'souvenir') {
              return mediaInsertValuesSpy(val);
            }
            return {
              onConflictDoUpdate: vi.fn().mockResolvedValue([]),
              // Conflict on product insert
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]),
              }),
            };
          }),
        })),
      };

      const result = await run(
        {
          superadminId: '11111111-2222-4333-8444-555555555555',
          status: 'published',
          clean: false,
          skipMedia: false,
        },
        {
          dbClient: mockDb,
          storageClient: mockStorageClient,
          uploadMediaFn: uploadSpy,
          fetchFn: fetchSpy,
        }
      );

      expect(result.productsSummary.totalItems).toBe(38);
      expect(result.productsSummary.createdCount).toBe(0);
      expect(result.productsSummary.existingCount).toBe(38);
      expect(result.mediaStats.uploadedCount).toBe(38);
      expect(result.mediaStats.existingCount).toBe(0);
      expect(result.mediaStats.errorCount).toBe(0);
      expect(uploadSpy).toHaveBeenCalledTimes(38);

      expect(mediaInsertValuesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'souvenir',
          entityId: 'existing-prod-id',
          isPrimary: true,
          createdBy: '11111111-2222-4333-8444-555555555555',
        })
      );
    });

    it('handles partial backfill when a subset of existing products lack media', async () => {
      let museumCallCount = 0;
      let productLookup = true;
      let mediaCheckIndex = 0;
      const uploadSpy = vi.fn().mockResolvedValue(undefined);
      const jpegBuffer = createValidJpegBuffer(150);
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(jpegBuffer.buffer),
      });

      const mockDb: any = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockImplementation(() => {
              const wherePromise = Promise.resolve([]) as any;
              wherePromise.limit = vi.fn().mockImplementation(() => {
                if (museumCallCount < 6) {
                  return Promise.resolve([fakeMuseums[museumCallCount++]]);
                }
                const idx = mediaCheckIndex++;
                // First 20 items already have media; last 18 items lack media
                if (idx < 20) {
                  return Promise.resolve([
                    { id: `media-${idx}`, storagePath: `path/${idx}.jpg` },
                  ]);
                }
                return Promise.resolve([]); // Missing -> backfill
              });
              return wherePromise;
            }),
          }),
        })),
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((val) => {
            if (val.entityType === 'souvenir') {
              return {
                onConflictDoNothing: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([{ id: 'backfilled-id' }]),
                }),
              };
            }
            return {
              onConflictDoUpdate: vi.fn().mockResolvedValue([]),
              onConflictDoNothing: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: 'prod-id' }]),
              }),
            };
          }),
        })),
      };

      const result = await run(
        {
          superadminId: '11111111-2222-4333-8444-555555555555',
          status: 'published',
          clean: false,
          skipMedia: false,
        },
        {
          dbClient: mockDb,
          storageClient: mockStorageClient,
          uploadMediaFn: uploadSpy,
          fetchFn: fetchSpy,
        }
      );

      expect(result.productsSummary.totalItems).toBe(38);
      expect(result.mediaStats.uploadedCount).toBe(18);
      expect(result.mediaStats.existingCount).toBe(20);
      expect(uploadSpy).toHaveBeenCalledTimes(18);
    });

    it('preserves existing product data on conflict and never updates attributes', async () => {
      const sampleItem = SOUVENIR_FIXTURES[0].items[0];
      const updateSpy = vi.fn();

      const mockDb: any = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]), // Conflict
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 'preserved-prod-id',
                  price: '999999.00', // Modified price in DB
                  stockQuantity: 5,
                },
              ]),
            }),
          }),
        }),
        update: updateSpy,
      };

      const result = await upsertSouvenirProduct(
        'mus-1',
        sampleItem,
        'published',
        'superadmin-1',
        mockDb
      );

      expect(result).toEqual({ id: 'preserved-prod-id', action: 'existing' });
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('throws descriptive error if product insertion fails with conflict but SKU lookup returns empty', async () => {
      const sampleItem = SOUVENIR_FIXTURES[0].items[0];

      const mockDb: any = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]), // Conflict
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // Not found
            }),
          }),
        }),
      };

      await expect(
        upsertSouvenirProduct(
          'mus-1',
          sampleItem,
          'published',
          'superadmin-1',
          mockDb
        )
      ).rejects.toThrow(
        `Unexpected conflict when inserting product with SKU "${sampleItem.sku}" in museum "mus-1": no existing product found.`
      );
    });
  });

  describe('Seed Souvenirs Script - Phase 7 Comprehensive Test Suite Verification', () => {
    it('throws when --status flag is supplied without a value at end of arguments', () => {
      expect(() => parseCliArgs(['--status'])).toThrow(
        /Invalid status "undefined". Allowed values: 'draft' | 'published'./
      );
    });

    it('throws when --superadmin-id flag is supplied without a value at end of arguments', () => {
      const parsed = parseCliArgs(['--superadmin-id']);
      expect(() => validateSeedConfig(parsed)).toThrow(
        /Superadmin ID is required. Pass it via flag: --superadmin <uuid>/
      );
    });

    it('rejects --clean when NODE_ENV is test but DATABASE_URL host is a remote cloud instance', () => {
      expect(() =>
        assertSafeCleanEnvironment({
          nodeEnv: 'test',
          databaseUrl: 'postgresql://postgres:secret@db.test.cloud.com:5432/postgres',
        })
      ).toThrow(/is not in the local\/test allowlist/);
    });

    it('orchestrates clean and skip-media combined without attempting media bucket preflight or upload', async () => {
      const fakeMuseums = SOUVENIR_FIXTURES.map((m, idx) => ({
        id: `00000000-0000-4000-8000-00000000000${idx}`,
        name: m.museumName,
        slug: m.museumSlug,
        status: 'published' as const,
      }));

      let museumIdx = 0;
      const deleteMediaSpy = vi.fn().mockResolvedValue(undefined);
      const uploadMediaSpy = vi.fn().mockResolvedValue(undefined);
      const fetchSpy = vi.fn();

      const mockDb: any = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => {
              const wherePromise = Promise.resolve([]) as any;
              wherePromise.limit = vi.fn().mockImplementation(() => {
                if (museumIdx < 6) {
                  return Promise.resolve([fakeMuseums[museumIdx++]]);
                }
                return Promise.resolve([]);
              });
              return wherePromise;
            }),
          })),
        })),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue([]),
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'new-product-id' }]),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
        transaction: vi.fn().mockImplementation(async (cb: any) => {
          const txMock: any = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue([]),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          };
          return cb(txMock);
        }),
      };

      const result = await run(
        {
          superadminId: '11111111-2222-4333-8444-555555555555',
          status: 'published',
          clean: true,
          skipMedia: true,
        },
        {
          dbClient: mockDb,
          deleteMediaFn: deleteMediaSpy,
          uploadMediaFn: uploadMediaSpy,
          fetchFn: fetchSpy,
          nodeEnv: 'development',
          databaseUrl: 'postgresql://postgres:pass@localhost:5432/postgres',
        }
      );

      expect(result.storagePreflight.skipped).toBe(true);
      expect(result.cleanSummary).toBeDefined();
      expect(result.mediaStats.skippedCount).toBe(38);
      expect(result.mediaStats.uploadedCount).toBe(0);
      expect(uploadMediaSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('validates all 38 fixture items across 6 museums have required attributes and valid price ranges', () => {
      let totalItemCount = 0;
      for (const museum of SOUVENIR_FIXTURES) {
        expect(museum.items.length).toBeGreaterThanOrEqual(5);
        expect(museum.items.length).toBeLessThanOrEqual(10);

        for (const item of museum.items) {
          totalItemCount++;
          expect(item.name.trim().length).toBeGreaterThan(0);
          expect(item.description.trim().length).toBeGreaterThanOrEqual(20);
          expect(item.currency).toBe('VND');

          const numPrice = Number(item.price);
          expect(numPrice).toBeGreaterThanOrEqual(50000);
          expect(numPrice).toBeLessThanOrEqual(1200000);

          expect(item.stockQuantity).toBeGreaterThanOrEqual(20);
          expect(item.stockQuantity).toBeLessThanOrEqual(100);

          expect(item.imageUrl).toMatch(/^https:\/\//);
        }
      }
      expect(totalItemCount).toBe(38);
    });

    it('validates all 38 souvenir fixture items have complete media provenance', () => {
      for (const museum of SOUVENIR_FIXTURES) {
        for (const item of museum.items) {
          expect(item.sourcePageUrl).toMatch(/^https:\/\//);
          expect(
            ['Public Domain', 'CC0'].includes(item.mediaRights)
          ).toBe(true);
        }
      }
    });
  });
