import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { ConflictError } from '../../src/lib/errors';
import { sendSuccess } from '../../src/lib/response';

describe('HTTP pipeline, 404, and global error handler', () => {
  const testRouter = Router();

  testRouter.post('/echo', (req, res) => {
    sendSuccess(res, req.body);
  });

  testRouter.get('/async-app-error', async () => {
    throw new ConflictError('Cart already exists', 'cart_conflict');
  });

  testRouter.get('/async-unexpected-error', async () => {
    throw new Error('Sensitive internal failure');
  });

  const app = createApp({ extraV1Router: testRouter });

  it('serves /health directly per API contract §0 and sets security/request headers', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      supabase: expect.stringMatching(/^(configured|not_configured)$/),
    });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('propagates a valid incoming X-Request-Id and replaces unsafe ones', async () => {
    const valid = await request(app)
      .get('/health')
      .set('X-Request-Id', 'req-123_abc');
    expect(valid.headers['x-request-id']).toBe('req-123_abc');

    const unsafe = await request(app)
      .get('/health')
      .set('X-Request-Id', 'bad header with spaces!');
    expect(unsafe.headers['x-request-id']).not.toBe('bad header with spaces!');
    expect(unsafe.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('returns normalized 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'not_found',
        message: 'Route GET /api/v1/does-not-exist not found',
      },
    });
  });

  it('returns normalized 400 invalid_json for malformed JSON bodies', async () => {
    const res = await request(app)
      .post('/api/v1/echo')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'invalid_json',
        message: 'Malformed JSON request body',
      },
    });
  });

  it('catches async AppError thrown in Express 5 routes', async () => {
    const res = await request(app).get('/api/v1/async-app-error');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'cart_conflict',
        message: 'Cart already exists',
      },
    });
  });

  it('masks unexpected async errors as 500 internal_error without leaking message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await request(app).get('/api/v1/async-unexpected-error');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: {
          code: 'internal_error',
          message: 'Internal server error',
        },
      });
      expect(consoleSpy).toHaveBeenCalledOnce();
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
