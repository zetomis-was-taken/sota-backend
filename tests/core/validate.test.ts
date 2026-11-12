import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app';
import { sendSuccess } from '../../src/lib/response';
import {
  dateStringSchema,
  idParamSchema,
  paginationQuerySchema,
  timeSlotSchema,
} from '../../src/lib/validation';
import { getValidated, validate } from '../../src/middleware/validate';

describe('request validation middleware and schemas', () => {
  const testRouter = Router();

  testRouter.get(
    '/test-items/:id',
    validate({
      params: idParamSchema,
      query: paginationQuerySchema,
    }),
    (req, res) => {
      const { params, query } = getValidated<
        unknown,
        z.infer<typeof paginationQuerySchema>,
        z.infer<typeof idParamSchema>
      >(req);
      sendSuccess(res, { id: params.id, pagination: query });
    }
  );

  testRouter.post(
    '/test-orders',
    validate({
      body: z.object({
        visit_date: dateStringSchema,
        time_slot: timeSlotSchema,
      }),
    }),
    (req, res) => {
      sendSuccess(res, req.body);
    }
  );

  const app = createApp({ extraV1Router: testRouter });

  it('applies default pagination values (limit=24, offset=0) safely in Express 5', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app).get(`/api/v1/test-items/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        id,
        pagination: { limit: 24, offset: 0 },
      },
    });
  });

  it('coerces valid query pagination numbers', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const res = await request(app).get(
      `/api/v1/test-items/${id}?limit=100&offset=20`
    );

    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toEqual({ limit: 100, offset: 20 });
  });

  it('rejects out-of-range pagination, empty strings, and invalid UUIDs', async () => {
    const res = await request(app).get(
      '/api/v1/test-items/not-a-uuid?limit=101&offset='
    );

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ location: 'params', path: 'id' }),
        expect.objectContaining({ location: 'query', path: 'limit' }),
        expect.objectContaining({ location: 'query', path: 'offset' }),
      ])
    );
  });

  it('validates YYYY-MM-DD calendar dates and fixed time slots', async () => {
    const valid = await request(app).post('/api/v1/test-orders').send({
      visit_date: '2024-02-29',
      time_slot: '09:00-11:00',
    });
    expect(valid.status).toBe(200);
    expect(valid.body.data).toEqual({
      visit_date: '2024-02-29',
      time_slot: '09:00-11:00',
    });

    const invalidDate = await request(app).post('/api/v1/test-orders').send({
      visit_date: '2025-02-29',
      time_slot: '10:00-12:00',
    });
    expect(invalidDate.status).toBe(400);
    expect(invalidDate.body.error.code).toBe('validation_error');
    expect(invalidDate.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ location: 'body', path: 'visit_date' }),
        expect.objectContaining({ location: 'body', path: 'time_slot' }),
      ])
    );
  });
});
