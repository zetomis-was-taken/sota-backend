import { describe, expect, it } from 'vitest';
import { SEED_MUSEUMS } from '../../scripts/seed-museums';
import {
  buildProductSeedData,
  getManagedSkus,
  MANAGED_SKUS,
  SOUVENIR_FIXTURES,
} from '../../scripts/seed-souvenirs';

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
      expect(getManagedSkus()).toEqual(MANAGED_SKUS);
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
          ).toBeGreaterThan(5);
        }
      }
    });
  });
});
