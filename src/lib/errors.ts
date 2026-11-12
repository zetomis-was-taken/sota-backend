import { ZodError } from 'zod';

export interface ErrorPayload {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ValidationIssueDetail {
  location?: 'body' | 'query' | 'params';
  path: string;
  message: string;
  code: string;
}

/**
 * Base application error normalized into the API contract error envelope:
 * `{ error: { code, message, details? } }`.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
    isOperational = true
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): ErrorPayload {
    const error: ErrorPayload['error'] = {
      code: this.code,
      message: this.message,
    };

    if (this.details !== undefined) {
      error.details = this.details;
    }

    return { error };
  }
}

export class BadRequestError extends AppError {
  constructor(
    message = 'Bad request',
    code = 'bad_request',
    details?: unknown
  ) {
    super(400, code, message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(400, 'validation_error', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(
    message = 'Authentication required',
    code = 'unauthorized',
    details?: unknown
  ) {
    super(401, code, message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = 'Insufficient permissions',
    code = 'forbidden',
    details?: unknown
  ) {
    super(403, code, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(
    message = 'Resource not found',
    code = 'not_found',
    details?: unknown
  ) {
    super(404, code, message, details);
  }
}

export class ConflictError extends AppError {
  constructor(
    message = 'Resource conflict',
    code = 'conflict',
    details?: unknown
  ) {
    super(409, code, message, details);
  }
}

export function formatZodIssues(
  error: ZodError,
  location?: 'body' | 'query' | 'params'
): ValidationIssueDetail[] {
  return error.issues.map((issue) => ({
    ...(location ? { location } : {}),
    path: issue.path.map(String).join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

interface PostgresLikeError {
  code?: unknown;
}

function extractPgErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') {
    return null;
  }

  const directCode = (err as PostgresLikeError).code;
  if (typeof directCode === 'string' && /^[0-9A-Z]{5}$/.test(directCode)) {
    return directCode;
  }

  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const causeCode = (cause as PostgresLikeError).code;
    if (typeof causeCode === 'string' && /^[0-9A-Z]{5}$/.test(causeCode)) {
      return causeCode;
    }
  }

  return null;
}

function isBodyParserSyntaxError(err: unknown): boolean {
  if (!(err instanceof SyntaxError)) {
    return false;
  }
  const candidate = err as SyntaxError & {
    status?: unknown;
    type?: unknown;
    body?: unknown;
  };
  return (
    candidate.type === 'entity.parse.failed' ||
    (candidate.status === 400 && 'body' in candidate)
  );
}

/**
 * Normalizes any thrown value into an `AppError` so every error response
 * conforms to `docs/api-contract.md` §1 without leaking internal details.
 */
export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  if (err instanceof ZodError) {
    return new ValidationError('Validation failed', formatZodIssues(err));
  }

  if (isBodyParserSyntaxError(err)) {
    return new BadRequestError('Malformed JSON request body', 'invalid_json');
  }

  if (
    err &&
    typeof err === 'object' &&
    (err as { type?: unknown }).type === 'entity.too.large'
  ) {
    return new AppError(
      413,
      'payload_too_large',
      'Request payload exceeds size limit'
    );
  }

  const pgCode = extractPgErrorCode(err);
  if (pgCode) {
    switch (pgCode) {
      case '23505':
        return new ConflictError('Resource already exists', 'conflict');
      case '23503':
        return new ConflictError('Referenced resource conflict', 'conflict');
      case '23502':
      case '23514':
      case '22P02':
        return new BadRequestError('Invalid request data', 'invalid_input');
      default:
        break;
    }
  }

  return new AppError(500, 'internal_error', 'Internal server error', undefined, false);
}
