# Project Overview — Hệ thống tuyển dụng thực tập sinh thông minh

**Repo:** `smart-internship-platform`
**Loại dự án:** Khoá luận tốt nghiệp — Kỹ thuật phần mềm
**Trạng thái tài liệu:** Khởi tạo lần đầu (Phase 0 discovery), sẽ cập nhật khi có thêm quyết định.

---

## 0. Setup — chạy dự án sau khi clone

**Yêu cầu:** Node.js ≥ 20, npm, Docker (cho Nginx gateway).

1. **Cài dependency** (chạy ở thư mục gốc — monorepo dùng npm workspaces):
   ```bash
   npm install
   ```

2. **Tạo file env gốc** từ template và điền giá trị thật:
   ```bash
   cp .env.example .env
   ```
   Chỉ có **một** file `.env` duy nhất ở thư mục gốc — dùng chung cho `apps/server` và `apps/web` (xem chi tiết trong `.env.example`). Cần điền:
   - `DATABASE_URL` — connection string PostgreSQL từ [Neon.tech](https://neon.tech) (Create Project → copy connection string).
   - `REDIS_URL` — connection string từ Redis Cloud.
   - `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — chuỗi bí mật bất kỳ (dev có thể tự sinh, vd. `openssl rand -hex 32`).
   - `RESEND_API_KEY` — API key từ [Resend](https://resend.com) (dev có thể để trống nếu bật `OTP_HARDCODE=true`).
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — từ Google Cloud Console (OAuth 2.0 Client), chỉ bắt buộc nếu test đăng nhập Google.
   - `CLOUDINARY_*` — từ [Cloudinary](https://cloudinary.com) dashboard, chỉ bắt buộc khi test upload media thật.
   - `OTP_HARDCODE=true` + `OTP_HARDCODE_VALUE=123456` — để dev không cần gửi email OTP thật.
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — dùng riêng cho script tạo Admin (bước 5), không phải biến runtime của server.

3. **Chạy Nginx API Gateway** (bắt buộc — frontend gọi API qua Nginx, xem `NEXT_PUBLIC_API_URL=http://localhost:8080/api`):
   ```bash
   docker compose -f infra/docker-compose.yaml up -d
   ```

4. **Khởi tạo database** (Prisma, từ Phase 1 trở đi):
   ```bash
   npm run db:generate --workspace=apps/server
   npm run db:migrate --workspace=apps/server
   ```

5. **(Tuỳ chọn) Tạo tài khoản Admin** — Admin không có luồng đăng ký, chỉ tạo qua script nội bộ, cần `ADMIN_EMAIL`/`ADMIN_PASSWORD` trong `.env`:
   ```bash
   npm run create-admin --workspace=apps/server
   ```

6. **Chạy backend và frontend** (2 terminal riêng, ở thư mục gốc):
   ```bash
   npm run dev:server   # Express API, http://localhost:4000
   npm run dev:web       # Next.js, http://localhost:3000
   ```
   `apps/web` không có `.env` riêng — mỗi lần `dev`/`build`/`start` sẽ tự copy `.env` gốc sang `apps/web/.env.local` (script `predev`/`prebuild`/`prestart`), nên chỉ cần sửa `.env` ở gốc.

7. Truy cập ứng dụng qua **Nginx gateway**: `http://localhost:8080` (không gọi thẳng `localhost:4000` — Nginx là single entry point cho API, xem `infra/nginx/nginx.conf`).

Nếu port 4000/3000/8080 đã bị chiếm hoặc cần đổi, cập nhật `PORT`, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL` tương ứng trong `.env`.

---

## 1. Project name

**Phát triển hệ thống tuyển dụng thực tập sinh thông minh tích hợp Trí tuệ nhân tạo** (tên repo: `smart-internship-platform`).

## 2. Problem statement

Sinh viên tìm kiếm cơ hội thực tập và nhà tuyển dụng tìm kiếm thực tập sinh phù hợp hiện gặp khó khăn trong việc kết nối hiệu quả: thông tin tuyển dụng phân mảnh, hồ sơ ứng viên khó so khớp với yêu cầu công việc, và thiếu công cụ hỗ trợ đánh giá mức độ phù hợp giữa CV và tin tuyển dụng. Hệ thống này xây dựng một nền tảng tập trung, có khả năng mở rộng bằng AI để cải thiện chất lượng kết nối giữa hai phía.

## 3. Project objectives

- Xây dựng nền tảng tuyển dụng thực tập sinh với đầy đủ vòng đời: đăng tin, ứng tuyển, xét duyệt, trao đổi.
- Cho phép ứng viên quản lý hồ sơ cá nhân, CV, và theo dõi trạng thái ứng tuyển.
- Cho phép nhà tuyển dụng quản lý thông tin doanh nghiệp, tin tuyển dụng, và hồ sơ ứng viên.
- Cho phép Admin quản trị người dùng, phê duyệt nhà tuyển dụng, và quản lý danh mục ngành nghề.
- Chuẩn bị kiến trúc để có thể bổ sung các tính năng AI (phân tích CV, matching, ranking) ở giai đoạn sau mà không phá vỡ core business logic.

## 4. Target users

| Actor | Vai trò |
|---|---|
| Khách vãng lai (Guest) | Tìm kiếm, xem tin tuyển dụng và thông tin doanh nghiệp công khai |
| Ứng viên / Sinh viên (Candidate) | Quản lý hồ sơ, CV, ứng tuyển, lưu tin, liên hệ nhà tuyển dụng |
| Nhà tuyển dụng (Employer) | Quản lý doanh nghiệp, đăng/quản lý tin tuyển dụng, xét duyệt hồ sơ ứng tuyển |
| Quản trị viên (Admin) | Quản lý người dùng, phê duyệt nhà tuyển dụng, quản lý ngành nghề, kiểm duyệt tin tuyển dụng |

## 5. Scope

- Đăng ký/đăng nhập, phân quyền theo vai trò. Candidate/Employer đăng ký & đăng nhập bằng email/password (kèm OTP) hoặc Google OAuth (liên kết theo email nếu trùng); Admin **không có luồng đăng ký** — tài khoản Admin chỉ được khởi tạo qua script nội bộ (`apps/server/scripts/create-admin.ts`), đăng nhập bằng email/password.
- Hồ sơ ứng viên (học vấn, kỹ năng, kinh nghiệm, dự án nổi bật, chứng chỉ, giải thưởng), quản lý CV.
- Hồ sơ doanh nghiệp, quy trình xác minh nhà tuyển dụng bởi Admin.
- Vòng đời tin tuyển dụng đầy đủ: nháp → (chờ duyệt/đăng ngay) → công khai → hết hạn/đóng/bị thu hồi.
- Cơ chế duyệt tin linh hoạt theo từng công ty + cơ chế thu hồi tin của Admin (xem chi tiết trong `INITIAL_ARCHITECTURE_PLAN.md`).
- Ứng tuyển, lưu tin, tìm kiếm/lọc tin theo lương/ngành/địa điểm.
- Nhắn tin thời gian thực giữa ứng viên và nhà tuyển dụng.
- Thông báo trong ứng dụng và qua email cho các sự kiện quan trọng.
- Quản lý danh mục dùng chung: ngành nghề, trường/khối ngành, loại hình công ty, thành phố.

## 6. Out of scope (giai đoạn hiện tại)

- Triển khai đầy đủ pipeline AI (phân tích CV, matching, ranking, gợi ý cải thiện CV) — chỉ chuẩn bị kiến trúc, không xây dựng thuật toán/tích hợp model thật ở các phase đầu.
- **Crawl/import tin tuyển dụng từ nguồn bên ngoài** (`CrawledJob` xuất hiện trong class diagram tạm thời nhưng không có trong use case/mô tả nghiệp vụ ban đầu) — xem Open Questions.
- Ứng dụng mobile.
- Đồng bộ đa thiết bị, offline mode.
- Microservices hoá — hệ thống giữ dạng modular monolith trong phạm vi khoá luận.

## 7. Main functional areas

Xem chi tiết actor × use case trong `docs/designs/use-case-diagram-v3.png` (Use Case Diagram) và domain entities trong `docs/designs/class-diagram-v2.jpg` (Class Diagram — bản tạm thời).

- **Public/Guest:** tìm kiếm tin tuyển dụng (lương/ngành/địa điểm), xem tin, xem thông tin doanh nghiệp.
- **Candidate:** hồ sơ cá nhân, CV, ứng tuyển, lưu tin, nhắn tin.
- **Employer:** hồ sơ doanh nghiệp, tin tuyển dụng, xét duyệt hồ sơ ứng tuyển, tìm kiếm ứng viên, nhắn tin.
- **Admin:** người dùng, nhà tuyển dụng (phê duyệt + cấu hình duyệt tin + thu hồi tin), ngành nghề.

## 8. Future AI direction

Các tính năng AI dự kiến (chưa triển khai, chỉ chuẩn bị boundary):

- Phân tích và đánh giá CV.
- Phân tích mức độ phù hợp giữa CV và tin tuyển dụng (matching).
- Hỗ trợ nhà tuyển dụng lọc/xếp hạng ứng viên (ranking).
- Đề xuất cải thiện CV.

Nguyên tắc: core business logic (`students`, `job-posts`, `applications`) không được phụ thuộc cứng vào một AI provider cụ thể — xem mục AI Integration Boundary trong `INITIAL_ARCHITECTURE_PLAN.md`.

## 9. Technology stack

| Layer | Công nghệ |
|---|---|
| Ngôn ngữ | TypeScript (toàn bộ) |
| Frontend | Next.js |
| Backend | Node.js, Express, TypeScript, DI qua `awilix` |
| ORM | Prisma (chưa cài đặt, sẽ thêm ở Phase 1) |
| Database | PostgreSQL (Neon.tech managed) |
| Cache / Rate-limit | Redis (Redis Cloud), dùng từ Phase 2 |
| API Gateway | Nginx (thiết lập sớm trong `infra/docker-compose`, từ Phase 0) |
| Realtime | Socket.IO (chạy chung process với Express) |
| Media/File storage | Cloudinary (avatar, logo, CV, banner) |
| Email | Resend (có `OTP_HARDCODE`/`OTP_HARDCODE_VALUE` cho dev) |
| Auth phương thức thứ 2 | Google OAuth 2.0 (chỉ Candidate/Employer, `google-auth-library` verify token phía backend) |
| Monorepo | npm workspaces (`apps/*`, `packages/*`) |

## 10. High-level architecture

```text
Next.js Frontend (apps/web)
        |
        v
Nginx API Gateway (infra/docker-compose, reverse proxy config)
        |
        v
Express Backend API (apps/server) ── Socket.IO (chạy chung process)
        |
   +----+-----------------------+
   |            |               |
   v            v               v
PostgreSQL    Redis        External Services
(Neon)        Cloud        (Cloudinary, Resend)
```

Chi tiết đầy đủ và các quyết định (Nginx dev setup, vai trò Redis, boundary AI, cơ chế duyệt tin...) nằm trong `docs/02-architecture/INITIAL_ARCHITECTURE_PLAN.md`.

## 11. External services

| Dịch vụ | Vai trò |
|---|---|
| Neon.tech | Managed PostgreSQL |
| Redis Cloud | Rate-limit OTP, JWT blacklist, cache |
| Cloudinary | Lưu trữ media: avatar, logo doanh nghiệp, CV, banner |
| Resend | Gửi email (OTP, thông báo giao dịch) |
| Nginx | API Gateway (dev + chuẩn bị cho production) |
| Google OAuth | Đăng ký/đăng nhập thay thế cho Candidate/Employer (không áp dụng cho Admin) |

## 12. Key architectural principles

- Maintainability và separation of concerns ưu tiên hơn tối ưu hiệu năng sớm.
- Modular monolith: chia theo module domain trong cùng một backend, không tách microservices trừ khi có lý do rõ ràng.
- Type safety xuyên suốt qua TypeScript + `packages/shared-types`.
- Không thêm công nghệ/dependency chỉ vì đã được liệt kê trong tech stack dự kiến — mỗi công nghệ phải có lý do sử dụng cụ thể được ghi trong tài liệu kiến trúc.
- AI là extension boundary, không phải core dependency.

## 13. Assumptions

- Kiến trúc monorepo hiện có (`apps/server`, `apps/web`, `packages/shared-types`, `infra/`) được giữ nguyên tên gọi, không đổi thành `apps/api` dù đó là gợi ý mặc định ban đầu.
- Admin không phải là một entity/class riêng trong dữ liệu — được mô hình hoá như `User` với Role `ADMIN`.
- Admin không bao giờ được tạo qua API/route đăng ký công khai — tài khoản Admin luôn được khởi tạo bằng script nội bộ chạy thủ công (`apps/server/scripts/create-admin.ts`, hash password rồi insert/upsert thẳng vào bảng `users`), không có UI/endpoint đăng ký Admin ở bất kỳ giai đoạn nào.
- Tài khoản Google và tài khoản email/password của Candidate/Employer được liên kết theo **email trùng khớp**: nếu email đăng nhập Google trùng với một `User` đã tồn tại (đăng ký bằng password), hệ thống gắn `googleId` vào `User` đó thay vì tạo bản ghi mới; một `User` có thể có cả `passwordHash` lẫn `googleId` cùng lúc.
- Use Case Diagram và Class Diagram hiện tại là **bản tạm thời**, không phải source of truth tuyệt đối — các điểm mâu thuẫn được ghi ở mục 14.
- `WorkExperience.company` mặc định là chuỗi tự do (không bắt buộc liên kết tới entity `Company` đã đăng ký trên hệ thống).
- Nhà tuyển dụng/công ty chưa được xác minh (`isVerified = false`) vẫn được tạo tin tuyển dụng ở trạng thái `DRAFT`, nhưng bị chặn từ bước gửi duyệt/đăng công khai.
- `Application.rating` và `employerNotes` chỉ hiển thị nội bộ cho nhà tuyển dụng, không hiển thị cho ứng viên.

## 14. Open questions

1. `packages/shared-types/src/index.ts` hiện chứa toàn bộ type của một dự án khác (chat app "Zync") — không liên quan domain tuyển dụng. Cần thay thế hoàn toàn ở Phase 1 (không sửa ở lần chạy này).
2. `CrawledJob` (crawl tin tuyển dụng từ nguồn ngoài) xuất hiện trong class diagram nhưng không có trong use case/mô tả nghiệp vụ — đã quyết định: **ngoài phạm vi** hiện tại, không đưa vào roadmap.
3. ~~`JobPost.jobType` hiện là kiểu `String` tự do...~~ **Đã chốt ở Phase 1:** `JobPostType` enum theo hình thức tuyển dụng — `INTERNSHIP | PART_TIME | FULL_TIME | CONTRACT` (không giới hạn nền tảng vào mỗi tin thực tập, khớp với các field lọc sẵn có theo lương/ngành/địa điểm).
4. `Employer.company` chưa rõ kiểu dữ liệu trong diagram — cần xác nhận là quan hệ bắt buộc tới `Company`.
5. ~~`Conversation` hiện gắn với bộ ba cố định...~~ **Đã chốt ở Phase 1:** `Conversation.jobPost` là quan hệ optional trong schema (theo đề xuất ban đầu) — cho phép liên hệ chung không gắn tin cụ thể; sẽ xác nhận lại UX thật khi implement Phase 8.
6. Use Case Diagram chỉ vẽ "Đăng tin/Cập nhật tin" cho nhà tuyển dụng, không có "Đóng tin", trong khi Class Diagram có đầy đủ `close()`/`expire()` và trạng thái tương ứng — coi Use Case Diagram là bản minh hoạ rút gọn, vẫn triển khai đầy đủ vòng đời tin tuyển dụng.
7. Cơ chế duyệt tin/thu hồi tin (`Company.requiresApproval`, `Company.retractionCount`, entity `JobPostModerationAction`, trạng thái `TAKEN_DOWN`) là quyết định nghiệp vụ mới, **chưa có trong Class Diagram gốc** — cần cập nhật chính thức vào diagram trước khi trình bày khoá luận.
8. Ngưỡng tự động hoá dựa trên `retractionCount` (ví dụ tự động chuyển `requiresApproval = true` khi vượt ngưỡng) chưa được xây dựng ở MVP — Admin quyết định thủ công dựa trên số liệu hiển thị; có thể cân nhắc tự động hoá ở giai đoạn sau.
9. Root `package.json` có field `description` bị lỗi encoding (dữ liệu UTF-16 sót lại) — lỗi cosmetic, không ảnh hưởng chức năng, có thể sửa khi tiện.

## 15. High-level development roadmap

Xem chi tiết đầy đủ (Goal/Modules/Deliverables/Dependencies/DoD/Risks từng phase) trong `docs/01-project/PROJECT_PHASES.md`. Tóm tắt:

0. Foundation & Environment
1. Core Architecture & Data Layer
2. Identity & Access
3. Candidate Profile
4. Employer & Company
5. Job Recruitment (bao gồm cơ chế duyệt/thu hồi tin)
6. CV & Saved Jobs
7. Application Module
8. Realtime Messaging
9. Notifications & Email
10. AI Features Boundary
11. Integration & Security Hardening
12. Testing & Quality
13. Deployment & Thesis Prep
