import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { museumAdmins, userRoles, users } from '../db/schema';
import { NotFoundError } from '../lib/errors';

export interface ProfileResponse {
  id: string;
  display_name: string | null;
  phone: string | null;
  roles: string[];
  managed_museums: { museum_id: string; status: string }[];
}

export interface UpdateProfileInput {
  display_name?: string | null;
  phone?: string | null;
}

export interface AdminUserItem {
  id: string;
  display_name: string | null;
  phone: string | null;
  roles: string[];
  managed_museums: { museum_id: string; status: string }[];
}

export interface ListAdminUsersResult {
  users: AdminUserItem[];
  total: number;
}

/** Fetches personal profile, roles, and active managed museums for GET /me. */
export async function getProfile(userId: string): Promise<ProfileResponse> {
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

  return {
    ...profile,
    roles,
    managed_museums: managedMuseums,
  };
}

/** Updates personal profile with null support for nullable columns for PATCH /me. */
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput
): Promise<{ id: string; display_name: string | null; phone: string | null }> {
  const updateValues: { displayName?: string | null; phone?: string | null } =
    {};

  if (input.display_name !== undefined) {
    updateValues.displayName = input.display_name;
  }
  if (input.phone !== undefined) {
    updateValues.phone = input.phone;
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

  return updated;
}

/** Lists paginated users with deterministic ordering and all museum memberships for super_admin. */
export async function listAdminUsers(
  limit: number,
  offset: number
): Promise<ListAdminUsersResult> {
  const [{ total }] = await db.select({ total: count() }).from(users);

  const userRows = await db
    .select({
      id: users.id,
      display_name: users.displayName,
      phone: users.phone,
    })
    .from(users)
    .orderBy(desc(users.createdAt), asc(users.id))
    .limit(limit)
    .offset(offset);

  if (userRows.length === 0) {
    return { users: [], total: Number(total) };
  }

  const userIds = userRows.map((u) => u.id);

  const roleRows = await db
    .select({
      userId: userRoles.userId,
      role: userRoles.role,
    })
    .from(userRoles)
    .where(inArray(userRoles.userId, userIds));

  const adminRows = await db
    .select({
      userId: museumAdmins.userId,
      museum_id: museumAdmins.museumId,
      status: museumAdmins.status,
    })
    .from(museumAdmins)
    .where(inArray(museumAdmins.userId, userIds));

  const roleMap = new Map<string, string[]>();
  for (const r of roleRows) {
    const existing = roleMap.get(r.userId) ?? [];
    existing.push(r.role);
    roleMap.set(r.userId, existing);
  }

  const museumMap = new Map<string, { museum_id: string; status: string }[]>();
  for (const m of adminRows) {
    const existing = museumMap.get(m.userId) ?? [];
    existing.push({ museum_id: m.museum_id, status: m.status });
    museumMap.set(m.userId, existing);
  }

  const resultUsers: AdminUserItem[] = userRows.map((user) => {
    const roles = roleMap.get(user.id) ?? [];

    return {
      id: user.id,
      display_name: user.display_name,
      phone: user.phone,
      roles,
      managed_museums: museumMap.get(user.id) ?? [],
    };
  });

  return { users: resultUsers, total: Number(total) };
}
