import cors from 'cors';
import express, { type Router } from 'express';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { requestIdMiddleware } from './middleware/request-id';
import { apiV1Router } from './routes';
import { healthRouter } from './routes/health';

export interface CreateAppOptions {
  /** Optional router mounted under `/api/v1` (primarily for isolated tests). */
  extraV1Router?: Router;
}

export function createApp(options?: CreateAppOptions) {
  const app = express();

  app.disable('x-powered-by');

  const corsOrigin =
    env.corsOrigin === '*'
      ? '*'
      : env.corsOrigin
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean);

  app.use(
    cors({
      origin: corsOrigin,
      exposedHeaders: ['X-Request-Id'],
    })
  );
  app.use(requestIdMiddleware);
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRouter);
  app.use('/api/v1', apiV1Router);
  if (options?.extraV1Router) {
    app.use('/api/v1', options.extraV1Router);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
