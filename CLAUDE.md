# CLAUDE.md

Hướng dẫn làm việc cho Claude Code trong repo này.

## Dự án

`smart-internship-platform` — khoá luận tốt nghiệp: **Hệ thống tuyển dụng thực tập sinh thông minh tích hợp AI**. Kết nối Ứng viên/Sinh viên, Nhà tuyển dụng, và Admin. AI (phân tích CV, matching, ranking) là hướng mở rộng ở giai đoạn sau, **chưa triển khai** ở các phase đầu.

Chi tiết đầy đủ: `docs/01-project/PROJECT_OVERVIEW.md`, roadmap: `docs/01-project/PROJECT_PHASES.md`, kiến trúc: `docs/02-architecture/`.

## Tech stack

- TypeScript toàn bộ codebase (frontend + backend + shared).
- Frontend: Next.js (`apps/web`).
- Backend: Node.js + Express + TypeScript, DI qua `awilix` (`apps/server`).
- Database: PostgreSQL (Neon.tech) qua Prisma (chưa cài đặt, sẽ thêm ở Phase 1).
- Cache/rate-limit: Redis.
- API Gateway: Nginx (dev qua `infra/docker-compose`).
- Realtime: Socket.IO (chạy chung process với Express, không tách service riêng).
- Media storage: Cloudinary. Email: Resend (có `OTP_HARDCODE`/`OTP_HARDCODE_VALUE` cho dev).
- Shared types: `packages/shared-types` (npm workspaces monorepo).

## Quy ước repo

- Monorepo npm workspaces: `apps/*`, `packages/*`. Giữ nguyên tên `apps/server` (không đổi thành `apps/api`).
- Module backend nằm trong `apps/server/src/modules/<domain>`, đăng ký qua awilix composition root.
- Route frontend nhóm theo actor bằng Next.js route groups: `(public)`, `(auth)`, `(candidate)`, `(employer)`, `(admin)`.
- Tài liệu chính thức nằm trong `docs/`; `.claude-workspace/` chỉ là nơi làm việc tạm của AI, **không commit**.

## Development workflow

- `npm run dev:server` / `npm run dev:web` để chạy từng app.
- Không tự thêm dependency, infra (Docker/K8s...) mới nếu chưa có lý do rõ ràng trong tài liệu kiến trúc.
- Thay đổi kiến trúc quan trọng phải có plan được ghi lại (trong `docs/` sau khi duyệt), không tự ý quyết định ngầm.

## Restrictions — bắt buộc tuân thủ

- Phân tích và lên kế hoạch trước khi thực hiện thay đổi lớn; không tự ý triển khai toàn bộ tính năng khi chưa có đặc tả rõ ràng.
- Không sửa file không liên quan đến task đang làm.
- Không thêm dependency không cần thiết.
- Không xoá chức năng/file hiện có khi chưa có xác nhận rõ ràng.
- Thay đổi kiến trúc quan trọng cần được ghi thành tài liệu (`docs/02-architecture/`) trước khi triển khai.
- `.claude-workspace/` là tạm thời, không phải nguồn sự thật, không được commit vào Git.
- `packages/shared-types/src/index.ts` hiện còn chứa type sót lại từ một dự án khác (chat app) — không dùng làm tham chiếu domain, sẽ được thay thế ở Phase 1 (xem Open Questions trong `PROJECT_OVERVIEW.md`).
