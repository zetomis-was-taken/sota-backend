import { z } from 'zod';
import { TICKET_TIME_SLOTS } from '../db/schema/ticket-orders';
import {
  DEFAULT_PAGINATION_LIMIT,
  DEFAULT_PAGINATION_OFFSET,
  MAX_PAGINATION_LIMIT,
} from './response';

export const uuidSchema = z.uuid('Invalid UUID format');

export const idParamSchema = z.object({
  id: uuidSchema,
});

export const museumIdParamSchema = z.object({
  museumId: uuidSchema,
});

function rejectEmptyStringNumber(value: unknown): unknown {
  return value === '' ? Number.NaN : value;
}

export const paginationQuerySchema = z.object({
  limit: z.preprocess(
    rejectEmptyStringNumber,
    z.coerce
      .number()
      .int('limit must be an integer')
      .min(1, 'limit must be at least 1')
      .max(MAX_PAGINATION_LIMIT, `limit must not exceed ${MAX_PAGINATION_LIMIT}`)
  ).default(DEFAULT_PAGINATION_LIMIT),
  offset: z.preprocess(
    rejectEmptyStringNumber,
    z.coerce
      .number()
      .int('offset must be an integer')
      .min(0, 'offset must be at least 0')
  ).default(DEFAULT_PAGINATION_OFFSET),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

const DATE_YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a `YYYY-MM-DD` calendar date without allowing rollovers (e.g. Feb 30). */
export function isValidCalendarDate(value: string): boolean {
  if (!DATE_YYYY_MM_DD_REGEX.test(value)) {
    return false;
  }

  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

export const dateStringSchema = z
  .string()
  .refine(isValidCalendarDate, 'Invalid date; expected YYYY-MM-DD');

export const timeSlotSchema = z.enum(TICKET_TIME_SLOTS);

export const positiveIntSchema = z
  .number()
  .int('Must be an integer')
  .min(1, 'Must be at least 1');

export const nonNegativeIntSchema = z
  .number()
  .int('Must be an integer')
  .min(0, 'Must be at least 0');

export const nonNegativeNumberSchema = z
  .number()
  .finite('Must be a finite number')
  .min(0, 'Must be at least 0');
