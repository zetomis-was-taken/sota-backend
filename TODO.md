# TODO — SOTA Museum Management Backend

Lộ trình triển khai theo **vertical slices** (kiến trúc application-first: `route → service → Drizzle ORM`) dựa trên `docs/api-contract.md`, `docs/auth-guide.md` và `docs/database-design.md`.

---

## Phần nền tảng (Đã hoàn thành)

- [x] Drizzle schema & migration ban đầu (`src/db/schema/*`, `drizzle/0000_spotty_absorbing_man.sql`)
- [x] Cấu hình env, Postgres client & Supabase client (`src/config/env.ts`, `src/config/supabase.ts`, `src/db/index.ts`)
- [x] Express pipeline, request ID, CORS, error normalization, response helpers, Zod validation (`src/app.ts`, `src/lib/*`, `src/middleware/*`)
- [x] Supabase JWT auth & Postgres RBAC (`src/lib/auth.ts`, `src/middleware/auth.ts`)
- [x] Operational endpoint `GET /health` (`src/routes/health.ts`)
- [x] Core unit & HTTP tests (`tests/core/*`)

---

## Các Vertical Slices cần triển khai (theo thứ tự)

Mỗi slice hoàn chỉnh gồm: Zod schema, service (`db` / `tx`), Express router gắn vào `src/routes/index.ts`, và tests (Vitest + Supertest).

### Slice 1 — Profile, Roles & Admin Users (`docs/api-contract.md` §3)

- [ ] `GET /api/v1/me` — trả profile (`id`, `display_name`, `phone`), `roles`, và danh sách `managed_museums` đang `active`
- [ ] `PATCH /api/v1/me` — chỉ cho phép cập nhật `{ display_name?, phone? }`
- [ ] `GET /api/v1/admin/users` — chỉ `super_admin`; list tất cả user profiles kèm `roles` và `museum_admins` (hỗ trợ `limit`, `offset`)
- [ ] Tests: `401`/`403` theo từng role (`anon`, `normal_user`, `admin_user`, `super_admin`), chặn field nhạy cảm trên `PATCH /me`

### Slice 2 — Catalog: Public & Admin (`docs/api-contract.md` §4 & §5)

- [ ] **Public reads** (không cần token; chỉ trả dữ liệu khi cả museum và entity con đều `published` / `is_available = true`, trả `404` nếu item `published` nằm trong museum `draft`/`archived`):
  - [ ] `GET /api/v1/museums` (phân trang, sắp xếp `created_at` desc)
  - [ ] `GET /api/v1/museums/:slug` (detail kèm embedded published `artifacts`, `souvenir_products`, available `ticket_types`)
  - [ ] `GET /api/v1/museums/:museumId/artifacts` & `GET /api/v1/artifacts/:id`
  - [ ] `GET /api/v1/museums/:museumId/products` & `GET /api/v1/products/:id`
  - [ ] `GET /api/v1/museums/:museumId/ticket-types`
  - [ ] `GET /api/v1/media` (query `entity_type=artifact|souvenir&entity_id=:id`, sắp xếp `sort_order` asc, kiểm tra parent museum & entity `published`)
- [ ] **Admin reads & writes** (`super_admin` toàn quyền; `admin_user` scoped theo `requireMuseumAdmin`; thấy cả `draft` & `archived`; không có `DELETE`, archive qua `PATCH`; `museum_id` bất biến, `created_by` lấy từ `req.auth.userId`):
  - [ ] `GET /api/v1/admin/museums`
  - [ ] `POST /api/v1/admin/museums` (`super_admin` only)
  - [ ] `PATCH /api/v1/admin/museums/:id` (`super_admin` / museum admin)
  - [ ] `GET /api/v1/admin/museums/:museumId/artifacts`, `POST /api/v1/admin/museums/:museumId/artifacts`, `PATCH /api/v1/admin/artifacts/:id`
  - [ ] `GET /api/v1/admin/museums/:museumId/products`, `POST /api/v1/admin/museums/:museumId/products`, `PATCH /api/v1/admin/products/:id`
  - [ ] `GET /api/v1/admin/museums/:museumId/ticket-types`, `POST /api/v1/admin/museums/:museumId/ticket-types`, `PATCH /api/v1/admin/ticket-types/:id`
- [ ] Tests: ẩn published item trong draft/archived museum, RBAC 4 role, mất quyền ngay khi `museum_admins` bị revoke, unique conflict (`slug`, `inventory_code`, `sku`)

### Slice 3 — Carts (`docs/api-contract.md` §6)

- [ ] `GET /api/v1/carts` — các giỏ `active` của chính user kèm `items` và product summary
- [ ] `POST /api/v1/carts` — tạo giỏ `active` cho `{ museum_id }`; trùng giỏ `active` cùng museum → `409`
- [ ] `PATCH /api/v1/carts/:id` — chỉ cho phép chuyển sang `abandoned`
- [ ] `DELETE /api/v1/carts/:id` — xóa giỏ của chính user khi chưa `converted`
- [ ] `POST /api/v1/carts/:cartId/items` — `{ product_id, quantity }`; trùng product → `409`; product khác museum với cart → `400`
- [ ] `PATCH /api/v1/carts/:cartId/items/:itemId` — cập nhật `quantity > 0`
- [ ] `DELETE /api/v1/carts/:cartId/items/:itemId` — xóa item khỏi giỏ
- [ ] Tests: ownership check, trùng active cart `409`, trùng item `409`, khác museum `400`, chặn sửa/xóa cart `converted`

### Slice 4 — Ticket Orders & Invoices (`docs/api-contract.md` §7)

- [ ] Helper dùng chung: xử lý ngày hiện tại theo `Asia/Ho_Chi_Minh` (`UTC+7`), sinh `entry_code` khó đoán, sinh `invoice_number` dạng `TKT-` / `SHP-` từ `invoice_seq`
- [ ] `POST /api/v1/ticket-orders` — transaction: kiểm tra museum `published`, ticket types thuộc museum và `is_available`, `visit_date >= today` (`Asia/Ho_Chi_Minh`), `time_slot` hợp lệ, `items` không rỗng; snapshot `unit_price`, tính `total_amount`, fake payment (`confirmed`/`paid`), sinh `entry_code`, tạo `ticket_invoices` (`TKT-`)
  - Error codes: `museum_not_available`, `ticket_type_unavailable`, `invalid_time_slot`, `invalid_visit_date`, `invalid_items`
- [ ] `GET /api/v1/ticket-orders` & `GET /api/v1/ticket-orders/:id` (owner / museum admin)
- [ ] `POST /api/v1/ticket-orders/:id/cancel` (owner / museum admin; chỉ khi `confirmed` và trước `visit_date` theo `Asia/Ho_Chi_Minh`; không hoàn tiền)
  - Error codes: `order_not_found`, `not_owner_or_admin`, `order_not_cancellable`, `visit_date_passed`
- [ ] `GET /api/v1/admin/museums/:museumId/ticket-orders` (filter theo `visit_date`, `status`)
- [ ] `POST /api/v1/admin/ticket-orders/redeem` — `{ entry_code }`; kiểm tra admin museum của đơn, `status = confirmed`, `visit_date = today` (`Asia/Ho_Chi_Minh`); cập nhật `used` / `used_at`
  - Error codes: `entry_code_not_found`, `not_museum_admin`, `order_not_confirmed`, `wrong_visit_date`, `already_used`
- [ ] Tests: transaction tạo đơn + invoice bất biến, edge cases múi giờ `Asia/Ho_Chi_Minh`, redeem 1 lần & scoped theo museum, cancel rules

### Slice 5 — Shop Orders & Invoices (`docs/api-contract.md` §8)

- [ ] `POST /api/v1/carts/:cartId/checkout` — transaction: lock cart & items (`FOR UPDATE`), verify owner & `active`; lock products (`FOR UPDATE ORDER BY id`); re-check museum & products `published`, giá và tồn kho; tính `subtotal` + flat `shipping_fee` từ server; trừ tồn kho có điều kiện (`stock_quantity >= qty`); fake payment (`confirmed`/`paid`); tạo `shop_invoices` (`SHP-`); chuyển cart thành `converted`
  - Error codes: `cart_not_found`, `cart_not_active`, `product_unavailable`, `price_changed`, `out_of_stock`
- [ ] `GET /api/v1/shop-orders` & `GET /api/v1/shop-orders/:id` (owner / museum admin)
- [ ] `POST /api/v1/shop-orders/:id/cancel` (owner / museum admin; chỉ khi `confirmed` và trước `shipped`; hoàn `stock_quantity`; không hoàn tiền)
  - Error codes: `order_not_found`, `not_owner_or_admin`, `order_not_cancellable`, `already_shipped`
- [ ] `GET /api/v1/admin/museums/:museumId/shop-orders` (filter theo `status`)
- [ ] `PATCH /api/v1/admin/shop-orders/:id/fulfillment` — `{ status: "shipped" | "completed" }`, chỉ cho phép `confirmed → shipped → completed`
  - Error codes: `order_not_found`, `not_museum_admin`, `invalid_transition`
- [ ] Tests: lock & rollback khi hết hàng hoặc lệch giá, hoàn kho khi cancel, state machine fulfillment, invoice bất biến

### Slice 6 — Media Upload & Management (`docs/api-contract.md` §5 & §9)

- [ ] Thêm `multipart/form-data` parser (ví dụ `multer` với memory storage + giới hạn dung lượng) và Supabase Storage helper cho buckets `museum-media` & `souvenir-media` (key `{museum_id}/{entity_type}/{entity_id}/{random_filename}`)
- [ ] `POST /api/v1/admin/media` — kiểm tra quyền museum admin, target entity tồn tại và thuộc cùng `museum_id`, file size, MIME (`image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/webm`), extension; upload Storage + insert `media_assets` (xử lý `is_primary` duy nhất)
- [ ] `PATCH /api/v1/admin/media/:id` — `{ sort_order?, is_primary? }`
- [ ] `DELETE /api/v1/admin/media/:id` — xóa row `media_assets` + xóa object trên Storage (best-effort)
- [ ] Tests: mock Storage client, validate MIME/size/extension, cross-museum entity check, `is_primary`, best-effort delete

---

## Các bước tiếp theo để hoàn thành dự án

1. **Thiết lập hạ tầng Supabase / Postgres thực tế**
   - [ ] Chạy Drizzle migration (`npm run db:migrate`) lên database Supabase (dùng `DIRECT_URL` port `5432` khi migrate nếu chạy qua pooler) và lên một test Postgres DB riêng.
   - [ ] Tạo 2 public buckets `museum-media` và `souvenir-media` trên Supabase Storage.
   - [ ] Tạo script/SQL seed tối thiểu cho demo: tài khoản `super_admin` đầu tiên, museum mẫu (`published`/`draft`), `admin_user` + `museum_admins`, artifacts, souvenir products, ticket types.

2. **Chạy Integration Test cho Database Transactions**
   - [ ] Bổ sung test suite chạy trên dedicated test Postgres database (không bao giờ chạy trên DB production) để verify `FOR UPDATE`, rollback khi hết hàng, `invoice_seq`, partial unique indexes và các rule ngày giờ `Asia/Ho_Chi_Minh`.

3. **Kiểm tra tổng thể & đối chiếu tài liệu**
   - [ ] Audit toàn bộ endpoints, response envelopes (`{ data }`, `{ data, pagination }`, `{ error }`) và error codes khớp 100% với `docs/api-contract.md`.
   - [ ] Rà soát toàn bộ checklist bảo mật trong `docs/auth-guide.md` §6 (kiểm tra đủ `anon`, `normal_user`, `admin_user`, `super_admin` và revoke membership tức thì).
   - [ ] Cập nhật `docs/` nếu phát sinh thay đổi trong quá trình implement.
   - [ ] Chạy kiểm tra cuối cùng: `npm run typecheck`, `npm test`, `npm run build`.

4. **Chuẩn bị triển khai (Deployment Readiness)**
   - [ ] Hoàn thiện `.env` cho môi trường chạy thật (`DATABASE_URL` transaction pooler port `6543`, `CORS_ORIGIN`, Supabase URL/keys, bucket names).
   - [ ] Kiểm tra `npm start` sau `npm run build`, xác nhận `GET /health` trả `"supabase": "configured"` và graceful shutdown hoạt động ổn định.
   - [ ] Viết `README.md` ngắn gọn hướng dẫn cài đặt, biến môi trường, migrate/seed, chạy dev và chạy test.
