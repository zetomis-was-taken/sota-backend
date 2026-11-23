import 'dotenv/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { closeDb, db } from '../src/db';
import {
  type AdminCliOptions,
  createOrUpdateAuthUser,
  ensurePublicUser,
  getSupabaseAdminClient,
  grantRoles,
  parseAdminCliArgs,
} from './lib/admin-utils';

export function printHelp(): void {
  console.log(`
Usage:
  npx tsx scripts/create-superadmin.ts [options]
  npm run admin:create-super -- [options]

Options:
  --email, -e           Email of the super admin (required)
  --password, -p        Password for the user (required for new accounts, min 6 chars)
  --name, -n            Display name (optional, e.g. "Main Super Admin")
  --display-name        Alias for --name
  --phone               Phone number (optional, e.g. "+84900000001")
  --help, -h            Show this help message

Examples:
  npx tsx scripts/create-superadmin.ts --email=super@example.com --password=SuperAdmin@123 --name="Super Admin"
`);
}

export interface CreateSuperadminDeps {
  supabase?: SupabaseClient;
  dbClient?: typeof db;
}

/**
 * Creates a new Super Admin or assigns super_admin role to an existing auth user.
 */
export async function runCreateSuperadmin(
  options: AdminCliOptions,
  deps: CreateSuperadminDeps = {}
): Promise<{ userId: string; email: string; isNew: boolean }> {
  if (!options.email) {
    throw new Error('Email is required. Use --email <address>.');
  }

  const supabase = deps.supabase ?? getSupabaseAdminClient();
  const dbClient = deps.dbClient ?? db;

  console.log(`\n--- Provisioning Super Admin: ${options.email} ---`);

  // 1. Create or update user in Supabase Auth
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

  // 2. Ensure record in public.users
  await ensurePublicUser(dbClient, {
    id: authUser.id,
    displayName: options.name,
    phone: options.phone,
  });
  console.log('  [✓] Updated public.users profile');

  // 3. Grant normal_user and super_admin roles
  await grantRoles(dbClient, authUser.id, ['normal_user', 'super_admin']);
  console.log('  [✓] Granted roles: normal_user, super_admin');

  console.log(`\nSuper Admin "${authUser.email}" provisioned successfully!\n`);

  return {
    userId: authUser.id,
    email: authUser.email,
    isNew: authUser.isNew,
  };
}

async function main(): Promise<void> {
  const options = parseAdminCliArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  try {
    await runCreateSuperadmin(options);
  } catch (error: any) {
    console.error('\nError creating super admin:', error.message);
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
