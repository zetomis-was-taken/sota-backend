import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  normalizeError,
} from '../../src/lib/errors';

describe('AppError and normalizeError', () => {
  it('serializes AppError without details when undefined', () => {
    const err = new NotFoundError('Museum not found', 'museum_not_found');
    expect(err.statusCode).toBe(404);
    expect(err.isOperational).toBe(true);
    expect(err.toJSON()).toEqual({
      error: {
        code: 'museum_not_found',
        message: 'Museum not found',
      },
    });
  });

  it('serializes AppError with details when provided', () => {
    const err = new ValidationError('Invalid input', [{ path: 'name' }]);
    expect(err.statusCode).toBe(400);
    expect(err.toJSON()).toEqual({
      error: {
        code: 'validation_error',
        message: 'Invalid input',
        details: [{ path: 'name' }],
      },
    });
  });

  it('constructs semantic subclasses with expected status codes and defaults', () => {
    expect(new BadRequestError().statusCode).toBe(400);
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ConflictError().statusCode).toBe(409);
  });

  it('returns existing AppError instances unchanged', () => {
    const original = new ConflictError('Out of stock', 'out_of_stock');
    expect(normalizeError(original)).toBe(original);
  });

  it('normalizes ZodError into 400 validation_error with issue details', () => {
    const schema = z.object({
      quantity: z.number().int().min(1),
    });
    const parsed = schema.safeParse({ quantity: 0 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const normalized = normalizeError(parsed.error);
      expect(normalized.statusCode).toBe(400);
      expect(normalized.code).toBe('validation_error');
      expect(normalized.details).toEqual([
        expect.objectContaining({
          path: 'quantity',
          code: 'too_small',
        }),
      ]);
    }
  });

  it('normalizes body-parser JSON SyntaxError into 400 invalid_json', () => {
    const syntaxErr = Object.assign(new SyntaxError('Unexpected token'), {
      status: 400,
      type: 'entity.parse.failed',
      body: '{bad',
    });
    const normalized = normalizeError(syntaxErr);
    expect(normalized.statusCode).toBe(400);
    expect(normalized.code).toBe('invalid_json');
  });

  it('normalizes entity.too.large into 413 payload_too_large', () => {
    const largeErr = { type: 'entity.too.large' };
    const normalized = normalizeError(largeErr);
    expect(normalized.statusCode).toBe(413);
    expect(normalized.code).toBe('payload_too_large');
  });

  it('normalizes Postgres unique (23505) and FK (23503) errors into 409 conflict', () => {
    expect(normalizeError({ code: '23505' }).statusCode).toBe(409);
    expect(normalizeError({ code: '23505' }).code).toBe('conflict');

    const drizzleWrapped = new Error('Query failed', {
      cause: { code: '23503' },
    });
    const normalized = normalizeError(drizzleWrapped);
    expect(normalized.statusCode).toBe(409);
    expect(normalized.code).toBe('conflict');
  });

  it('normalizes Postgres input constraint errors (23502, 23514, 22P02) into 400 invalid_input', () => {
    for (const pgCode of ['23502', '23514', '22P02']) {
      const normalized = normalizeError({ cause: { code: pgCode } });
      expect(normalized.statusCode).toBe(400);
      expect(normalized.code).toBe('invalid_input');
    }
  });

  it('masks unknown errors as non-operational 500 internal_error', () => {
    const normalized = normalizeError(new Error('DB password leaked'));
    expect(normalized.statusCode).toBe(500);
    expect(normalized.code).toBe('internal_error');
    expect(normalized.message).toBe('Internal server error');
    expect(normalized.isOperational).toBe(false);
    expect(normalized.details).toBeUndefined();
  });
});
