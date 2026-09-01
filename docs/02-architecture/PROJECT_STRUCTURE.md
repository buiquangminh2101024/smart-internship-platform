# Project Structure

## 1. Repository strategy

Monorepo dùng npm workspaces (`apps/*`, `packages/*`), giữ nguyên cấu trúc đã có sẵn trong repo thay vì áp đặt lại template gốc của prompt khởi tạo (vốn gợi ý `apps/api`) — vì `apps/server` đã được git-track và dùng xuyên suốt.

## 2. Root structure

```text
smart-internship-platform/
├── apps/
│   ├── server/          # Backend: Express API + Socket.IO
│   └── web/             # Frontend: Next.js
├── packages/
│   └── shared-types/     # TypeScript types dùng chung server + web
├── infra/
│   └── docker-compose.yaml   # Nginx, Redis (từ Phase 0), Postgres/Neon proxy nếu cần cho local
├── docs/
│   ├── 01-project/       # Tài liệu tổng quan + roadmap
│   ├── 02-architecture/  # Tài liệu kiến trúc
│   └── designs/          # Diagram tham chiếu (Use Case, Class Diagram)
├── .claude-workspace/     # Workspace tạm của AI — KHÔNG commit
├── CLAUDE.md
├── .gitignore
├── package.json           # npm workspaces root
└── tsconfig.base.json / tsconfig.json
```

## 3. Frontend structure (`apps/web`)

Next.js App Router. Route groups theo actor để mỗi nhóm có layout/guard riêng:

```text
apps/web/src/app/
├── (public)/       # Guest: landing, tìm kiếm tin, chi tiết tin, chi tiết doanh nghiệp
├── (auth)/         # Đăng ký, đăng nhập — dùng chung cho mọi actor
├── (candidate)/    # Hồ sơ, CV, ứng tuyển, tin đã lưu, nhắn tin
├── (employer)/     # Hồ sơ doanh nghiệp, quản lý tin, xét duyệt hồ sơ ứng tuyển, tìm ứng viên, nhắn tin
├── (admin)/        # Quản lý người dùng, nhà tuyển dụng, ngành nghề
├── layout.tsx
├── page.tsx
└── provider.tsx    # React Query / global providers
```

Role guard thực hiện qua `middleware.ts` ở root `apps/web/src/`, kiểm tra JWT/role trước khi cho vào route group tương ứng (sẽ tạo khi implement Phase 2).

`apps/web/CLAUDE.md` và `apps/web/AGENTS.md` do `next dev` tự sinh lại (breaking-change notice của Next 16) — giữ trong `.gitignore`, không commit, dù chính file đó khuyến nghị nên commit; đây là lựa chọn có chủ đích để tránh nhiễu diff mỗi lần chạy dev.

## 4. Backend structure (`apps/server`)

```text
apps/server/src/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── students/
│   ├── employers/
│   ├── companies/
│   ├── job-posts/
│   ├── applications/
│   ├── cv/
│   ├── saved-jobs/
│   ├── messaging/        # Conversation + Message (gộp, không tách)
│   ├── notifications/
│   ├── catalog/          # Major, University, Industry, City, CompanyType (gộp)
│   └── ai/                # ports/ + adapters/ — boundary only cho tới Phase 10
├── socket/                # Socket.IO gateway, chạy chung process Express
├── infrastructure/        # Kết nối DB (Prisma/Neon), Redis, Cloudinary, Resend, email
├── shared/                # Utilities, middleware (auth guard, validation, rate-limit), error types
└── main.ts                # Entry point, awilix composition root
```

## 5. Module organization

Mỗi module domain là một thư mục độc lập trong `modules/`, tự chứa route/controller/service/repository của module đó, đăng ký dependency qua `awilix` tại `main.ts`. Quy tắc gộp/tách đã quyết định:

- **`messaging`** gộp `Conversation` + `Message` — luôn được truy cập cùng nhau, tách ra không có giá trị cô lập.
- **`catalog`** gộp Major/University/Industry/City/CompanyType — dữ liệu danh mục nhỏ, admin-managed, CRUD gần giống nhau; tách riêng từng module là over-fragmentation cho quy mô khoá luận.
- **`companies`** và **`employers`** giữ tách biệt — vòng đời khác nhau: `Company.verify()/unverify()` là quy trình do Admin gate độc lập với từng Employer user, và một Company có thể có nhiều Employer (`isCompanyAdmin`).
- **`auth`** và **`users`** giữ tách biệt về tầng service dù cùng thao tác trên bảng `User` — `auth` lo xác thực/token, `users` lo hồ sơ/quản trị tài khoản.
- **Không có module `admin` riêng** — quyền admin là các endpoint được gate bằng Role trên module có sẵn (`users`, `companies`, `catalog`), vì không có entity `Admin` riêng trong domain model.

## 6. Shared code strategy

- `packages/shared-types` chứa type dùng chung server + web (request/response payload, entity shape cơ bản, Socket.IO event payload).
- **Hiện trạng cần lưu ý:** nội dung file `packages/shared-types/src/index.ts` hiện tại là leftover 100% từ một dự án khác (chat app "Zync") — sẽ được thay thế hoàn toàn bằng type domain tuyển dụng ở Phase 1 (Core Architecture & Data Layer), không sửa ở giai đoạn tài liệu hoá này.
- Không duplicate type giữa `apps/server` và `apps/web` — mọi type dùng ở cả hai phía phải đến từ `packages/shared-types`.

## 7. Documentation structure

```text
docs/
├── 01-project/
│   ├── PROJECT_OVERVIEW.md
│   └── PROJECT_PHASES.md
├── 02-architecture/
│   ├── PROJECT_STRUCTURE.md          # File này
│   └── INITIAL_ARCHITECTURE_PLAN.md
└── designs/
    ├── class-diagram-v2.jpg          # Class Diagram tham khảo (bản tạm thời)
    └── use-case-diagram-v3.png       # Use Case Diagram tham khảo (bản tạm thời)
```

## 8. Infrastructure structure (`infra/`)

```text
infra/
├── docker-compose.yaml   # Nginx, Redis, và các service hỗ trợ dev khác nếu cần
└── nginx/
    └── nginx.conf         # Reverse proxy config: route /api/* -> apps/server, còn lại -> apps/web
```

`infra/nginx/` sẽ được tạo khi implement Phase 0 (hiện tại `docker-compose.yaml` đang trống — chỉ ghi nhận trong tài liệu này, không tạo file cấu hình thật ở lần chạy tài liệu hoá này).

## 9. Testing structure

```text
apps/server/tests/
├── unit/          # Test theo module (service/logic thuần)
├── integration/   # Test API + DB thật/test container
└── load/          # Script load test cơ bản (Phase 12)
```

Frontend testing structure sẽ được bổ sung khi Phase 12 tới gần (chưa quyết định framework — cân nhắc Playwright/RTL tuỳ nhu cầu thực tế lúc đó).

## 10. Thư mục được commit / không commit

| Thư mục/file | Commit? | Ghi chú |
|---|---|---|
| `apps/`, `packages/`, `infra/`, `docs/` | Có | Source of truth |
| `CLAUDE.md` (root) | Có | Vừa sửa `.gitignore` để bỏ chặn |
| `apps/web/CLAUDE.md`, `apps/web/AGENTS.md` | Không | Next.js tự sinh lại mỗi `next dev` |
| `.claude-workspace/` | Không | Workspace tạm của AI |
| `node_modules/`, `dist/`, `build/`, `.next/` | Không | Build artifact/dependency |
| `.env`, `.env.*.local` | Không | Secrets — chỉ commit `.env.example` |
| `agents/`, `codex/`, `claude/`, `gemini/`, `.cursor/`, `docs/todo` | Không | Ghi chú riêng theo từng AI tool, không phải tài liệu chính thức |
