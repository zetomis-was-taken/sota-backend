import { Router } from 'express';
import { isSupabaseConfigured } from '../config/supabase';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    supabase: isSupabaseConfigured() ? 'configured' : 'not_configured',
  });
});
