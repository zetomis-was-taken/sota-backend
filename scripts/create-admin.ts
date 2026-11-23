import 'dotenv/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { closeDb, db } from '../src/db';
import { uuidSchema } from '../src/lib/validation';
import {
  type AdminCliOptions,
  assignMuseumAdmin,
  createOrUpdateAuthUser,
  ensurePublicUser,
  findMuseumByIdOrSlug,
  getSupabaseAdminClient,
  grantRoles,
  parseAdminCliArgs,
} from './lib/admin-utils';

export function printHelp(): void {
  console.log(`
Usage:
  npx tsx scripts/create-admin.ts [options]
  npm run admin:create -- [options]

Options:
  --email, -e           Email of the admin (required)
  --password, -p        Password for the user (required for new accounts, min 6 chars)
  --name, -n            Display name (optional, e.g. "Museum Manager")
  --display-name        Alias for --name
  --phone               Phone number (optional)
  --museum, -m          Museum UUID or slug to assign for management (optional)
  --museum-slug         Alias for --museum
  --museum-id           Alias for --museum
  --assigned-by         UUID of the super admin performing the assignment (optional)
  --help, -h            Show this help message

Examples:
  npx tsx scripts/create-admin.ts --email=admin@example.com --password=AdminPassword@123 --name="Admin User"
  npx tsx scripts/create-admin.ts --email=admin@example.com --password=AdminPassword@123 --museum=national-museum-of-natural-history
`);
}

export interface CreateAdminDeps {
  supabase?: SupabaseClient;
  dbClient?: typeof db;
}

/**
 * Creates a new normal admin user (admin_user) and optionally assigns them to a museum.
 */
export async function runCreateAdmin(
  options: AdminCliOptions,
  deps: CreateAdminDeps = {}
): Promise<{
  userId: string;
  email: string;
  isNew: boolean;
  assignedMuseumId?: string;
}> {
  if (!options.email) {
    throw new Error('Email is required. Use --email <address>.');
  }

  if (options.assignedBy) {
    const validAssignedBy = uuidSchema.safeParse(options.assignedBy);
    if (!validAssignedBy.success) {
      throw new Error(`Invalid --assigned-by UUID format: ${options.assignedBy}`);
    }
  }

  const supabase = deps.supabase ?? getSupabaseAdminClient();
  const dbClient = deps.dbClient ?? db;

  // 1. If museum is specified, verify it exists before modifying auth/users
  let targetMuseum: { id: string; name: string; slug: string } | null = null;
  if (options.museum) {
    targetMuseum = await findMuseumByIdOrSlug(dbClient, options.museum);
    if (!targetMuseum) {
      throw new Error(
        `Museum "${options.museum}" not found in database. Please verify the museum ID or slug.`
      );
    }
  }

  console.log(`\n--- Provisioning Museum Admin: ${options.email} ---`);

  // 2. Create or update user in Supabase Auth
  const authUser = await createOrUpdateAuthUser(supabase, {
    email: options.email,
    password: options.password,
    displayName: options.name,
    phone: options.phone,
  });

  console.log(
    authUser.isNew
      ? `  [✓] Created new auth account (ID: ${authUser.id})`
      : `  [✓] Found existing auth account (ID: ${authUser.id}), updated metadata`
  );

  // 3. Ensure record in public.users
  await ensurePublicUser(dbClient, {
    id: authUser.id,
    displayName: options.name,
    phone: options.phone,
  });
  console.log('  [✓] Updated public.users profile');

  // 4. Grant normal_user and admin_user roles
  await grantRoles(dbClient, authUser.id, ['normal_user', 'admin_user']);
  console.log('  [✓] Granted roles: normal_user, admin_user');

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
      `      You can assign a museum anytime using: npm run admin:grant -- --email=${options.email} --museum=<museum-slug>`
    );
  }

  console.log(`\nAdmin "${authUser.email}" provisioned successfully!\n`);

  return {
    userId: authUser.id,
    email: authUser.email,
    isNew: authUser.isNew,
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
    await runCreateAdmin(options);
  } catch (error: any) {
    console.error('\nError creating admin:', error.message);
    if (!options.email) {
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
