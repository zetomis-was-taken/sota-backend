# API Contract (Demo) — Museum Management System

An Express.js + TypeScript server hosts operational endpoints (starting with `GET /health`), while Supabase remains the data, auth, and storage backend using the publishable key and RLS (see `docs/database-design.md` §1). This file defines the HTTP surface: Express server endpoints, PostgREST (`/rest/v1`), Auth (`/auth/v1`), and Storage (`/storage/v1`). Authorization is RLS only; the auth model is in `docs/auth-guide.md`.

> Keep this contract updated when adding Express routes. Do not add endpoints that bypass RLS.

## 0. Express server endpoints

| Method | Path | Who | Returns |
|---|---|---|---|
| GET | `/health` | public | `200` `{status, uptime, timestamp, supabase}` (`supabase` is `"configured"` or `"not_configured"`) |

## 1. Conventions

### Base URL and headers

Base: `https://<project-ref>.supabase.co`.

| Header | Required | Value |
|---|---|---|
| `apikey` | Always | publishable key (`sb_publishable_...`) |
| `Authorization` | Signed-in calls | `Bearer <access_token>` (omitted or publishable key when signed out) |
| `Content-Type` | JSON writes | `application/json` (raw file content type for Storage uploads) |
| `Prefer` | Writes | `return=representation` to get the written rows; `count=exact` for counts |

### Query parameters (PostgREST)

`select=*`, `select=id,name`, embeddings `select=*,ticket_order_items(*)`; filters `id=eq.<uuid>`, `status=eq.published`, `is_available=eq.true`, `created_at=gte.2026-01-01`; `order=created_at.desc`; `limit` + `offset`. Always paginate list calls explicitly. For a single row, send `Accept: application/vnd.pgrst.object+json` and expect `406` when there is no visible row.

### Data formats

- IDs are UUIDs; timestamps are ISO 8601 UTC; dates are `YYYY-MM-DD`; money is a decimal number in VND.
- RPC parameters are sent as a JSON object whose keys are the function's `p_` argument names.
- Missing or invalid session → `401`; insufficient table/column privilege → `403`. RLS-filtered reads return `200` with `[]` (or `406` for a single-object request); a denied insert returns `403`; an UPDATE/DELETE matching no visible rows returns `204` with no body. Treat all of these as "not allowed or not found", never as success.
- Unique/FK violations → `409`; check violations and RPC failures → `400`. Errors follow PostgREST shape: `{"code","message","details","hint"}`.
- Clients never send `created_at`, `updated_at`, generated columns (`line_total`, `total_amount`), or totals.

## 2. Auth endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/v1/signup` | `{email, password}` | User, or session if email confirmation is disabled |
| POST | `/auth/v1/token?grant_type=password` | `{email, password}` | `{access_token, refresh_token, expires_in, user}` |
| POST | `/auth/v1/token?grant_type=refresh_token` | `{refresh_token}` | Same session shape |
| GET | `/auth/v1/user` | — | Current user |
| PUT | `/auth/v1/user` | `{password}` | Updated user |
| POST | `/auth/v1/logout` | — | `204` |
| POST | `/auth/v1/recover` | `{email}` | `200` |
| GET | `/auth/v1/verify?token=...&type=signup\|recovery` | — | Email-link redirect |

- The signup trigger creates `public.users` and `user_roles(normal_user)`. Clients never insert either row.
- Roles are not JWT claims; a role change applies to the next request with the same token.
- `signup` returns no session when email confirmation is on; the client waits for verification before signing in.
- Password reset: `recover` sends a link that lands on the app with a recovery session; then call `PUT /auth/v1/user` with the new password.
- Endpoint shapes are GoTrue's; clients should use `supabase-js` rather than hand-rolling them.

## 3. Profile, roles, memberships

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/rest/v1/users?id=eq.{uid}&select=id,display_name,phone` | user | Own profile |
| PATCH | `/rest/v1/users?id=eq.{uid}` | user | Body: `{display_name, phone}` only |
| GET | `/rest/v1/users?select=*` | super_admin | All profiles |
| GET | `/rest/v1/user_roles?user_id=eq.{uid}&select=role` | user | Own roles |
| GET | `/rest/v1/museum_admins?user_id=eq.{uid}&status=eq.active&select=museum_id,status` | user | Museum scope for admin UI |
| GET | `/rest/v1/user_roles?select=*` | super_admin | All roles |
| GET | `/rest/v1/museum_admins?select=*` | super_admin | All memberships |

No insert/update/delete endpoints exist for `user_roles` or `museum_admins`; provisioning is SQL (see `docs/auth-guide.md` §3). `users` has no insert/delete endpoint. Patching any profile column other than `display_name`/`phone` is rejected by column grants.

## 4. Catalog — public reads

No session required. Only `published` museums and their published/available children are visible.

| Method | Path | Notes |
|---|---|---|
| GET | `/rest/v1/museums?status=eq.published&order=created_at.desc&limit=24&offset=0` | List |
| GET | `/rest/v1/museums?slug=eq.{slug}&select=*,artifacts(*),souvenir_products(*),ticket_types(*)` | Detail with embedded children |
| GET | `/rest/v1/artifacts?museum_id=eq.{museum_id}&status=eq.published` | Museum artifacts |
| GET | `/rest/v1/artifacts?id=eq.{id}` | Detail |
| GET | `/rest/v1/souvenir_products?museum_id=eq.{museum_id}&status=eq.published` | Museum shop |
| GET | `/rest/v1/souvenir_products?id=eq.{id}` | Detail |
| GET | `/rest/v1/ticket_types?museum_id=eq.{museum_id}&is_available=eq.true` | Sellable ticket types |
| GET | `/rest/v1/media_assets?entity_type=eq.{artifact\|souvenir}&entity_id=eq.{id}&order=sort_order.asc` | Gallery |

A published artifact inside a draft museum is not visible. Media rows are visible only when their parent museum and entity are public. There is no public user, order, or admin endpoint.

## 5. Catalog — admin reads and writes

`admin_user` needs an `active` `museum_admins` row for that museum; `super_admin` is unrestricted.

Admin reads include draft/archived rows in managed museums (the public filters in §4 exclude them):

| Method | Path | Notes |
|---|---|---|
| GET | `/rest/v1/museums?select=*` | Published museums plus draft/archived ones they manage |
| GET | `/rest/v1/artifacts?museum_id=eq.{id}&select=*` | All statuses |
| GET | `/rest/v1/souvenir_products?museum_id=eq.{id}&select=*` | All statuses, including stock |
| GET | `/rest/v1/ticket_types?museum_id=eq.{id}&select=*` | Including unavailable types |

Writes:

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/rest/v1/museums` | super_admin | `{name, slug, description?, address?, city?, cover_image_path?, status?, created_by}` |
| PATCH | `/rest/v1/museums?id=eq.{id}` | super_admin; admin_user for managed museum | Mutable catalog fields, including `status` |
| POST | `/rest/v1/artifacts` | admin | `{museum_id, name, description?, period?, inventory_code?, status?, created_by}` |
| PATCH | `/rest/v1/artifacts?id=eq.{id}` | admin | Same fields; `status` used to publish/archive |
| POST | `/rest/v1/souvenir_products` | admin | `{museum_id, name, description?, sku?, price, stock_quantity?, status?, created_by}` |
| PATCH | `/rest/v1/souvenir_products?id=eq.{id}` | admin | Including `price`, `stock_quantity`, `status` (restock) |
| POST | `/rest/v1/ticket_types` | admin | `{museum_id, name, description?, price, is_available?}` |
| PATCH | `/rest/v1/ticket_types?id=eq.{id}` | admin | Including `price`, `is_available` |
| POST | `/rest/v1/media_assets` | admin | Metadata after upload; `{museum_id, entity_type, entity_id, media_type, storage_bucket, storage_path, mime_type, sort_order?, is_primary?, created_by}` |
| PATCH | `/rest/v1/media_assets?id=eq.{id}` | admin | `{sort_order, is_primary}` |
| DELETE | `/rest/v1/media_assets?id=eq.{id}` | admin | Storage object cleanup is best-effort |

- Catalog rows (`museums`, `artifacts`, `souvenir_products`, `ticket_types`) are archived via `PATCH {status: "archived"}`, never deleted. No DELETE endpoints exist for them.
- `museum_id` cannot be changed after creation. `created_by` must be the caller's id.
- Price/stock edits do not affect existing orders or their snapshots.

## 6. Carts

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/rest/v1/carts?status=eq.active&select=*,cart_items(*)` | user | Own active carts (one per museum) |
| POST | `/rest/v1/carts` | user | `{museum_id, user_id}`; duplicate active cart → `409` |
| PATCH | `/rest/v1/carts?id=eq.{id}` | user | `{status: "abandoned"}` only; `converted` is set by checkout |
| DELETE | `/rest/v1/carts?id=eq.{id}` | user | Own cart; do not delete `converted` carts (order history) |
| GET | `/rest/v1/cart_items?cart_id=eq.{cart_id}&select=*,souvenir_products(*)` | user | Cart contents |
| POST | `/rest/v1/cart_items` | user | `{cart_id, product_id, quantity}`; duplicate product → `409` |
| PATCH | `/rest/v1/cart_items?id=eq.{id}` | user | `{quantity}` |
| DELETE | `/rest/v1/cart_items?id=eq.{id}` | user | Remove line |

- The product must belong to the cart's museum (DB trigger); a mismatch fails the write.
- Stock and price are re-checked at checkout, not when adding to the cart.
- Users can only reach their own carts; filtering by `user_id` is still recommended.

## 7. Orders and invoices — read-only

No POST/PATCH/DELETE exists. All writes go through the RPCs in §8.

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/rest/v1/ticket_orders?user_id=eq.{uid}&order=created_at.desc&select=*,ticket_order_items(*),ticket_invoices(*)` | user | Own ticket orders |
| GET | `/rest/v1/ticket_orders?id=eq.{id}&select=*,ticket_order_items(*),ticket_invoices(*)` | user / admin | Detail |
| GET | `/rest/v1/ticket_orders?museum_id=eq.{museum_id}&status=eq.confirmed&visit_date=eq.{today}` | admin | Gate list for a managed museum |
| GET | `/rest/v1/shop_orders?user_id=eq.{uid}&order=created_at.desc&select=*,shop_order_items(*),shop_invoices(*)` | user | Own shop orders |
| GET | `/rest/v1/shop_orders?id=eq.{id}&select=*,shop_order_items(*),shop_invoices(*)` | user / admin | Detail |
| GET | `/rest/v1/shop_orders?museum_id=eq.{museum_id}&status=eq.confirmed` | admin | Fulfillment queue |
| GET | `/rest/v1/ticket_order_items?ticket_order_id=eq.{id}` | user / admin | Order lines |
| GET | `/rest/v1/shop_order_items?order_id=eq.{id}` | user / admin | Order lines |
| GET | `/rest/v1/ticket_invoices?ticket_order_id=eq.{id}` | user / admin | Invoice |
| GET | `/rest/v1/shop_invoices?order_id=eq.{id}` | user / admin | Invoice |

Invoices are immutable. Admins see orders for managed museums only; `super_admin` sees all.

## 8. RPCs

All are `POST /rest/v1/rpc/{name}`. Parameters are `p_`-prefixed JSON keys. Callers must be signed in; RPCs validate `auth.uid()` themselves. Failures return `400` with `message` set to one of the tokens below — clients branch on `message`, not on human-readable text. Unauthenticated calls are rejected by the function grants (`401`/`403`).

### `purchase_tickets` → ticket order UUID

```json
{
  "p_museum_id": "uuid",
  "p_visit_date": "2026-11-20",
  "p_time_slot": "09:00-11:00",
  "p_items": [{"ticket_type_id": "uuid", "quantity": 2}]
}
```

Creates the order and items from current prices, performs the fake payment (`confirmed`/`paid`), issues one `entry_code`, and creates the `TKT-` invoice. Slot must be one of the four fixed values; date must be today or later in `Asia/Ho_Chi_Minh`.

Rejects: `museum_not_available`, `ticket_type_unavailable`, `invalid_time_slot`, `invalid_visit_date`, `invalid_items`.

### `checkout_cart` → shop order UUID

```json
{
  "p_cart_id": "uuid",
  "p_shipping": {
    "shipping_name": "Nguyen Van A",
    "shipping_phone": "0900000000",
    "shipping_address": "1 Le Loi",
    "shipping_city": "Ho Chi Minh City"
  }
}
```

Locks the cart and products, re-checks price/stock, applies the server-side flat shipping fee, decrements stock, performs the fake payment, creates the `SHP-` invoice, and marks the cart `converted`. The client never sends the fee or totals.

Rejects: `cart_not_found`, `cart_not_active`, `product_unavailable`, `price_changed`, `out_of_stock`.

### `redeem_entry` → ticket order UUID

```json
{"p_entry_code": "..."}
```

Admin only. Requires an `active` membership in the order's museum, `status = confirmed`, and `visit_date` equal to today in `Asia/Ho_Chi_Minh`. Sets `used`/`used_at`.

Rejects: `entry_code_not_found`, `not_museum_admin`, `order_not_confirmed`, `wrong_visit_date`, `already_used`.

### `update_fulfillment`

```json
{"p_order_id": "uuid", "p_status": "shipped"}
```

Admin only. Allows `confirmed → shipped → completed` on a shop order.

Rejects: `order_not_found`, `not_museum_admin`, `invalid_transition`.

### `cancel_ticket_order`

```json
{"p_order_id": "uuid"}
```

Owner or admin. Only while `confirmed` and before `visit_date`. Sets `cancelled`; no refund.

Rejects: `order_not_found`, `not_owner_or_admin`, `order_not_cancellable`, `visit_date_passed`.

### `cancel_shop_order`

```json
{"p_order_id": "uuid"}
```

Owner or admin. Only while `confirmed` and before `shipped`. Sets `cancelled`; restores stock; no refund.

Rejects: `order_not_found`, `not_owner_or_admin`, `order_not_cancellable`, `already_shipped`.

## 9. Storage

Buckets `museum-media` and `souvenir-media` are public. Paths: `{museum_id}/{entity_type}/{entity_id}/{random_filename}`.

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/storage/v1/object/{bucket}/{path}` | admin | Raw file body; `Content-Type`; `x-upsert: false`; size and MIME limited by bucket settings and policies |
| GET | `/storage/v1/object/public/{bucket}/{path}` | public | No auth header required |
| DELETE | `/storage/v1/object/{bucket}/{path}` | admin | Managed museum only |

- Storage policies enforce the same museum scope using the first path segment (`museum_id`).
- Upload first, then insert the `media_assets` row; delete the row and object together (object cleanup best-effort).
- Accepted media: images (`image/jpeg`, `image/png`, `image/webp`) and videos (`video/mp4`, `video/webm`).
- Public URLs can be read by anyone with the path; signed URLs are not used in this demo.

## 10. Not provided

No endpoints for role/membership provisioning, real payments or webhooks, refunds, audit logs, account deletion, capacity checks, configurable slots, multi-museum carts/orders, per-person QR codes, search, or notifications. Catalog rows are never deleted, only archived; invoices are never modified.
