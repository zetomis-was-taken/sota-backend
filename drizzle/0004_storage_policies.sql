-- Configure public media buckets with server-side size (50 MiB) and MIME allow-list
INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES
  (
    'museum-media',
    'museum-media',
    true,
    52428800,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
  ),
  (
    'souvenir-media',
    'souvenir-media',
    true,
    52428800,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
  )
ON CONFLICT ("id") DO UPDATE
SET
  "public" = EXCLUDED."public",
  "file_size_limit" = EXCLUDED."file_size_limit",
  "allowed_mime_types" = EXCLUDED."allowed_mime_types";--> statement-breakpoint

-- Public read access for museum-media and souvenir-media
CREATE POLICY "media_buckets_public_select"
  ON "storage"."objects"
  FOR SELECT
  TO "anon", "authenticated"
  USING ("bucket_id" IN ('museum-media', 'souvenir-media'));--> statement-breakpoint

-- Admin-only upload scoped by first path segment ({museum_id}/...) and allowed extension
CREATE POLICY "media_buckets_admin_insert"
  ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    "bucket_id" IN ('museum-media', 'souvenir-media')
    AND lower(storage.extension("name")) IN ('jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm')
    AND CASE
      WHEN (storage.foldername("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN private.can_manage_museum(((storage.foldername("name"))[1])::uuid)
      ELSE false
    END
  );--> statement-breakpoint

-- Admin-only delete scoped by first path segment ({museum_id}/...)
CREATE POLICY "media_buckets_admin_delete"
  ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (
    "bucket_id" IN ('museum-media', 'souvenir-media')
    AND CASE
      WHEN (storage.foldername("name"))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN private.can_manage_museum(((storage.foldername("name"))[1])::uuid)
      ELSE false
    END
  );
