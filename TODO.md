# Backend Implementation TODO — Museum Management System (Demo)

End-to-end checklist to implement, test, and deploy the Supabase/Postgres backend defined in [`docs/database-design.md`](docs/database-design.md), [`docs/api-contract.md`](docs/api-contract.md), and [`docs/auth-guide.md`](docs/auth-guide.md).

> **Scope guard:** Follow [`docs/database-design.md`](docs/database-design.md) §10 strictly — do not add real payments, webhooks, refunds, audit logs, membership history, account deletion, stock reservations, capacity limits, configurable slots, multi-museum carts/orders, per-person QR codes, search, or notifications.

---

## Phase 1 — Supabase Project & Tooling Setup

- [x] Initialize Supabase project in the repo (`supabase init`) to create `supabase/config.toml`.
- [x] Configure `supabase/config.toml`:
  - [x] Enable email/password auth and configure email confirmation behavior for local demo/testing.
  - [x] Set Storage file size limits and allowed MIME types (`image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/webm`).
  - [x] Verify database timezone stays UTC (`(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` is handled inside RPCs).
- [x] Add `.gitignore` (ignore `.env`, `.env.local`, `supabase/.temp/`, etc.) and `.env.example` containing only `SUPABASE_URL` and `SUPABASE_ANON_KEY` (never expose `service_role`).
- [x] Choose and configure verification tooling (e.g., `supabase test db` with pgTAP + an HTTP integration test runner against local `/auth/v1`, `/rest/v1`, `/storage/v1`).
- [ ] Record exact local setup, migration, and test commands in [`AGENTS.md`](AGENTS.md).

---

## Phase 2 — Database Schema & Migrations (`supabase/migrations/`)

### 2.1 Extensions, Schemas, Sequences & Enums
- [ ] Ensure `pgcrypto` is available for `gen_random_uuid()` and cryptographic random `entry_code` generation.
- [ ] Create `private` schema for RLS helper functions (`REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated`).
- [ ] Create shared `public.invoice_seq` sequence for globally unique `TKT-` and `SHP-` invoice numbers.
- [ ] Create all 9 enums (`docs/database-design.md` §3):
  - [ ] `app_role` (`normal_user`, `admin_user`, `super_admin`)
  - [ ] `publication_status` (`draft`, `published`, `archived`)
  - [ ] `media_type` (`image`, `video`)
  - [ ] `media_entity_type` (`artifact`, `souvenir`)
  - [ ] `ticket_order_status` (`pending`, `confirmed`, `used`, `cancelled`)
  - [ ] `payment_status` (`unpaid`, `paid`, `failed`)
  - [ ] `cart_status` (`active`, `converted`, `abandoned`)
  - [ ] `shop_order_status` (`pending`, `confirmed`, `shipped`, `completed`, `cancelled`)
  - [ ] `admin_membership_status` (`active`, `suspended`, `revoked`)
- [ ] Create shared `public.set_updated_at()` trigger function.

### 2.2 Tables, Constraints & Indexes (`docs/database-design.md` §5–6)
- [ ] `users`: `id` PK FK `auth.users(id) ON DELETE CASCADE`, `display_name` (nullable), `phone` (nullable), `created_at`, `updated_at`.
- [ ] `user_roles`: `user_id` FK `users(id) ON DELETE CASCADE`, `role` `app_role`, PK `(user_id, role)`, `created_at`.
- [ ] `museums`: `id`, `name`, `slug` unique, `description`, `address`, `city`, `cover_image_path`, `status` default `'draft'`, `created_by` FK `users(id) ON DELETE SET NULL`, `created_at`, `updated_at`.
- [ ] `museum_admins`: `museum_id` FK `museums(id) ON DELETE CASCADE`, `user_id` FK `users(id) ON DELETE CASCADE`, `status` default `'active'`, `assigned_by` FK `users(id) ON DELETE SET NULL`, `assigned_at` default `now()`, `revoked_at` (nullable), PK `(museum_id, user_id)`.
- [ ] `artifacts`: `id`, `museum_id` FK `museums(id) ON DELETE RESTRICT`, `name`, `description`, `period`, `inventory_code`, `status` default `'draft'`, `created_by` FK `users(id) ON DELETE SET NULL`, timestamps; partial unique `(museum_id, inventory_code) WHERE inventory_code IS NOT NULL`.
- [ ] `souvenir_products`: `id`, `museum_id` FK `museums(id) ON DELETE RESTRICT`, `name`, `description`, `sku`, `price` `numeric(12,2) CHECK (price >= 0)`, `currency` default `'VND' CHECK (currency = 'VND')`, `stock_quantity` integer default `0 CHECK (stock_quantity >= 0)`, `status` default `'draft'`, `created_by` FK `users(id) ON DELETE SET NULL`, timestamps; partial unique `(museum_id, sku) WHERE sku IS NOT NULL`.
- [ ] `media_assets`: `id`, `museum_id` FK `museums(id) ON DELETE CASCADE`, `entity_type`, `entity_id`, `media_type`, `storage_bucket`, `storage_path`, `mime_type`, `sort_order` default `0`, `is_primary` default `false`, `created_by` FK `users(id) ON DELETE SET NULL`, timestamps; unique `(storage_bucket, storage_path)`; partial unique `(entity_type, entity_id) WHERE is_primary`.
- [ ] `ticket_types`: `id`, `museum_id` FK `museums(id) ON DELETE RESTRICT`, `name`, `description`, `price` `numeric(12,2) CHECK (price >= 0)`, `currency` default `'VND' CHECK (currency = 'VND')`, `is_available` default `true`, timestamps.
- [ ] `ticket_orders`: `id`, `user_id` FK `users(id) ON DELETE RESTRICT`, `museum_id` FK `museums(id) ON DELETE RESTRICT`, `visit_date`, `time_slot` `CHECK (time_slot IN ('09:00-11:00', '11:00-13:00', '14:00-16:00', '16:00-18:00'))`, `status` default `'pending'`, `payment_status` default `'unpaid'`, `total_amount` `numeric(12,2) CHECK (total_amount >= 0)`, `currency` default `'VND' CHECK (currency = 'VND')`, `entry_code` text unique (nullable), `used_at` (nullable), timestamps.
- [ ] `ticket_order_items`: `id`, `ticket_order_id` FK `ticket_orders(id) ON DELETE CASCADE`, `ticket_type_id` FK `ticket_types(id) ON DELETE RESTRICT`, `quantity` `CHECK (quantity > 0)`, `unit_price` `numeric(12,2) CHECK (unit_price >= 0)`, `line_total` `numeric(12,2) GENERATED ALWAYS AS (unit_price * quantity) STORED`, timestamps.
- [ ] `ticket_invoices`: `id`, `ticket_order_id` uuid unique FK `ticket_orders(id) ON DELETE RESTRICT`, `invoice_number` unique, `issued_at` default `now()`, `billing_name`, `billing_email`, `total_amount` `numeric(12,2) CHECK (total_amount >= 0)`, `currency` default `'VND' CHECK (currency = 'VND')`.
- [ ] `carts`: `id`, `user_id` FK `users(id) ON DELETE CASCADE`, `museum_id` FK `museums(id) ON DELETE RESTRICT`, `status` default `'active'`, timestamps; partial unique `(user_id, museum_id) WHERE status = 'active'`.
- [ ] `cart_items`: `id`, `cart_id` FK `carts(id) ON DELETE CASCADE`, `product_id` FK `souvenir_products(id) ON DELETE RESTRICT`, `quantity` `CHECK (quantity > 0)`, timestamps; unique `(cart_id, product_id)`.
- [ ] `shop_orders`: `id`, `user_id` FK `users(id) ON DELETE RESTRICT`, `museum_id` FK `museums(id) ON DELETE RESTRICT`, `status` default `'pending'`, `payment_status` default `'unpaid'`, `subtotal` `numeric(12,2) CHECK (subtotal >= 0)`, `shipping_fee` `numeric(12,2) default 0 CHECK (shipping_fee >= 0)`, `total_amount` `numeric(12,2) GENERATED ALWAYS AS (subtotal + shipping_fee) STORED`, `currency` default `'VND' CHECK (currency = 'VND')`, `shipping_name`, `shipping_phone`, `shipping_address`, `shipping_city` (nullable), timestamps.
- [ ] `shop_order_items`: `id`, `order_id` FK `shop_orders(id) ON DELETE CASCADE`, `product_id` FK `souvenir_products(id) ON DELETE RESTRICT`, `product_name`, `unit_price` `numeric(12,2) CHECK (unit_price >= 0)`, `quantity` `CHECK (quantity > 0)`, `line_total` `numeric(12,2) GENERATED ALWAYS AS (unit_price * quantity) STORED`, timestamps.
- [ ] `shop_invoices`: `id`, `order_id` uuid unique FK `shop_orders(id) ON DELETE RESTRICT`, `invoice_number` unique, `issued_at` default `now()`, `billing_name`, `billing_email`, `total_amount` `numeric(12,2) CHECK (total_amount >= 0)`, `currency` default `'VND' CHECK (currency = 'VND')`.
- [ ] Attach `set_updated_at()` triggers to every table with `updated_at`.
- [ ] Create all FK, public catalog, and partial unique indexes from `docs/database-design.md` §6.

### 2.3 Integrity & Auth Triggers
- [ ] Auth signup trigger on `auth.users` (`AFTER INSERT`, `SECURITY DEFINER`, `SET search_path = ''`): insert into `public.users` and `public.user_roles` (`normal_user`) with `ON CONFLICT DO NOTHING`.
- [ ] `media_assets` validation trigger (`BEFORE INSERT OR UPDATE`): verify `(entity_type, entity_id)` exists in `artifacts` or `souvenir_products` and shares the same `museum_id`; prevent changing `museum_id` on update.
- [ ] `cart_items` validation trigger (`BEFORE INSERT OR UPDATE`): verify `souvenir_products.museum_id = carts.museum_id`.
- [ ] Immutability triggers/checks for `museum_id` on catalog tables (`artifacts`, `souvenir_products`, `ticket_types`) so `museum_id` cannot be changed after creation (`docs/api-contract.md` §5).

### 2.4 RLS Helpers, Grants & Policies (`docs/database-design.md` §7, `docs/api-contract.md` §3–7)
- [ ] Implement `private.is_super_admin()` and `private.can_manage_museum(p_museum_id uuid)` (`SECURITY DEFINER`, `SET search_path = ''`, `GRANT EXECUTE` to `authenticated` only; `REVOKE` from `anon`/`PUBLIC`).
- [ ] Enable RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`) on all 16 `public` tables.
- [ ] Configure column/table privilege grants:
  - [ ] `users`: `REVOKE UPDATE` and `GRANT UPDATE (display_name, phone) ON public.users TO authenticated`; no client `INSERT`/`DELETE`.
  - [ ] Revoke client `INSERT`/`UPDATE`/`DELETE` on `ticket_orders`, `ticket_order_items`, `ticket_invoices`, `shop_orders`, `shop_order_items`, `shop_invoices`, `user_roles`, `museum_admins` (and disallow `DELETE` on catalog tables).
- [ ] Write RLS policies per role matrix:
  - [ ] `users`: own `SELECT`/`UPDATE`; `super_admin` `SELECT` all.
  - [ ] `user_roles`: own `SELECT`; `super_admin` `SELECT` all.
  - [ ] `museum_admins`: own `SELECT` (`user_id = auth.uid()`); `super_admin` `SELECT` all; call `private.can_manage_museum()` if admin visibility is needed to avoid policy recursion.
  - [ ] `museums`: public `SELECT` where `status = 'published'`; admin `SELECT`/`UPDATE` via `private.can_manage_museum(id)`; `super_admin` `INSERT`/`SELECT`/`UPDATE`.
  - [ ] `artifacts` & `souvenir_products`: public `SELECT` where `status = 'published'` AND parent museum `status = 'published'`; admin `SELECT`/`INSERT`/`UPDATE` via `private.can_manage_museum(museum_id)` (enforce `created_by = auth.uid()` on `INSERT`).
  - [ ] `ticket_types`: public `SELECT` where `is_available = true` AND parent museum `status = 'published'`; admin `SELECT`/`INSERT`/`UPDATE` via `private.can_manage_museum(museum_id)`.
  - [ ] `media_assets`: public `SELECT` only when parent museum AND parent entity (`artifact`/`souvenir`) are `published`; admin `SELECT`/`INSERT`/`UPDATE`/`DELETE` via `private.can_manage_museum(museum_id)` (enforce `created_by = auth.uid()` on `INSERT`).
  - [ ] `carts`: owner CRUD (`user_id = auth.uid()`); restrict client `UPDATE` so `status` can only become `'abandoned'` (never `'converted'` directly); `super_admin` `SELECT` (or `ALL`).
  - [ ] `cart_items`: CRUD when parent cart belongs to `auth.uid()` and is `active`.
  - [ ] `ticket_orders`, `ticket_order_items`, `ticket_invoices`, `shop_orders`, `shop_order_items`, `shop_invoices`: `SELECT` for owner (`user_id = auth.uid()`), managed museum admin (`private.can_manage_museum(museum_id)`), and `super_admin`; no write policies.

### 2.5 `SECURITY DEFINER` RPCs (`docs/database-design.md` §8, `docs/api-contract.md` §8)
For every RPC: `SECURITY DEFINER`, `SET search_path = ''`, check `auth.uid() IS NOT NULL`, `REVOKE ALL FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated`, and raise exact `ERRCODE = 'P0001'` / `MESSAGE` error tokens:

- [ ] `purchase_tickets(p_museum_id uuid, p_visit_date date, p_time_slot text, p_items jsonb) RETURNS uuid`
  - [ ] Validate museum `published`, `p_visit_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`, `p_time_slot` in the 4 fixed slots, non-empty valid `p_items` with positive quantities, and all `ticket_type_id`s belong to `p_museum_id` with `is_available = true`.
  - [ ] Read current `ticket_types.price`, compute `total_amount`, insert `ticket_orders` (`status = 'confirmed'`, `payment_status = 'paid'`, unguessable `entry_code`), `ticket_order_items`, and `ticket_invoices` (`'TKT-' || nextval('public.invoice_seq')`).
  - [ ] Emit exact tokens: `museum_not_available`, `ticket_type_unavailable`, `invalid_time_slot`, `invalid_visit_date`, `invalid_items`.
- [ ] `checkout_cart(p_cart_id uuid, p_shipping jsonb) RETURNS uuid`
  - [ ] Lock cart (`FOR UPDATE`) and require `user_id = auth.uid()` and `status = 'active'` (`cart_not_found`, `cart_not_active`).
  - [ ] Validate museum is `published`; lock cart products via `SELECT ... FOR UPDATE ORDER BY id` (`product_unavailable`, `out_of_stock`).
  - [ ] Validate `p_shipping` required fields (`shipping_name`, `shipping_phone`, `shipping_address`).
  - [ ] Compute `subtotal`, apply server-side flat `shipping_fee` (`30000.00` VND), decrement stock (`WHERE stock_quantity >= qty`), insert `shop_orders` (`confirmed`/`paid`), `shop_order_items` (name & unit_price snapshots), `shop_invoices` (`'SHP-' || nextval('public.invoice_seq')`), and mark cart `converted`.
- [ ] `redeem_entry(p_entry_code text) RETURNS uuid`
  - [ ] Lock `ticket_orders` by `entry_code` (`entry_code_not_found`).
  - [ ] Verify `private.can_manage_museum(museum_id)` (`not_museum_admin`), `status != 'used'` (`already_used`), `status = 'confirmed'` (`order_not_confirmed`), and `visit_date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` (`wrong_visit_date`).
  - [ ] Set `status = 'used'`, `used_at = now()`, return `ticket_orders.id`.
- [ ] `update_fulfillment(p_order_id uuid, p_status public.shop_order_status) RETURNS void`
  - [ ] Lock `shop_orders` (`order_not_found`), verify `private.can_manage_museum(museum_id)` (`not_museum_admin`).
  - [ ] Enforce `confirmed -> shipped -> completed` (`invalid_transition`).
- [ ] `cancel_ticket_order(p_order_id uuid) RETURNS void`
  - [ ] Lock `ticket_orders` (`order_not_found`), verify `user_id = auth.uid()` or `private.can_manage_museum(museum_id)` (`not_owner_or_admin`).
  - [ ] Require `status = 'confirmed'` (`order_not_cancellable`) and `visit_date > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date` (`visit_date_passed`).
  - [ ] Set `status = 'cancelled'` (no refund).
- [ ] `cancel_shop_order(p_order_id uuid) RETURNS void`
  - [ ] Lock `shop_orders` (`order_not_found`), verify `user_id = auth.uid()` or `private.can_manage_museum(museum_id)` (`not_owner_or_admin`).
  - [ ] Require `status != 'shipped'`/`'completed'` (`already_shipped` when `shipped`) and `status = 'confirmed'` (`order_not_cancellable`).
  - [ ] Lock referenced `souvenir_products` (`ORDER BY id`) and restore `stock_quantity`; set `status = 'cancelled'` (no refund).

---

## Phase 3 — Storage Buckets & Policies

- [ ] Create migration/setup for public buckets `museum-media` and `souvenir-media` (`public = true`, configured `file_size_limit` and `allowed_mime_types`: `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/webm`).
- [ ] Add RLS policies on `storage.objects`:
  - [ ] Public `SELECT` for `museum-media` and `souvenir-media`.
  - [ ] Admin `INSERT` and `DELETE` scoped to `private.can_manage_museum(...)` using the first path segment (`(storage.foldername(name))[1]::uuid`), enforcing `{museum_id}/{entity_type}/{entity_id}/{random_filename}` format and valid file extension/MIME matching.

---

## Phase 4 — Seed Data & Admin Provisioning (`supabase/seed.sql`)

- [ ] Create SQL script/seed to insert the first `super_admin` user and `user_roles` row (`docs/database-design.md` §1, `docs/auth-guide.md` §2).
- [ ] Seed demo `admin_user` + `museum_admins` (`active`) and `normal_user` accounts for local verification.
- [ ] Seed sample museums (at least one `published` and one `draft`), artifacts, souvenir products, ticket types, and media records.
- [ ] Document the reusable SQL snippet for granting `admin_user` and upserting/reactivating `museum_admins` rows (reusing existing rows without keeping history).

---

## Phase 5 — Verification & Testing

### 5.1 Database & RLS Tests (`supabase/tests/`)
- [ ] Schema & trigger tests:
  - [ ] Signup trigger creates `public.users` + `user_roles(normal_user)` idempotently.
  - [ ] `updated_at` trigger updates on row modifications.
  - [ ] `media_assets` and `cart_items` museum-match triggers reject cross-museum links.
  - [ ] Generated columns (`line_total`, `total_amount`) and `CHECK` constraints enforce invariants.
- [ ] Auth & RLS matrix tests as `anon`, `normal_user`, `admin_user`, and `super_admin` (`docs/auth-guide.md` §6):
  - [ ] Published artifact inside a `draft` museum is **not** visible to `anon` or `normal_user` (same for `media_assets`, `souvenir_products`, `ticket_types`).
  - [ ] Revoking `museum_admins.status` to `revoked`/`suspended` immediately revokes admin access without re-login.
  - [ ] `users` column-level `GRANT UPDATE` rejects updating `id` or timestamps.
  - [ ] Direct writes to `ticket_orders`, `ticket_order_items`, `ticket_invoices`, `shop_orders`, `shop_order_items`, `shop_invoices`, `user_roles`, `museum_admins` are rejected.
  - [ ] Invoices cannot be updated or deleted by any role.
- [ ] RPC functional & edge-case tests:
  - [ ] All 6 RPCs succeed on valid inputs and return exact error tokens on every failure branch.
  - [ ] Timezone boundary checks for `Asia/Ho_Chi_Minh` near UTC midnight.
  - [ ] Sequential/concurrent `checkout_cart` stock decrement and `cancel_shop_order` stock restoration.
  - [ ] `redeem_entry` rejects replay (`already_used`).

### 5.2 HTTP Surface Integration Tests (`/auth/v1`, `/rest/v1`, `/storage/v1`)
- [ ] Verify every endpoint shape, header (`apikey`, `Authorization`, `Prefer`, `Accept: application/vnd.pgrst.object+json`), pagination, and PostgREST embedding listed in `docs/api-contract.md` §2–9 using only the `anon` key + user JWTs.
- [ ] Verify Storage upload (`x-upsert: false`), public read without auth header, cross-museum upload rejection, invalid MIME/size rejection, and cleanup delete.

---

## Phase 6 — Type Generation, Documentation Sync & Deployment

- [ ] Generate TypeScript types from local schema (`supabase gen types typescript --local`) if shared with frontend consumers.
- [ ] Review all files in `docs/` against the implemented SQL and sync any minor differences (`shipping_fee` constant, `checkout_cart` error tokens, and SQL-only provisioning for `user_roles`/`museum_admins`) per `AGENTS.md` §Documentation.
- [ ] Update [`AGENTS.md`](AGENTS.md) with final build/migration/test commands.
- [ ] Link and push migrations to the target Supabase project (`supabase link`, `supabase db push`), verify Storage buckets/policies remotely, and provision the initial `super_admin` via SQL.
