import type { Response } from 'express';
import type { AppError } from './errors';

export const DEFAULT_PAGINATION_LIMIT = 24;
export const MAX_PAGINATION_LIMIT = 100;
export const DEFAULT_PAGINATION_OFFSET = 0;

export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
}

export interface ApiResponse<T> {
  data: T;
}

export interface PaginatedApiResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/** Sends a single-resource response wrapped as `{ data }`. */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200
): Response<ApiResponse<T>> {
  return res.status(statusCode).json({ data });
}

/** Sends a `201 Created` response wrapped as `{ data }`. */
export function sendCreated<T>(
  res: Response,
  data: T
): Response<ApiResponse<T>> {
  return sendSuccess(res, data, 201);
}

/** Sends a collection response wrapped as `{ data, pagination }`. */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
  statusCode = 200
): Response<PaginatedApiResponse<T>> {
  return res.status(statusCode).json({
    data,
    pagination,
  });
}

/** Sends an empty `204 No Content` response. */
export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

/** Sends a normalized error response matching `docs/api-contract.md` §1. */
export function sendError(res: Response, error: AppError): Response {
  return res.status(error.statusCode).json(error.toJSON());
}
