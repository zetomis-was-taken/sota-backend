import 'dotenv/config';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../../src/config/env';
import { db as defaultDb } from '../../src/db';
import {
  museumAdmins,
  museums,
  userRoles,
  users,
} from '../../src/db/schema';
import { type AppRole } from '../../src/lib/auth';
import { uuidSchema } from '../../src/lib/validation';

export const emailSchema = z.string().trim().email('Invalid email address format');

export interface AdminCliOptions {
  email?: string;
  password?: string;
  name?: string;
  phone?: string;
  userId?: string;
  museum?: string;
  assignedBy?: string;
  help?: boolean;
}

/**
 * Parses command-line arguments into structured AdminCliOptions.
 * Supports flags: --email, -e, --password, -p, --name, -n, --display-name,
 * --phone, --user-id, -u, --museum, -m, --museum-id, --museum-slug,
 * --assigned-by, --help, -h.
 * Supports both `--flag=value` and `--flag value` syntax.
 */
export function parseAdminCliArgs(argv: string[]): AdminCliOptions {
  const options: AdminCliOptions = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--email=')) {
      options.email = arg.slice('--email='.length).trim();
    } else if (arg === '--email' || arg === '-e') {
      options.email = argv[++i]?.trim();
    } else if (arg.startsWith('--password=')) {
      options.password = arg.slice('--password='.length);
    } else if (arg === '--password' || arg === '-p') {
      options.password = argv[++i];
    } else if (arg.startsWith('--name=')) {
      options.name = arg.slice('--name='.length).trim();
    } else if (arg.startsWith('--display-name=')) {
      options.name = arg.slice('--display-name='.length).trim();
    } else if (arg === '--name' || arg === '--display-name' || arg === '-n') {
      options.name = argv[++i]?.trim();
    } else if (arg.startsWith('--phone=')) {
      options.phone = arg.slice('--phone='.length).trim();
    } else if (arg === '--phone') {
      options.phone = argv[++i]?.trim();
    } else if (arg.startsWith('--user-id=')) {
      options.userId = arg.slice('--user-id='.length).trim();
    } else if (arg.startsWith('--userId=')) {
      options.userId = arg.slice('--userId='.length).trim();
    } else if (arg === '--user-id' || arg === '--userId' || arg === '-u') {
      options.userId = argv[++i]?.trim();
    } else if (arg.startsWith('--museum=')) {
      options.museum = arg.slice('--museum='.length).trim();
    } else if (arg.startsWith('--museum-id=')) {
      options.museum = arg.slice('--museum-id='.length).trim();
    } else if (arg.startsWith('--museum-slug=')) {
      options.museum = arg.slice('--museum-slug='.length).trim();
    } else if (
      arg === '--museum' ||
      arg === '--museum-id' ||
      arg === '--museum-slug' ||
      arg === '-m'
    ) {
      options.museum = argv[++i]?.trim();
    } else if (arg.startsWith('--assigned-by=')) {
      options.assignedBy = arg.slice('--assigned-by='.length).trim();
    } else if (arg === '--assigned-by') {
      options.assignedBy = argv[++i]?.trim();
    }
  }

  return options;
}

/**
 * Initializes and returns a Supabase client configured with the service role secret key.
 */
export function getSupabaseAdminClient(): SupabaseClient {
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SECRET_KEY must be configured in .env'
    );
  }

  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Searches for a user in Supabase Auth by email (case-insensitive).
 */
export async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<User | null> {
  const normalizedEmail = email.toLowerCase().trim();
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Failed to list users from Supabase: ${error.message}`);
    }

    const match = data.users.find(
      (u) => u.email?.toLowerCase().trim() === normalizedEmail
    );
    if (match) {
      return match;
    }

    if (data.users.length < perPage) {
      break;
    }
    page++;
  }

  return null;
}

/**
 * Finds a user in Supabase Auth by their user ID.
 */
export async function findAuthUserById(
  supabase: SupabaseClient,
  userId: string
): Promise<User | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return null;
  }
  return data.user;
}

/**
 * Creates a new user in Supabase Auth, or updates their credentials if they already exist.
 */
export async function createOrUpdateAuthUser(
  supabase: SupabaseClient,
  params: {
    email: string;
    password?: string;
    displayName?: string;
    phone?: string;
  }
): Promise<{ id: string; email: string; isNew: boolean }> {
  const validationResult = emailSchema.safeParse(params.email);
  if (!validationResult.success) {
    throw new Error(`Invalid email: ${validationResult.error.issues[0].message}`);
  }

  const existing = await findAuthUserByEmail(supabase, params.email);

  if (existing) {
    const updatePayload: {
      password?: string;
      email_confirm?: boolean;
      user_metadata?: Record<string, unknown>;
    } = {
      email_confirm: true,
    };

    if (params.password) {
      if (params.password.length < 6) {
        throw new Error('Password must be at least 6 characters long.');
      }
      updatePayload.password = params.password;
    }

    if (params.displayName) {
      updatePayload.user_metadata = {
        ...(existing.user_metadata ?? {}),
        display_name: params.displayName,
      };
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      existing.id,
      updatePayload
    );

    if (updateError) {
      throw new Error(
        `Failed to update user in Supabase Auth: ${updateError.message}`
      );
    }

    return {
      id: existing.id,
      email: existing.email ?? params.email,
      isNew: false,
    };
  }

  if (!params.password) {
    throw new Error('Password is required when creating a new user.');
  }

  if (params.password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: true,
      user_metadata: params.displayName
        ? { display_name: params.displayName }
        : undefined,
    });

  if (createError || !created.user) {
    throw new Error(
      `Failed to create user in Supabase Auth: ${createError?.message}`
    );
  }

  return {
    id: created.user.id,
    email: created.user.email ?? params.email,
    isNew: true,
  };
}

/**
 * Ensures a record exists in `public.users`, updating display_name or phone if provided.
 */
export async function ensurePublicUser(
  dbClient: any = defaultDb,
  params: {
    id: string;
    displayName?: string | null;
    phone?: string | null;
  }
): Promise<void> {
  const updateSet: Record<string, unknown> = {};
  if (params.displayName !== undefined) {
    updateSet.displayName = params.displayName;
  }
  if (params.phone !== undefined) {
    updateSet.phone = params.phone;
  }

  if (Object.keys(updateSet).length > 0) {
    await dbClient
      .insert(users)
      .values({
        id: params.id,
        displayName: params.displayName ?? null,
        phone: params.phone ?? null,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: updateSet,
      });
  } else {
    await dbClient
      .insert(users)
      .values({
        id: params.id,
        displayName: null,
        phone: null,
      })
      .onConflictDoNothing();
  }
}

/**
 * Grants application roles in `public.user_roles` with `onConflictDoNothing()`.
 */
export async function grantRoles(
  dbClient: any = defaultDb,
  userId: string,
  roles: AppRole[]
): Promise<void> {
  for (const role of roles) {
    await dbClient
      .insert(userRoles)
      .values({
        userId,
        role,
      })
      .onConflictDoNothing();
  }
}

/**
 * Looks up a museum by UUID or slug.
 */
export async function findMuseumByIdOrSlug(
  dbClient: any = defaultDb,
  identifier: string
): Promise<{ id: string; name: string; slug: string; status: string } | null> {
  const trimmed = identifier.trim();
  const isUuid = uuidSchema.safeParse(trimmed).success;

  const condition = isUuid
    ? or(eq(museums.id, trimmed), eq(museums.slug, trimmed))
    : eq(museums.slug, trimmed);

  const [row] = await dbClient
    .select({
      id: museums.id,
      name: museums.name,
      slug: museums.slug,
      status: museums.status,
    })
    .from(museums)
    .where(condition)
    .limit(1);

  return row ?? null;
}

/**
 * Assigns an admin to a museum in `public.museum_admins`, setting status to 'active'.
 */
export async function assignMuseumAdmin(
  dbClient: any = defaultDb,
  params: {
    museumId: string;
    userId: string;
    assignedBy?: string | null;
  }
): Promise<void> {
  await dbClient
    .insert(museumAdmins)
    .values({
      museumId: params.museumId,
      userId: params.userId,
      status: 'active',
      assignedBy: params.assignedBy ?? null,
      assignedAt: new Date(),
      revokedAt: null,
    })
    .onConflictDoUpdate({
      target: [museumAdmins.museumId, museumAdmins.userId],
      set: {
        status: 'active',
        assignedBy: params.assignedBy ?? null,
        assignedAt: new Date(),
        revokedAt: null,
      },
    });
}
