import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { museumAdmins, userRoles, users } from '../db/schema';

export type AppRole = 'normal_user' | 'admin_user' | 'super_admin';

/**
 * Idempotently provisions `public.users` and `user_roles(normal_user)` on first
 * authenticated request when an `auth.users` signup trigger has not run yet.
 */
export async function ensureUserProvisioned(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(users).values({ id: userId }).onConflictDoNothing();
    await tx
      .insert(userRoles)
      .values({ userId, role: 'normal_user' })
      .onConflictDoNothing();
  });
}

/** Returns all application roles assigned to the user from Postgres. */
export async function getUserRoles(userId: string): Promise<AppRole[]> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));

  return rows.map((row) => row.role);
}

/** Checks whether the user currently holds `super_admin` in Postgres. */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, 'super_admin')))
    .limit(1);

  return rows.length > 0;
}

/**
 * Checks whether the user can manage the given museum:
 * either `super_admin`, or BOTH `admin_user` role and an `active` `museum_admins` row.
 */
export async function canManageMuseum(
  userId: string,
  museumId: string
): Promise<boolean> {
  const roles = await getUserRoles(userId);

  if (roles.includes('super_admin')) {
    return true;
  }

  if (!roles.includes('admin_user')) {
    return false;
  }

  const membership = await db
    .select({ museumId: museumAdmins.museumId })
    .from(museumAdmins)
    .where(
      and(
        eq(museumAdmins.museumId, museumId),
        eq(museumAdmins.userId, userId),
        eq(museumAdmins.status, 'active')
      )
    )
    .limit(1);

  return membership.length > 0;
}

/** Returns active managed museum IDs for `admin_user`, or empty if role is missing. */
export async function getManagedMuseumIds(userId: string): Promise<string[]> {
  const roles = await getUserRoles(userId);
  if (!roles.includes('admin_user')) {
    return [];
  }

  const rows = await db
    .select({ museumId: museumAdmins.museumId })
    .from(museumAdmins)
    .where(
      and(eq(museumAdmins.userId, userId), eq(museumAdmins.status, 'active'))
    );

  return rows.map((row) => row.museumId);
}
