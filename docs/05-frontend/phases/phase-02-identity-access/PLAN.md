# Phase 2 (Frontend) — Identity & Access — Kế hoạch triển khai

Tham chiếu: `docs/05-frontend/FRONTEND_PHASES.md` (Phase 2), `docs/02-architecture/PROJECT_STRUCTURE.md` §3, `docs/02-architecture/ARCHITECTURE_DECISIONS.md` (AD-1 URL structure, AD-2 token storage), `docs/phases/phase-02-identity-access/PLAN.md` (backend — API contract), `packages/shared-types/src/index.ts` (type request/response auth). Tài liệu này chỉ ghi phần đặc thù Phase 2 Frontend, không lặp lại nội dung đã có ở các file trên.

---

## Phần 1 — Công nghệ / package / kiến trúc frontend sử dụng

**Không thêm dependency mới.** Dùng những gì đã có sẵn trong `apps/web/package.json`:

- `zustand` (đã cài, chưa dùng) — client auth store (`user`, `accessToken`, `refreshToken`), dùng middleware `persist` của zustand để lưu vào `localStorage` qua `lib/auth-storage.ts` (xem AD-2).
- `@tanstack/react-query` (đã cài, đã setup ở `provider.tsx`) — server state cho `GET /users/me` (hydrate lại `user` khi load trang/refresh).
- Form đăng ký/đăng nhập/OTP: controlled input thuần + validate tay bằng vài hàm nhỏ (email regex, độ dài password, 6 số OTP). Không thêm `react-hook-form`/`zod` ở `apps/web` — số field mỗi form ít (tối đa 4), thêm thư viện validate ở giai đoạn này là over-engineering so với `CLAUDE.md` ("Không thêm dependency không cần thiết").

Pattern áp dụng:
- `page.tsx`/`layout.tsx` giữ Server Component mặc định của Next.js App Router khi không cần state/event (phần tĩnh của 3 homepage, ví dụ hero/footer).
- Phần có state/event (form, nội dung đổi theo session, gọi API) là Client Component (`"use client"`), theo đúng pattern đã dùng ở `apps/web/src/app/provider.tsx`.
- Không dùng Server Actions ở phase này — gọi API qua `fetch` client-side từ `lib/api-client.ts`, giữ nhất quán với việc token nằm ở client (zustand), không có session phía Next.js server.

---

## Phần 2 — Kiến trúc & liên kết

### Routing & layout theo actor

Cấu trúc thư mục đầy đủ đã chốt ở `docs/02-architecture/PROJECT_STRUCTURE.md` §3. Bảng route ↔ actor ↔ guard cho riêng phase này:

| Route | Actor | Cần đăng nhập? | Guard (`middleware.ts`) |
|---|---|---|---|
| `/` | Candidate (+ guest) | Không (nội dung đổi nếu có session hợp lệ) | Không chặn — chỉ đọc token nếu có để đổi nội dung |
| `/(auth)/register`, `/(auth)/login` | Candidate/Employer (Admin dùng chung `/login`... **không** — xem ghi chú dưới) | Không | Không chặn |
| `/employer` | Employer (+ guest) | Không | Không chặn |
| `/employer/(portal)/*` | Employer | Có | `role !== "EMPLOYER"` → redirect `/employer` |
| `/admin` | Admin | Không | Không chặn |
| `/admin/(console)/*` | Admin | Có | `role !== "ADMIN"` → redirect `/admin` |
| `(candidate)/*` (`/profile`, `/cv`, `/applications`, `/saved-jobs`, `/messages`) | Candidate | Có | `role !== "CANDIDATE"` → redirect `/` |

**Ghi chú đăng nhập Admin:** theo `PROJECT_STRUCTURE.md` bản gốc, `(auth)/login` dùng chung cho cả 3 actor. Vì `/admin` là trang bí mật không có entry point từ nơi khác, `/admin/page.tsx` **tự chứa form đăng nhập riêng** (không redirect sang `(auth)/login`) — chỉ email/password, không có nút Google, không có link "Đăng ký" (khớp yêu cầu "Admin thì chỉ có đăng nhập"). `(auth)/login` dùng chung cho Candidate/Employer, có toggle/param xác định role đang đăng nhập để biết redirect đi đâu sau khi thành công (xem mục Redirect bên dưới).

### Component tree & tái sử dụng

- `lib/api-client.ts` — fetch wrapper: base URL từ `NEXT_PUBLIC_API_URL`, tự đính `Authorization: Bearer <accessToken>` từ auth store, bắt lỗi 401 → gọi `POST /auth/refresh` một lần → retry request gốc → nếu vẫn 401 thì `clear()` store + redirect về homepage tương ứng.
- `stores/auth-store.ts` — zustand store, export hook `useAuthStore` + selector tiện dụng (`useCurrentUser`, `useIsAuthenticated`).
- `components/auth/LoginForm.tsx`, `RegisterForm.tsx` — dùng chung giữa Candidate và Employer (props `role: "CANDIDATE" | "EMPLOYER"` quyết định label, có hiện nút Google hay không, endpoint role gửi kèm). Đặt trong `components/auth/` (dùng chung, không thuộc riêng route nào).
- `components/auth/OtpForm.tsx` — bước 2 sau `register`, dùng chung Candidate/Employer.
- 3 trang homepage (`/`, `/employer`, `/admin`) **không** share component "hero"/layout tổng — mỗi trang có bố cục riêng theo đúng yêu cầu tách biệt UX. Chỉ dùng chung nguyên liệu ở mức thấp nhất có thể tái dùng thật (component `Button`/nút, không phải cả section) — vì `apps/web` hiện chưa cài đặt bộ component nào từ `docs/template_ui` (thư mục đó là tài liệu thiết kế tham khảo, không phải package build sẵn để import).

### State management & data fetching

- **Client state (zustand + persist → `localStorage`):** `user: UserProfile | null`, `accessToken: string | null`, `refreshToken: string | null`. Actions: `setSession(tokens, user)`, `clear()`.
- **Server state (React Query):** `useQuery(["me"], fetchMe)` gọi `GET /users/me` — chạy khi có `accessToken` trong store (dùng để xác nhận token còn hợp lệ + hydrate `user` sau khi load lại trang, vì `persist` chỉ khôi phục token chứ không tự verify).
- **Luồng đăng ký:** `RegisterForm` → `POST /auth/register` (`RegisterRequest`) → chuyển sang `OtpForm` (không set session — backend chưa trả token ở bước này) → `POST /auth/verify-otp` (`VerifyOtpRequest`) → nhận `AuthTokensResponse` → `setSession` → redirect theo role.
- **Luồng đăng nhập:** `LoginForm` → `POST /auth/login` (`LoginRequest`) → nếu lỗi "cần xác thực OTP" (status `PENDING_VERIFICATION`, xem backend `auth.service.ts`) → chuyển sang `OtpForm` (dùng lại luồng resend/verify) → thành công → `AuthTokensResponse` → `setSession` → redirect theo role.
- **Google:** nút "Đăng nhập với Google" trong `LoginForm`/`RegisterForm` (chỉ Candidate/Employer) → lấy `idToken` từ Google Identity Services → `POST /auth/google` (`GoogleAuthRequest { idToken, role }`) → `AuthTokensResponse` → `setSession` → redirect theo role.
- **Logout:** action gọi `POST /auth/logout` (kèm `refreshToken`) rồi `clear()` store bất kể API thành công hay không (ưu tiên clear phía client ngay).

### Redirect theo role (khớp yêu cầu nghiệp vụ)

| Sự kiện | Redirect tới |
|---|---|
| Candidate đăng ký (sau verify OTP) / đăng nhập / Google thành công | `/` |
| Employer đăng ký (sau verify OTP) / đăng nhập / Google thành công | `/employer` (portal landing — tạm thời chính là `/employer` vì `(portal)` con chưa có nội dung nghiệp vụ thật tới Phase 4/5; khi có, đổi đích redirect thành `/employer/dashboard` mà không cần sửa lại luồng auth) |
| Admin đăng nhập thành công (chỉ qua `/admin`) | `/admin` console placeholder (tương tự — đổi thành `/admin/dashboard` khi console có nội dung thật) |

### UI states & design system

- **Loading:** nút submit disable + đổi label tạm thời (vd. "Đang đăng nhập…"), không dùng skeleton.
- **Error:** một câu ngắn dưới field liên quan hoặc dưới form nếu lỗi chung (vd. sai email/password) — theo giọng văn đã định nghĩa ở `docs/template_ui/readme.md` (không dấu chấm than, không đổ lỗi, nêu cách sửa nếu có).
- **OTP:** ô nhập 6 số, có nút "Gửi lại mã" (gọi `resend-otp`, tự disable theo cooldown 60s để khớp rate-limit backend).
- Không tạo mockup HTML/JSX mới trong `docs/template_ui` ở phase này (theo quyết định của chủ dự án) — 3 homepage và các form triển khai trực tiếp bằng Tailwind (đã có sẵn trong `apps/web`) dựa trên đặc tả bằng chữ ở trên, không có file thiết kế trực quan đi kèm.

---

## Phần 3 — Các bước thực hiện

1. **`middleware.ts`** (root `apps/web/src/`) + tạo khung thư mục route rỗng theo bảng ở Phần 2 (`employer/(portal)/`, `admin/(console)/`, `(candidate)/`, `(auth)/login`, `(auth)/register`) — chỉ khung, chưa có nội dung nghiệp vụ thật cho phần `(portal)`/`(console)` (để trống/placeholder, nội dung thật tới Phase 4/5 và ngoài phạm vi roadmap admin hiện tại).
2. **`lib/api-client.ts`** — fetch wrapper + xử lý refresh-on-401 như mô tả Phần 2.
3. **`stores/auth-store.ts`** — zustand store + `persist` vào `localStorage`.
4. **`components/auth/LoginForm.tsx`, `RegisterForm.tsx`, `OtpForm.tsx`** — dùng chung Candidate/Employer.
5. **`(auth)/login/page.tsx`, `(auth)/register/page.tsx`** — ráp form, đọc/set redirect theo role sau khi thành công.
6. **`/admin/page.tsx`** — form đăng nhập riêng (email/password only), gọi thẳng `POST /auth/login`, chặn nếu response `role !== "ADMIN"` (hiển thị lỗi chung, không gợi ý đây là sai role để tránh lộ thông tin route ẩn).
7. **`/page.tsx` (Candidate homepage)** — bố cục ưu tiên Job Seeker; phần trên cùng đọc `useCurrentUser()` để quyết định hiển thị hero marketing (guest) hay khối cá nhân hoá (đã đăng nhập).
8. **`/employer/page.tsx` (Employer homepage)** — bố cục riêng ưu tiên Recruiter, thiết kế độc lập với bước 7 (không tái dùng section).
9. **Wiring redirect** sau mỗi luồng thành công (register+OTP, login, Google) theo bảng redirect ở Phần 2.
10. **Kiểm thử thủ công theo Definition of Done** (`docs/05-frontend/FRONTEND_PHASES.md` Phase 2): đăng ký/đăng nhập Candidate + Employer (email/password và Google) → đúng redirect; đăng nhập Admin qua `/admin` → vào console placeholder; truy cập `/employer/(portal)/*` hoặc `/admin/(console)/*` khi chưa đăng nhập đúng role → bị redirect đúng nơi.
11. **Cập nhật tài liệu sau khi hoàn thành implement:** đổi trạng thái Phase 2 frontend trong `docs/01-project/PROJECT_STATUS.md` (thêm dòng riêng hoặc gộp ghi chú vào dòng Phase 2 hiện có), ghi chú deviation nếu có so với kế hoạch này.

---

## Phần 4 — Ghi chú của chủ dự án

Phạm vi `/` và `/employer` đã mở rộng thành landing đầy đủ (không còn tối giản như mô tả gốc ở Phần 2) — xem `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-3 để biết chi tiết & lý do. Phần hạ tầng auth (middleware, api-client, auth-store, form) ở tài liệu này không đổi.
