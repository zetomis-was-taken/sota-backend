import type { NextFunction, Request, Response } from 'express';
import { normalizeError } from '../lib/errors';
import { sendError } from '../lib/response';

/** Global Express error-handling middleware normalizing all errors to JSON. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  const appError = normalizeError(err);

  if (!appError.isOperational || appError.statusCode >= 500) {
    console.error(
      `[error] [${req.requestId ?? 'no-request-id'}] ${req.method} ${req.originalUrl}`,
      err
    );
  }

  sendError(res, appError);
}
