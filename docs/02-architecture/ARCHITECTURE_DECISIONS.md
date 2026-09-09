# Architecture Decisions

Log các quyết định kiến trúc phát sinh trong quá trình triển khai (không phải quyết định ban đầu đã có sẵn trong `INITIAL_ARCHITECTURE_PLAN.md`). Mỗi mục ghi: quyết định, lý do, phase liên quan. Không sửa/xoá mục cũ khi quyết định thay đổi — thêm mục mới ghi rõ "thay thế mục X" để giữ lịch sử.

---

## AD-1 — Cấu trúc URL theo actor (`apps/web`)

**Ngày:** 2026-09-02 · **Phase liên quan:** 05-frontend Phase 2 (Identity & Access)

**Quyết định:** `docs/02-architecture/PROJECT_STRUCTURE.md` §3 (bản gốc) mô tả `(public)/(candidate)/(employer)/(admin)` như route *group* thuần của Next.js App Router — nhóm này không tạo prefix URL riêng. Quyết định này thay bằng cấu trúc URL thật theo actor:

- `/` — Candidate homepage. Dùng chung cho guest (marketing, chưa đăng nhập) và Candidate đã đăng nhập; nội dung đổi theo trạng thái đăng nhập trên **cùng một route**, không tách route riêng cho "trang chủ đã đăng nhập".
- `/employer/*` — toàn bộ khu vực Employer, dùng segment thư mục thật `employer/` (không phải route group). `/employer` là homepage công khai riêng, ưu tiên hành vi Recruiter — **không phải** bản đổi màu/đổi nội dung của Candidate homepage. `/employer/...` (route group con `(portal)`) là khu vực đã đăng nhập (dashboard, quản lý tin, ứng viên, công ty, nhắn tin).
- `/admin/*` — segment thư mục thật `admin/`. `/admin` chỉ có form đăng nhập, không có bất kỳ link/nút kích hoạt nào trỏ tới từ `/` hay `/employer`. `/admin/...` (route group con `(console)`) là khu vực quản trị đã đăng nhập.
- `(candidate)` (route group, không thêm prefix) chứa các trang đã đăng nhập của Candidate không thuộc `/` — `/profile`, `/cv`, `/applications`, `/saved-jobs`, `/messages`.

**Lý do:** yêu cầu nghiệp vụ (chủ dự án) là 3 homepage tách biệt hoàn toàn theo actor, URL phải phản ánh đúng khu vực đang truy cập (đặc biệt để `/employer` và `/admin` không bị nhầm là biến thể của trang chủ Candidate), và Employer Portal cần nằm chung namespace `/employer/...` để rõ ràng đây là "khu vực Employer" kể cả trước/sau khi đăng nhập.

**Ảnh hưởng:** `docs/02-architecture/PROJECT_STRUCTURE.md` §3 cập nhật theo cấu trúc này (xem file đó). `middleware.ts` (root `apps/web/src/`) guard theo prefix thay vì theo route group đơn thuần: `/employer/(portal)/*` yêu cầu `role=EMPLOYER`, `/admin/(console)/*` yêu cầu `role=ADMIN`, `(candidate)/*` yêu cầu `role=CANDIDATE`.

---

## AD-2 — Lưu JWT phía client (`apps/web`)

**Ngày:** 2026-09-02 · **Phase liên quan:** 05-frontend Phase 2 (Identity & Access)

**Quyết định:** Backend Phase 2 trả `accessToken`/`refreshToken` qua JSON body (`AuthTokensResponse`), không dùng cookie (xem `docs/phases/phase-02-identity-access/PLAN.md`). Frontend lưu cả hai token qua một module `lib/auth-storage.ts` bọc `localStorage`, quản lý state qua `zustand` store (`user`, `accessToken`, `refreshToken`, actions `setSession`/`clear`, dùng middleware `persist` của zustand).

**Lý do:** backend không có hạ tầng set cookie ở phase này, thay đổi sang cookie (đặc biệt httpOnly) sẽ động tới cả `auth.controller.ts` lẫn CORS/Nginx — vượt phạm vi Phase 2 frontend. `localStorage` qua một module bọc riêng (không rải `localStorage.getItem` khắp nơi) là lựa chọn đơn giản nhất cho MVP, đổi được sau mà không sửa nhiều nơi gọi.

**Rủi ro chấp nhận ở mức MVP:** token trong `localStorage` đọc được bởi bất kỳ script nào chạy trên trang (rủi ro XSS) — không dùng cho production thật nếu chưa hardening.

**Kế hoạch rà soát lại:** Phase 11 (Integration & Security Hardening, cả backend lẫn frontend) sẽ đánh giá lại lựa chọn này — cân nhắc chuyển access token sang in-memory (refresh khi load lại trang qua `/auth/refresh`) hoặc đổi backend sang httpOnly cookie cho refresh token. Không mở rộng phạm vi Phase 2 để làm việc này ngay.

---

## AD-3 — Mở rộng phạm vi 2 trang chủ công khai + thêm `lucide-react` (`apps/web`)

**Ngày:** 2026-09-02 · **Phase liên quan:** 05-frontend Phase 2 (Identity & Access)

**Quyết định:** `docs/05-frontend/phases/phase-02-identity-access/PLAN.md` (bản gốc) chủ trương xây `/` và `/employer` tối giản, không tham chiếu `docs/template_ui`. Quyết định này mở rộng phạm vi cho riêng 2 route đó (không đổi phần hạ tầng auth — middleware/api-client/auth-store/form vẫn giữ nguyên plan gốc):

- `/` (Candidate) và `/employer` được xây thành landing đầy đủ (nhiều section: Hero, Roles, Lifecycle, Featured, EmployerCta/Value props, Stats, Footer), tham khảo bố cục/nội dung có sẵn ở `docs/template_ui/ui_kits/marketing_site` và cấu trúc phổ biến của topcv.vn/itviec.com (Candidate) và tuyendung.topcv.vn (Employer). Viết lại bằng Tailwind trong `apps/web` — không import trực tiếp kit (kit phụ thuộc object `window.InternHubDesignSystem...` không tồn tại trong app Next.js).
- Section "Tin mới trong tuần" (Featured jobs) trên `/` dùng **dữ liệu tĩnh mẫu** (`lib/sample-jobs.ts`) vì Job Post API chưa có tới Phase 5 — layout đã sẵn sàng nối API thật, không cần sửa lại khi Phase 5 xong.
- Khi Candidate đã đăng nhập, `/` chỉ đổi phần navbar (ẩn Đăng nhập/Đăng ký, hiện tên user + Đăng xuất), phần nội dung chính giữ nguyên — chưa có API hồ sơ/job cá nhân hoá thật tới Phase 3+.
- Thêm dependency mới `lucide-react` vào `apps/web` — bộ icon mà `docs/template_ui` đã quy định (contract `Icon` component dùng tên icon Lucide). Đây là ngoại lệ so với ghi chú "không thêm dependency" của plan gốc; thư viện này nhẹ và sẽ dùng lại xuyên suốt các phase UI sau (JobCard, StatusPill, nav...).

**Lý do:** yêu cầu chủ dự án — muốn 2 trang chủ công khai đạt độ hoàn thiện gần với landing page thật của các nền tảng tuyển dụng tham khảo, thay vì khung tối giản; chấp nhận thêm `lucide-react` vì bộ icon cần dùng lại nhiều lần ở các phase sau.

**Ảnh hưởng:** không đổi AD-1/AD-2 hay phần hạ tầng auth của `docs/05-frontend/phases/phase-02-identity-access/PLAN.md`. `apps/web/src/app/globals.css` được bổ sung token màu thương hiệu (Pine/Indigo/Plum/Marigold...) lấy từ `docs/template_ui/readme.md` + `styles.css` để dựng landing đúng bảng màu tham chiếu.

---

## AD-4 — Cô lập auth state theo actor area (`apps/web`), thay một phần AD-1/AD-2

**Ngày:** 2026-09-08 · **Phase liên quan:** 05-frontend Phase 2 (Identity & Access)

**Quyết định:** AD-1 dùng 1 cookie `sip_role` (chứa giá trị role) và AD-2 dùng 1 Zustand store/localStorage key `sip-auth` cho cả 3 actor. Trên thực tế điều này khiến state bị dùng chung xuyên khu vực: đăng nhập Candidate xong qua `/employer` (trang public, không bị `proxy.ts` chặn), header Employer vẫn đọc được `user` từ đúng store toàn cục và hiện như đang đăng nhập ở đó.

Quyết định này giữ nguyên mô hình backend "một tài khoản một role" (không thêm `user_roles`/`auth_sessions`, không đổi endpoint `/auth/*`), chỉ tách **state phía client** thành 3 ngữ cảnh độc lập theo `AuthArea = "candidate" | "employer" | "admin"` (`apps/web/src/lib/auth-area.ts`):

- 3 Zustand store/localStorage key riêng thay cho 1 (`sip-auth-candidate`/`sip-auth-employer`/`sip-auth-admin`, factory `createAuthStore(area)` trong `stores/auth-store.ts`).
- 3 cookie đánh dấu phiên theo area thay cho 1 `sip_role` (`sip_session_candidate`/`sip_session_employer`/`sip_session_admin`, chỉ đánh dấu có phiên — area đã ngụ ý role nên không cần chứa giá trị role trong cookie nữa).
- `apiFetch` tách thành `publicFetch` (endpoint anonymous: login/register/verify-otp/resend-otp/google) và `apiFetch(area, path, init)` (endpoint cần token, đọc/ghi đúng store theo `area`).
- `completeAuth` tự suy `area` từ role thật trả về bởi `/users/me` (không phải từ trang đăng nhập đang đứng), nên một tài khoản Candidate lỡ đăng nhập trên `/login?role=EMPLOYER` vẫn được lưu đúng vào store Candidate.

**Lý do:** bug cụ thể nêu trên (session Candidate hiển thị nhầm sang `/employer`) là hệ quả trực tiếp của việc dùng chung 1 store/cookie cho 3 khu vực có UI/quyền truy cập tách biệt theo AD-1. Cân nhắc phương án đầy đủ hơn (bảng `user_roles` + `auth_sessions`, per-role login/logout endpoint ở backend — xem `docs/designs/internhub-role-scoped-authentication.md`) nhưng bị loại vì tiền đề "một identity nhiều role" không khớp schema hiện tại (`User.role` là 1 field enum) và không cần thiết cho vấn đề thực tế đang gặp.

**Ảnh hưởng:** `AD-1`/`AD-2` không bị xoá/sửa (giữ lịch sử theo quy ước đầu file) nhưng chi tiết cookie/localStorage key ở đó coi như lỗi thời — tham chiếu AD-4 này. Danh sách file bị ảnh hưởng: `lib/auth-area.ts` (mới), `lib/auth-storage.ts`, `stores/auth-store.ts`, `lib/api-client.ts`, `lib/auth.ts`, `components/auth/{LoginForm,RegisterForm,OtpForm}.tsx`, `components/marketing/{CandidateHomeHeader,EmployerHomeHeader}.tsx`, `app/admin/page.tsx`, `components/auth/SessionSync.tsx`, `app/provider.tsx`, `proxy.ts`. Backend (`apps/server`) không đổi.

---

## AD-5 — Xác thực doanh nghiệp khi Employer hoàn tất thủ tục (Phase 4)

**Ngày:** 2026-09-08 · **Phase liên quan:** 06-backend/05-frontend Phase 4 (Employer & Company)

**Quyết định:** Sau khi đăng ký/đăng nhập, một tài khoản Employer chưa có `Employer` record (chưa liên kết công ty) bị điều hướng bắt buộc tới `/employer/hoan-tat-thu-tuc` để chọn (a) đăng ký công ty mới hoặc (b) liên kết công ty đã có qua mã mời 6 số (TTL 2 phút, sinh bởi Redis `CompanyInviteCodeStore`, một lần dùng). Không cần migrate `Employer.companyId` sang nullable: một `Employer` record chỉ được tạo tại thời điểm công ty được xác định (tạo mới hoặc join), nên "chưa có Employer" chính là tín hiệu "chưa hoàn tất thủ tục" — khớp với hành vi sẵn có của `AuthService.register` (chỉ tạo `User`, không tạo `Employer`).

**Luồng xác thực khi đăng ký công ty mới** (`EmployersService.createOrResubmitCompany`, `CompanyVerificationService`):
1. Đuôi email đăng ký thuộc `COMMON_EMAIL_DOMAINS` (env, mặc định gmail/yahoo/outlook/hotmail/icloud/live/aol/protonmail) → bỏ qua tra cứu, luôn cần Admin xác thực thủ công (`NEEDS_MANUAL_REVIEW`, `reason: COMMON_EMAIL_DOMAIN`).
2. Ngược lại: kiểm tra domain có MX record (`node:dns`) → không có → `BLOCKED` (`NO_MAIL_SERVER`). Có MX → gọi VietQR (`GET {VIETQR_API_URL}/{taxCode}`) → mã `51`/`52`/lỗi mạng → `BLOCKED` (`TAX_CODE_INVALID`/`TAX_CODE_NOT_FOUND`/`TAX_LOOKUP_FAILED`). Thành công (`code: "00"`) → so khớp domain với `data.shortName` (`domainMatchesShortName`, xem thuật toán bên dưới) → khớp thì `AUTO_VERIFIED`, không khớp thì `NEEDS_MANUAL_REVIEW` (`DOMAIN_MISMATCH`).
3. `BLOCKED` được trả về frontend như lỗi kèm lựa chọn "vẫn gửi yêu cầu xác thực thủ công" (`forceManualReview: true` ở lần submit kế tiếp) — không tự động chuyển sang manual review để tránh nộp nhầm khi email/mã số thuế thực sự sai.
4. Mọi trường hợp không phải `AUTO_VERIFIED` đều **bắt buộc** upload giấy phép kinh doanh (qua `MediaStorage`/Cloudinary) trước khi ghi `Company(verificationStatus: PENDING, verificationMethod: MANUAL_REVIEW)` — quyết định thống nhất một luồng review duy nhất thay vì tách riêng theo từng lý do.
5. `runVerificationCheck` luôn chạy lại phía server ở endpoint tạo công ty thật (`POST /employers/company`), không tin outcome do client tự gửi — `POST /employers/company/verification-check` chỉ là preview để frontend quyết định UI (có cần hiện ô upload hay không) trước khi submit multipart cuối cùng.

**Thuật toán so khớp domain ↔ shortName** (`domainMatchesShortName`): bóc các hậu tố tổ chức phổ biến (`edu.vn, com.vn, org.vn, gov.vn, net.vn, ac.vn, vn, com, org, net, edu, gov`) khỏi domain, sau đó thử **từng nhãn còn lại** (không chỉ cấp 1/2 theo vị trí — vd. cả `student` lẫn `iuh` từ `student.iuh.edu.vn`) làm ứng viên, chuẩn hoá (bỏ dấu, chỉ giữ chữ/số) rồi so khớp chuỗi con hai chiều với shortName đã chuẩn hoá. Đây là heuristic best-effort — false negative rơi về xác thực thủ công (an toàn), ưu tiên tránh false positive.

**Model bổ sung** (`Company`): `verificationStatus: PENDING|VERIFIED|REJECTED` (mới), `verificationMethod: AUTO_TAX_MATCH|MANUAL_REVIEW`, `businessLicenseUrl`, `verificationNote`, `rejectedAt` — giữ nguyên `isVerified`/`verifiedAt` cũ (đồng bộ bởi service layer khi `verificationStatus` đổi) để không phá các nơi đã đọc `isVerified` theo tài liệu Phase 4 gốc. `Admin.reject()` cho phép nộp lại (`REJECTED → PENDING` qua chính endpoint tạo công ty, phát hiện qua `Employer.isCompanyAdmin && company.verificationStatus === "REJECTED"`), không phải trạng thái chung cuộc.

**Truy cập bị hạn chế khi chưa `VERIFIED`:** `apps/web/src/proxy.ts` đọc thêm cookie `sip_employer_stage` (`onboarding|pending|active`, ghi bởi `EmployerStageSync`/`lib/auth.ts` sau mỗi lần gọi `GET /employers/me`) để chặn `/employer/(portal)/*`: `onboarding` → luôn về `hoan-tat-thu-tuc`; `pending` → chỉ cho vào `/employer/profile` (+ homepage công khai `/employer`, không bị proxy chặn); `active` → truy cập bình thường. Đây là gate **UX phía frontend**, không phải security boundary — chưa có endpoint nghiệp vụ nào khác (job posts bắt đầu Phase 6) cần gate tương tự ở backend nên chưa thêm middleware `requireVerifiedCompany` (tránh code chưa dùng tới).

**Quy ước upload multipart mới** (chưa từng có trước Phase 4): route `POST /employers/company` dùng `multer` (memory storage, field `businessLicense`, tối đa 5MB, chỉ nhận jpg/png/pdf) — mount cục bộ trên đúng route đó, không đổi convention `express.json()`-only toàn cục. Business license lưu qua `MediaStorage` (`shared/ports/MediaStorage.ts`) → `CloudinaryMediaStorage`, đúng boundary đã định trong `INITIAL_ARCHITECTURE_PLAN.md` §7. Phase 6 (CV upload) sẽ tái dùng nguyên convention này.

**Cờ dev-bypass:** `DEV_SKIP_COMPANY_MANUAL_VERIFICATION` (env, mặc định `false`) — khi `true`, mọi công ty cần manual review được tự động `VERIFIED` ngay (kèm `logger.warn` mỗi lần áp dụng). `env.ts` chặn cứng server khởi động nếu `NODE_ENV=production` và cờ này `true`. **Lưu ý kỹ thuật:** cờ này parse thủ công (`z.preprocess` so khớp đúng chuỗi `"true"`) thay vì `z.coerce.boolean()` — `z.coerce.boolean()` gọi `Boolean(input)` của JS nên chuỗi `"false"` (non-empty) vẫn coerce ra `true`, nguy hiểm cho đúng loại cờ an toàn này (phát hiện khi test thủ công: xem §12c "Bug tìm thấy khi test" bên dưới).

**Module `catalog` mới** (tối thiểu): `GET /industries`, `/company-types`, `/cities` — public, không auth, cần cho dropdown ở form công ty. Chỉ 3 catalog này (không đụng `University`/`Major`, thuộc phạm vi Phase 3 — module khác đảm nhiệm) để tránh đụng độ với công việc song song.

**Dependency mới:** `apps/server`: `cloudinary`, `multer` (+`@types/multer`) — Cloudinary đã có trong tech stack/env từ trước nhưng chưa dùng; `multer` là middleware multipart chuẩn của Express, chưa có middleware nào tương đương. `apps/web`: `react-hook-form`, `zod`, `@hookform/resolvers` — form hoàn tất thủ tục có 10+ field kèm logic hiển thị có điều kiện (upload giấy phép), vượt ngưỡng "form đơn giản" mà Phase 2 frontend cố tình tránh thêm thư viện; các form auth hiện có (`LoginForm`/`RegisterForm`/`OtpForm`) giữ nguyên pattern `useState` cũ, không đổi theo. **Lưu ý version:** `apps/web` pin `zod@^4` (không phải `^3`) dù `@hookform/resolvers@3.x` — vì gói này bị hoist lên root `node_modules` (chỉ `apps/web` khai báo), khiến type resolution phía trong nó phân giải theo `zod` ở root (vốn đã là v4 do `apps/server`) chứ không phải bản nested trong `apps/web`; pin v4 để cả hai đồng bộ một bản duy nhất thay vì cố ép v3 (gây lỗi kiểu `$ZodTypeInternals` không khớp lúc build).

### Bug phát sinh trong lúc implement Phase 4 (đã sửa cùng đợt, không thuộc phạm vi nghiệp vụ Phase 4 nhưng chặn thẳng đường test)

- **`shared/middleware/validate.ts` không hoạt động với `part: "query"` trên Express 5:** `req.query` là getter-only trên prototype của Express 5 (không có setter) — gán trực tiếp (`req.query = result.data`) ném `TypeError: Cannot set property query...`. Chưa từng lộ ra trước Phase 4 vì không route nào validate query cho tới `GET /companies?status=...&cursor=...`. Sửa bằng `Object.defineProperty(req, "query", { value, writable: true, configurable: true, enumerable: true })` thay vì gán trực tiếp, chỉ áp dụng khi `part === "query"`.

## Phần ghi chú của chủ dự án

*(để trống)*
