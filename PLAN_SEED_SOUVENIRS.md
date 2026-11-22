# Kế Hoạch Triển Khai: Seed Souvenir Products & Media Assets (Issue #14)

> **Skill áp dụng:**
> - `ponytail`: Giữ thay đổi ở mức tối thiểu cần thiết để giải quyết trọn vẹn yêu cầu. Tận dụng triệt để helper, config và convention sẵn có (`src/lib/storage.ts`, `src/config/env.ts`, `scripts/seed-museums.ts`). Không tạo thêm abstraction hay layer bọc ngoài không cần thiết.
> - `stop-slop` & `humanizer`: Văn phong kỹ thuật trực diện, chính xác, không dùng từ ngữ sáo rỗng hoặc cấu trúc văn mẫu AI. Nêu rõ sự thật kỹ thuật, ranh giới lỗi và điều kiện ràng buộc.
>
> **Quy định Git tối thượng:**
> - **TUYỆT ĐỐI KHÔNG TỰ Ý CHẠY `git commit` HOẶC `git push`**.
> - **TUYỆT ĐỐI TRÁNH `git add .`** do workspace hiện có nhiều file untracked (`.csv`, `.sql`, `.py`, nháp cào dữ liệu). Chỉ `git add` chính xác từng file thuộc phạm vi giai đoạn.
> - Sau mỗi giai đoạn, script/agent chỉ dừng lại ở việc chuẩn bị mã nguồn và in sẵn câu lệnh `git add <file>` + `git commit` mẫu (theo chuẩn Conventional Commits) để người dùng tự kiểm tra và tự gõ vào terminal.

---

## 📌 Kiểm Tra Môi Trường & Trạng Thái Nhánh

Workspace hiện đã ở đúng nhánh **`feat/duy/souvenir-seed`**. Trước khi bắt đầu, kiểm tra nhánh hiện tại và trạng thái working tree:

```bash
git branch --show-current
git status
```
*Lưu ý: Không chạy lệnh tạo lại branch. Giữ nguyên các file untracked ngoài phạm vi.*

---

## Giai đoạn 1: Chuẩn hóa Dataset Fixtures & Bản quyền Hình ảnh

### Mục tiêu
Định nghĩa tập dữ liệu tĩnh cho đúng 6 bảo tàng Smithsonian, thiết lập tập SKU quản lý (`MANAGED_SKUS`) và xác thực quyền sử dụng của từng asset ảnh.

### Yêu cầu kỹ thuật
1. **6 Bảo tàng Smithsonian mục tiêu:**
   - `national-museum-of-natural-history`: Hóa thạch khủng long, bộ khoáng sản, mô hình giải phẫu...
   - `national-air-and-space-museum`: Huy hiệu thêu nhiệm vụ Apollo, mô hình tàu con thoi, kem sấy phi hành gia...
   - `national-museum-of-american-history`: Tiền xu kỷ niệm Star-Spangled Banner, bưu thiếp Americana cổ điển...
   - `national-portrait-gallery`: Sách tranh chân dung, canvas prints, bookmark danh nhân...
   - `hirshhorn-museum-and-sculpture-garden`: Mô hình điêu khắc đương đại, túi tote triển lãm, sổ sketch...
   - `national-museum-of-asian-art`: Bộ tách trà gốm sứ nghệ thuật, khăn lụa họa tiết cổ, bộ bút lông thư pháp...
2. **Quy chuẩn số lượng:** Mỗi bảo tàng có đúng **5–10 sản phẩm đặc trưng**.
3. **Tập SKU quản lý (`MANAGED_SKUS`):**
   - Định nghĩa `MANAGED_SKUS: ReadonlySet<string>` gom toàn bộ SKU trong fixture.
   - Tiền tố quy chuẩn: `NMNH-xxx`, `NASM-xxx`, `AME-xxx`, `NPG-xxx`, `HMSG-xxx`, `NMAA-xxx`.
4. **Bản quyền hình ảnh & Xác minh Nguồn gốc (Copyright & Provenance):**
   - **Tuyệt đối không dùng nhãn "Educational Fair Use":** Fair use là đánh giá pháp lý theo tình huống thực tế (dựa trên 4 yếu tố luật định của Hoa Kỳ), không phải giấy phép cấp quyền sao chép (theo [U.S. Copyright Office](https://www.copyright.gov/fair-use/more-info.html) và [Smithsonian Terms of Use](https://www.si.edu/termsofuse)).
   - Chỉ dùng ảnh có **quyền tái sử dụng minh bạch xác định theo từng asset** (Smithsonian Open Access CC0 media đã kiểm chứng, NASA Public Domain, Wikimedia Commons CC0).
   - Mỗi asset bắt buộc có `sourcePageUrl` (URL dẫn thẳng tới trang mô tả/hồ sơ bản quyền chính thức trên Wikimedia Commons, Smithsonian hoặc Library of Congress) để phục vụ kiểm tra và truy nguyên quyền sở hữu.
   - Mỗi asset có credit/nguồn cụ thể trong metadata của fixture.
   - Bất kỳ ảnh nào không xác định được quyền tái sử dụng minh bạch sẽ bị loại khỏi fixture.
5. **Ràng buộc Schema, Tiền Tệ & Trạng Thái Mặc Định:**
   - `price`: Số tiền VND dương (`numeric(12, 2)`). Đa số sản phẩm phổ thông nằm trong dải **50.000 – 500.000 VND** (đúng theo ví dụ Issue #14); cho phép một số ít món đặc thù cao cấp (như bộ ấm chén gốm thủ công hoặc mô hình kim loại đúc) ở mức 800.000 – 1.200.000 VND.
   - `currency`: Bắt buộc strict `'VND'` ngay trên từng item trong fixture (khớp ràng buộc `currencyCheck`).
   - `stockQuantity`: Số nguyên dương từ `20` đến `100` units.
   - `status`: Mặc định `'published'` thông qua hàm builder dữ liệu sản phẩm `buildProductSeedData` (cho phép override qua `--status`).

### Lệnh commit (Người dùng tự gõ):
```bash
git add scripts/seed-souvenirs.ts tests/scripts/seed-souvenirs.test.ts
git commit -m "feat(seed): define managed souvenir fixtures with verified media provenance"
```

---

## Giai đoạn 2: Preflight Checks, Tìm/Tạo Bảo Tàng & Cảnh Báo Trạng Thái

### Mục tiêu
Kiểm tra cấu hình môi trường, xác nhận bucket `souvenir-media` tồn tại và là public bucket trước khi ghi DB; tìm hoặc tạo bảo tàng độc lập trạng thái và phát cảnh báo hiển thị catalog.

### Yêu cầu kỹ thuật
1. **Khớp biến môi trường Repo:**
   - Đọc cấu hình từ `src/config/env.ts`:
     + `env.supabaseUrl`
     + `env.supabaseSecretKey` (`SUPABASE_SECRET_KEY`, tuyệt đối không dùng `SUPABASE_SERVICE_ROLE_KEY`)
     + `env.souvenirMediaBucket` (`SUPABASE_SOUVENIR_MEDIA_BUCKET`, fallback `'souvenir-media'`)
2. **Preflight Kiểm Tra Bucket Public:**
   - Kiểm tra kết nối Supabase Storage client và gọi `storage.getBucket(bucketName)`.
   - **Xác nhận bucket tồn tại VÀ có cờ `public: true`** (vì catalog cần đọc ảnh trực tiếp không qua signed URL).
   - Nếu `--skip-media` bật: Bỏ qua kiểm tra bucket.
   - Nếu không có `--skip-media`:
     + Bucket không tồn tại -> Dừng ngay (fail-fast), in thông báo yêu cầu tạo bucket `souvenir-media` (theo lưu ý tại `TODO.md:97`).
     + Bucket tồn tại nhưng `public: false` -> Dừng ngay (fail-fast), in hướng dẫn sửa cấu hình bucket thành `public`. Không ghi dữ liệu dở dang vào DB.
3. **Cơ chế `findOrCreateMuseum` chuẩn hóa:**
   - Tái sử dụng logic chuẩn từ `scripts/seed-museums.ts:278`:
     + Tìm theo `slug` hoặc `name`.
     + **Nếu bảo tàng đã có:** Tái sử dụng `id`, **GIỮ NGUYÊN trạng thái hiện tại (`status`)**, tuyệt đối không cập nhật âm thầm.
     + **Nếu bảo tàng chưa có:** Tạo mới với trạng thái mặc định độc lập dành riêng cho museum mới tạo (`status: 'published'`), gán `createdBy: superadminId`.
     + Gán `superadminId` vào `museum_admins` với `status: 'active'` (`onConflictDoNothing`).
4. **Cảnh báo tính hiển thị Catalog (`api-contract.md:79`):**
   - Theo hợp đồng API: Cả bảo tàng `draft` và `archived` đều ẩn sản phẩm `published` bên trong nó khỏi Public API (`404`).
   - Kiểm tra `museum.status`: Nếu bảo tàng là `draft` hoặc `archived` trong khi sản phẩm seed có status `published`, hiển thị cảnh báo:
     `[Warning] Bảo tàng "${museum.name}" đang ở trạng thái "${museum.status}". Theo hợp đồng API, các sản phẩm published sẽ bị ẩn khỏi Public Catalog API (404) cho đến khi bảo tàng được chuyển sang "published".`

### Lệnh commit (Người dùng tự gõ):
```bash
git add scripts/seed-souvenirs.ts
git commit -m "feat(seed): add public storage preflight, find-or-create museum, and visibility checks"
```

---

## Giai đoạn 3: Xử Lý `--clean` An Toàn (Dev Exception) & Khóa Ngoại RESTRICT

### Mục tiêu
Hiện thực hóa cờ `--clean` như một ngoại lệ dành riêng cho môi trường dev/local để reset fixture, bảo vệ toàn vẹn dữ liệu trước khóa ngoại RESTRICT và cập nhật tài liệu thiết kế DB.

### Yêu cầu kỹ thuật
1. **Ranh giới Ngoại lệ Kỹ thuật & Defense-in-depth Safety Guard cho `--clean`:**
   - Catalog runtime cấm hard-delete (`archive only` theo `database-design.md:13`). Cờ `--clean` là ngoại lệ kỹ thuật chỉ phục vụ reset fixture trên môi trường dev/local.
   - **Xác nhận an toàn kép (Defense-in-depth Safety Guard):**
     Do `src/config/env.ts:4` mặc định gán `NODE_ENV = 'development'` khi biến này bị thiếu, việc chỉ kiểm tra `NODE_ENV !== 'production'` sẽ không an toàn nếu file `.env` trỏ tới production database nhưng lại thiếu khai báo `NODE_ENV`. Vì vậy, khi cờ `--clean` được bật, script bắt buộc kiểm tra đồng thời:
     1. `NODE_ENV` bắt buộc phải được đặt **tường minh** là `'development'` hoặc `'test'`. Nếu `NODE_ENV` bị thiếu hoặc mang bất kỳ giá trị nào khác (kể cả fallback ngầm) -> dừng ngay lập tức.
     2. `DATABASE_URL` bắt buộc phải có host nằm trong **allowlist local/test** (`localhost`, `127.0.0.1`, `::1`, `0.0.0.0`, `*.local`, `*.test`). Nếu `DATABASE_URL` trỏ tới bất kỳ remote/cloud host nào (như `*.supabase.co`, `*.supabase.com`, remote RDS...) -> ném lỗi và từ chối chạy `--clean` ngay lập tức để bảo vệ an toàn tuyệt đối cho database từ xa.
   - **Phạm vi cập nhật tài liệu:** Chỉ cập nhật tài liệu thiết kế cơ sở dữ liệu (`docs/database-design.md`) để ghi nhận ngoại lệ reset fixture bằng CLI script. **GIỮ NGUYÊN `docs/api-contract.md`** vì contract chỉ mô tả HTTP REST API (và API hoàn toàn không có DELETE endpoint cho catalog).
2. **Giới hạn phạm vi theo Managed SKUs:**
   - Chỉ xóa các sản phẩm thuộc bảo tàng mục tiêu có `sku IN (:managedSkus)`. Không xóa bất kỳ sản phẩm nào ngoài fixture.
3. **Pre-check Ràng buộc Khóa ngoại (Fail-fast / No partial changes):**
   - `cart_items` và `shop_order_items` tham chiếu `souvenir_products(id)` với `onDelete: 'restrict'`.
   - Trước khi xóa: Query kiểm tra xem các `id` sản phẩm sắp xóa có tồn tại trong `cart_items` hoặc `shop_order_items` hay không.
   - **Nếu có tham chiếu:** Hủy ngay tiến trình xóa (Abort), ném lỗi chi tiết danh sách SKU/Product đang bị khóa và dừng script trước khi có bất kỳ thay đổi một phần nào.
4. **Thực thi Transaction DB & Best-effort Storage Cleanup:**
   - Bọc toàn bộ thao tác xóa DB trong `db.transaction(...)`:
     1. Lấy danh sách `storage_path` của các `media_assets` liên quan (`entity_type = 'souvenir' AND entity_id IN (:productIds)`).
     2. Xóa các bản ghi `media_assets`.
     3. Xóa các bản ghi `souvenir_products`.
   - Sau khi DB transaction commit thành công, gọi `deleteMedia(bucket, storagePath)` từ `src/lib/storage.ts` để dọn Storage theo cơ chế **best-effort** (lỗi Storage chỉ ghi warning log, không làm fail script).

### Lệnh commit (Người dùng tự gõ):
```bash
git add scripts/seed-souvenirs.ts docs/database-design.md
git commit -m "feat(seed): implement scoped clean with foreign key pre-check and doc updates"
```

---

## Giai đoạn 4: Luồng Xử Lý Media Đầy Đủ & Khớp Chuẩn Repo

### Mục tiêu
Tải ảnh có kiểm soát bộ nhớ, kiểm định MIME type, upload lên Supabase Storage với cấu trúc đường dẫn chuẩn repo và gán đầy đủ `createdBy`.

### Yêu cầu kỹ thuật
1. **Kiểm Soát Kích Thước Khi Đọc Stream/Buffer (Memory Guard):**
   - Giới hạn dung lượng tối đa: **10 MB** (`10 * 1024 * 1024` bytes).
   - Kiểm tra header `content-length` trước khi tải. Nếu vượt quá 10 MB, bỏ qua ngay.
   - Khi đọc response stream, cộng dồn kích thước các chunk và ngắt sớm (abort stream) nếu vượt quá 10 MB để tránh nạp dữ liệu khổng lồ vào bộ nhớ RAM.
   - Buffer hợp lệ phải >= 100 bytes.
2. **Định dạng cho phép & Khớp Quy ước Đường dẫn:**
   - Định dạng ảnh: Chỉ chấp nhận các định dạng backend cho phép (`ALLOWED_MIME_TYPES` từ `src/services/media.ts`: `'image/jpeg'`, `'image/png'`, `'image/webp'`) sau khi phân tích qua `detectMimeType(buffer)`.
   - Sử dụng hàm chuẩn `buildStoragePath(museumId, 'souvenir', souvenirId, ext)` từ `src/lib/storage.ts`.
   - Đường dẫn sinh ra có dạng `${museumId}/souvenir/${souvenirId}/${randomHex}.${ext}`, khớp với `docs/api-contract.md:163`.
3. **Ghi `media_assets`, Gán `createdBy` & Thu Hồi Object Mồ Côi:**
   - Chèn bản ghi `media_assets` với:
     ```typescript
     const [mediaRow] = await dbClient
       .insert(mediaAssets)
       .values({
         museumId,
         entityType: 'souvenir',
         entityId: productId,
         mediaType: 'image',
         storageBucket: 'souvenir-media',
         storagePath,
         mimeType: detectedMime,
         sortOrder: 0,
         isPrimary: true,
         createdBy: superadminId, // Bắt buộc gán createdBy
       })
       .onConflictDoNothing()
       .returning({ id: mediaAssets.id });
     ```
   - **Dọn dẹp Object mồ côi nếu ghi DB thất bại:**
     Nếu insert không tạo được row (tức `mediaRow` rỗng do conflict ngoài ý muốn) HOẶC nếu câu lệnh insert ném ra lỗi DB sau khi file đã upload lên Storage:
     Script gọi ngay `deleteMedia(bucket, storagePath)` theo cơ chế **best-effort** để dọn dẹp file vừa upload, tránh để lại object mồ côi trên Storage.
4. **Báo lỗi Media Chặt Chẽ:**
   - Nếu tải, upload ảnh, hoặc ghi DB media thất bại: Ghi log chi tiết lỗi kèm ID sản phẩm, tăng biến đếm `mediaErrors++`.
   - Kết thúc script, nếu `mediaErrors > 0`, **đặt `process.exitCode = 1`** để script không báo thành công giả khi thiếu ảnh.

### Lệnh commit (Người dùng tự gõ):
```bash
git add scripts/seed-souvenirs.ts
git commit -m "feat(seed): implement memory-guarded media fetch, upload, and error reporting"
```

---

## Giai đoạn 5: Idempotency Toàn Diện (Sản Phẩm, Media & Backfill)

### Mục tiêu
Chèn sản phẩm kèm `createdBy`, xử lý conflict SKU chuẩn xác (báo lỗi nếu conflict bất thường), không đè dữ liệu cũ và tự động backfill media bị thiếu.

### Yêu cầu kỹ thuật
1. **Chèn Sản phẩm & Gán `createdBy: superadminId`:**
   - Thực hiện insert vào `souvenir_products`:
     ```typescript
     const [inserted] = await dbClient
       .insert(souvenirProducts)
       .values({
         museumId,
         name: item.name,
         description: item.description,
         sku: item.sku,
         price: item.price,
         currency: 'VND',
         stockQuantity: item.stockQuantity,
         status: options.status,
         createdBy: superadminId, // Bắt buộc gán createdBy
       })
       .onConflictDoNothing()
       .returning({ id: souvenirProducts.id });
     ```
2. **Xử lý Conflict Chuẩn Xác (Không che giấu lỗi):**
   - Nếu `inserted` trả về rỗng (conflict xảy ra):
     + Query DB tìm bản ghi theo `(museum_id, sku)`.
     + **Nếu không tìm thấy bản ghi:** Ném lỗi ngay (`throw new Error(...)`) vì conflict xảy ra do nguyên nhân bất thường khác ngoài SKU (tránh coi đây là sản phẩm bỏ qua).
     + **Nếu tìm thấy:** Giữ nguyên dữ liệu hiện có (`price`, `stock_quantity`, `description`, `status`), không ghi đè.
     + Lấy `productId = existing.id`.
3. **Kiểm tra Media Hiện Có & Tự Động Backfill:**
   - Kiểm tra trong `media_assets` xem đã có bản ghi primary cho `productId` này chưa.
   - Nếu đã có: Bỏ qua (không tải/upload lại), ngăn chặn file mồ côi trên Storage.
   - Nếu chưa có (sản phẩm cũ chưa có ảnh hoặc chạy lại sau khi lỗi mạng): Tải ảnh, upload Storage và chèn `media_assets` với `createdBy: superadminId` để **backfill media**.

### Lệnh commit (Người dùng tự gõ):
```bash
git add scripts/seed-souvenirs.ts
git commit -m "feat(seed): ensure strict product idempotency, error detection, and media backfill"
```

---

## Giai đoạn 6: Hoàn Thiện CLI Entrypoint (`scripts/seed-souvenirs.ts`)

### Mục tiêu
Hoàn tất giao diện dòng lệnh, phân tích cờ, kiểm tra quyền superadmin và dọn dẹp tài nguyên.

### Yêu cầu kỹ thuật
1. **Phân tích Cờ CLI (`parseCliArgs`):**
   - `--superadmin <uuid>` / `-s <uuid>` / `--superadmin=<uuid>` (Bắt buộc).
   - `--status <published|draft>` (Mặc định: `published`).
   - `--clean` (Ngoại lệ dev reset).
   - `--skip-media` (Bỏ qua hoàn toàn upload & media_assets).
2. **Thẩm định Quyền Hạn, Môi Trường & Safety Guard:**
   - Chặn chạy trên `NODE_ENV === 'production'`.
   - Nếu cờ `--clean` được bật: Kích hoạt `assertSafeCleanEnvironment` (kiểm tra `NODE_ENV` tường minh là `development`/`test` và `DATABASE_URL` hostname thuộc allowlist local/test).
   - Validate `superadminId` đúng định dạng UUID.
   - Kiểm tra `superadminId` tồn tại trong bảng `users` và có role `super_admin` trong bảng `user_roles`.
3. **Báo Cáo Thống Kê & Giải Phóng Kết Nối:**
   - In bảng tóm tắt: bảo tàng xử lý, sản phẩm chèn mới, sản phẩm giữ nguyên, media upload thành công, media bỏ qua, số lỗi media.
   - Gán `process.exitCode = 1` nếu có lỗi.
   - Luôn đóng kết nối database trong `finally { await closeDb(); }`.

### Lệnh commit (Người dùng tự gõ):
```bash
git add scripts/seed-souvenirs.ts
git commit -m "feat(seed): complete cli argument parsing and execution orchestration"
```

---

## Giai đoạn 7: Bộ Test Suite Toàn Diện (`tests/scripts/seed-souvenirs.test.ts`)

### Mục tiêu
Xây dựng test suite hoàn chỉnh với Vitest, cô lập hoàn toàn DB và Storage client bằng mock pattern.

### Yêu cầu kỹ thuật
1. **Test Fixture Schema & Integrity:**
   - Fixture có đủ 6 bảo tàng Smithsonian, mỗi bảo tàng có đúng 5–10 sản phẩm.
   - SKU không trùng lặp trong từng bảo tàng.
   - Giá tiền dương, currency strict `'VND'`, tồn kho hợp lệ (`20..100`).
2. **Test CLI Arguments & User Validation:**
   - Nhận diện đúng cờ dài, cờ ngắn, giá trị mặc định.
   - Báo lỗi khi thiếu superadmin ID, sai định dạng UUID.
   - Báo lỗi khi superadmin ID đúng chuẩn UUID nhưng **không tồn tại trong bảng `users`**.
   - Báo lỗi khi user có trong `users` nhưng thiếu role `super_admin` trong bảng `user_roles`.
   - Báo lỗi khi cờ `--status` nhận giá trị không hợp lệ (ví dụ `--status invalid`) hoặc bị thiếu giá trị đi kèm.
   - Từ chối thực thi khi `NODE_ENV=production`.
3. **Test `findOrCreateMuseum` & Cảnh Báo Trạng Thái:**
   - Tái sử dụng bảo tàng đã có mà không sửa `status`.
   - Tạo mới bảo tàng với status mặc định riêng nếu chưa có.
   - Kích hoạt cảnh báo khi bảo tàng là `draft` hoặc `archived` với sản phẩm `published`.
4. **Test `--clean` Safety Guards & Pre-check Khóa Ngoại:**
   - **Safety Guards:**
     + Từ chối `--clean` khi `NODE_ENV` bị thiếu hoặc rỗng.
     + Từ chối `--clean` khi `NODE_ENV` không phải `development` hoặc `test` (ví dụ `staging`, `production`).
     + Từ chối `--clean` khi `DATABASE_URL` trỏ tới remote host không nằm trong allowlist (ví dụ `aws-0.pooler.supabase.com`, `db.production.io`).
     + Chấp thuận `--clean` khi `NODE_ENV === 'development'` và host là `localhost`/`127.0.0.1`.
   - Giới hạn xóa đúng các sản phẩm trong `MANAGED_SKUS`.
   - Ném lỗi và dừng trước khi xóa nếu sản phẩm có tham chiếu trong `cart_items` hoặc `shop_order_items`.
   - Xác nhận script kích hoạt `db.transaction(...)`.
5. **Test Media Flow, Idempotency & Error Handling:**
   - Upload ảnh với `buildStoragePath`, gán `createdBy: superadminId` và tạo `media_assets` đúng schema.
   - Cờ `--skip-media` không gọi Storage và không tạo bản ghi media.
   - **Xử lý các ca lỗi fetch & validation media:**
     + Fetch trả HTTP non-2xx (404, 500) -> ghi nhận lỗi, không upload.
     + Fetch bị timeout / AbortSignal kích hoạt -> ghi nhận lỗi, không upload.
     + Response stream vượt quá 10 MB -> hủy stream sớm, ghi nhận lỗi, không upload.
     + Buffer < 100 bytes hoặc magic bytes không khớp `ALLOWED_MIME_TYPES` -> ghi nhận lỗi, không upload.
     + Dọn dẹp object Storage nếu insert DB `media_assets` thất bại hoặc conflict (gọi `deleteMedia` best-effort).
   - Rerun không sửa đổi giá/tồn kho của sản phẩm cũ, không tạo sản phẩm trùng, và tự động backfill media nếu thiếu.
   - Ném lỗi khi `onConflictDoNothing` trả về rỗng nhưng không tìm thấy sản phẩm theo SKU.
   - Đặt `process.exitCode = 1` khi có bất kỳ lỗi media nào.

> ⚠️ **Lưu ý kiểm chứng Database Rollback:**
> Test đơn vị dùng mock chỉ kiểm tra việc gọi transaction và bắt exception. Để kiểm chứng rollback vật lý trên PostgreSQL thực tế, integration test cần chạy trên **dedicated test Postgres database** (theo nguyên tắc trong `AGENTS.md`), tuyệt đối không chạy trên database production.

### Lệnh commit (Người dùng tự gõ):
```bash
git add tests/scripts/seed-souvenirs.test.ts
git commit -m "test(seed): add comprehensive test suite for souvenir and media seed script"
```

---

## Giai đoạn 8: Đăng Ký Package.json, Toàn Bộ Test Suite & Chạy Thử Nghiệm

### Mục tiêu
Khai báo script trong `package.json`, chạy kiểm thử mục tiêu, chạy toàn bộ test suite repo và kiểm thử trên DB dev/local đã xác minh.

### Yêu cầu kỹ thuật
1. **Cấu hình `package.json`:**
   - Chỉ thêm duy nhất script mới (`typecheck:seed` đã có sẵn):
     ```json
     "seed:souvenirs": "tsx scripts/seed-souvenirs.ts"
     ```
2. **Bộ Lệnh Kiểm Tra Bắt Buộc (Theo AGENTS.md):**
   ```bash
   # 1. Test mục tiêu để xác minh logic seed
   npm test -- tests/scripts/seed-souvenirs.test.ts

   # 2. Typecheck toàn bộ repo & script seed
   npm run typecheck
   npm run typecheck:seed

   # 3. Chạy toàn bộ test suite để đảm bảo không hồi quy
   npm test
   ```
3. **Chạy Thử Nghiệm Trên DB Dev/Local Đã Xác Minh:**
   - Chạy với `--skip-media` để kiểm tra lưu trữ sản phẩm và `createdBy`.
   - Chạy với media đầy đủ để kiểm tra bucket `souvenir-media` (xác nhận bucket public).
   - Chạy lại lần 2 để kiểm chứng tính idempotent (không tạo bản ghi mới).
   - Chạy thử `--clean` trên môi trường dev.
4. **Hoàn tất Pull Request:**
   - Soát lại `git status` đảm bảo không có file rác hay file tạm nào bị stage (`git status`).
   - Mở PR từ nhánh `feat/duy/souvenir-seed` vào `main`, mô tả chi tiết các thay đổi và liên kết `Closes #14`.

### Lệnh commit (Người dùng tự gõ):
```bash
git add package.json
git commit -m "chore(seed): register seed:souvenirs script and complete test suite verification"
```
