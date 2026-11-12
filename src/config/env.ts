import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL?.trim() ?? '',
  supabaseUrl: process.env.SUPABASE_URL?.trim() ?? '',
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY?.trim() ?? '',
  museumMediaBucket:
    process.env.SUPABASE_MUSEUM_MEDIA_BUCKET?.trim() || 'museum-media',
  souvenirMediaBucket:
    process.env.SUPABASE_SOUVENIR_MEDIA_BUCKET?.trim() || 'souvenir-media',
};
