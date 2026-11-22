import { describe, expect, it, vi } from 'vitest';
import {
  findOrCreateMuseum,
  parseCliArgs,
  processArtifactMedia,
  runSeedMuseums,
  SEED_MUSEUMS,
  validateSeedMuseumsConfig,
  verifySuperadminExists,
  type SeedMuseumDefinition,
} from '../../scripts/seed-museums';

describe('Seed Museums Script (scripts/seed-museums.ts)', () => {
  describe('parseCliArgs', () => {
    it('parses --superadmin and alias flags correctly', () => {
      const uuid = '11111111-1111-4111-8111-111111111111';

      expect(parseCliArgs(['--superadmin', uuid])).toEqual({
        superadminId: uuid,
      });

      expect(parseCliArgs(['--superadmin-id', uuid])).toEqual({
        superadminId: uuid,
      });

      expect(parseCliArgs(['-s', uuid])).toEqual({
        superadminId: uuid,
      });

      expect(parseCliArgs([`--superadmin=${uuid}`])).toEqual({
        superadminId: uuid,
      });

      expect(parseCliArgs([`--superadmin-id=${uuid}`])).toEqual({
        superadminId: uuid,
      });

      expect(parseCliArgs([uuid])).toEqual({
        superadminId: uuid,
      });
    });

    it('parses options flags: --target-count, --status, --api-key', () => {
      const uuid = '11111111-1111-4111-8111-111111111111';
      const parsed = parseCliArgs([
        '-s',
        uuid,
        '--target-count',
        '45',
        '--status',
        'draft',
        '--api-key',
        'my-key',
      ]);

      expect(parsed).toEqual({
        superadminId: uuid,
        targetCount: 45,
        status: 'draft',
        apiKey: 'my-key',
      });
    });

    it('parses --skip-media and --clean flags', () => {
      const uuid = '11111111-1111-4111-8111-111111111111';
      const parsed = parseCliArgs(['-s', uuid, '--skip-media', '--clean']);

      expect(parsed).toEqual({
        superadminId: uuid,
        skipMedia: true,
        clean: true,
      });
    });
  });

  describe('validateSeedMuseumsConfig', () => {
    it('rejects execution in production environment', () => {
      expect(() =>
        validateSeedMuseumsConfig({
          nodeEnv: 'production',
          apiKey: 'key',
          superadminId: '11111111-1111-4111-8111-111111111111',
        })
      ).toThrow(/Refusing to run seed script in production environment/);
    });

    it('requires SMITHSONIAN_API_KEY', () => {
      expect(() =>
        validateSeedMuseumsConfig({
          apiKey: '',
          superadminId: '11111111-1111-4111-8111-111111111111',
        })
      ).toThrow(/SMITHSONIAN_API_KEY is required/);
    });

    it('requires superadminId', () => {
      expect(() =>
        validateSeedMuseumsConfig({
          apiKey: 'valid-key',
          superadminId: '',
        })
      ).toThrow(/Superadmin ID is required/);
    });

    it('validates superadminId as UUID', () => {
      expect(() =>
        validateSeedMuseumsConfig({
          apiKey: 'valid-key',
          superadminId: 'not-a-uuid',
        })
      ).toThrow(/must be a valid UUID/);
    });

    it('applies defaults for valid config (targetCount: 50, status: published)', () => {
      const config = validateSeedMuseumsConfig({
        apiKey: 'valid-key',
        superadminId: '11111111-1111-4111-8111-111111111111',
      });

      expect(config).toEqual({
        apiKey: 'valid-key',
        superadminId: '11111111-1111-4111-8111-111111111111',
        targetCount: 50,
        status: 'published',
        skipMedia: false,
        clean: false,
      });
    });
  });

  describe('SEED_MUSEUMS list', () => {
    it('contains exactly the 6 requested museums with mapped Smithsonian queries', () => {
      expect(SEED_MUSEUMS).toHaveLength(6);

      const expectedNames = [
        'National Museum of Natural History',
        'National Air and Space Museum',
        'National Museum of American History',
        'National Portrait Gallery',
        'Hirshhorn Museum and Sculpture Garden',
        'National Museum of Asian Art',
      ];

      expect(SEED_MUSEUMS.map((m) => m.name)).toEqual(expectedNames);

      for (const m of SEED_MUSEUMS) {
        expect(m.slug).toBeTruthy();
        expect(m.city).toBe('Washington, D.C.');
        expect(m.smithsonianQuery).toContain('online_media_type:Images');
      }
    });
  });

  describe('verifySuperadminExists', () => {
    it('succeeds when superadmin exists in users table and has super_admin role', async () => {
      const superadminId = '11111111-1111-4111-8111-111111111111';

      const mockDb = {
        select: vi.fn((fields: Record<string, unknown>) => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => {
                if ('id' in fields) {
                  return [{ id: superadminId }];
                }
                if ('role' in fields) {
                  return [{ role: 'super_admin' }];
                }
                return [];
              }),
            })),
          })),
        })),
      };

      await expect(
        verifySuperadminExists(superadminId, mockDb as unknown as Parameters<typeof verifySuperadminExists>[1])
      ).resolves.toBeUndefined();
    });

    it('throws when user does not exist in users table', async () => {
      const missingId = '99999999-9999-4999-8999-999999999999';

      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
          })),
        })),
      };

      await expect(
        verifySuperadminExists(missingId, mockDb as unknown as Parameters<typeof verifySuperadminExists>[1])
      ).rejects.toThrow(/Superadmin user with ID .* was not found in database/);
    });
  });

  describe('findOrCreateMuseum', () => {
    it('returns existing museum when matching slug/name is found', async () => {
      const superadminId = '11111111-1111-4111-8111-111111111111';
      const existingId = '22222222-2222-4222-8222-222222222222';

      const insertAdminValues = vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      });

      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [
                { id: existingId, name: 'National Museum of Natural History' },
              ]),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          values: insertAdminValues,
        })),
      };

      const result = await findOrCreateMuseum(
        SEED_MUSEUMS[0],
        { superadminId, status: 'published' },
        mockDb as unknown as Parameters<typeof findOrCreateMuseum>[2]
      );

      expect(result).toEqual({
        id: existingId,
        name: 'National Museum of Natural History',
        isCreated: false,
      });

      expect(insertAdminValues).toHaveBeenCalledWith(
        expect.objectContaining({
          museumId: existingId,
          userId: superadminId,
          status: 'active',
        })
      );
    });

    it('creates new museum when not found in database', async () => {
      const superadminId = '11111111-1111-4111-8111-111111111111';
      const newMuseumId = '33333333-3333-4333-8333-333333333333';

      const insertMuseumReturning = vi.fn().mockResolvedValue([
        { id: newMuseumId, name: 'National Air and Space Museum' },
      ]);
      const insertMuseumValues = vi.fn().mockReturnValue({
        returning: insertMuseumReturning,
      });

      const insertAdminValues = vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      });

      let insertCallCount = 0;
      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
          })),
        })),
        insert: vi.fn(() => {
          insertCallCount++;
          if (insertCallCount === 1) {
            return { values: insertMuseumValues };
          }
          return { values: insertAdminValues };
        }),
      };

      const result = await findOrCreateMuseum(
        SEED_MUSEUMS[1],
        { superadminId, status: 'published' },
        mockDb as unknown as Parameters<typeof findOrCreateMuseum>[2]
      );

      expect(result).toEqual({
        id: newMuseumId,
        name: 'National Air and Space Museum',
        isCreated: true,
      });

      expect(insertMuseumValues).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'National Air and Space Museum',
          slug: 'national-air-and-space-museum',
          status: 'published',
          createdBy: superadminId,
        })
      );

      expect(insertAdminValues).toHaveBeenCalledWith(
        expect.objectContaining({
          museumId: newMuseumId,
          userId: superadminId,
          status: 'active',
        })
      );
    });
  });

  describe('runSeedMuseums orchestration', () => {
    it('skips Smithsonian API fetch if museum already has >= targetCount artifacts', async () => {
      const superadminId = '11111111-1111-4111-8111-111111111111';
      const museumId = '44444444-4444-4444-8444-444444444444';

      const mockDb = {
        select: vi.fn((fields: Record<string, unknown>) => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => {
                if ('role' in fields) return [{ role: 'super_admin' }];
                if ('name' in fields) return [{ id: museumId, name: 'Single Test Museum' }];
                if ('id' in fields) return [{ id: superadminId }];
                return [{ id: museumId, name: 'Single Test Museum' }];
              }),
              then: (resolve: (rows: unknown[]) => void) =>
                resolve([{ count: 50 }]),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            onConflictDoNothing: vi.fn().mockResolvedValue([]),
          })),
        })),
      };

      const mockFetch = vi.fn();

      const testMuseumList: SeedMuseumDefinition[] = [
        {
          name: 'Single Test Museum',
          slug: 'single-test-museum',
          description: 'Desc',
          address: 'Address',
          city: 'Washington, D.C.',
          smithsonianQuery: 'unit_code:TEST AND online_media_type:Images',
        },
      ];

      const results = await runSeedMuseums({
        superadminId,
        targetCount: 50,
        status: 'published',
        apiKey: 'test-api-key',
        museumsList: testMuseumList,
        dbClient: mockDb as unknown as Parameters<typeof runSeedMuseums>[0]['dbClient'],
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(results).toHaveLength(1);
      expect(results[0].artifactsInserted).toBe(0);
      expect(results[0].artifactsTotal).toBe(50);
      // Smithsonian API was not fetched because targetCount was already satisfied
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('fetches and inserts artifacts when museum has fewer than targetCount artifacts', async () => {
      const superadminId = '11111111-1111-4111-8111-111111111111';
      const museumId = '55555555-5555-4555-8555-555555555555';

      let countQueried = false;

      const mockDb = {
        select: vi.fn((fields: Record<string, unknown>) => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => {
                if ('role' in fields) return [{ role: 'super_admin' }];
                if ('name' in fields) return [{ id: museumId, name: 'Single Test Museum' }];
                if ('id' in fields) return [{ id: superadminId }];
                return [{ id: museumId, name: 'Single Test Museum' }];
              }),
              then: (resolve: (rows: unknown[]) => void) => {
                if (!countQueried) {
                  countQueried = true;
                  return resolve([{ count: 0 }]); // currently 0 artifacts
                }
                return resolve([{ id: museumId }]);
              },
            })),
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'art-1' }, { id: 'art-2' }]),
            }),
          })),
        })),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          response: {
            rowCount: 2,
            rows: [
              {
                id: 'edanmdm-test-1',
                title: 'Test Artifact 1',
                content: {
                  descriptiveNonRepeating: {
                    record_ID: 'test-1',
                    metadata_usage: { access: 'CC0' },
                  },
                },
              },
              {
                id: 'edanmdm-test-2',
                title: 'Test Artifact 2',
                content: {
                  descriptiveNonRepeating: {
                    record_ID: 'test-2',
                    metadata_usage: { access: 'CC0' },
                  },
                },
              },
            ],
          },
        }),
      });

      const testMuseumList: SeedMuseumDefinition[] = [
        {
          name: 'Single Test Museum',
          slug: 'single-test-museum',
          description: 'Desc',
          address: 'Address',
          city: 'Washington, D.C.',
          smithsonianQuery: 'unit_code:TEST AND online_media_type:Images',
        },
      ];

      const results = await runSeedMuseums({
        superadminId,
        targetCount: 2,
        status: 'published',
        apiKey: 'test-api-key',
        museumsList: testMuseumList,
        dbClient: mockDb as unknown as Parameters<typeof runSeedMuseums>[0]['dbClient'],
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(results).toHaveLength(1);
      expect(results[0].museumName).toBe('Single Test Museum');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(results[0].artifactsInserted).toBe(2);
      expect(results[0].artifactsTotal).toBe(2);
    });
  });

  describe('processArtifactMedia', () => {
    it('downloads valid JPEG image, uploads to storage and inserts media_assets record', async () => {
      // Valid JPEG header bytes: FF D8 FF E0 + padding
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(100).fill(0)]);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => jpegBuffer.buffer,
      });

      const mockUploadMedia = vi.fn().mockResolvedValue(undefined);
      const insertMediaValues = vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      });
      const mockDb = {
        insert: vi.fn(() => ({
          values: insertMediaValues,
        })),
      };

      const storagePath = await processArtifactMedia(
        {
          museumId: '11111111-1111-4111-8111-111111111111',
          artifactId: '22222222-2222-4222-8222-222222222222',
          imageUrl: 'https://ids.si.edu/sample.jpg',
          superadminId: '33333333-3333-4333-8333-333333333333',
        },
        mockFetch as unknown as typeof fetch,
        mockUploadMedia as unknown as typeof import('../../src/lib/storage').uploadMedia,
        mockDb as unknown as Parameters<typeof processArtifactMedia>[3]
      );

      expect(storagePath).toBeTruthy();
      expect(mockUploadMedia).toHaveBeenCalledWith(
        'museum-media',
        storagePath,
        expect.any(Buffer),
        'image/jpeg'
      );
      expect(insertMediaValues).toHaveBeenCalledWith(
        expect.objectContaining({
          museumId: '11111111-1111-4111-8111-111111111111',
          entityId: '22222222-2222-4222-8222-222222222222',
          entityType: 'artifact',
          mediaType: 'image',
          storageBucket: 'museum-media',
          isPrimary: true,
        })
      );
    });
  });
});
