import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID_REGEX = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Propagates a safe incoming `X-Request-Id` header or generates a UUID v4,
 * attaching it to `req.requestId` and the response headers.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const incoming = req.header(REQUEST_ID_HEADER)?.trim();
  const requestId =
    incoming && SAFE_REQUEST_ID_REGEX.test(incoming) ? incoming : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
