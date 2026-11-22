import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { db, closeDb } from '../src/db';
import { users, userRoles } from '../src/db/schema';
import { env } from '../src/config/env';

interface SuperAdminSeed {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
}

const DEFAULT_SUPERADMINS: SuperAdminSeed[] = [
  {
    email: 'superadmin@gmail.com',
    password: 'SuperAdmin@123456',
    displayName: 'Main Super Admin',
    phone: '+84900000001',
  },
  {
    email: 'superadmin1@gmail.com',
    password: 'SuperAdmin@123456',
    displayName: 'Super Admin 1',
    phone: '+84900000002',
  },
  {
    email: 'superadmin2@gmail.com',
    password: 'SuperAdmin@123456',
    displayName: 'Super Admin 2',
    phone: '+84900000003',
  },
];

async function seedSuperAdmins() {
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be configured in .env');
  }

  const supabase = createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Seeding superadmins...');

  for (const admin of DEFAULT_SUPERADMINS) {
    let userId: string | null = null;

    // 1. Check if user already exists in Supabase Auth
    const { data: userList, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      throw new Error(`Failed to list users from Supabase: ${listError.message}`);
    }

    const existingAuthUser = userList.users.find(
      (u) => u.email?.toLowerCase() === admin.email.toLowerCase()
    );

    if (existingAuthUser) {
      userId = existingAuthUser.id;
      console.log(`User ${admin.email} already exists in Supabase Auth (id: ${userId})`);
      
      // Update password to ensure it matches the default password
      await supabase.auth.admin.updateUserById(userId, {
        password: admin.password,
        email_confirm: true,
        user_metadata: { display_name: admin.displayName },
      });
    } else {
      // Create new user in Supabase Auth
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: admin.email,
        password: admin.password,
        email_confirm: true,
        user_metadata: { display_name: admin.displayName },
      });

      if (createError || !created.user) {
        throw new Error(`Failed to create user ${admin.email}: ${createError?.message}`);
      }

      userId = created.user.id;
      console.log(`Created user ${admin.email} in Supabase Auth (id: ${userId})`);
    }

    // 2. Ensure record in public.users
    await db
      .insert(users)
      .values({
        id: userId,
        displayName: admin.displayName,
        phone: admin.phone ?? null,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          displayName: admin.displayName,
          phone: admin.phone ?? null,
        },
      });

    // 3. Ensure super_admin and normal_user roles in public.user_roles
    await db
      .insert(userRoles)
      .values({
        userId,
        role: 'normal_user',
      })
      .onConflictDoNothing();

    await db
      .insert(userRoles)
      .values({
        userId,
        role: 'super_admin',
      })
      .onConflictDoNothing();

    console.log(`Assigned super_admin & normal_user roles for ${admin.email}`);
  }

  console.log('\nSuperadmins seeded successfully!');
}

async function run() {
  try {
    await seedSuperAdmins();
  } catch (error) {
    console.error('Seed superadmins failed:', error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

if (require.main === module) {
  void run();
}
