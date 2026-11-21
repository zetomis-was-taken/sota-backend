import path from 'path';
import { and, eq, ne } from 'drizzle-orm';
import { env } from '../config/env';
import { db } from '../db';
import { artifacts, mediaAssets, souvenirProducts } from '../db/schema';
import { canManageMuseum } from '../lib/auth';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../lib/errors';
import { buildStoragePath, deleteMedia, uploadMedia } from '../lib/storage';

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MIME_EXTENSIONS: Record<AllowedMimeType, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
};

/** Detects MIME type from file magic bytes for supported formats. */
export function detectMimeType(buffer: Buffer): AllowedMimeType | null {
  if (!buffer || buffer.length < 4) {
    return null;
  }

  // JPEG: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  // MP4: ....ftyp
  if (buffer.length >= 8 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return 'video/mp4';
  }

  // WebM: 1A 45 DF A3
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3
  ) {
    return 'video/webm';
  }

  return null;
}

/** Validates file presence, magic bytes, matching extension, and media type consistency. */
export function validateMediaFile(
  file: Express.Multer.File,
  mediaType: 'image' | 'video'
): { detectedMime: AllowedMimeType; extension: string } {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw new BadRequestError('File is required', 'file_required');
  }

  const detectedMime = detectMimeType(file.buffer);
  if (!detectedMime) {
    throw new BadRequestError(
      'Unsupported file signature or MIME type',
      'invalid_file_signature'
    );
  }

  if (file.mimetype && file.mimetype !== detectedMime) {
    throw new BadRequestError(
      'MIME type does not match file content signature',
      'spoofed_mime_type'
    );
  }

  const extension = path.extname(file.originalname || '').toLowerCase();
  const allowedExtensions = MIME_EXTENSIONS[detectedMime];
  if (!extension || !allowedExtensions.includes(extension)) {
    throw new BadRequestError(
      'File extension does not match detected MIME type',
      'invalid_extension'
    );
  }

  if (mediaType === 'image' && !detectedMime.startsWith('image/')) {
    throw new BadRequestError(
      'media_type does not match file content',
      'media_type_mismatch'
    );
  }

  if (mediaType === 'video' && !detectedMime.startsWith('video/')) {
    throw new BadRequestError(
      'media_type does not match file content',
      'media_type_mismatch'
    );
  }

  return { detectedMime, extension };
}

export interface CreateAdminMediaInput {
  userId: string;
  museumId: string;
  entityType: 'artifact' | 'souvenir';
  entityId: string;
  mediaType: 'image' | 'video';
  file: Express.Multer.File;
  sortOrder?: number;
  isPrimary?: boolean;
}

/** Uploads file to Supabase Storage and creates media_assets row in a safe transaction. */
export async function createAdminMedia(input: CreateAdminMediaInput) {
  const { detectedMime, extension } = validateMediaFile(
    input.file,
    input.mediaType
  );

  let realMuseumId: string;
  if (input.entityType === 'artifact') {
    const [artifact] = await db
      .select({ id: artifacts.id, museumId: artifacts.museumId })
      .from(artifacts)
      .where(eq(artifacts.id, input.entityId))
      .limit(1);

    if (!artifact) {
      throw new NotFoundError('Artifact not found');
    }
    realMuseumId = artifact.museumId;
  } else {
    const [product] = await db
      .select({ id: souvenirProducts.id, museumId: souvenirProducts.museumId })
      .from(souvenirProducts)
      .where(eq(souvenirProducts.id, input.entityId))
      .limit(1);

    if (!product) {
      throw new NotFoundError('Souvenir product not found');
    }
    realMuseumId = product.museumId;
  }

  if (input.museumId !== realMuseumId) {
    throw new ForbiddenError(
      'Entity does not belong to the specified museum',
      'not_museum_admin'
    );
  }

  const allowed = await canManageMuseum(input.userId, realMuseumId);
  if (!allowed) {
    throw new ForbiddenError(
      'Museum admin access required',
      'not_museum_admin'
    );
  }

  const bucket =
    input.entityType === 'artifact'
      ? env.museumMediaBucket
      : env.souvenirMediaBucket;

  const storagePath = buildStoragePath(
    realMuseumId,
    input.entityType,
    input.entityId,
    extension
  );

  await uploadMedia(bucket, storagePath, input.file.buffer, detectedMime);

  try {
    const createdAsset = await db.transaction(async (tx) => {
      if (input.isPrimary) {
        if (input.entityType === 'artifact') {
          await tx
            .select({ id: artifacts.id })
            .from(artifacts)
            .where(eq(artifacts.id, input.entityId))
            .for('update');
        } else {
          await tx
            .select({ id: souvenirProducts.id })
            .from(souvenirProducts)
            .where(eq(souvenirProducts.id, input.entityId))
            .for('update');
        }

        await tx
          .update(mediaAssets)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(
            and(
              eq(mediaAssets.entityType, input.entityType),
              eq(mediaAssets.entityId, input.entityId),
              eq(mediaAssets.isPrimary, true)
            )
          );
      }

      const [inserted] = await tx
        .insert(mediaAssets)
        .values({
          museumId: realMuseumId,
          entityType: input.entityType,
          entityId: input.entityId,
          mediaType: input.mediaType,
          storageBucket: bucket,
          storagePath,
          mimeType: detectedMime,
          sortOrder: input.sortOrder ?? 0,
          isPrimary: input.isPrimary ?? false,
          createdBy: input.userId,
        })
        .returning();

      return inserted;
    });

    return createdAsset;
  } catch (dbErr) {
    await deleteMedia(bucket, storagePath);
    throw dbErr;
  }
}

/** Updates sort order or primary status of a media asset. */
export async function updateAdminMedia(
  userId: string,
  mediaId: string,
  input: { sort_order?: number; is_primary?: boolean }
) {
  const [media] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaId))
    .limit(1);

  if (!media) {
    throw new NotFoundError('Media asset not found');
  }

  const allowed = await canManageMuseum(userId, media.museumId);
  if (!allowed) {
    throw new ForbiddenError(
      'Museum admin access required',
      'not_museum_admin'
    );
  }

  const updatedAsset = await db.transaction(async (tx) => {
    if (input.is_primary === true) {
      if (media.entityType === 'artifact') {
        await tx
          .select({ id: artifacts.id })
          .from(artifacts)
          .where(eq(artifacts.id, media.entityId))
          .for('update');
      } else {
        await tx
          .select({ id: souvenirProducts.id })
          .from(souvenirProducts)
          .where(eq(souvenirProducts.id, media.entityId))
          .for('update');
      }

      await tx
        .update(mediaAssets)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(
          and(
            eq(mediaAssets.entityType, media.entityType),
            eq(mediaAssets.entityId, media.entityId),
            eq(mediaAssets.isPrimary, true),
            ne(mediaAssets.id, media.id)
          )
        );
    }

    const patchValues: Partial<typeof mediaAssets.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.sort_order !== undefined) {
      patchValues.sortOrder = input.sort_order;
    }
    if (input.is_primary !== undefined) {
      patchValues.isPrimary = input.is_primary;
    }

    const [result] = await tx
      .update(mediaAssets)
      .set(patchValues)
      .where(eq(mediaAssets.id, mediaId))
      .returning();

    return result;
  });

  return updatedAsset;
}

/** Deletes a media asset record from database first, then removes Storage object best-effort. */
export async function deleteAdminMedia(userId: string, mediaId: string) {
  const [media] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaId))
    .limit(1);

  if (!media) {
    throw new NotFoundError('Media asset not found');
  }

  const allowed = await canManageMuseum(userId, media.museumId);
  if (!allowed) {
    throw new ForbiddenError(
      'Museum admin access required',
      'not_museum_admin'
    );
  }

  await db.delete(mediaAssets).where(eq(mediaAssets.id, mediaId));

  try {
    await deleteMedia(media.storageBucket, media.storagePath);
  } catch (err) {
    console.error('Best-effort storage delete failed:', err);
  }

  return { id: mediaId, deleted: true };
}
