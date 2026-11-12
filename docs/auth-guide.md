# Auth Guide (Demo) — Museum Management System

How to use Supabase Auth correctly. This covers identity, roles, and access checks only; endpoint details belong in `api-contract.md`. Schema details are in `docs/database-design.md` §7.

## 1. Principles

1. **Authentication = Supabase Auth. Authorization = RLS.** There is no other security layer. If a query is allowed, it runs; if not, RLS returns no rows or an error.
2. **The client uses the anon key plus the user's session.** The `service_role` key bypasses RLS and must never reach the browser or a public bundle.
3. **Roles are stored in the database, not in the JWT.** A role change applies to the next query, not the next login.
4. **Never gate data in app code.** UI checks are convenience only; the database decides. Assume any client request can be replayed by hand.
5. **Idempotent signup.** The signup trigger creates `public.users` and `user_roles(normal_user)`; the client must not create or upsert either row.

## 2. Roles

| Role | Granted by | Scope |
|---|---|---|
| `normal_user` | Signup trigger | Own profile, carts, orders, invoices |
| `admin_user` | `super_admin` (SQL) | Managed museums, and only while `museum_admins.status = 'active'` |
| `super_admin` | SQL only (first row inserted manually) | Everything |

- `admin_user` alone grants nothing. Management requires **both** the role and an `active` `museum_admins` row (`private.can_manage_museum(museum_id)`).
- `super_admin` is not self-service. Never expose a way to grant it from the app.
- Revoking a membership takes effect immediately; the app should refetch roles on focus/reload rather than cache them for the session.
- Membership rows are reused on re-assignment; no history is kept.

## 3. Backend (database side)

- **Do not write to `auth.users`.** Supabase owns it. Application data lives in `public.users` (profile) and role tables.
- **Profiles:** only `display_name` and `phone` are client-updatable (column-level `GRANT UPDATE`). Do not add profile columns to the client's update payload; `id` and timestamps are server-owned.
- **RPCs are the only write path** for orders, items, invoices, payments, totals, and `entry_code`s. Each RPC is `SECURITY DEFINER`, `SET search_path = ''`, validates `auth.uid()` and inputs, and is revoked from `anon`.
- **RLS helpers** (`private.is_super_admin()`, `private.can_manage_museum()`) are the single source of authorization logic. Reuse them in new policies; do not duplicate role checks in SQL or TypeScript.
- **Policies must not recurse.** Queries against `museum_admins` from a policy go through `private.can_manage_museum()`.
- **Invoices are immutable** — no UPDATE/DELETE policy. Do not add one.
- **If a server layer is added** (e.g. Next.js route handlers), forward the caller's JWT and let RLS decide. Do not use `service_role` to "fix" a permission error, and do not implement a second authorization model there.
- **Admin provisioning** is SQL/seed work: grant `admin_user`, then insert/re-activate the `museum_admins` row. There is no app flow for it in this demo.

## 4. Frontend

- Create one Supabase client with the anon key. Enable session persistence and auto-refresh; for SSR frameworks use `@supabase/ssr` with cookies instead of `localStorage`.
- **Identity:** call `getUser()` when a decision depends on who the user is (it verifies the token). Use `getSession()` only for cheap UI state.
- **Session lifecycle:** `signUp` → (email confirmation, if enabled) → `signInWithPassword` → `signOut`. React to `onAuthStateChange` to update the UI; do not poll.
- **Route guards are UX only.** Redirecting unauthenticated users is fine; hiding admin pages is fine. Neither is security — keep RLS as the enforcement.
- **Role-aware UI:** fetch the current user's `user_roles` and active `museum_admins` rows, then show admin affordances. On a denied call, show "not allowed" rather than falling back to cached data.
- **Errors:** expired/invalid session → sign out and redirect to login. RLS denial (empty result or permission error) → treat as unauthorized; never retry with a privileged key.
- **Admin UI is scoped to a museum.** Pick the museum first, then filter everything by `museum_id`; do not build a cross-museum admin view for a `normal_user`/`admin_user`.
- **Fake payment is server-side.** The client never sets `payment_status`, totals, or `entry_code`; it only calls the RPC and displays the result.
- **No secrets:** only the anon key and the Supabase URL are public configuration.

## 5. Typical flows

1. **Sign up / sign in** — Supabase Auth creates the session; the trigger has already created the profile and `normal_user` role.
2. **Browse catalog as `anon`** — no session required; only `published` data and media are visible.
3. **Buy tickets / checkout** — signed-in user calls the RPC; the order, invoice, and fake payment are written server-side.
4. **Manage a museum** — `super_admin` grants `admin_user` and an `active` membership by SQL; the admin signs in and sees only that museum's draft data and admin actions.
5. **Redeem an entry code** — admin-only RPC, scoped by `can_manage_museum()`.
6. **Sign out** — clear the session; do not keep role or profile data in global state.

## 6. Checklist

- [ ] No `service_role` key in the frontend or in any public config.
- [ ] No client writes to `user_roles`, `museum_admins`, orders, items, invoices, or `entry_code`.
- [ ] No authorization logic duplicated outside RLS helpers and RPCs.
- [ ] Test as `anon`, `normal_user`, `admin_user`, and `super_admin`; confirm the middle two lose access when membership is revoked.
- [ ] Verify a published artifact inside a draft museum is not visible to `anon`.
