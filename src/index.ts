import { env } from './config/env';
import { createApp } from './app';
import { closeDb } from './db';
import './config/supabase';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`Server listening on port ${env.port}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down...`);
  server.close(async () => {
    try {
      await closeDb();
    } catch (err) {
      console.error('Error closing database pool:', err);
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
