import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../src/lib/errors';
import {
  sendCreated,
  sendError,
  sendNoContent,
  sendPaginated,
  sendSuccess,
} from '../../src/lib/response';

function createMockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  };
}

describe('response helpers', () => {
  it('sendSuccess wraps single resource as { data } with 200 default', () => {
    const res = createMockResponse();
    sendSuccess(res, { id: '123', name: 'Museum' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: { id: '123', name: 'Museum' },
    });
  });

  it('sendCreated wraps single resource as { data } with 201', () => {
    const res = createMockResponse();
    sendCreated(res, { id: '123' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: { id: '123' } });
  });

  it('sendPaginated wraps collection as { data, pagination }', () => {
    const res = createMockResponse();
    sendPaginated(res, [{ id: '1' }, { id: '2' }], {
      limit: 24,
      offset: 0,
      total: 2,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      data: [{ id: '1' }, { id: '2' }],
      pagination: { limit: 24, offset: 0, total: 2 },
    });
  });

  it('sendNoContent responds with 204 and empty body', () => {
    const res = createMockResponse();
    sendNoContent(res);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalledWith();
  });

  it('sendError responds with error statusCode and normalized JSON', () => {
    const res = createMockResponse();
    sendError(res, new NotFoundError('Missing item', 'item_not_found'));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'item_not_found',
        message: 'Missing item',
      },
    });
  });
});
