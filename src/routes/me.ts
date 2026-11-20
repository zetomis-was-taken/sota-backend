import { Router } from 'express';
import { z } from 'zod';
import { sendPaginated, sendSuccess } from '../lib/response';
import { paginationQuerySchema, type PaginationQuery } from '../lib/validation';
import { requireAuth, requireSuperAdmin } from '../middleware/auth';
import { getValidated, validate } from '../middleware/validate';
import {
  getProfile,
  listAdminUsers,
  updateProfile,
} from '../services/profile';

export const meRouter = Router();

const patchMeBodySchema = z
  .object({
    display_name: z.string().trim().min(1).max(255).nullable().optional(),
    phone: z.string().trim().min(1).max(20).nullable().optional(),
  })
  .strict()
  .refine(
    (body) => body.display_name !== undefined || body.phone !== undefined,
    'At least one profile field is required'
  );

meRouter.get('/me', requireAuth, async (req, res) => {
  const profile = await getProfile(req.auth!.userId);
  sendSuccess(res, profile);
});

meRouter.patch(
  '/me',
  requireAuth,
  validate({ body: patchMeBodySchema }),
  async (req, res) => {
    const { body } = getValidated<z.infer<typeof patchMeBodySchema>>(req);
    const updated = await updateProfile(req.auth!.userId, body);
    sendSuccess(res, updated);
  }
);

meRouter.get(
  '/admin/users',
  requireAuth,
  requireSuperAdmin,
  validate({ query: paginationQuerySchema }),
  async (req, res) => {
    const { limit, offset } = getValidated<unknown, PaginationQuery>(req).query;
    const { users, total } = await listAdminUsers(limit, offset);
    sendPaginated(res, users, { limit, offset, total });
  }
);
