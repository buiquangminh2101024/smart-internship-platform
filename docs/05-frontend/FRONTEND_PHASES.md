# Frontend Phases — Roadmap

Roadmap này liệt kê các phase frontend (`apps/web`) ở mức tóm tắt, đi song song với `docs/01-project/PROJECT_PHASES.md` (backend) để dễ đối chiếu dependency giữa BE/FE. Kế hoạch chi tiết từng phase (component tree, routing, state management...) đặt ở `docs/05-frontend/phases/phase-NN-slug/PLAN.md`, tạo ngay trước khi triển khai — **chưa tồn tại** cho phase nào tại thời điểm viết roadmap này.

Không bắt buộc tuân thủ tuyệt đối thứ tự/số lượng phase này. Có thể chen thêm phase (đánh số `phase-NNx-slug`, xem `README.md`) khi phát sinh nhu cầu UI không map trực tiếp vào phase backend nào.

---

## Phase 0 — Foundation & Environment

- **Goal:** Scaffold Next.js app, tooling nền tảng (lint/format), chưa có UI nghiệp vụ.
- **Main screens/routes:** Không có — chỉ khung project.
- **Dependencies:** Không có.
- **Definition of Done:** `npm run dev:web` chạy được, load trang mặc định qua Nginx.

## Phase 1 — Core Architecture & Data Layer

- **Goal:** Nền tảng frontend mà mọi phase sau dựa vào.
- **Main screens/routes:** Root `layout.tsx`, `provider.tsx` (React Query/global providers), API client base (gọi `apps/server`), type dùng chung từ `packages/shared-types`.
- **Dependencies:** Phase 0 (frontend), Phase 1 (backend — cần type domain đã thay thế leftover Zync).
- **Definition of Done:** Gọi thử được 1 API backend (health-check) từ frontend qua API client chung, type-safe.

## Phase 2 — Identity & Access

- **Goal:** UI đăng ký/đăng nhập cho cả 3 actor, quản lý session phía client, và 3 homepage đầu tiên tách biệt theo actor (URL structure — xem `docs/02-architecture/ARCHITECTURE_DECISIONS.md` mục AD-1).
- **Main screens/routes:** `/` (Candidate homepage — guest marketing ⇄ Candidate đã đăng nhập, cùng route), `/employer` (Employer homepage công khai riêng, ưu tiên hành vi Recruiter), `/admin` (chỉ form đăng nhập, không có entry point từ nơi khác), `(auth)/register` + `(auth)/login` (email/password + OTP, Google OAuth cho Candidate/Employer), `middleware.ts` guard theo prefix (`/employer/(portal)/*`, `/admin/(console)/*`, `(candidate)/*`), lưu/refresh JWT phía client. Chi tiết: `docs/05-frontend/phases/phase-02-identity-access/PLAN.md`.
- **Dependencies:** Phase 1 (frontend), Phase 2 (backend).
- **Definition of Done:** Đăng ký/đăng nhập được qua UI cho Candidate/Employer (email/password + Google) và Admin (email/password); sau đăng nhập/đăng ký, Candidate quay lại `/`, Employer chuyển vào `/employer/...` (portal), Admin vào `/admin/...` (console); các route đã đăng nhập bị chặn nếu chưa đăng nhập đúng role.

## Phase 3 — Candidate Profile

- **Goal:** UI hồ sơ ứng viên.
- **Main screens/routes:** `(candidate)/profile` — CRUD học vấn, kỹ năng, kinh nghiệm làm việc, dự án, chứng chỉ, giải thưởng.
- **Dependencies:** Phase 2 (frontend), Phase 3 (backend), dữ liệu danh mục Major/University.
- **Definition of Done:** Một Candidate hoàn thiện toàn bộ hồ sơ qua UI.

## Phase 4 — Employer & Company Module

- **Goal:** UI hồ sơ doanh nghiệp và trạng thái xác minh.
- **Main screens/routes:** `(employer)/company` (đăng ký/cập nhật hồ sơ công ty, trạng thái verify), `(admin)/companies` (verify/unverify, bật/tắt `requiresApproval`, xem `retractionCount`).
- **Dependencies:** Phase 2 (frontend), Phase 4 (backend).
- **Definition of Done:** Employer thấy rõ trạng thái verify công ty mình; Admin verify/unverify và cấu hình `requiresApproval` được qua UI.

## Phase 5 — Job Recruitment Module

- **Goal:** UI vòng đời tin tuyển dụng đầy đủ, tìm kiếm công khai.
- **Main screens/routes:** `(public)/jobs` (tìm kiếm/lọc theo lương/ngành/địa điểm cho Guest), `(employer)/jobs` (tạo/sửa/submit/publish/close tin), `(admin)/jobs` (duyệt/từ chối/thu hồi kèm lý do, xem log moderation).
- **Dependencies:** Phase 4 (frontend), Phase 5 (backend).
- **Definition of Done:** Guest tìm được tin qua bộ lọc; Employer publish/đóng tin qua UI; Admin duyệt/thu hồi tin qua UI.

## Phase 6 — CV & Saved Jobs

- **Goal:** UI hỗ trợ ứng viên gắn với tin tuyển dụng.
- **Main screens/routes:** `(candidate)/cv` (upload/quản lý CV qua Cloudinary, đặt CV mặc định), nút lưu/bỏ lưu tin trong `(public)/jobs` và `(candidate)/saved-jobs`.
- **Dependencies:** Phase 3 (frontend), Phase 5 (frontend), Phase 6 (backend).
- **Definition of Done:** Candidate upload CV và lưu/bỏ lưu tin qua UI.

## Phase 7 — Application Module

- **Goal:** UI luồng ứng tuyển trung tâm.
- **Main screens/routes:** `(candidate)/applications` (nộp/huỷ ứng tuyển, theo dõi trạng thái), `(employer)/applications` (xét duyệt, ghi chú nội bộ + rating, đổi trạng thái).
- **Dependencies:** Phase 3, 5, 6 (frontend), Phase 7 (backend).
- **Definition of Done:** Luồng ứng tuyển → xét duyệt → quyết định chạy trọn vẹn qua UI cho một tin tuyển dụng.

## Phase 8 — Realtime Communication

- **Goal:** UI nhắn tin realtime giữa Candidate và Employer.
- **Main screens/routes:** `(candidate)/messages`, `(employer)/messages` — kết nối Socket.IO client, trạng thái đã đọc.
- **Dependencies:** Phase 7 (frontend), Phase 8 (backend).
- **Definition of Done:** Hai user trao đổi tin nhắn realtime qua UI thành công giữa hai phiên trình duyệt khác nhau.

## Phase 9 — Notification & Email

- **Goal:** UI thông báo trong ứng dụng.
- **Main screens/routes:** Notification bell/dropdown dùng chung layout (candidate/employer/admin).
- **Dependencies:** Phase 4, 5, 7 (frontend), Phase 9 (backend).
- **Definition of Done:** Thay đổi trạng thái ứng tuyển/tin tuyển dụng/verify công ty hiển thị notification trên UI theo thời gian thực hoặc khi reload.

## Phase 10 — AI Features Boundary

- **Goal:** Chỉ chuẩn bị chỗ hiển thị kết quả AI trên UI (nếu backend bật feature flag), không tự xây AI thật.
- **Main screens/routes:** Placeholder/khu vực hiển thị gợi ý (CV analysis, job matching...) ẩn khi feature flag tắt.
- **Dependencies:** Phase 3, 5, 6, 7 (frontend), Phase 10 (backend).
- **Definition of Done:** Tắt feature flag AI thì UI không hiển thị gì thêm, không lỗi.

## Phase 11 — Integration & Security Hardening

- **Goal:** Rà soát bảo mật phía client (XSS, lưu token an toàn, CORS).
- **Main screens/routes:** Cross-cutting — không có screen mới.
- **Dependencies:** Tất cả phase trước.
- **Definition of Done:** Security checklist frontend đạt (vd. không lưu JWT ở nơi dễ bị XSS đọc, sanitize input hiển thị).

## Phase 12 — Testing & Quality

- **Goal:** Test UI (unit component + integration/E2E cơ bản).
- **Main screens/routes:** Cross-cutting.
- **Dependencies:** Tất cả phase nghiệp vụ frontend.
- **Definition of Done:** Có bộ test có ý nghĩa chạy được (framework chốt lúc gần tới phase này — xem `docs/02-architecture/PROJECT_STRUCTURE.md` §9).

## Phase 13 — Deployment & Thesis Preparation

- **Goal:** Bản build frontend production-ready cho demo bảo vệ.
- **Main screens/routes:** Cross-cutting.
- **Dependencies:** Tất cả phase trước.
- **Definition of Done:** Build `apps/web` chạy qua Nginx cùng backend từ một bản clone mới theo tài liệu triển khai.
