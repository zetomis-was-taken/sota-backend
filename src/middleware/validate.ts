import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import {
  formatZodIssues,
  ValidationError,
  type ValidationIssueDetail,
} from '../lib/errors';
import type { ValidatedRequestData } from '../types/express';

export interface ValidationSchemas<
  TBody extends z.ZodTypeAny = z.ZodTypeAny,
  TQuery extends z.ZodTypeAny = z.ZodTypeAny,
  TParams extends z.ZodTypeAny = z.ZodTypeAny,
> {
  body?: TBody;
  query?: TQuery;
  params?: TParams;
}

/**
 * Validates `req.body`, `req.query`, and `req.params` with Zod schemas.
 * Parsed results are stored on `req.validated` (and `req.body` is updated when
 * a `body` schema is given; `req.query` is never reassigned because it is a
 * read-only getter in Express 5).
 */
export function validate<
  TBody extends z.ZodTypeAny = z.ZodTypeAny,
  TQuery extends z.ZodTypeAny = z.ZodTypeAny,
  TParams extends z.ZodTypeAny = z.ZodTypeAny,
>(schemas: ValidationSchemas<TBody, TQuery, TParams>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: ValidationIssueDetail[] = [];
    const validated: ValidatedRequestData = {
      body: req.body,
      query: req.query,
      params: req.params,
    };

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) {
        validated.params = result.data;
      } else {
        issues.push(...formatZodIssues(result.error, 'params'));
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) {
        validated.query = result.data;
      } else {
        issues.push(...formatZodIssues(result.error, 'query'));
      }
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) {
        validated.body = result.data;
        req.body = result.data;
      } else {
        issues.push(...formatZodIssues(result.error, 'body'));
      }
    }

    if (issues.length > 0) {
      next(new ValidationError('Validation failed', issues));
      return;
    }

    req.validated = validated;
    next();
  };
}

/** Returns typed validated request segments populated by `validate()`. */
export function getValidated<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
>(req: Request): ValidatedRequestData<TBody, TQuery, TParams> {
  return (req.validated ?? {
    body: req.body,
    query: req.query,
    params: req.params,
  }) as ValidatedRequestData<TBody, TQuery, TParams>;
}
