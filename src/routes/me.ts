import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db';
import { museumAdmins, userRoles, users } from '../db/schema';
import { NotFoundError } from '../lib/errors';
import { sendSuccess } from '../lib/response';
import { requireAuth } from '../middleware/auth';

export const meRouter = Router();

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
