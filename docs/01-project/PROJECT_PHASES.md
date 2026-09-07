# Project Phases — Roadmap

Roadmap này điều chỉnh theo domain thực tế của hệ thống tuyển dụng thực tập sinh (không dùng nguyên mẫu generic), và theo các quyết định đã chốt với người dùng: Nginx + Redis được thiết lập sớm (Phase 0/2) thay vì trì hoãn, cơ chế duyệt/thu hồi tin tuyển dụng (D4) được đưa vào Phase 4/6.

Không bắt buộc phải tuân thủ tuyệt đối thứ tự/số lượng phase này khi implementation thực tế phát sinh thay đổi hợp lý.

---

## Phase 0 — Foundation & Environment

- **Goal:** Repo hygiene và tooling nền tảng, không viết business logic.
- **Main modules:** Không có (chỉ infra/docs).
- **Deliverables:** `.gitignore` đã sửa (scope `apps/web/CLAUDE.md`/`apps/web/AGENTS.md`, thêm `.claude-workspace/`), bộ tài liệu `docs/` khởi tạo, `.claude-workspace/`, root `CLAUDE.md`, Nginx + Redis được thêm vào `infra/docker-compose.yaml` (chỉ setup hạ tầng, chưa cần dùng thật trong code).
- **Dependencies:** Không có.
- **Definition of Done:** `npm install`, `npm run dev:server`, `npm run dev:web` chạy được; `docker compose up` khởi động Nginx + Redis không lỗi.
- **Risks/Notes:** Thấp. Rủi ro duy nhất là cấu hình Nginx route sai khiến dev experience khó chịu — nên kiểm tra sớm.

## Phase 1 — Core Architecture & Data Layer

- **Goal:** Thiết lập nền backend mà tất cả các module nghiệp vụ sẽ dựa vào.
- **Main modules:** Cross-cutting — Prisma schema toàn domain, awilix composition root, quy ước error handling/logging, seed data danh mục (`catalog`).
- **Deliverables:** Prisma schema đầy đủ (bao gồm delta D4: `Company.requiresApproval`, `Company.retractionCount`, entity `JobPostModerationAction`, `JobPostStatus.TAKEN_DOWN`); kết nối Neon; thay thế toàn bộ nội dung `packages/shared-types/src/index.ts` (bỏ leftover từ dự án Zync) bằng type domain thật; base Express app + quy ước đăng ký module qua awilix; load env qua `dotenv`. Delta bổ sung cho auth (chốt cùng đợt điều chỉnh Identity & Access): `User.passwordHash` đổi thành optional, thêm `User.googleId` (optional, unique) để chuẩn bị cho đăng nhập Google ở Phase 2.
- **Dependencies:** Phase 0.
- **Definition of Done:** Một endpoint health-check chạy được với schema Postgres thật và type-safe qua Prisma Client.
- **Risks/Notes:** Các quyết định schema ở đây (đặc biệt `JobPost.jobType` enum, `WorkExperience.company` typing — xem Open Questions) cần được chốt trước khi implement, vì sửa sau sẽ tốn kém.

## Phase 2 — Identity & Access

- **Goal:** Xác thực và vòng đời user cơ bản cho cả 4 actor.
- **Main modules:** `auth`, `users`.
- **Deliverables:** Đăng ký/đăng nhập cho **Candidate/Employer** qua 2 phương thức — (1) email/password kèm xác thực OTP qua Resend (`OTP_HARDCODE`/`OTP_HARDCODE_VALUE` cho dev), (2) Google OAuth (verify token qua `google-auth-library`, tự động liên kết vào `User` có sẵn nếu email trùng, tạo mới nếu chưa có — role bắt buộc client gửi kèm là `CANDIDATE`/`EMPLOYER`, backend từ chối mọi giá trị khác). JWT issue/refresh/revoke, model Role/Status dùng chung cho cả 2 phương thức đăng nhập. Rate-limit OTP và JWT blacklist **dùng Redis thật ngay từ phase này** (theo quyết định D3), không dùng in-memory tạm. **Không có deliverable đăng ký Admin** — route `/auth/register` chặn cứng `role=ADMIN` ở tầng validation; tài khoản Admin được bootstrap riêng qua `apps/server/scripts/create-admin.ts` (ngoài phạm vi Express, xem Phase 1 delta + `INITIAL_ARCHITECTURE_PLAN.md`).
- **Dependencies:** Phase 1.
- **Definition of Done:** Candidate/Employer đăng ký/đăng nhập được qua cả email/password và Google; luồng OTP hoạt động đúng với cả `OTP_HARDCODE=true/false`; rate-limit OTP hoạt động qua Redis; gọi `/auth/register` với `role=ADMIN` bị từ chối; một tài khoản Admin được tạo sẵn qua script đăng nhập được bằng email/password.
- **Risks/Notes:** Redis phải sẵn sàng (đã có từ Phase 0 qua docker-compose hoặc redis cloud) trước khi phase này bắt đầu.

## Phase 3 — Candidate Profile

- **Goal:** Domain hồ sơ ứng viên.
- **Main modules:** `students`.
- **Deliverables:** CRUD hồ sơ cá nhân (bao gồm `gender`), học vấn (`Education` — lịch sử nhiều trường/ngành qua FK `University`/`Major`, có `isCurrent` đánh dấu chương trình đang theo học; không phải 1 trường/ngành cố định trên `Student`), kỹ năng (với số năm kinh nghiệm), kinh nghiệm làm việc, dự án nổi bật (kèm `isWorkingOn`), chứng chỉ (kèm `description`), giải thưởng.
- **Dependencies:** Phase 2, dữ liệu danh mục `catalog` (Major/University) đã seed từ Phase 1 (giờ được `Education` tham chiếu thay vì `Student`).
- **Definition of Done:** Một ứng viên có thể hoàn thiện toàn bộ hồ sơ cá nhân qua API.
- **Risks/Notes:** Thấp.

## Phase 4 — Employer & Company Module

- **Goal:** Domain tổ chức phía nhà tuyển dụng, bao gồm cơ chế kiểm soát duyệt tin.
- **Main modules:** `employers`, `companies`.
- **Deliverables:** Đăng ký/cập nhật hồ sơ doanh nghiệp, liên kết Employer ↔ Company (`isCompanyAdmin`), quy trình Admin `verify()`/`unverify()`, cờ **`Company.requiresApproval`** (Admin bật/tắt theo từng công ty), field **`Company.retractionCount`** (đếm số lần bị Admin thu hồi tin — xem chi tiết cơ chế D4 trong `INITIAL_ARCHITECTURE_PLAN.md`).
- **Dependencies:** Phase 2.
- **Definition of Done:** Một Employer account không thể đăng tin công khai cho tới khi `Company.isVerified = true`; Admin có thể bật/tắt `requiresApproval` cho một công ty và thấy `retractionCount` trong màn quản lý.
- **Risks/Notes:** Cần chốt rule: công ty chưa verified có được tạo `DRAFT` job post hay không (giả định hiện tại: được phép DRAFT, chặn từ bước submit/publish).

## Phase 5 — Subscription & Payment cho đăng tin tuyển dụng

- **Goal:** Domain gói dịch vụ + thanh toán, kiểm soát quyền đăng tin tuyển dụng theo gói đã mua.
- **Main modules:** `subscriptions`, `payments`.
- **Deliverables:**
  - `SubscriptionPlan` (catalog do Admin quản lý: `jobPostQuota`, `durationDays`, `price`, `isActive`).
  - `CompanySubscription`: Company mua/nâng cấp gói (`status: PENDING|ACTIVE|EXPIRED|CANCELLED`); nâng cấp giữa kỳ = huỷ gói cũ + tạo gói mới (không cộng dồn); quota còn lại tính bằng đếm `JobPost` tạo trong kỳ hiện tại (không lưu counter riêng).
  - Thanh toán qua VNPay/Momo (redirect + IPN callback, không SDK mobile): `Payment` (ý định thanh toán), `Transaction` (mỗi lần gọi cổng, giữ lịch sử thử lại), `PaymentCallbackLog` (log thô mọi callback, kể cả không khớp), `PaymentMethod` (catalog generic hoá cổng thanh toán).
  - Chặn hoàn toàn việc tạo `JobPost` mới (kể cả `DRAFT`) khi Company không có `CompanySubscription` đang `ACTIVE` còn quota — điểm tích hợp với Phase 6.
- **Dependencies:** Phase 4 (cần `Company` tồn tại để gắn `CompanySubscription`).
- **Definition of Done:** Company mua được gói qua VNPay hoặc Momo, IPN callback cập nhật đúng trạng thái `CompanySubscription`/`Payment`/`Transaction`; Company không có gói active bị chặn tạo `JobPost`; nâng cấp gói giữa kỳ hoạt động đúng luật đã chốt.
- **Risks/Notes:** Không dùng message queue (RabbitMQ/Redpanda) — xử lý IPN trực tiếp trong 1 transaction Prisma vì đây là monolith 1 process/1 DB, không có ranh giới service cần decouple (xem `INITIAL_ARCHITECTURE_PLAN.md` §12c). Chi tiết thiết kế: `docs/designs/SUBSCRIPTION_BILLING_DESIGN.md`.

## Phase 6 — Job Recruitment Module

- **Goal:** Vòng đời tin tuyển dụng đầy đủ, bao gồm cơ chế duyệt/thu hồi hoàn chỉnh.
- **Main modules:** `job-posts` (+ tra cứu `catalog` cho Industry/City/Skill khi filter/gắn tag).
- **Deliverables:**
  - Vòng đời: `DRAFT` → `submitForApproval()`/`publish()` → (nếu `Company.requiresApproval=true`: `PENDING` → Admin `APPROVED`/`REJECTED`; nếu `false`: thẳng `PUBLISHED`) → `EXPIRED` (tự động hết hạn)/`CLOSED` (employer tự đóng)/`TAKEN_DOWN` (Admin chủ động thu hồi, kèm lý do bắt buộc, tăng `Company.retractionCount`).
  - Entity `JobPostModerationAction` ghi log đầy đủ mọi hành động duyệt/từ chối/thu hồi.
  - Địa chỉ cụ thể (`address`, độc lập với `cityId` — cần thiết khi công ty có nhiều chi nhánh cùng thành phố), lương thoả thuận (`isNegotiable`), `requirements`/`benefits`; gắn kỹ năng yêu cầu qua `JobPostSkill` (dùng chung catalog `Skill` với `StudentSkill`, chuẩn bị AI matching Phase 11).
  - Tìm kiếm/lọc công khai theo lương, ngành nghề, địa điểm cho Guest.
  - Tạo mới (`submitForApproval()`/`publish()`) yêu cầu `Company` có `CompanySubscription` đang `ACTIVE` còn quota (Phase 5) — thiếu điều kiện này thì chặn ngay từ bước tạo `JobPost`.
- **Dependencies:** Phase 4, Phase 5.
- **Definition of Done:** Một Employer thuộc công ty đã verified publish được tin (tự động hoặc qua duyệt tuỳ cờ `requiresApproval`); Admin thu hồi được một tin đang `PUBLISHED` kèm lý do và thấy `retractionCount` tăng; Guest tìm được tin qua bộ lọc.
- **Risks/Notes:** `JobPost.jobType` cần enum rõ ràng trước khi hoàn thiện schema phase này (Open Question).

## Phase 7 — CV & Saved Jobs

- **Goal:** Tính năng hỗ trợ phía ứng viên gắn với tin tuyển dụng.
- **Main modules:** `cv`, `saved-jobs`.
- **Deliverables:** Upload/quản lý CV qua boundary Cloudinary (`MediaStorageService`), đặt CV mặc định; lưu/huỷ lưu tin tuyển dụng.
- **Dependencies:** Phase 3, Phase 6.
- **Definition of Done:** Ứng viên upload được CV và lưu/bỏ lưu một tin tuyển dụng đã đăng.
- **Risks/Notes:** Đảm bảo `students`/`applications` không import trực tiếp SDK Cloudinary — chỉ qua interface.

## Phase 8 — Application Module

- **Goal:** Luồng giao dịch trung tâm nối Student + JobPost + CV.
- **Main modules:** `applications`.
- **Deliverables:** Nộp/huỷ ứng tuyển, vòng đời trạng thái (`PENDING → REVIEWING → SHORTLISTED → INTERVIEWING → ACCEPTED/REJECTED`), ghi chú nội bộ + rating của nhà tuyển dụng (không hiển thị cho ứng viên — Open Question).
- **Dependencies:** Phase 3, Phase 6, Phase 7.
- **Definition of Done:** Luồng ứng tuyển → xét duyệt → quyết định chạy trọn vẹn end-to-end cho một tin tuyển dụng.
- **Risks/Notes:** Xác nhận rõ tính hiển thị của `rating`/`employerNotes` trước khi expose qua API cho ứng viên.

## Phase 9 — Realtime Communication

- **Goal:** Nhắn tin giữa ứng viên và nhà tuyển dụng.
- **Main modules:** `messaging` (gộp Conversation + Message), Socket.IO gateway (chạy chung process với Express, không tách service riêng).
- **Deliverables:** Tạo hội thoại — mỗi `Conversation` gắn cố định đúng 1 Student + 1 Employer qua FK trực tiếp (`studentId`/`employerId`, không phải participant list chung), tuỳ chọn gắn tin tuyển dụng (`jobPostId` optional); gửi/nhận tin nhắn realtime; trạng thái đã đọc qua `studentLastReadAt`/`employerLastReadAt`.
- **Dependencies:** Phase 8 (hoặc tối thiểu Phase 6 nếu cho phép liên hệ chung không qua ứng tuyển).
- **Definition of Done:** Hai user đăng nhập trao đổi tin nhắn realtime thành công giữa hai phiên trình duyệt khác nhau.
- **Risks/Notes:** Cần xác nhận ràng buộc `jobPost` trên Conversation trước khi chốt schema.

## Phase 10 — Notification & Email

- **Goal:** Thông báo xuyên suốt các module.
- **Main modules:** `notifications`, tích hợp Resend.
- **Deliverables:** Notification trong ứng dụng + email cho: cập nhật trạng thái ứng tuyển, tin tuyển dụng được duyệt/bị thu hồi, công ty được xác minh.
- **Dependencies:** Phase 4, Phase 6, Phase 8.
- **Definition of Done:** Một thay đổi trạng thái ứng tuyển tạo ra cả bản ghi notification trong DB và email (nếu cấu hình).
- **Risks/Notes:** Resend nên dùng chung một interface `EmailSender` với luồng OTP ở Phase 2.

## Phase 11 — AI Features Boundary

- **Goal:** Chỉ định nghĩa và nối sẵn boundary mở rộng AI, **không triển khai AI thật**.
- **Main modules:** `ai` (chia `ports/` và `adapters/`).
- **Deliverables:** Type `AIProvider`/`AIProviderType` (tái sử dụng shape đã có sẵn trong `packages/shared-types` hiện tại, kiểu `gemini`/`openrouter`), 4 port use-case (`CvAnalyzer`, `JobMatcher`, `CandidateRanker`, `CvImprover`), một adapter mẫu, feature flag bật/tắt toàn bộ AI.
- **Dependencies:** Phase 3, 6, 7, 8 (cần dữ liệu Student/JobPost/CV/Application để AI vận hành trên đó).
- **Definition of Done:** Tắt feature flag AI thì toàn bộ phase trước vẫn hoạt động bình thường, không module nghiệp vụ nào import trực tiếp adapter/SDK AI.
- **Risks/Notes:** Rủi ro lớn nhất là mở rộng quá đà sang việc "xây AI thật" — nằm ngoài phạm vi phase này.

## Phase 12 — Integration & Security Hardening

- **Goal:** Rà soát và cứng hoá bảo mật, review lại Nginx/Redis đã dựng từ Phase 0/2 (không phải setup mới).
- **Main modules:** Cross-cutting.
- **Deliverables:** Cấu hình Nginx (rate-limit qua `limit_req`, CORS header) nếu cần cho demo; JWT/auth vẫn xử lý ở tầng backend (Nginx không có plugin auth như Kong); audit input validation trên toàn bộ module; rà soát việc dùng Redis (rate-limit/cache) có hợp lý không.
- **Dependencies:** Tất cả các phase trước.
- **Definition of Done:** Security checklist đạt; Nginx/Redis được ghi rõ là "đã áp dụng" kèm rationale (không phải thêm ngẫu nhiên).
- **Risks/Notes:** Phase đầu tiên có thể cắt giảm nếu tiến độ khoá luận gấp.

## Phase 13 — Testing & Quality

- **Goal:** Lấp đầy `apps/server/tests/{unit,integration,load}` hiện đang trống.
- **Main modules:** Cross-cutting.
- **Deliverables:** Unit test theo module, integration test cho luồng ứng tuyển/duyệt tin/nhắn tin, một load test cơ bản.
- **Dependencies:** Tất cả các phase nghiệp vụ.
- **Definition of Done:** `npm test` chạy một bộ test có ý nghĩa (thay vì script placeholder hiện tại).
- **Risks/Notes:** Ưu tiên thấp hơn dưới áp lực thời gian nhưng cần thiết cho tính thuyết phục của khoá luận.

## Phase 14 — Deployment & Thesis Preparation

- **Goal:** Có một bản demo chạy được cho buổi bảo vệ.
- **Main modules:** Infra.
- **Deliverables:** Hoàn thiện `infra/docker-compose.yaml` cho production-like setup, cấu hình env production (Neon/Redis Cloud/Cloudinary/Resend/Nginx), tài liệu triển khai, kịch bản demo bảo vệ khoá luận.
- **Dependencies:** Tất cả các phase trước.
- **Definition of Done:** Từ một bản clone mới, làm theo tài liệu là chạy được bản demo.
- **Risks/Notes:** Rủi ro chung của việc triển khai lần đầu — nên thử sớm, không để tới sát ngày bảo vệ.
