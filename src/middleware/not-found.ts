import type { NextFunction, Request, Response } from 'express';
import { NotFoundError } from '../lib/errors';

/** Forwards unmatched routes into the global error handler as a normalized 404. */
export function notFoundHandler(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
}
