import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT) || 3000,
  supabaseUrl: process.env.SUPABASE_URL?.trim() ?? '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY?.trim() ?? '',
};
