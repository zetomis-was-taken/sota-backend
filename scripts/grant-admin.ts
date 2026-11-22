import 'dotenv/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { closeDb, db } from '../src/db';
import { uuidSchema } from '../src/lib/validation';
import {
  type AdminCliOptions,
  assignMuseumAdmin,
  ensurePublicUser,
  findAuthUserByEmail,
  findAuthUserById,
  findMuseumByIdOrSlug,
  getSupabaseAdminClient,
  grantRoles,
  parseAdminCliArgs,
} from './lib/admin-utils';

export function printHelp(): void {
  console.log(`
Usage:
  npx tsx scripts/grant-admin.ts [options]
  npm run admin:grant -- [options]

Options:
  --email, -e           Email of the existing normal user (either --email or --user-id required)
  --user-id, -u         UUID of the user (either --email or --user-id required)
  --museum, -m          Museum UUID or slug to assign for management (optional)
  --museum-slug         Alias for --museum
  --museum-id           Alias for --museum
  --assigned-by         UUID of the super admin performing the assignment (optional)
  --help, -h            Show this help message

Examples:
  npx tsx scripts/grant-admin.ts --email=user@example.com --museum=national-museum-of-natural-history
  npx tsx scripts/grant-admin.ts --user-id=11111111-2222-3333-4444-555555555555 --museum=national-air-and-space-museum
`);
}

export interface GrantAdminDeps {
  supabase?: SupabaseClient;
  dbClient?: typeof db;
}

/**
 * Grants admin_user role to an existing user and optionally assigns museum management rights.
 */
export async function runGrantAdmin(
  options: AdminCliOptions,
  deps: GrantAdminDeps = {}
): Promise<{
  userId: string;
  email?: string;
  assignedMuseumId?: string;
}> {
  if (!options.email && !options.userId) {
    throw new Error('Either --email or --user-id is required.');
  }

  if (options.userId) {
    const validUserId = uuidSchema.safeParse(options.userId);
    if (!validUserId.success) {
      throw new Error(`Invalid --user-id format: ${options.userId}`);
    }
  }

  if (options.assignedBy) {
    const validAssignedBy = uuidSchema.safeParse(options.assignedBy);
    if (!validAssignedBy.success) {
      throw new Error(`Invalid --assigned-by UUID format: ${options.assignedBy}`);
    }
  }

  const supabase = deps.supabase ?? getSupabaseAdminClient();
  const dbClient = deps.dbClient ?? db;

  // 1. If museum is specified, verify it exists before granting roles
  let targetMuseum: { id: string; name: string; slug: string } | null = null;
  if (options.museum) {
    targetMuseum = await findMuseumByIdOrSlug(dbClient, options.museum);
    if (!targetMuseum) {
      throw new Error(
        `Museum "${options.museum}" not found in database. Please verify the museum ID or slug.`
      );
    }
  }

  // 2. Look up the user in Supabase Auth
  let authUser: { id: string; email?: string } | null = null;
  if (options.email) {
    const user = await findAuthUserByEmail(supabase, options.email);
    if (user) {
      authUser = { id: user.id, email: user.email };
    }
  } else if (options.userId) {
    const user = await findAuthUserById(supabase, options.userId);
    if (user) {
      authUser = { id: user.id, email: user.email };
    }
  }

  if (!authUser) {
    const targetIdentifier = options.email ?? options.userId;
    throw new Error(
      `User "${targetIdentifier}" was not found in Supabase Auth. Please ensure the user has signed up first.`
    );
  }

  console.log(
    `\n--- Granting Admin Role to User: ${authUser.email ?? authUser.id} ---`
  );

  // 3. Ensure record exists in public.users
  await ensurePublicUser(dbClient, {
    id: authUser.id,
  });
  console.log('  [✓] Verified user in public.users');

  // 4. Grant admin_user role (and normal_user if missing)
  await grantRoles(dbClient, authUser.id, ['normal_user', 'admin_user']);
  console.log('  [✓] Granted role: admin_user');

  // 5. Assign to museum if specified
  let assignedMuseumId: string | undefined;
  if (targetMuseum) {
    await assignMuseumAdmin(dbClient, {
      museumId: targetMuseum.id,
      userId: authUser.id,
      assignedBy: options.assignedBy,
    });
    assignedMuseumId = targetMuseum.id;
    console.log(
      `  [✓] Assigned active management rights for museum: "${targetMuseum.name}" (${targetMuseum.slug})`
    );
  } else {
    console.log(
      `  [!] Notice: User has 'admin_user' role, but is not currently assigned to any museum.`
    );
    console.log(
      `      According to docs/auth-guide.md, an admin must have an active entry in museum_admins to manage a museum.`
    );
    console.log(
      `      You can assign a museum anytime using: npm run admin:grant -- --email=${authUser.email} --museum=<museum-slug>`
    );
  }

  console.log(
    `\nAdmin role granted successfully to "${authUser.email ?? authUser.id}"!\n`
  );

  return {
    userId: authUser.id,
    email: authUser.email,
    assignedMuseumId,
  };
}

async function main(): Promise<void> {
  const options = parseAdminCliArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  try {
    await runGrantAdmin(options);
  } catch (error: any) {
    console.error('\nError granting admin role:', error.message);
    if (!options.email && !options.userId) {
      printHelp();
    }
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

if (require.main === module) {
  void main();
}
