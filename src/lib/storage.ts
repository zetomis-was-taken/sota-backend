import { randomBytes } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

let storageClient: SupabaseClient | null =
  env.supabaseUrl && env.supabaseSecretKey
    ? createClient(env.supabaseUrl, env.supabaseSecretKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

/** Returns the server-side Supabase Storage client or throws if credentials are missing. */
export function getSupabaseStorageClient(): SupabaseClient {
  if (storageClient) {
    return storageClient;
  }

  if (env.supabaseUrl && env.supabaseSecretKey) {
    storageClient = createClient(env.supabaseUrl, env.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return storageClient;
  }

  throw new Error('Supabase Storage is not configured');
}

/** Allows overriding or resetting the storage client (e.g. for testing). */
export function setStorageClient(client: SupabaseClient | null): void {
  storageClient = client;
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
  const { error } = await getSupabaseStorageClient()
    .storage.from(bucket)
    .upload(storagePath, buffer, { contentType: mimeType });

  if (error) {
    throw new Error('Storage upload failed', { cause: error });
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
