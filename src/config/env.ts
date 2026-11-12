import 'dotenv/config';

export const env = {
  nodeEnv: process.env.NODE_ENV?.trim() || 'development',
  port: Number(process.env.PORT) || 3000,
  corsOrigin: process.env.CORS_ORIGIN?.trim() || '*',
  databaseUrl: process.env.DATABASE_URL?.trim() ?? '',
  supabaseUrl: process.env.SUPABASE_URL?.trim() ?? '',
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY?.trim() ?? '',
  museumMediaBucket:
    process.env.SUPABASE_MUSEUM_MEDIA_BUCKET?.trim() || 'museum-media',
  souvenirMediaBucket:
    process.env.SUPABASE_SOUVENIR_MEDIA_BUCKET?.trim() || 'souvenir-media',
};
