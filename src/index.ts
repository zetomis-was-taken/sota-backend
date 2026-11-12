import { env } from './config/env';
import { createApp } from './app';
import './config/supabase';

const app = createApp();

app.listen(env.port, () => {
  console.log(`Server listening on port ${env.port}`);
});
