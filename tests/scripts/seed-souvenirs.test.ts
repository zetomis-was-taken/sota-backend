import { describe, expect, it, vi } from 'vitest';
import provenanceManifest from '../../scripts/fixtures/souvenir-media-provenance.json';
import { SEED_MUSEUMS } from '../../scripts/seed-museums';
import {
  assertSafeCleanEnvironment,
  buildProductSeedData,
  checkCatalogVisibilityWarning,
  checkForeignKeyReferences,
  checkStorageBucketPreflight,
  cleanAllManagedSouvenirs,
  cleanExistingManagedSouvenirs,
  findOrCreateMuseum,
  getManagedSkus,
  MANAGED_SKUS,
  parseCliArgs,
  precheckManagedSouvenirsForeignKeys,
  run,
  runStoragePreflight,
  SOUVENIR_FIXTURES,
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

    it('proves actual usage rights by reconciling every fixture item with audited provenance metadata', () => {
      expect(provenanceManifest.totalAssets).toBe(38);
      expect(provenanceManifest.assets).toHaveLength(38);

      const auditedMap = new Map(
        provenanceManifest.assets.map((asset) => [asset.sku, asset])
      );
      const uniqueImageUrls = new Set<string>();

      for (const museum of SOUVENIR_FIXTURES) {
        for (const item of museum.items) {
          const audited = auditedMap.get(item.sku);

          expect(
            audited,
            `Missing audited provenance record for fixture item SKU "${item.sku}"`
          ).toBeDefined();

          if (!audited) continue;

          // Reconcile sourcePageUrl with audited record
          expect(
            item.sourcePageUrl,
            `sourcePageUrl for SKU "${item.sku}" must match audited provenance page`
          ).toBe(audited.sourcePageUrl);

          // Reconcile direct download imageUrl with audited record
          expect(
            item.imageUrl,
            `imageUrl for SKU "${item.sku}" must match audited direct download URL`
          ).toBe(audited.imageUrl);

          // Reconcile MIME type with audited record
          expect(
            item.imageMimeType,
            `MIME type for SKU "${item.sku}" must match audited MIME type`
          ).toBe(audited.imageMimeType);

          // Reconcile mediaRights with audited record
          expect(
            item.mediaRights,
            `mediaRights for SKU "${item.sku}" must match audited rights`
          ).toBe(audited.mediaRights);

          // Reconcile mediaCredit with audited provenance record
          expect(
            item.mediaCredit,
            `mediaCredit for SKU "${item.sku}" must match audited provenance credit`
          ).toBe(audited.mediaCredit);

          // Prove that the actual source page metadata declares Public domain or CC0
          const validRawLicense =
            /public domain/i.test(audited.rawLicense) ||
            /cc-?0/i.test(audited.rawLicense);
          expect(
            validRawLicense,
            `Source page for SKU "${item.sku}" must declare Public domain or CC0, got "${audited.rawLicense}"`
          ).toBe(true);

          // Verify memory safety constraint (file size <= 10MB)
          expect(
            audited.fileSizeBytes,
            `Asset file size for SKU "${item.sku}" exceeds 10MB limit: ${audited.fileSizeBytes} bytes`
          ).toBeLessThanOrEqual(10 * 1024 * 1024);

          // Verify unique image URL per product
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

    it('throws when an invalid --status flag value is passed', () => {
      expect(() => parseCliArgs(['--status', 'archived'])).toThrow(
        /Invalid status "archived"/
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

    it('warns if user exists in users table but lacks super_admin role', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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

      await verifySuperadminExists('valid-user-id', mockDb);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("does not have the 'super_admin' role")
      );

      warnSpy.mockRestore();
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
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(() => {
                const item = fakeMuseums[callCount++];
                return Promise.resolve(item ? [item] : []);
              }),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue([]),
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

      const mockDb: any = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]), // Museum does not exist -> creates new
            }),
          }),
        }),
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((val) => {
            if (val.slug) {
              insertedMuseumStatus = val.status;
            }
            return {
              returning: vi.fn().mockResolvedValue([createdMuseum]),
              onConflictDoUpdate: vi.fn().mockResolvedValue([]),
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
});
