import { randomBytes } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

function initStorageClient(): SupabaseClient | null {
  return env.supabaseUrl && env.supabaseSecretKey
    ? createClient(env.supabaseUrl, env.supabaseSecretKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;
}

let storageClient: SupabaseClient | null = initStorageClient();

/** Returns the server-side Supabase Storage client or throws if credentials are missing. */
export function getSupabaseStorageClient(): SupabaseClient {
  if (!storageClient) {
    throw new Error('Supabase Storage is not configured');
  }
  return storageClient;
}

/** Allows overriding or clearing the storage client (e.g. for testing). */
export function setStorageClient(client: SupabaseClient | null): void {
  storageClient = client;
}

/** Resets the storage client back to the instance derived from current environment variables. */
export function resetStorageClient(): void {
  storageClient = initStorageClient();
}

/** Generates an unguessable storage key: `{museumId}/{entityType}/{entityId}/{random_hex}{extension}` */
export function buildStoragePath(
  museumId: string,
  entityType: string,
  entityId: string,
  extension: string
): string {
  const random = randomBytes(8).toString('hex');
  const normalizedExt =
    extension && !extension.startsWith('.') ? `.${extension}` : extension;
  return `${museumId}/${entityType}/${entityId}/${random}${normalizedExt}`;
}

/** Uploads binary media data to Supabase Storage. */
export async function uploadMedia(
  bucket: string,
  storagePath: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  const client = getSupabaseStorageClient();

  let uploadResult: { error: unknown } | null = null;
  try {
    uploadResult = await client
      .storage.from(bucket)
      .upload(storagePath, buffer, { contentType: mimeType });
  } catch (err) {
    throw new Error('Storage upload failed', { cause: err });
  }

  if (uploadResult.error) {
    throw new Error('Storage upload failed', { cause: uploadResult.error });
  }
}

/** Best-effort delete: logs failure but never throws. */
export async function deleteMedia(
  bucket: string,
  storagePath: string
): Promise<void> {
  try {
    const { error } = await getSupabaseStorageClient()
      .storage.from(bucket)
      .remove([storagePath]);

    if (error) {
      console.error('Storage delete failed (best-effort):', error.message);
    }
  } catch (error) {
    console.error('Storage delete failed (best-effort):', error);
  }
}
