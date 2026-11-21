import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { env } from '../../src/config/env';
import {
  buildStoragePath,
  uploadMedia,
  deleteMedia,
  getSupabaseStorageClient,
  setStorageClient,
  resetStorageClient,
} from '../../src/lib/storage';

describe('storage helper', () => {
  const originalEnv = { ...process.env };
  const origSupabaseUrl = env.supabaseUrl;
  const origSupabaseSecretKey = env.supabaseSecretKey;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    env.supabaseUrl = origSupabaseUrl;
    env.supabaseSecretKey = origSupabaseSecretKey;
    resetStorageClient();
  });

  describe('buildStoragePath', () => {
    it('generates correct path matching required pattern without original filename', () => {
      const museumId = '11111111-1111-1111-1111-111111111111';
      const entityType = 'artifact';
      const entityId = '22222222-2222-2222-2222-222222222222';
      const extension = '.jpg';

      const path = buildStoragePath(museumId, entityType, entityId, extension);

      // Pattern: {museum_id}/{entity_type}/{entity_id}/{16-hex-chars}{extension}
      const regex = /^11111111-1111-1111-1111-111111111111\/artifact\/22222222-2222-2222-2222-222222222222\/[0-9a-f]{16}\.jpg$/;
      expect(path).toMatch(regex);
      expect(path).not.toContain('original');
      expect(path).not.toContain('photo');
    });

    it('normalizes extension without leading dot', () => {
      const path = buildStoragePath('m1', 'souvenir', 's1', 'png');
      expect(path).toMatch(/^m1\/souvenir\/s1\/[0-9a-f]{16}\.png$/);
    });

    it('handles empty extension', () => {
      const path = buildStoragePath('m1', 'artifact', 'a1', '');
      expect(path).toMatch(/^m1\/artifact\/a1\/[0-9a-f]{16}$/);
    });

    it('generates different random paths on consecutive calls', () => {
      const path1 = buildStoragePath('m1', 'artifact', 'a1', '.webp');
      const path2 = buildStoragePath('m1', 'artifact', 'a1', '.webp');
      expect(path1).not.toBe(path2);
    });
  });

  describe('uploadMedia', () => {
    it('uploads buffer to the specified bucket with contentType', async () => {
      const mockUpload = vi.fn().mockResolvedValue({ error: null });
      const mockFrom = vi.fn().mockReturnValue({ upload: mockUpload });
      const mockClient = { storage: { from: mockFrom } };

      setStorageClient(mockClient as any);

      const buffer = Buffer.from('fake image data');
      await uploadMedia('museum-media', 'm1/artifact/a1/random.jpg', buffer, 'image/jpeg');

      expect(mockFrom).toHaveBeenCalledWith('museum-media');
      expect(mockUpload).toHaveBeenCalledWith(
        'm1/artifact/a1/random.jpg',
        buffer,
        { contentType: 'image/jpeg' }
      );
    });

    it('throws generic error without leaking Supabase internal message', async () => {
      const originalError = { message: 'Bucket not found: internal_bucket_id' };
      const mockUpload = vi.fn().mockResolvedValue({
        error: originalError,
      });
      const mockFrom = vi.fn().mockReturnValue({ upload: mockUpload });
      const mockClient = { storage: { from: mockFrom } };

      setStorageClient(mockClient as any);

      const buffer = Buffer.from('fake data');
      const promise = uploadMedia('museum-media', 'path/to/file.jpg', buffer, 'image/jpeg');

      await expect(promise).rejects.toThrow('Storage upload failed');
      await expect(promise).rejects.toSatisfy((err: Error) => {
        return (
          err.message === 'Storage upload failed' &&
          err.cause === originalError
        );
      });
    });

    it('throws generic error with cause when upload promise is rejected (e.g. network failure)', async () => {
      const networkError = new Error('getaddrinfo ENOTFOUND xyz.supabase.co');
      const mockUpload = vi.fn().mockRejectedValue(networkError);
      const mockFrom = vi.fn().mockReturnValue({ upload: mockUpload });
      const mockClient = { storage: { from: mockFrom } };

      setStorageClient(mockClient as any);

      const buffer = Buffer.from('fake data');
      const promise = uploadMedia('museum-media', 'path/to/file.jpg', buffer, 'image/jpeg');

      await expect(promise).rejects.toThrow('Storage upload failed');
      await expect(promise).rejects.toSatisfy((err: Error) => {
        return (
          err.message === 'Storage upload failed' &&
          err.cause === networkError
        );
      });
    });

    it('throws error when storage is not configured, even if env credentials exist in CI', async () => {
      env.supabaseUrl = 'https://example.supabase.co';
      env.supabaseSecretKey = 'mock-secret-key';
      setStorageClient(null);

      const buffer = Buffer.from('fake data');
      await expect(
        uploadMedia('museum-media', 'path/to/file.jpg', buffer, 'image/jpeg')
      ).rejects.toThrow('Supabase Storage is not configured');
    });
  });

  describe('deleteMedia', () => {
    it('removes storage path and does not throw on success', async () => {
      const mockRemove = vi.fn().mockResolvedValue({ error: null });
      const mockFrom = vi.fn().mockReturnValue({ remove: mockRemove });
      const mockClient = { storage: { from: mockFrom } };

      setStorageClient(mockClient as any);

      await expect(
        deleteMedia('museum-media', 'm1/artifact/a1/random.jpg')
      ).resolves.toBeUndefined();

      expect(mockFrom).toHaveBeenCalledWith('museum-media');
      expect(mockRemove).toHaveBeenCalledWith(['m1/artifact/a1/random.jpg']);
    });

    it('does not throw when storage remove returns an error (best-effort)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockRemove = vi.fn().mockResolvedValue({
        error: { message: 'Object not found' },
      });
      const mockFrom = vi.fn().mockReturnValue({ remove: mockRemove });
      const mockClient = { storage: { from: mockFrom } };

      setStorageClient(mockClient as any);

      await expect(
        deleteMedia('museum-media', 'm1/artifact/a1/random.jpg')
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Storage delete failed (best-effort):',
        'Object not found'
      );
      consoleSpy.mockRestore();
    });

    it('does not throw when storage client throws an exception (best-effort)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockFrom = vi.fn().mockImplementation(() => {
        throw new Error('Network timeout');
      });
      const mockClient = { storage: { from: mockFrom } };

      setStorageClient(mockClient as any);

      await expect(
        deleteMedia('museum-media', 'm1/artifact/a1/random.jpg')
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Storage delete failed (best-effort):',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('does not throw when storage is not configured (best-effort)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      setStorageClient(null);

      await expect(
        deleteMedia('museum-media', 'm1/artifact/a1/random.jpg')
      ).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Storage delete failed (best-effort):',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('getSupabaseStorageClient', () => {
    it('throws error when storage credentials are not configured', () => {
      setStorageClient(null);
      expect(() => getSupabaseStorageClient()).toThrow(
        'Supabase Storage is not configured'
      );
    });

    it('throws error when storage is explicitly set to null even if env credentials are set in CI', () => {
      env.supabaseUrl = 'https://example.supabase.co';
      env.supabaseSecretKey = 'mock-secret-key';
      setStorageClient(null);

      expect(() => getSupabaseStorageClient()).toThrow(
        'Supabase Storage is not configured'
      );
    });

    it('returns client when explicitly set', () => {
      const mockClient = { storage: {} };
      setStorageClient(mockClient as any);
      expect(getSupabaseStorageClient()).toBe(mockClient);
    });

    it('restores client from environment when resetStorageClient is called', () => {
      env.supabaseUrl = 'https://example.supabase.co';
      env.supabaseSecretKey = 'mock-secret-key';
      setStorageClient(null);

      resetStorageClient();
      expect(getSupabaseStorageClient()).toBeDefined();
    });
  });
});
