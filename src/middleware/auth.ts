import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { getSupabaseClient } from '../config/supabase';
import {
  canManageMuseum,
  ensureUserProvisioned,
  isSuperAdmin,
} from '../lib/auth';
import {
  BadRequestError,
  ForbiddenError,
  UnauthorizedError,
} from '../lib/errors';

function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  return match ? match[1] : null;
}

/**
 * Verifies the Supabase Auth Bearer JWT on every protected request and
 * idempotently ensures `public.users` + `user_roles(normal_user)` exist.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerToken(req.header('authorization'));
  if (!token) {
    throw new UnauthorizedError('Missing or invalid authorization token');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new UnauthorizedError('Invalid or expired token');
  }

  await ensureUserProvisioned(data.user.id);

  req.auth = {
    userId: data.user.id,
    email: data.user.email ?? null,
    accessToken: token,
  };

  next();
}

/** Requires `requireAuth` to have populated `req.auth` and checks `super_admin` in Postgres. */
export async function requireSuperAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.auth) {
    throw new UnauthorizedError('Authentication required');
  }

  const allowed = await isSuperAdmin(req.auth.userId);
  if (!allowed) {
    throw new ForbiddenError('Super admin role required');
  }

  next();
}

export type MuseumIdResolver = (req: Request) => string | undefined;

/**
 * Requires `requireAuth` and verifies `canManageMuseum(userId, museumId)` in Postgres.
 * Defaults to reading `req.params.museumId` when no resolver is passed.
 */
export function requireMuseumAdmin(
  resolveMuseumId: MuseumIdResolver = (req) => {
    const value = req.params.museumId;
    return typeof value === 'string' ? value : undefined;
  }
): RequestHandler {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.auth) {
      throw new UnauthorizedError('Authentication required');
    }

    const museumId = resolveMuseumId(req);
    if (!museumId) {
      throw new BadRequestError('Museum ID is required', 'validation_error');
    }

    const allowed = await canManageMuseum(req.auth.userId, museumId);
    if (!allowed) {
      throw new ForbiddenError(
        'Museum admin access required',
        'not_museum_admin'
      );
    }

    next();
  };
}
