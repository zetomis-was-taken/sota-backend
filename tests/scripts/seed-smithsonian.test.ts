import { describe, expect, it, vi } from 'vitest';
import {
  fetchEligibleRecords,
  fetchSmithsonianPage,
  maskApiKeyInUrl,
  parseSmithsonianRecord,
  runSeed,
  seedSmithsonianArtifacts,
  validateSeedConfig,
  verifyMuseumExists,
  type ValidatedSmithsonianArtifact,
} from '../../scripts/seed-smithsonian';

const documentedSmithsonianRecord = {
  id: 'edanmdm-chndm_1968-111-1',
  title: 'Drawing, Design for a Ceiling, 18th century',
  unitCode: 'CHNDM',
  type: 'edanmdm',
  content: {
    descriptiveNonRepeating: {
      record_ID: 'chndm_1968-111-1',
      title: {
        label: 'Title',
        content: 'Drawing, Design for a Ceiling, 18th century',
      },
      record_link: 'https://collection.cooperhewitt.org/objects/18492005/',
      unit_code: 'CHNDM',
      metadata_usage: {
        text: 'CC0',
        access: 'CC0',
      },
      data_source: 'Cooper Hewitt, Smithsonian Design Museum',
    },
    indexedStructured: {
      date: ['18th century'],
      usage_flag: ['CC0'],
    },
    freetext: {
      date: [{ label: 'Date', content: 'ca. 1780' }],
      creditLine: [
        { label: 'Credit Line', content: 'Museum purchase through gift of Eleanor Garnier Hewitt' },
      ],
      notes: [
        {
          label: 'Description',
          content: 'Pen and ink drawing of an elaborate architectural ceiling design with neoclassical motifs.',
        },
      ],
    },
  },
};

describe('Smithsonian record mapping and seed (Phase 6.2)', () => {
  it('maps a documented record id, title, period, source URL, metadata rights and credit', () => {
    const parsed = parseSmithsonianRecord(documentedSmithsonianRecord);

    expect(parsed).not.toBeNull();
    expect(parsed?.sourceId).toBe('edanmdm-chndm_1968-111-1');
    expect(parsed?.name).toBe('Drawing, Design for a Ceiling, 18th century');
    expect(parsed?.period).toBe('ca. 1780');
    expect(parsed?.sourceUrl).toBe('https://collection.cooperhewitt.org/objects/18492005/');
    expect(parsed?.sourceRights).toBe('CC0');
    expect(parsed?.sourceCredit).toBe('Museum purchase through gift of Eleanor Garnier Hewitt');
    expect(parsed?.description).toBe(
      'Pen and ink drawing of an elaborate architectural ceiling design with neoclassical motifs.'
    );
  });

  it('strictly requires access === "CC0" as the sufficient condition and preserves verbatim text', () => {
    // 1. access is Restricted but text says CC0 (must be rejected because access is authoritative)
    const accessRestrictedTextCC0 = {
      id: 'edanmdm-conflict-1',
      title: 'Conflicting Record 1',
      content: {
        descriptiveNonRepeating: {
          record_ID: 'conflict-1',
          metadata_usage: {
            access: 'Restricted',
            text: 'CC0',
          },
        },
      },
    };
    expect(parseSmithsonianRecord(accessRestrictedTextCC0)).toBeNull();

    // 2. access is Restricted and text mentions "CC0 is not applicable" (rejected)
    const accessRestrictedTextNotApplicable = {
      id: 'edanmdm-conflict-2',
      title: 'Conflicting Record 2',
      content: {
        descriptiveNonRepeating: {
          record_ID: 'conflict-2',
          metadata_usage: {
            access: 'Restricted',
            text: 'CC0 is not applicable',
          },
        },
      },
    };
    expect(parseSmithsonianRecord(accessRestrictedTextNotApplicable)).toBeNull();

    // 3. Record with only usage_flag = ['CC0'] but missing metadata_usage.access === 'CC0'
    const usageFlagOnlyRecord = {
      id: 'edanmdm-usage-flag-only',
      title: 'Artifact With Only Usage Flag',
      content: {
        descriptiveNonRepeating: {
          record_ID: 'usage-flag-only',
        },
        indexedStructured: {
          usage_flag: ['CC0'],
        },
      },
    };
    expect(parseSmithsonianRecord(usageFlagOnlyRecord)).toBeNull();

    // 4. Missing metadata_usage entirely
    const missingUsageRecord = {
      id: 'edanmdm-missing-usage',
      title: 'Unspecified Usage Object',
      content: {
        descriptiveNonRepeating: {
          record_ID: 'missing-usage',
        },
      },
    };
    expect(parseSmithsonianRecord(missingUsageRecord)).toBeNull();

    // 5. Valid: access is CC0 without text, sourceRights defaults to canonical access value 'CC0'
    const accessCC0NoText = {
      id: 'edanmdm-valid-no-text',
      title: 'Valid CC0 Object',
      content: {
        descriptiveNonRepeating: {
          record_ID: 'valid-no-text',
          metadata_usage: {
            access: 'CC0',
          },
        },
      },
    };
    const parsedValid = parseSmithsonianRecord(accessCC0NoText);
    expect(parsedValid).not.toBeNull();
    expect(parsedValid?.sourceRights).toBe('CC0');

    // 6. Valid: access is CC0 and text contains descriptive statement preserved verbatim
    const accessCC0WithFullText = {
      id: 'edanmdm-valid-full-text',
      title: 'Valid CC0 Full Text Object',
      content: {
        descriptiveNonRepeating: {
          record_ID: 'valid-full-text',
          metadata_usage: {
            access: 'CC0',
            text: 'Creative Commons Zero (CC0 1.0 Universal)',
          },
        },
      },
    };
    const parsedFullText = parseSmithsonianRecord(accessCC0WithFullText);
    expect(parsedFullText).not.toBeNull();
    expect(parsedFullText?.sourceRights).toBe('Creative Commons Zero (CC0 1.0 Universal)');
  });

  it('fetches pages until targetCount eligible records or rowCount exhausted', async () => {
    const generateRows = (startIdx: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `edanmdm-item-${startIdx + i}`,
        title: `Smithsonian Artifact ${startIdx + i}`,
        content: {
          descriptiveNonRepeating: {
            record_ID: `item-${startIdx + i}`,
            record_link: `https://si.edu/item/${startIdx + i}`,
            metadata_usage: { access: 'CC0', text: 'CC0' },
          },
        },
      }));

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const parsedUrl = new URL(url);
      const start = Number(parsedUrl.searchParams.get('start')) || 0;

      if (start === 0) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            response: {
              rowCount: 60,
              rows: generateRows(1, 30),
            },
          }),
        };
      } else {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            response: {
              rowCount: 60,
              rows: generateRows(31, 30),
            },
          }),
        };
      }
    });

    const result = await fetchEligibleRecords(
      'test-api-key',
      50,
      'online_media_type:Images',
      mockFetch as unknown as typeof fetch
    );

    expect(result.records).toHaveLength(50);
    expect(result.records[0].sourceId).toBe('edanmdm-item-1');
    expect(result.records[49].sourceId).toBe('edanmdm-item-50');
    expect(result.hitPageLimit).toBe(false);
    expect(result.pagesFetched).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify pagination stops if rowCount reached
    const mockExhaustedFetch = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        response: {
          rowCount: 10,
          rows: generateRows(1, 10),
        },
      }),
    }));

    const exhaustedResult = await fetchEligibleRecords(
      'test-api-key',
      50,
      'query',
      mockExhaustedFetch as unknown as typeof fetch
    );
    expect(exhaustedResult.records).toHaveLength(10);
    expect(exhaustedResult.hitPageLimit).toBe(false);
    expect(exhaustedResult.isExhausted).toBe(true);
    expect(mockExhaustedFetch).toHaveBeenCalledTimes(1);
  });

  it('identifies and reports partial results when hitting maxPages limit', async () => {
    // API returns 1 eligible row per page but rowCount is 1000
    const mockLimitedFetch = vi.fn().mockImplementation(async (url: string) => {
      const parsedUrl = new URL(url);
      const start = Number(parsedUrl.searchParams.get('start')) || 0;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          response: {
            rowCount: 1000,
            rows: [
              {
                id: `edanmdm-page-${start}`,
                title: `Artifact Page ${start}`,
                content: {
                  descriptiveNonRepeating: {
                    record_ID: `page-${start}`,
                    metadata_usage: { access: 'CC0', text: 'CC0' },
                  },
                },
              },
            ],
          },
        }),
      };
    });

    const result = await fetchEligibleRecords(
      'test-api-key',
      50,
      'query',
      mockLimitedFetch as unknown as typeof fetch,
      3 // maxPages = 3
    );

    expect(result.records).toHaveLength(3);
    expect(result.hitPageLimit).toBe(true);
    expect(result.isExhausted).toBe(false);
    expect(result.pagesFetched).toBe(3);
    expect(mockLimitedFetch).toHaveBeenCalledTimes(3);

    // Verify runSeed passes hitPageLimit and flags isPartial: true
    const validMuseumId = '11111111-1111-4111-8111-111111111111';
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ id: validMuseumId }]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => [{ id: 'new-uuid' }]),
          })),
        })),
      })),
    };

    const seedResult = await runSeed({
      apiKey: 'test-api-key',
      museumId: validMuseumId,
      targetCount: 50,
      dbClient: mockDb as unknown as Parameters<typeof verifyMuseumExists>[1],
      fetchFn: mockLimitedFetch as unknown as typeof fetch,
      maxPages: 3,
    });

    expect(seedResult.totalEligible).toBe(3);
    expect(seedResult.inserted).toBe(3);
    expect(seedResult.hitPageLimit).toBe(true);
    expect(seedResult.isPartial).toBe(true);
  });

  it('stops and reports an API error for non-2xx or malformed JSON responses without leaking API key', async () => {
    // 403 Forbidden
    const mock403Fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    await expect(
      fetchSmithsonianPage('secret-key-123', 'query', 0, 10, mock403Fetch as unknown as typeof fetch)
    ).rejects.toThrow(/Smithsonian API returned HTTP 403/);

    // Unparseable JSON syntax
    const mockBadJsonFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    });

    await expect(
      fetchSmithsonianPage('secret-key-123', 'query', 0, 10, mockBadJsonFetch as unknown as typeof fetch)
    ).rejects.toThrow(/Failed to parse JSON response/);

    // Ensure API key is masked in error message
    try {
      await fetchSmithsonianPage('super_secret_token_abc', 'query', 0, 10, mock403Fetch as unknown as typeof fetch);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).not.toContain('super_secret_token_abc');
      expect(message).toContain('api_key=***');
    }
  });

  it('rejects valid JSON with malformed response structures', async () => {
    const makeMockFetch = (jsonPayload: unknown) =>
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => jsonPayload,
      });

    // 1. Missing "response" key
    await expect(
      fetchSmithsonianPage('k', 'q', 0, 10, makeMockFetch({ other: 'value' }) as unknown as typeof fetch)
    ).rejects.toThrow(/Malformed response structure/);

    // 2. response is null
    await expect(
      fetchSmithsonianPage('k', 'q', 0, 10, makeMockFetch({ response: null }) as unknown as typeof fetch)
    ).rejects.toThrow(/Malformed response structure/);

    // 3. rows is not an array
    await expect(
      fetchSmithsonianPage(
        'k',
        'q',
        0,
        10,
        makeMockFetch({ response: { rows: 'not-an-array', rowCount: 10 } }) as unknown as typeof fetch
      )
    ).rejects.toThrow(/Malformed response structure/);

    // 4. rowCount is not a number
    await expect(
      fetchSmithsonianPage(
        'k',
        'q',
        0,
        10,
        makeMockFetch({ response: { rows: [], rowCount: '10' } }) as unknown as typeof fetch
      )
    ).rejects.toThrow(/Malformed response structure/);

    // 5. rowCount is negative
    await expect(
      fetchSmithsonianPage(
        'k',
        'q',
        0,
        10,
        makeMockFetch({ response: { rows: [], rowCount: -1 } }) as unknown as typeof fetch
      )
    ).rejects.toThrow(/Malformed response structure/);
  });

  it('verifies museum exists before calling Smithsonian API and does not fetch if museum is invalid', async () => {
    const mockDbMissingMuseum = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
    };

    const mockFetch = vi.fn();

    await expect(
      runSeed({
        apiKey: 'test-api-key',
        museumId: '11111111-1111-4111-8111-111111111111',
        dbClient: mockDbMissingMuseum as unknown as Parameters<typeof verifyMuseumExists>[1],
        fetchFn: mockFetch as unknown as typeof fetch,
      })
    ).rejects.toThrow(/Target museum not found: 11111111-1111-4111-8111-111111111111/);

    // API must NEVER be called if the museum does not exist in the database
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rerun does not create duplicate (source_system, source_id) records', async () => {
    const validMuseumId = '11111111-1111-4111-8111-111111111111';

    const testRecords: ValidatedSmithsonianArtifact[] = [
      {
        sourceId: 'edanmdm-sample-1',
        name: 'Sample Artifact 1',
        description: 'First sample',
        period: '19th century',
        sourceUrl: 'https://si.edu/sample1',
        sourceRights: 'CC0',
        sourceCredit: 'Smithsonian',
      },
      {
        sourceId: 'edanmdm-sample-2',
        name: 'Sample Artifact 2',
        description: 'Second sample',
        period: '20th century',
        sourceUrl: 'https://si.edu/sample2',
        sourceRights: 'CC0',
        sourceCredit: 'Smithsonian',
      },
    ];

    const existingDbArtifacts = new Set<string>();

    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ id: validMuseumId }]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((val: { sourceSystem: string; sourceId: string }) => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => {
              const key = `${val.sourceSystem}:${val.sourceId}`;
              if (existingDbArtifacts.has(key)) {
                return []; // Conflict: 0 rows inserted
              }
              existingDbArtifacts.add(key);
              return [{ id: 'new-uuid' }];
            }),
          })),
        })),
      })),
    };

    // First run: inserts 2
    const firstRun = await seedSmithsonianArtifacts(
      { museumId: validMuseumId, records: testRecords },
      mockDb as unknown as Parameters<typeof seedSmithsonianArtifacts>[1]
    );
    expect(firstRun.inserted).toBe(2);
    expect(firstRun.skipped).toBe(0);

    // Second run (rerun): inserts 0, skips 2
    const secondRun = await seedSmithsonianArtifacts(
      { museumId: validMuseumId, records: testRecords },
      mockDb as unknown as Parameters<typeof seedSmithsonianArtifacts>[1]
    );
    expect(secondRun.inserted).toBe(0);
    expect(secondRun.skipped).toBe(2);
  });

  it('validates config parameters and refuses production environment', () => {
    // Missing API key
    expect(() =>
      validateSeedConfig({
        apiKey: '',
        museumId: '11111111-1111-4111-8111-111111111111',
      })
    ).toThrow(/SMITHSONIAN_API_KEY is required/);

    // Missing museum ID
    expect(() =>
      validateSeedConfig({
        apiKey: 'some-key',
        museumId: '',
      })
    ).toThrow(/SEED_MUSEUM_ID is required/);

    // Invalid UUID
    expect(() =>
      validateSeedConfig({
        apiKey: 'some-key',
        museumId: 'not-a-valid-uuid',
      })
    ).toThrow(/SEED_MUSEUM_ID must be a valid UUID/);

    // Refuses production
    expect(() =>
      validateSeedConfig({
        apiKey: 'some-key',
        museumId: '11111111-1111-4111-8111-111111111111',
        nodeEnv: 'production',
      })
    ).toThrow(/Refusing to run seed script in production/);

    // Valid config
    const valid = validateSeedConfig({
      apiKey: 'valid-api-key',
      museumId: '11111111-1111-4111-8111-111111111111',
      nodeEnv: 'development',
      targetCount: 50,
    });
    expect(valid.apiKey).toBe('valid-api-key');
    expect(valid.museumId).toBe('11111111-1111-4111-8111-111111111111');
    expect(valid.targetCount).toBe(50);
  });

  it('masks API key in URLs correctly', () => {
    const raw = 'https://api.si.edu/openaccess/api/v1.0/search?api_key=mySecretKey123&q=art';
    const masked = maskApiKeyInUrl(raw);
    expect(masked).toBe('https://api.si.edu/openaccess/api/v1.0/search?api_key=***&q=art');
    expect(masked).not.toContain('mySecretKey123');
  });
});
