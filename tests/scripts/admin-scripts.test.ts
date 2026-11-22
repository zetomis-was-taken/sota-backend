import { describe, expect, it, vi } from 'vitest';
import {
  assignMuseumAdmin,
  findMuseumByIdOrSlug,
  parseAdminCliArgs,
} from '../../scripts/lib/admin-utils';
import { runCreateSuperadmin } from '../../scripts/create-superadmin';
import { runCreateAdmin } from '../../scripts/create-admin';
import { runGrantAdmin } from '../../scripts/grant-admin';

describe('Admin Management Scripts', () => {
  describe('parseAdminCliArgs', () => {
    it('parses flags with space-separated syntax', () => {
      const parsed = parseAdminCliArgs([
        '--email',
        'admin@example.com',
        '--password',
        'Pass123456',
        '--name',
        'Test Admin',
        '--phone',
        '+84999999999',
        '--museum',
        'test-museum-slug',
        '--assigned-by',
        '11111111-1111-4111-8111-111111111111',
      ]);

      expect(parsed).toEqual({
        email: 'admin@example.com',
        password: 'Pass123456',
        name: 'Test Admin',
        phone: '+84999999999',
        museum: 'test-museum-slug',
        assignedBy: '11111111-1111-4111-8111-111111111111',
      });
    });

    it('parses flags with = syntax', () => {
      const parsed = parseAdminCliArgs([
        '--email=super@example.com',
        '--password=SuperPass123',
        '--display-name=Super Admin',
        '--phone=+84123456789',
        '--user-id=22222222-2222-4222-8222-222222222222',
        '--museum-slug=natural-history',
      ]);

      expect(parsed).toEqual({
        email: 'super@example.com',
        password: 'SuperPass123',
        name: 'Super Admin',
        phone: '+84123456789',
        userId: '22222222-2222-4222-8222-222222222222',
        museum: 'natural-history',
      });
    });

    it('parses shorthand flags: -e, -p, -n, -u, -m, -h', () => {
      const parsed = parseAdminCliArgs([
        '-e',
        'short@example.com',
        '-p',
        'ShortPass123',
        '-n',
        'Short Name',
        '-u',
        '33333333-3333-4333-8333-333333333333',
        '-m',
        'short-museum',
        '-h',
      ]);

      expect(parsed).toEqual({
        email: 'short@example.com',
        password: 'ShortPass123',
        name: 'Short Name',
        userId: '33333333-3333-4333-8333-333333333333',
        museum: 'short-museum',
        help: true,
      });
    });
  });

  describe('create-superadmin.ts (runCreateSuperadmin)', () => {
    it('throws when email is missing', async () => {
      await expect(runCreateSuperadmin({})).rejects.toThrow(
        /Email is required/
      );
    });

    it('throws when creating new auth user with password shorter than 6 characters', async () => {
      const mockSupabase = {
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          },
        },
      } as any;

      await expect(
        runCreateSuperadmin(
          { email: 'super@example.com', password: '123' },
          { supabase: mockSupabase }
        )
      ).rejects.toThrow(/at least 6 characters/);
    });

    it('successfully provisions a new superadmin in Auth and Postgres', async () => {
      const newUserId = '11111111-1111-4111-8111-111111111111';

      const mockSupabase = {
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
            createUser: vi.fn().mockResolvedValue({
              data: { user: { id: newUserId, email: 'super@example.com' } },
              error: null,
            }),
          },
        },
      } as any;

      const userInsertValues = vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      });

      const roleInsertValues = vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      });

      const mockDb = {
        insert: vi.fn((table: any) => {
          if (table._?.name === 'users' || table.id) {
            return { values: userInsertValues };
          }
          return { values: roleInsertValues };
        }),
      } as any;

      const result = await runCreateSuperadmin(
        {
          email: 'super@example.com',
          password: 'Password123',
          name: 'Main Admin',
          phone: '+84900000001',
        },
        { supabase: mockSupabase, dbClient: mockDb }
      );

      expect(result).toEqual({
        userId: newUserId,
        email: 'super@example.com',
        isNew: true,
      });

      expect(mockSupabase.auth.admin.createUser).toHaveBeenCalledWith({
        email: 'super@example.com',
        password: 'Password123',
        email_confirm: true,
        user_metadata: { display_name: 'Main Admin' },
      });

      expect(userInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          id: newUserId,
          displayName: 'Main Admin',
          phone: '+84900000001',
        })
      );

      // Verify super_admin and normal_user were granted
      expect(roleInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({ userId: newUserId, role: 'normal_user' })
      );
      expect(roleInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({ userId: newUserId, role: 'super_admin' })
      );
    });

    it('updates existing auth account when email already exists', async () => {
      const existingUserId = '22222222-2222-4222-8222-222222222222';

      const mockSupabase = {
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({
              data: {
                users: [
                  {
                    id: existingUserId,
                    email: 'existing@example.com',
                    user_metadata: {},
                  },
                ],
              },
              error: null,
            }),
            updateUserById: vi.fn().mockResolvedValue({ error: null }),
          },
        },
      } as any;

      const mockDb = {
        insert: vi.fn(() => ({
          values: vi.fn().mockReturnValue({
            onConflictDoUpdate: vi.fn().mockResolvedValue([]),
            onConflictDoNothing: vi.fn().mockResolvedValue([]),
          }),
        })),
      } as any;

      const result = await runCreateSuperadmin(
        {
          email: 'existing@example.com',
          password: 'NewPassword123',
          name: 'Updated Name',
        },
        { supabase: mockSupabase, dbClient: mockDb }
      );

      expect(result).toEqual({
        userId: existingUserId,
        email: 'existing@example.com',
        isNew: false,
      });

      expect(mockSupabase.auth.admin.updateUserById).toHaveBeenCalledWith(
        existingUserId,
        expect.objectContaining({
          password: 'NewPassword123',
          email_confirm: true,
          user_metadata: { display_name: 'Updated Name' },
        })
      );
    });
  });

  describe('create-admin.ts (runCreateAdmin)', () => {
    it('throws when email is missing', async () => {
      await expect(runCreateAdmin({})).rejects.toThrow(/Email is required/);
    });

    it('throws when --assigned-by is not a valid UUID', async () => {
      await expect(
        runCreateAdmin({
          email: 'admin@example.com',
          assignedBy: 'not-a-uuid',
        })
      ).rejects.toThrow(/Invalid --assigned-by UUID format/);
    });

    it('throws when requested museum is not found', async () => {
      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      } as any;

      await expect(
        runCreateAdmin(
          {
            email: 'admin@example.com',
            museum: 'nonexistent-museum',
          },
          { dbClient: mockDb }
        )
      ).rejects.toThrow(/Museum "nonexistent-museum" not found in database/);
    });

    it('creates admin user and assigns museum admin membership when museum is provided', async () => {
      const adminUserId = '33333333-3333-4333-8333-333333333333';
      const museumId = '44444444-4444-4444-8444-444444444444';

      const mockSupabase = {
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
            createUser: vi.fn().mockResolvedValue({
              data: { user: { id: adminUserId, email: 'admin@example.com' } },
              error: null,
            }),
          },
        },
      } as any;

      const museumAdminValues = vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
      });

      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  id: museumId,
                  name: 'National Museum of Natural History',
                  slug: 'natural-history',
                  status: 'published',
                },
              ]),
            })),
          })),
        })),
        insert: vi.fn((table: any) => {
          if (table.museumId) {
            return { values: museumAdminValues };
          }
          return {
            values: vi.fn().mockReturnValue({
              onConflictDoUpdate: vi.fn().mockResolvedValue([]),
              onConflictDoNothing: vi.fn().mockResolvedValue([]),
            }),
          };
        }),
      } as any;

      const result = await runCreateAdmin(
        {
          email: 'admin@example.com',
          password: 'Password123',
          museum: 'natural-history',
        },
        { supabase: mockSupabase, dbClient: mockDb }
      );

      expect(result).toEqual({
        userId: adminUserId,
        email: 'admin@example.com',
        isNew: true,
        assignedMuseumId: museumId,
      });

      expect(museumAdminValues).toHaveBeenCalledWith(
        expect.objectContaining({
          museumId,
          userId: adminUserId,
          status: 'active',
        })
      );
    });
  });

  describe('grant-admin.ts (runGrantAdmin)', () => {
    it('throws when neither --email nor --user-id is provided', async () => {
      await expect(runGrantAdmin({})).rejects.toThrow(
        /Either --email or --user-id is required/
      );
    });

    it('throws when user is not found in Supabase Auth', async () => {
      const mockSupabase = {
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          },
        },
      } as any;

      await expect(
        runGrantAdmin(
          { email: 'nonexistent@example.com' },
          { supabase: mockSupabase }
        )
      ).rejects.toThrow(/was not found in Supabase Auth/);
    });

    it('grants admin_user role to an existing user by email and assigns museum', async () => {
      const userId = '55555555-5555-4555-8555-555555555555';
      const museumId = '66666666-6666-4666-8666-666666666666';

      const mockSupabase = {
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({
              data: {
                users: [{ id: userId, email: 'normaluser@example.com' }],
              },
              error: null,
            }),
          },
        },
      } as any;

      const museumAdminValues = vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
      });

      const roleInsertValues = vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      });

      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  id: museumId,
                  name: 'National Air and Space Museum',
                  slug: 'air-and-space',
                  status: 'published',
                },
              ]),
            })),
          })),
        })),
        insert: vi.fn((table: any) => {
          if (table.museumId) {
            return { values: museumAdminValues };
          }
          if (table.role) {
            return { values: roleInsertValues };
          }
          return {
            values: vi.fn().mockReturnValue({
              onConflictDoNothing: vi.fn().mockResolvedValue([]),
            }),
          };
        }),
      } as any;

      const result = await runGrantAdmin(
        {
          email: 'normaluser@example.com',
          museum: 'air-and-space',
        },
        { supabase: mockSupabase, dbClient: mockDb }
      );

      expect(result).toEqual({
        userId,
        email: 'normaluser@example.com',
        assignedMuseumId: museumId,
      });

      // Verify admin_user role was granted
      expect(roleInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({ userId, role: 'admin_user' })
      );

      // Verify museum_admins membership was assigned
      expect(museumAdminValues).toHaveBeenCalledWith(
        expect.objectContaining({
          museumId,
          userId,
          status: 'active',
        })
      );
    });

    it('grants admin_user role to an existing user by user-id without museum', async () => {
      const userId = '77777777-7777-4777-8777-777777777777';

      const mockSupabase = {
        auth: {
          admin: {
            getUserById: vi.fn().mockResolvedValue({
              data: { user: { id: userId, email: 'user7@example.com' } },
              error: null,
            }),
          },
        },
      } as any;

      const roleInsertValues = vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      });

      const mockDb = {
        insert: vi.fn(() => ({
          values: roleInsertValues,
        })),
      } as any;

      const result = await runGrantAdmin(
        { userId },
        { supabase: mockSupabase, dbClient: mockDb }
      );

      expect(result).toEqual({
        userId,
        email: 'user7@example.com',
        assignedMuseumId: undefined,
      });

      expect(roleInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({ userId, role: 'admin_user' })
      );
    });
  });

  describe('admin-utils helper functions', () => {
    it('findMuseumByIdOrSlug searches by id when passed a valid UUID', async () => {
      const testUuid = '88888888-8888-4888-8888-888888888888';
      const mockDb = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                { id: testUuid, name: 'UUID Museum', slug: 'uuid-museum', status: 'published' },
              ]),
            })),
          })),
        })),
      } as any;

      const found = await findMuseumByIdOrSlug(mockDb, testUuid);
      expect(found).toEqual({
        id: testUuid,
        name: 'UUID Museum',
        slug: 'uuid-museum',
        status: 'published',
      });
    });

    it('assignMuseumAdmin executes onConflictDoUpdate to reactivate membership', async () => {
      const museumId = '11111111-1111-4111-8111-111111111111';
      const userId = '22222222-2222-4222-8222-222222222222';

      const onConflictDoUpdate = vi.fn().mockResolvedValue([]);
      const mockDb = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            onConflictDoUpdate,
          })),
        })),
      } as any;

      await assignMuseumAdmin(mockDb, { museumId, userId });

      expect(onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({
            status: 'active',
            revokedAt: null,
          }),
        })
      );
    });
  });
});
