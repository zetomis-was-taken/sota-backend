import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { museumAdmins, userRoles, users } from '../db/schema';
import { NotFoundError } from '../lib/errors';
import { sendSuccess } from '../lib/response';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';

export const meRouter = Router();

const patchMeBodySchema = z
  .object({
    display_name: z.string().min(1).max(255).optional(),
    phone: z.string().max(20).optional(),
  })
  .refine(
    (data) => data.display_name !== undefined || data.phone !== undefined,
    {
      message: 'At least one field (display_name or phone) must be provided',
    }
  );

meRouter.get('/me', requireAuth, async (req, res) => {
  const userId = req.auth!.userId;

  const [profile] = await db
    .select({
      id: users.id,
      display_name: users.displayName,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!profile) {
    throw new NotFoundError('User not found');
  }

  const roleRows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));

  const roles = roleRows.map((r) => r.role);
  const hasAdminRole =
    roles.includes('admin_user') || roles.includes('super_admin');

  const managedMuseums = hasAdminRole
    ? await db
        .select({
          museum_id: museumAdmins.museumId,
          status: museumAdmins.status,
        })
        .from(museumAdmins)
        .where(
          and(
            eq(museumAdmins.userId, userId),
            eq(museumAdmins.status, 'active')
          )
        )
    : [];

  sendSuccess(res, {
    ...profile,
    roles,
    managed_museums: managedMuseums,
  });
});

meRouter.patch(
  '/me',
  requireAuth,
  validate({ body: patchMeBodySchema }),
  async (req, res) => {
    const userId = req.auth!.userId;
    const body = req.body as z.infer<typeof patchMeBodySchema>;

    const updateValues: { displayName?: string; phone?: string } = {};
    if (body.display_name !== undefined) {
      updateValues.displayName = body.display_name;
    }
    if (body.phone !== undefined) {
      updateValues.phone = body.phone;
    }

    const [updated] = await db
      .update(users)
      .set(updateValues)
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        display_name: users.displayName,
        phone: users.phone,
      });

    if (!updated) {
      throw new NotFoundError('User not found');
    }

    sendSuccess(res, updated);
  }
);
