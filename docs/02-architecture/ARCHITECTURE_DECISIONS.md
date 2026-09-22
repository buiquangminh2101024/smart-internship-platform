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

**Cập nhật 2026-09-16 — logo/banner công ty:** `POST /employers/company` chuyển sang `multiFileUpload` (`shared/middleware/upload.ts`, `multer().fields()`, tối đa 1 file/field, danh sách MIME riêng từng field): `businessLicense` (jpg/png/pdf), `logo` và `banner` (jpg/png/webp), vẫn 5MB/file. Logo + banner **bắt buộc** khi tạo công ty; khi nộp lại hồ sơ (`REJECTED`) được giữ ảnh cũ nếu công ty đã có — kiểm tra ở `EmployersService`, không ở tầng route. Thêm `PATCH /employers/company/branding` (multipart `logo`/`banner`, gửi 1 hoặc cả 2) để đổi ảnh sau này, **chỉ `isCompanyAdmin`** (check trong service, giống `POST /employers/invite-code`); frontend chỉ hiện ở `/employer/profile` khi công ty `VERIFIED`. Ảnh lưu vào folder Cloudinary `company-logos`/`company-banners`, ghi thẳng vào cột `Company.logoUrl`/`bannerUrl` đã có sẵn (không migration).

**Cờ dev-bypass:** `DEV_SKIP_COMPANY_MANUAL_VERIFICATION` (env, mặc định `false`) — khi `true`, mọi công ty cần manual review được tự động `VERIFIED` ngay (kèm `logger.warn` mỗi lần áp dụng). `env.ts` chặn cứng server khởi động nếu `NODE_ENV=production` và cờ này `true`. **Lưu ý kỹ thuật:** cờ này parse thủ công (`z.preprocess` so khớp đúng chuỗi `"true"`) thay vì `z.coerce.boolean()` — `z.coerce.boolean()` gọi `Boolean(input)` của JS nên chuỗi `"false"` (non-empty) vẫn coerce ra `true`, nguy hiểm cho đúng loại cờ an toàn này (phát hiện khi test thủ công: xem §12c "Bug tìm thấy khi test" bên dưới).

**Module `catalog` mới** (tối thiểu): `GET /industries`, `/company-types`, `/cities` — public, không auth, cần cho dropdown ở form công ty. Chỉ 3 catalog này (không đụng `University`/`Major`, thuộc phạm vi Phase 3 — module khác đảm nhiệm) để tránh đụng độ với công việc song song.

**Dependency mới:** `apps/server`: `cloudinary`, `multer` (+`@types/multer`) — Cloudinary đã có trong tech stack/env từ trước nhưng chưa dùng; `multer` là middleware multipart chuẩn của Express, chưa có middleware nào tương đương. `apps/web`: `react-hook-form`, `zod`, `@hookform/resolvers` — form hoàn tất thủ tục có 10+ field kèm logic hiển thị có điều kiện (upload giấy phép), vượt ngưỡng "form đơn giản" mà Phase 2 frontend cố tình tránh thêm thư viện; các form auth hiện có (`LoginForm`/`RegisterForm`/`OtpForm`) giữ nguyên pattern `useState` cũ, không đổi theo. **Lưu ý version:** `apps/web` pin `zod@^4` (không phải `^3`) dù `@hookform/resolvers@3.x` — vì gói này bị hoist lên root `node_modules` (chỉ `apps/web` khai báo), khiến type resolution phía trong nó phân giải theo `zod` ở root (vốn đã là v4 do `apps/server`) chứ không phải bản nested trong `apps/web`; pin v4 để cả hai đồng bộ một bản duy nhất thay vì cố ép v3 (gây lỗi kiểu `$ZodTypeInternals` không khớp lúc build).

### Bug phát sinh trong lúc implement Phase 4 (đã sửa cùng đợt, không thuộc phạm vi nghiệp vụ Phase 4 nhưng chặn thẳng đường test)

- **`shared/middleware/validate.ts` không hoạt động với `part: "query"` trên Express 5:** `req.query` là getter-only trên prototype của Express 5 (không có setter) — gán trực tiếp (`req.query = result.data`) ném `TypeError: Cannot set property query...`. Chưa từng lộ ra trước Phase 4 vì không route nào validate query cho tới `GET /companies?status=...&cursor=...`. Sửa bằng `Object.defineProperty(req, "query", { value, writable: true, configurable: true, enumerable: true })` thay vì gán trực tiếp, chỉ áp dụng khi `part === "query"`.

## AD-6 — Subscription free trial, node-cron sweep, và Payment Gateway Adapter pattern (Phase 5)

**Ngày:** 2026-09-09 · **Phase liên quan:** 06-backend/05-frontend Phase 5 (Subscription & Payment)

**Quyết định:**

1. **Free trial không cần `CompanySubscription`:** một `Company` vừa được `verify()` (Phase 4, `verificationStatus = VERIFIED`, `verifiedAt` được set) được phép tạo tối đa **2 `JobPost` ở trạng thái `PUBLISHED`** và **10 `JobPost` ở trạng thái `DRAFT`** trong vòng **30 ngày kể từ `Company.verifiedAt`**, không cần mua `CompanySubscription`. Điều kiện: company đó **chưa từng có bất kỳ `CompanySubscription` nào** (kể cả `CANCELLED`/`EXPIRED`) — ngay khi company mua gói đầu tiên (bất kỳ lúc nào, kể cả trước khi hết 30 ngày), trial kết thúc vĩnh viễn, từ đó đi theo nhánh `CompanySubscription` bình thường. Không thêm cột schema mới — tính tại query-time từ `Company.verifiedAt` + đếm `JobPost` theo `companyId`/`status`/`createdAt` trong khoảng đó + kiểm tra công ty chưa từng có `CompanySubscription`, cùng tinh thần "không lưu counter riêng" đã chốt cho quota trả phí (`docs/designs/SUBSCRIPTION_BILLING_DESIGN.md` mục 3.1).
2. **Auto-đóng `JobPost` khi gói hết hạn — tách làm 2 phase:** Phase 5 chỉ chuyển `CompanySubscription.status` từ `ACTIVE` sang `EXPIRED` khi `endDate` đã qua (qua job định kỳ, xem mục 3). Tự động đóng các `JobPost` đang `PUBLISHED` của company đó là **deliverable của Phase 6** (đã cập nhật `PROJECT_PHASES.md`) — bảng `job_posts` tồn tại từ Phase 1 nhưng module nghiệp vụ `job-posts` chỉ được xây ở Phase 6; làm sớm ở Phase 5 buộc module `subscriptions` viết thẳng vào phạm vi của một module chưa tồn tại, vi phạm ranh giới đã định (`PROJECT_STRUCTURE.md` §5). Phase 5 export sẵn `SubscriptionsService.getCompanySubscriptionAccess(companyId)` (trạng thái quota/trial hiện tại) để module `job-posts` (Phase 6) gọi cả khi kiểm tra quyền tạo tin lẫn khi quét công ty vừa hết hạn để đóng tin — tận dụng lại `CompanySubscription.status = EXPIRED` đã có sẵn nhờ sweep Phase 5 thay vì tự phát hiện hết hạn lần nữa.
3. **Cơ chế sweep dùng `node-cron`** (dependency mới cho `apps/server`) thay vì tự viết `setInterval` — quyết định trực tiếp của chủ dự án khi được hỏi (đánh đổi 1 dependency nhỏ lấy cú pháp lịch chạy chuẩn, dễ đọc hơn `setInterval` thô). Job đăng ký ở `apps/server/src/modules/subscriptions/subscription-expiry.job.ts`, khởi động cùng `main.ts` (chạy chung process, giống Socket.IO — đúng nguyên tắc modular monolith, không tách service riêng).
4. **`PaymentGatewayAdapter`** — 1 interface chung (`shared/ports/PaymentGatewayAdapter.ts`) cho VNPay/Momo, 2 adapter implement (`infrastructure/vnpay-gateway-adapter.ts`, `infrastructure/momo-gateway-adapter.ts`), thay vì 2 service riêng không chung interface (cách tổ chức của dự án Java tham khảo `event-ticketing-platform/services/payment` — xem đánh giá ở `docs/designs/SUBSCRIPTION_BILLING_DESIGN.md` mục 6). `PaymentsService` chọn adapter theo `PaymentMethod.processorType` qua awilix (`paymentGatewayAdapters: Record<PaymentProvider, PaymentGatewayAdapter>` đăng ký ở `container.ts`). Hàm ký chữ ký (`hmacSha512Hex`, `hmacSha256Hex`, `buildSortedQueryString`) gom vào 1 module thuần `shared/utils/payment-signing.ts`, dùng chung 2 adapter — tránh trùng lặp code đã thấy ở dự án tham khảo.

**Lý do:**

- Trial: yêu cầu nghiệp vụ chủ dự án — cho phép company trải nghiệm trước khi buộc trả tiền, giới hạn đủ nhỏ để không thay thế nhu cầu mua gói thật.
- Tách auto-đóng JobPost sang Phase 6: giữ đúng ranh giới module theo `PROJECT_STRUCTURE.md` §5.
- `node-cron`: quyết định trực tiếp của chủ dự án khi được hỏi.
- `PaymentGatewayAdapter`: sửa đúng điểm yếu quan sát được ở code tham khảo (không có interface chung → không phải Strategy pattern thật, logic ký chữ ký copy-paste giữa 2 impl, 2 nguồn cấu hình song song không rõ nguồn sự thật).

**Tham khảo kỹ thuật lấy từ `event-ticketing-platform/services/payment`** (đọc trực tiếp source Java, không copy code — chi tiết đầy đủ luồng ký/verify/quirk ở `docs/designs/SUBSCRIPTION_BILLING_DESIGN.md` mục 6):

- VNPay: build URL redirect tự phía server (không gọi API VNPay để "tạo" giao dịch), ký `HMAC-SHA512` trên params sort alphabet, encode US-ASCII (không phải UTF-8), `vnp_Amount` phải nhân 100. IPN là `GET` server-to-server tới `vnp_IpnUrl` **cấu hình sẵn trên trang quản trị sandbox VNPay** (không gửi trong request), phải trả đúng format phản hồi VNPay yêu cầu (xác nhận chính xác tên field lúc implement qua tài liệu chính thức/sandbox tool VNPay).
- Momo: gọi thật `POST` sang endpoint tạo giao dịch của Momo (`https://test-payment.momo.vn/v2/gateway/api/create`), ký `HMAC-SHA256` trên chuỗi field theo thứ tự cố định (không tự sort), **amount gửi nguyên, KHÔNG nhân 100** (khác VNPay — dễ nhầm nếu dùng chung 1 hàm format tiền). IPN là `POST` JSON tới `momo.ipn-url` (phải là URL public — xem mục dev tunnel bên dưới).
- Tuyệt đối không tin trạng thái thanh toán từ query param ở return URL (redirect qua trình duyệt người dùng, có thể bị giả mạo) — chỉ set `Payment.status`/`CompanySubscription.status` trong IPN handler đã verify chữ ký. Return URL chỉ hiển thị UI tạm ("đang xác nhận...") rồi frontend gọi API backend lấy trạng thái thật.
- Idempotency bắt buộc ở cả 2 cổng (cổng có thể gọi lại IPN nhiều lần) — check `Transaction.providerTransactionId` đã tồn tại trước khi update.

**Sandbox credentials tái sử dụng** (test/sandbox, không phải bí mật production — lấy từ `event-ticketing-platform/services/payment/src/main/resources/config/{vnpay,momo}-secrets.properties`, bỏ qua VietQR theo yêu cầu chủ dự án vì Phase 5 không dùng VietQR): tên biến env cụ thể ghi ở `docs/06-backend/phase-05-subscription-payment/PLAN.md` — **không** paste giá trị thật vào tài liệu commit git; copy trực tiếp vào `.env` cục bộ (không track) lúc bắt đầu implement.

**Test IPN cục bộ lúc dev:** dùng **port forwarding của VS Code** (tab "PORTS" trong terminal tích hợp → forward port `4000` → đổi Port Visibility sang "Public" → copy URL dạng `https://<id>-4000.<region>.devtunnels.ms`) làm `MOMO_IPN_URL`, và điền thủ công URL tương tự vào ô IPN URL trên trang quản trị sandbox VNPay (không nằm trong code/env — xem mục kỹ thuật ở PLAN.md). Chính dự án tham khảo cũng dùng cơ chế devtunnels này cho Momo IPN (`payment.momo.ipn-url` mặc định trỏ một URL `*.devtunnels.ms`), xác nhận đây là cách hợp lý cho môi trường dev Windows + VS Code hiện tại. **Lưu ý:** URL forward đổi mỗi lần tạo lại tunnel — cần cập nhật lại `MOMO_IPN_URL` trong `.env` và ô IPN URL trên trang VNPay sandbox mỗi lần khởi động lại tunnel.

**Ảnh hưởng:** `PROJECT_PHASES.md` Phase 5 (deliverables trial + node-cron) và Phase 6 (thêm deliverable auto-đóng JobPost); `docs/designs/SUBSCRIPTION_BILLING_DESIGN.md` (thêm mục Free trial, Payment Gateway Adapter, sweep job); `docs/03-database/DATABASE_DESIGN.md`; `docs/04-api/API_CONVENTIONS.md` (convention response IPN không theo `ApiResponse`); `docs/01-project/PROJECT_STATUS.md` và `docs/05-frontend/FRONTEND_PHASES.md` — **đánh số lại từ Phase 5 trở đi** để khớp với `PROJECT_PHASES.md` (2 file này lệch số vì được viết trước khi Phase Subscription & Payment được chèn chính thức làm Phase 5).

**Bug phát hiện lúc implement (2026-09-09, đã sửa một phần — lỗi gốc VẪN CHƯA GIẢI QUYẾT ĐƯỢC):** `vnp_IpAddr` lấy từ `req.ip` của Express có thể ở dạng IPv4-mapped IPv6 (`::ffff:127.0.0.1`) khi Node HTTP server nghe trên `::` (dual-stack, mặc định khi `app.listen(PORT)` không chỉ định host) — VNPay sandbox từ chối định dạng này. Đã sửa bằng `normalizeClientIp()` trong `subscriptions.controller.ts` (bóc tiền tố `::ffff:` trước khi đưa vào params VNPay) — đây là một bug thật, đáng sửa, nhưng **không phải nguyên nhân gốc** của lỗi trang thanh toán VNPay: sau khi sửa, trang checkout VNPay sandbox vẫn trả lỗi `Error.html?code=71` ("Website chưa được phê duyệt"). Nguyên nhân thật sự nhiều khả năng là tài khoản merchant sandbox `PG3V5QW9` (mượn từ `event-ticketing-platform`) chưa được VNPay phê duyệt cho website/domain của dự án này — nhưng chưa xác nhận được chắc chắn, cần tài khoản sandbox VNPay riêng đăng ký cho đúng dự án này để test lại. Coi đây là vấn đề **còn tồn đọng, chưa đóng**.

**Cờ dev-bypass bổ sung (2026-09-09):** `DEV_SKIP_PAYMENT_GATEWAY` (env, mặc định `false`) — cùng khuôn mẫu `DEV_SKIP_COMPANY_MANUAL_VERIFICATION` (AD-5): khi `true`, `PaymentsService.createCheckout` bỏ qua gọi VNPay/Momo thật, đánh dấu `Payment`/`Transaction` `COMPLETED` và kích hoạt `CompanySubscription` ngay lập tức (redirect thẳng về trang return của app kèm `orderCode`, không cần đổi frontend). Lý do: lỗi VNPay sandbox ở trên chưa giải quyết được, cần cờ tạm để tiếp tục phát triển/test các phần phụ thuộc subscription (Phase 6+) trong lúc chờ xử lý dứt điểm lỗi gateway thật. `env.ts` chặn cứng server khởi động nếu `NODE_ENV=production` và cờ này `true`. **Việc thanh toán VNPay/Momo thật sự vẫn cần được sửa và test lại trước khi lên production** (gỡ bỏ phụ thuộc vào cờ này).

---

## AD-7 — Màu thương hiệu theo actor bằng lớp alias token `brand-*` + scope `[data-role]` (`apps/web`)

**Ngày:** 2026-09-12 · **Phase liên quan:** 05-frontend (app shell Employer/Admin, sau Phase 6)

**Quyết định:** AD-3 đưa 4 bảng màu (Pine = Candidate, Indigo = Employer, Plum = Admin, Marigold = accent) vào `apps/web/src/app/globals.css`, nhưng không quy định **component dùng bảng nào**. Trên thực tế cả UI kit (`components/ui/*`) hardcode `pine-*` làm màu mặc định, nên mỗi lần cần một component đúng màu khu vực thì phải ghi đè tại chỗ — ví dụ `!bg-indigo-600 hover:!bg-indigo-700` trên nút "Đăng tin mới" của sidebar Employer, hoặc ternary `role === "employer" ? ... : ...` trong `SideNav`/`PortalTopbar`. Cách này không mở rộng được cho ~15 component × 3 actor.

Quyết định này **không đổi** 4 bảng màu của AD-3, chỉ thêm một lớp **alias semantic** ở giữa component và bảng màu:

- `globals.css` khai báo thêm trong `@theme`: `--color-brand-{50,100,200,500,600,700,800}` mặc định trỏ tới `pine-*` (Candidate là mặc định của app), và `--color-success-{100,600,700}` cũng trỏ tới `pine-*`.
- Hai khối scope ngoài `@theme`: `[data-role="employer"]` trỏ `--color-brand-*` sang `indigo-*`, `[data-role="admin"]` sang `plum-*`. App shell của mỗi khu vực (`EmployerPortalShell`, `AdminConsoleShell`) đặt `data-role` trên thẻ bọc ngoài cùng; các khu vực khác không đặt gì nên giữ Pine.
- UI kit chỉ dùng `brand-*`/`success-*`, **không** dùng trực tiếp `pine-*`/`indigo-*`/`plum-*` nữa. Ngoại lệ có chủ đích: `RoleBadge.tsx` (nhiệm vụ của nó là phân biệt 3 actor nên phải thấy đủ 3 bảng màu) và các trang marketing công khai `/`, `/employer` (màu cố định theo thiết kế landing, không phải khu vực đã đăng nhập).
- Tách `success-*` ra khỏi `brand-*` là phần bắt buộc, không phải tuỳ chọn: Pine vốn gánh cả vai "màu thương hiệu Candidate" lẫn vai "màu trạng thái thành công" (`Badge` tone `success` cho badge "Đã xác minh", icon `circle-check` của `Toast`, icon `badge-check` của `JobCard`). Nếu gộp chung, badge "Đã xác minh" trong portal Employer sẽ thành màu indigo và mất nghĩa semantic.
- Mục điều hướng đang mở của sidebar dùng **một kiểu duy nhất cho cả 2 actor**: nền `brand-50` + chữ/icon `brand-700`/`brand-600` (nền primary nhạt, chữ primary đậm) — không dùng nền primary đậm + chữ trắng như panel Admin trong ảnh mẫu `Screenshot 2026-09-12 134326.png`. Quyết định của chủ dự án; giữ một kiểu giúp toàn bộ khác biệt giữa 2 khu vực rút về đúng giá trị token, không còn nhánh điều kiện trong component.

**Lý do:** đây là cơ chế đổi màu thuần CSS — không cần prop `role` khoan qua nhiều tầng component, không cần React context, nên component dùng màu **không bị buộc thành client component** và không nhấp nháy màu lúc hydrate. Mọi component lồng bao sâu trong shell đều tự nhận đúng màu.

**Điều kiện kỹ thuật (đã kiểm chứng trên Tailwind 4.3.3 của repo bằng cách compile thử):** khối khai báo phải là `@theme`, **không** được là `@theme inline`. `@theme` sinh ra utility dạng tham chiếu biến (`.bg-brand-500 { background-color: var(--color-brand-500) }`) nên override biến ở tầng dưới mới có tác dụng; `@theme inline` nhúng thẳng giá trị hex vào utility và sẽ vô hiệu hoá toàn bộ cơ chế này. Tailwind cũng giữ lại biến được tham chiếu gián tiếp (`--color-brand-500: var(--color-pine-500)` không làm mất `--color-pine-500` khỏi output dù không utility `pine-*` nào được dùng). Hai dòng `--color-background`/`--color-foreground` hiện nằm trong `@theme inline` không liên quan và giữ nguyên.

**Ảnh hưởng:** `globals.css` (thêm lớp alias, `--color-surface-brand-soft` chuyển thành `var(--color-brand-50)` nên khối thông báo quota trong portal Employer tự đổi sang nền indigo nhạt); `components/ui/{Button,Badge,Input,Select,Textarea,Card,StatCard,JobCard,Toast}.tsx`; `components/layout/{SideNav,PortalTopbar,EmployerPortalShell,AdminConsoleShell}.tsx` (bỏ prop `role` chỉ dùng để chọn màu, bỏ `!important`). Không thêm dependency, không đổi API công khai nào khác của UI kit. Trang marketing `/employer` vẫn còn `!bg-indigo-600` ở một nút CTA — cố ý để lại vì nằm ngoài khu vực có `data-role`, có thể dọn sau nếu muốn đặt `data-role="employer"` cho cả trang landing đó.

---

## AD-8 — Transactional Outbox cho email notification (Phase 10)

**Ngày:** 2026-09-14 · **Phase liên quan:** 06-backend/05-frontend Phase 10 (Notification & Email)

**Quyết định:** mọi email sinh ra từ notification **không** được gửi trực tiếp trong luồng xử lý request. Thay vào đó:

1. Thêm model `OutboxEvent` + enum `OutboxStatus` (`PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`) vào `schema.prisma` (chi tiết cột ở `docs/03-database/DATABASE_DESIGN.md`).
2. `NotificationsService.notify()` ghi `Notification` + `OutboxEvent` **trong cùng `prisma.$transaction` với thay đổi nghiệp vụ** (đổi trạng thái đơn ứng tuyển, duyệt/từ chối tin, xác minh/từ chối công ty). Hoặc cả ba cùng được ghi, hoặc không gì cả.
3. Một worker `node-cron` chạy **mỗi phút** (`modules/notifications/outbox/outbox.job.ts`) claim lô 20 event `PENDING` đã tới hạn, gọi `EmailSender.send()` (Resend), rồi đánh dấu `COMPLETED`; lỗi thì lùi lịch theo backoff `[1, 5, 15, 30]` phút và `FAILED` sau 5 lần thử.
4. `Notification.title/body/link` là **snapshot đã render** lúc tạo — bảng không lưu payload thô, notification cũ không đổi nội dung khi dữ liệu nguồn (vd. tiêu đề tin) bị sửa về sau.

**Lý do — và vì sao điều này KHÔNG mâu thuẫn với việc đã từ chối outbox cho payments:** `docs/designs/SUBSCRIPTION_BILLING_DESIGN.md` mục 4 đã loại `PaymentOutboxEvent` với lý do "thuộc pattern outbox/payout cho hệ microservices, không cần cho app monolith Express hiện tại". Lý do đó vẫn đúng và **không bị đảo ngược** ở đây, vì hai trường hợp giải quyết hai bài toán khác nhau:

- **Payments:** outbox ở đó tồn tại để phát sự kiện cho các service khác tiêu thụ (điều phối giữa nhiều service). Monolith này không có service nào để phát tới — cập nhật `Payment`/`Transaction`/`CompanySubscription` đều nằm trong một transaction PostgreSQL duy nhất, nên outbox chỉ thêm tầng trung gian mà không thêm bảo đảm nào.
- **Notification/email:** bài toán là **độ tin cậy của một lời gọi HTTP đồng bộ ra ngoài** (Resend) — nó tồn tại y hệt dù kiến trúc là monolith hay microservices. Không có outbox thì chỉ có hai lựa chọn, cả hai đều sai: gọi Resend *trong* transaction (một cú HTTP chậm/timeout giữ khoá DB, và Resend lỗi sẽ rollback cả thao tác nghiệp vụ hợp lệ), hoặc gọi *sau* khi commit (process chết giữa chừng là mất email vĩnh viễn, không dấu vết, không cách nào gửi lại).

Ngoài ra, không dùng RabbitMQ/Redpanda/Kafka/BullMQ để giải bài toán này — PostgreSQL + `node-cron` (đã có sẵn từ AD-6 mục 3) là đủ cho quy mô dự án và giữ đúng nguyên tắc modular monolith, không thêm hạ tầng mới.

**Điểm nối realtime tách riêng:** port `shared/ports/RealtimeNotifier.ts` được định nghĩa ở Phase 10 nhưng chỉ có bản `NoopRealtimeNotifier` — **Phase 10 không viết dòng Socket.IO nào** (Socket.IO thuộc Phase 9, đang triển khai song song). Khi Phase 9 xong chỉ cần đổi registration `realtimeNotifier` trong `container.ts`, `NotificationsService` không phải sửa. Frontend Phase 10 tương ứng dùng **polling** `GET /notifications/unread-count` (30s), REST contract không đổi khi chuyển sang socket.

**Known gap (chấp nhận có chủ đích):** nếu process chết đúng lúc một lô đang ở trạng thái `PROCESSING`, các event đó kẹt lại và không được thử lại (chưa có cơ chế reclaim theo timeout). Chấp nhận được ở quy mô đồ án chạy một instance; nếu cần, bổ sung sau bằng cách đưa `PROCESSING` quá hạn về `PENDING` trong chính sweep.

**Ảnh hưởng:** `apps/server/prisma/schema.prisma` (enum `NotificationType` thêm `COMPANY_REJECTED`/`MESSAGE_RECEIVED`, `Notification` thêm `readAt` + index, thêm `OutboxEvent`/`OutboxStatus`); module mới `apps/server/src/modules/notifications/`; `container.ts` (đăng ký `realtimeNotifier`); `main.ts` (mount router + start outbox job); 7 call site ở `applications`/`job-posts`/`companies`/`employers` service; `docs/03-database/DATABASE_DESIGN.md`; `docs/designs/NOTIFICATION_EMAIL_DESIGN.md` (mới).

**Thay đổi kèm theo ngoài phạm vi notification:** `CompaniesService.verify()/reject()` được bổ sung **guard trạng thái** (409 nếu company đã `VERIFIED`/`REJECTED`), theo đúng pattern đã có ở `JobPostsService`. Trước đây gọi lại API duyệt/từ chối nhiều lần vẫn ghi đè hợp lệ; từ khi có notification thì mỗi lần gọi lại sẽ sinh thêm một thông báo và một email trùng, nên guard là bắt buộc chứ không phải dọn dẹp tuỳ chọn.

## AD-9 — Skill do người dùng tự nhập: pgvector + embedding local + ranh giới AI cho LLM (JobPost Skill, Hướng B)

**Ngày:** 2026-09-15 · **Phase liên quan:** không thuộc phase đánh số — retrofit cho `job-posts` (Phase 6) và `candidates` (Phase 3), chuẩn bị cho Phase 11. Kế hoạch chi tiết: `docs/06-backend/jobpost-skill-huong-b/PLAN.md` và `docs/05-frontend/phases/jobpost-skill-huong-b/PLAN.md`; thiết kế gốc: `docs/designs/JOBPOST_SKILL_DESIGN.md`.

**Quyết định:** Candidate và Employer được **tự gõ tên kỹ năng chưa có** thay vì chỉ chọn từ danh mục Admin. Để catalog không biến thành bãi rác trùng lặp, mỗi tên gõ vào đi qua một pipeline khử trùng lặp **phân bậc từ rẻ tới đắt**, và chỉ bậc đắt nhất mới dùng tới LLM:

| Bậc | Kỹ thuật | Chi phí | Kết quả |
|---|---|---|---|
| 0 | Tra bảng `SkillAlias` (tên đã chuẩn hoá) | 1 truy vấn | `ALIAS` |
| 1 | Jaccard trên tập từ + Dice trên bigram ký tự | trong RAM | `AUTO` nếu ≥ 0.85 |
| 2 | Embedding local 384 chiều, cosine qua pgvector | CPU, không gọi API ngoài | `AUTO` nếu ≥ 0.85 |
| 3 | Gemini xác nhận cặp tên (chạy trong cron, **không** trong request) | tốn token | cron tự gộp nếu `MATCH` |
| 4 | Admin duyệt/từ chối/gộp tay | người | quyết định cuối |

Điểm dưới 0.6 coi như chắc chắn là kỹ năng khác — tạo `PENDING` thẳng, **không** đi qua bậc 3.

**Lý do đặt LLM ở bậc 3 và cho chạy trong cron, không phải trong request:**

- Gọi Gemini đồng bộ bắt người dùng chờ vài giây chỉ để thêm một cái tag. Bậc 2 vùng xám tạo bản ghi `PENDING` tạm rồi trả về ngay; cron mỗi giờ mới hỏi LLM và gộp lại nếu trùng.
- **Feedback loop:** mỗi lần gộp (cron hoặc Admin) ghi thêm một dòng `SkillAlias`, nên lần sau chính biến thể đó rơi xuống bậc 0 — càng dùng càng ít phải gọi LLM. Đã kiểm chứng: "Reactjs" lần đầu mất ~3s + 1 lượt gọi Gemini, lần sau khớp alias trong <1s, không gọi gì.
- **Không có LLM thì hệ thống vẫn đúng**, chỉ kém tự động: `SkillMatchVerifier.verify()` không bao giờ ném lỗi, mọi sự cố (thiếu key, model bị gỡ, JSON hỏng) đều quy về `UNSURE` và skill nằm lại chờ Admin. Human-in-the-loop là đường lui mặc định, không phải phương án dự phòng phải viết thêm.

**pgvector thay vì vector database riêng:** cột `Skill.embedding` kiểu `vector(384)` (~1.5KB/dòng) nằm ngay trong Postgres/Neon hiện có. Catalog kỹ năng cỡ hàng trăm dòng nên tổng dung lượng không đáng kể và không cần thêm hạ tầng — đúng nguyên tắc modular monolith như AD-6/AD-8. Prisma Client chưa có kiểu vector native nên cột khai `Unsupported("vector(384)")` và mọi thao tác đọc/ghi đi qua `$queryRaw`/`$executeRaw`.

**Ranh giới AI (chuẩn bị Phase 11):** port `shared/ports/SkillMatchVerifier.ts` + adapter `infrastructure/gemini-skill-match-verifier.ts`, đúng pattern `EmailSender`/`PaymentGatewayAdapter` đã có. Pipeline không biết gì về Gemini; đổi model hoặc tắt hẳn AI chỉ cần đổi registration trong `skills.routes.ts`. Đây là port AI đầu tiên của dự án và là bản thử pattern cho `CvAnalyzer`/`JobMatcher`/`CandidateRanker` ở Phase 11.

**Chống lạm dụng — rate-limit đặt ở đâu và vì sao:** 10 kỹ năng mới/tuần và 40/tháng cho mỗi người, 150/tuần toàn hệ thống (Redis `INCR`+`EXPIRE`, khoá theo mốc lịch). **Chỉ tăng bộ đếm khi thực sự tạo ra một `Skill` PENDING mới** — gõ trúng kỹ năng đã có không tạo dữ liệu gì nên không bị trừ. Không tái dùng port `RateLimiter` sẵn có vì port đó gộp "kiểm tra + tăng" trong một lệnh `consume()`, còn ở đây hai thời điểm phải tách rời.

**Validate khác chuẩn hoá:** `skill-normalize.util.ts` chỉ *biến đổi* chuỗi để so khớp. Việc *từ chối* input rác (≤50 ký tự, không có từ 1 ký tự, phải có ít nhất một chữ/số) nằm ở zod trong `skills.dto.ts`, chạy trước cả rate-limit. Rule "không có từ 1 ký tự" **chỉ áp dụng cho input tự gõ** qua `POST /skills/suggest` — skill seed sẵn tên một ký tự (`"C"`, `"R"`) ghi thẳng vào DB qua `scripts/seed.ts` nên không bị ảnh hưởng.

**Ảnh hưởng:** `schema.prisma` (bật `previewFeatures = ["postgresqlExtensions"]` + `extensions = [vector]`; enum `SkillStatus`/`SkillAliasSource`; `Skill` thêm `status`/`createdByUserId`/`embedding`/`pendingMatchSkillId`/`createdAt`; model `SkillAlias` mới); module mới `apps/server/src/modules/skills/`; port + adapter mới; `catalog.repository.ts` (lọc `APPROVED` + `select` tường minh để không lộ cột nội bộ ra endpoint công khai); `job-posts` (DTO/service/repository/mapper nhận `skillIds`, lọc tìm kiếm theo kỹ năng); `applications`/`saved-jobs` (dùng chung `jobPostInclude` export từ `job-post.repository.ts` thay vì chép tay); `main.ts` (mount router + cron); `packages/shared-types`; frontend: `components/shared/SkillMultiSelect.tsx` mới, `CandidateProfileClient`, `JobPostForm`, `JobPostContent`, `app/jobs/page.tsx`, `app/admin/(console)/skills/page.tsx` mới.

**Hai điểm đã kiểm chứng khi triển khai, khác dự đoán lúc lên kế hoạch:**

1. **`env.cacheDir` phải đặt trên đúng instance module vừa `import()`.** `@huggingface/transformers` có hai bản build (CJS/ESM); import tĩnh và `import()` động cho ra **hai object `env` khác nhau**, nên cấu hình đặt ở bản này không ảnh hưởng bản kia — model vẫn tải về `node_modules` (465MB) dù log báo đã trỏ sang ổ D:. `applyEmbeddingEnv()` vì vậy nhận `env` làm tham số thay vì tự import.
2. **Model Gemini bị gỡ theo thời gian.** `gemini-2.0-flash` trả 404 kèm tên bản thay thế; ID model để trong `GEMINI_MODEL` (env, mặc định `gemini-3.6-flash`) để đổi được mà không phải sửa code.

**Known gap (chấp nhận có chủ đích):** người đã chạm hạn mức tuần bị chặn ở bước rate-limit **trước** khi pipeline chạy, nên lúc đó gõ trúng một kỹ năng đã có cũng bị 429 dù không tạo gì mới. Chấp nhận được vì luồng chính (chọn từ dropdown) không đi qua endpoint này; nếu thấy vướng thì dời `assertWithinQuota()` xuống ngay trước bước tạo `Skill` trong `skill-dedupe.service.ts`.

## AD-10 — Bắt buộc đủ thông tin khi gửi duyệt tin tuyển dụng (Phase 6)

Lưu nháp (`createDraft`/`updateDraft`) vẫn chỉ bắt buộc `title` + `description` như cũ — DTO `job-posts.dto.ts` **không đổi**. Ràng buộc mới chỉ áp dụng ở bước **gửi duyệt** (`submitForApproval`), vì endpoint này (`POST /employer/job-posts/:id/submit`) không nhận body — nó kiểm tra ngay trên bản ghi `JobPost` đã lưu (`assertReadyForSubmission()` trong `job-posts.service.ts`), không qua zod/`validate()` middleware như các route khác.

Bắt buộc thêm khi gửi duyệt (áp dụng cho cả nhánh publish thẳng khi `company.requiresApproval=false`): `industryId`, `cityId`, `address`, hạn nộp (`expiresAt`, đã có từ trước), mức lương (`salaryMin`/`salaryMax`) hoặc `isNegotiable=true`, và ít nhất 1 kỹ năng (`skills.length >= 1`). Mỗi điều kiện thiếu ném `AppError(400, ...)` riêng, dừng ở lỗi đầu tiên gặp — khác với frontend (xem dưới) vì đây là lớp bảo vệ cuối, không phải nơi hiển thị lỗi cho người dùng.

**Frontend (`JobPostForm.tsx`):** chuyển từ validate thủ công (dừng ở lỗi đầu tiên, 1 thông báo chung ở cuối form) sang `react-hook-form` + `zod`, hiện lỗi **theo từng field cùng lúc**. Dùng 2 schema: `draftSchema` (lỏng, khớp DTO nháp) và `submitSchema` (đủ ràng buộc ở trên, dùng chung cho cả hành động "Xem trước" và "Gửi duyệt"). Vì cùng một `useForm` phải đổi schema theo nút bấm, resolver là một hàm tra `actionRef.current` (set ngay trước khi gọi `handleSubmit`) rồi mới gọi `zodResolver(schema)` tương ứng — không dùng `watch()` của RHF (trả về hàm không memo-hoá được, bị React Compiler bỏ qua tối ưu cả component) mà giữ `isNegotiable` bằng `useState` riêng, đồng bộ thủ công qua `setValue()`. Kỹ năng (`skills`) không phải field do RHF điều khiển (đến từ bảng nối, kiểu dữ liệu khác) nên validate ngoài schema, lỗi hiện qua state `skillsError` riêng — cùng nguyên tắc với lỗi logo/banner/license ở `CreateCompanyForm.tsx`.

**Ảnh hưởng:** `apps/server/src/modules/job-posts/job-posts.service.ts` (thêm `assertReadyForSubmission`, gọi trong `submitForApproval`); `apps/web/src/components/jobs/JobPostForm.tsx` (viết lại bằng react-hook-form + zod, không thêm dependency mới — `react-hook-form`/`@hookform/resolvers` đã có sẵn từ `CreateCompanyForm`). Không đổi `packages/shared-types` (mọi field trong `CreateJobPostRequest` vẫn optional — bắt buộc hay không do tầng validate quyết định theo action, không do type).

**Bug phát sinh trong lúc implement (đã sửa cùng đợt):** khi validate thất bại với nhiều lỗi cùng lúc, `zodResolver` ném thẳng `ZodError` ra ngoài thay vì gán vào `formState.errors` — form không hiện lỗi theo field mà Next.js hiện màn hình lỗi runtime. Nguyên nhân: `zod` đã ở v4 (`^4.5.4`) nhưng `@hookform/resolvers` vẫn ở v3 (`^3.9.1`, cài `3.10.0`) — bản v3 kiểm tra lỗi validate qua `error.errors` (tên thuộc tính của `ZodError` ở **Zod v3**), trong khi **Zod v4** đã bỏ hẳn `.errors`, chỉ còn `.issues`; điều kiện kiểm tra sai khiến thư viện coi đây không phải lỗi validate và `throw` nguyên văn. Bug này không riêng `JobPostForm` — mọi form dùng `zodResolver` (kể cả `CreateCompanyForm.tsx`) đều dính, chỉ là chưa ai rơi đúng nhánh nhiều lỗi cùng lúc để lộ ra. **Đã sửa** bằng cách nâng `@hookform/resolvers` lên `^5.9.1` (đã build sẵn nhánh nhận diện schema Zod v4 và đọc đúng `.issues`) — không phải thêm dependency mới, mà nâng cấp bản của dependency đã có sẵn để tương thích đúng với `zod` đang cài. `react-hook-form` giữ nguyên (`7.87.0` đã cao hơn peer dependency `^7.55.0` của bản `@hookform/resolvers` mới).

## AD-11 — Soft-delete hội thoại theo trạng thái JobPost, khoá gửi tin một chiều qua socket (Phase 9, bổ sung)

**Ngày:** 2026-09-17 · **Phase liên quan:** 06-backend/05-frontend Phase 9 (Realtime Communication), bổ sung sau `IMPLEMENTATION.md`. Kế hoạch chi tiết: `docs/06-backend/phase-09-realtime-communication/CONVERSATION_SOFT_DELETE_PLAN.md` và `docs/05-frontend/phases/phase-09-realtime-communication/CONVERSATION_SOFT_DELETE_PLAN.md`.

> **Trạng thái: ĐÃ TRIỂN KHAI (2026-09-17)** — chi tiết và các điểm lệch nhỏ so với plan ghi ở 2 file `CONVERSATION_SOFT_DELETE_PLAN.md`.

**Quyết định:**

1. **Điều kiện xoá gắn với `JobPost.status`, không thêm cờ mới trên `JobPost`/`Conversation` cho việc "đánh dấu"**: một `Conversation` chỉ xoá được khi `jobPost.status` ∈ `{CLOSED, EXPIRED, TAKEN_DOWN}` (3 trạng thái chung cuộc — đã xác nhận trong `job-posts.service.ts` không có transition nào quay ngược từ 3 trạng thái này về `PUBLISHED`). Badge "tin đã đóng/hết hạn/bị gỡ — có thể xoá hội thoại" hiển thị cho **cả 2 phía** tính trực tiếp từ `jobPost.status` đã có sẵn qua JOIN, không cần cột/bảng đánh dấu riêng.
2. **Soft-delete 2 cờ độc lập theo từng phía** (`Conversation.candidateDeletedAt`/`employerDeletedAt`, đều `DateTime?`): mỗi bên chỉ set cờ của chính mình. Một bên xoá thì hội thoại biến mất khỏi danh sách của **chính họ** (filter ở query list), phía còn lại vẫn thấy hội thoại nhưng bị khoá — chỉ xem được lịch sử, không gửi được tin mới.
3. **Xoá cứng khi cả 2 cờ cùng có giá trị** — kiểm tra ngay trong transaction của lần xoá thứ 2, gọi `prisma.conversation.delete()` (cascade xoá `Message` đã có sẵn qua `onDelete: Cascade`, không cần dọn thủ công).
4. **Thông báo "không còn khả dụng" qua Socket.IO (không dùng polling)** — quyết định sau khi so sánh 2 phương án:
   - **Polling bị loại**: trang `/messages` hiện chỉ gọi `fetchConversations()` một lần lúc mount (`ChatLayout.tsx`), không có `refetchInterval` nào cho danh sách hội thoại. Nếu chỉ dựa vào polling, một người đang gõ dở tin trong đúng hội thoại bị phía kia xoá sẽ không biết cho tới khi rời trang và quay lại — không đáp ứng được yêu cầu "đang nhắn hoặc đang mở cuộc hội thoại đó phải được thông báo ngay".
   - **Socket được chọn**: hạ tầng `RealtimeNotifier` (port + `SocketIoRealtimeNotifier`/`NoopRealtimeNotifier`, room `user:${userId}`) đã có sẵn từ Phase 9/10, thêm 1 method mới (`notifyConversationUnavailable`) là chi phí biên rất nhỏ, tái dùng đúng pattern đã có thay vì dựng cơ chế polling mới.
   - **REST vẫn là nguồn sự thật dự phòng** (không chỉ dựa vào socket): `saveMessage()` (được gọi từ handler `send_message`) kiểm tra lại cờ xoá của phía kia mỗi lần gửi — bị chặn ngay cả khi phía nhận lỡ mất sự kiện socket (mất kết nối đúng lúc, tab chưa mount lại listener...). `GET /conversations` cũng luôn trả đúng 2 cờ `*DeletedAt` hiện tại, nên client mở lại trang (bỏ qua socket) vẫn thấy đúng trạng thái khoá ngay từ lần fetch đầu.
5. **Không cho phép reopen job post quay lại trạng thái cho phép xoá** — không có cơ chế "un-eligible" cần xử lý (đã xác nhận qua code hiện tại, xem điểm 1).

**Lý do:** giữ đúng nguyên tắc "1 nguồn sự thật, socket chỉ là kênh đẩy nhanh" đã áp dụng nhất quán từ AD-8 (outbox email) tới bổ sung Phase 9 (notification tin nhắn) — không có nhánh nào chỉ đúng khi socket không rớt.

**Ảnh hưởng:** `schema.prisma` (`Conversation` thêm `candidateDeletedAt`/`employerDeletedAt`, cần migration); `messaging.repository.ts` (2 query list + 2 câu raw SQL đếm chưa đọc phải lọc thêm theo cờ xoá của người gọi); `messaging.service.ts` (thêm `deleteConversation()`, guard trong `saveMessage()`); `messaging.controller.ts`/`.routes.ts` (`DELETE /conversations/:id`); `RealtimeNotifier` port + 2 impl (method mới); `AppError` (thêm field `code?: string` tuỳ chọn để phân biệt lỗi "không còn khả dụng" ở tầng socket); `packages/shared-types` (`Conversation` thêm 2 field, `ConversationJobPostInfo` thêm `status`); frontend `messaging-store.ts`, `useSocket.ts`, `lib/messaging.ts`, `ChatLayout.tsx`. Chi tiết đầy đủ ở 2 file PLAN nêu trên.

## AD-12 — Thông báo cho Admin khi có việc cần duyệt, tái dùng hạ tầng `notify()` chung theo `userId` (Phase 10, bổ sung)

**Ngày:** 2026-09-17 · **Phase liên quan:** 06-backend/05-frontend Phase 10 (Notification & Email), bổ sung. Kế hoạch chi tiết: `docs/06-backend/phase-10-notification-email/ADMIN_MODERATION_NOTIFICATIONS_PLAN.md` và `docs/05-frontend/phases/phase-10-notification-email/ADMIN_MODERATION_NOTIFICATIONS_PLAN.md`.

> **Trạng thái: ĐÃ TRIỂN KHAI (2026-09-17).**

**Quyết định:**

1. **Không cần event socket mới, không sửa `RealtimeNotifier`**: `NotificationsService.notify()`/`notifyMany()` đã tổng quát theo `userId`, không phân biệt role — chỉ cần thêm 2 giá trị `NotificationType` (`COMPANY_LINK_REQUESTED`, `JOB_POST_SUBMITTED`) và gọi `notifyMany(type, adminIds, ...)` tại đúng 2 điểm nghiệp vụ (`employers.service.ts#createOrResubmitCompany` nhánh `MANUAL_REVIEW`, `job-posts.service.ts#submitForApproval` nhánh `PENDING`).
2. **Không gửi email cho 2 loại thông báo này** (`email: null` trong renderer) — Admin làm việc trực tiếp trên dashboard trong giờ hành chính (hàng đợi công việc), khác candidate/employer chờ kết quả nhiều ngày; gửi email mỗi lần sẽ spam mà không thêm giá trị.
3. **Mỗi sự kiện là 1 dòng riêng trong NotificationBell, không gộp theo kiểu hội thoại**: khác tin nhắn (gộp theo `Conversation` vì là luồng trao đổi liên tục), mỗi yêu cầu liên kết công ty / mỗi tin chờ duyệt là 1 action item Admin cần xử lý (duyệt/từ chối) độc lập — gộp lại sẽ khó biết còn bao nhiêu việc tồn đọng và khó đánh dấu đã xử lý riêng từng cái.
4. **Mở rộng tầng socket/browser-notification frontend từ `MessagingArea` sang `AuthArea`, có type guard tường minh chặn phần tin nhắn cho admin**: `useSocketConnection`/`SocketProvider`/`useBrowserNotification`/`SettingsPage` trước đây cố ý loại `"admin"` (đúng vì admin không có hội thoại). Thêm `isMessagingArea()` type guard tại các điểm gọi API riêng cho tin nhắn (`markConversationUnavailable`, `MESSAGES_HREF[area]`) thay vì dựa vào "server sẽ không emit event tin nhắn cho admin" để bỏ qua kiểm tra kiểu.
5. **Admin có socket connection lần đầu** (`AdminConsoleShell` mount `SocketProvider area="admin"`) — trước đây khu admin chạy hoàn toàn bằng polling 30s cho `NotificationBell`; polling vẫn giữ làm dự phòng (không đổi `UNREAD_POLL_MS`), giống nguyên tắc "socket chỉ là kênh đẩy nhanh, REST vẫn là nguồn sự thật" đã dùng từ AD-8/AD-11.
6. **Trang Cài đặt (`/admin/settings`) dùng lại `SettingsPage` component chung**, ẩn toggle "Tin nhắn mới" khi `area === "admin"` thay vì tách component riêng — tránh trùng lặp UI, đúng tinh thần tái dùng đã áp dụng cho `NotificationBell`.

**Lý do:** tận dụng tối đa hạ tầng generic đã có (notification theo `userId`, không theo role) thay vì dựng cơ chế riêng cho Admin — chi phí biên chỉ là 2 giá trị enum + 2 điểm gọi `notifyMany` ở backend, và nới kiểu `AuthArea` có kiểm soát ở frontend.

**Ảnh hưởng:** `schema.prisma` (`NotificationType` thêm 2 giá trị, cần migration); `notification.types.ts`/`notification-templates.ts` (payload + renderer mới, `email: null`); `user.repository.ts` (method `findAdminIds()` mới); `employers.service.ts`, `job-posts.service.ts` (điểm gọi `notifyMany` mới); frontend `useSocket.ts`, `SocketProvider.tsx`, `AdminConsoleShell.tsx` (mount `SocketProvider` + mục nav "Cài đặt"), `lib/browser-notification.ts`, `useBrowserNotification.ts`, `SettingsPage.tsx`, route mới `app/admin/(console)/settings/page.tsx`. Chi tiết đầy đủ ở 2 file PLAN nêu trên.

## AD-13 — Job Matcher (A2): một bộ chấm điểm thuần, ba giai đoạn rule → embedding → LLM (chuẩn bị Phase 11)

**Ngày:** 2026-09-20 · **Phase liên quan:** không thuộc phase đánh số — đi trước Phase 11 (AI Features Boundary), dùng lại nền của `skills` (AD-9) và CV extraction. Kế hoạch chi tiết: `docs/06-backend/job-matcher-phase1|2/PLAN.md`, `docs/05-frontend/phases/job-matcher-phase1|2/PLAN.md`. Bản nháp lập luận đầy đủ: `docs/temp/A2_JOB_MATCHER_3_PHASES.md` (không commit).

> **Trạng thái: GĐ1 ĐÃ TRIỂN KHAI (2026-09-21; FE chưa kiểm thử trên trình duyệt). GĐ2 ĐÃ LẬP KẾ HOẠCH (2026-09-20), CHƯA TRIỂN KHAI.** **GĐ3 (LLM trích yêu cầu từ tin) mới ở mức quyết định dự kiến, CHƯA có PLAN chi tiết** — cố ý hoãn tới khi có số liệu đánh giá của GĐ2, vì chấm điểm GĐ3 dựa trên cấu hình cuối cùng của GĐ2 (trọng số, `lo/hi`, mẫu văn bản embed).

**Quyết định:**

1. **Một hàm chấm điểm thuần, ba cấu hình.** `ScoringJobMatcher(weights).match(MatchInput) → MatchResult` là hàm đồng bộ, không chạm DB/mạng. `RULE` / `EMBEDDING_ONLY` / `HYBRID` chỉ là ba bảng trọng số khác nhau (`job-matching.config.ts`, có `version`), không phải ba matcher. Nhờ vậy test đơn vị không cần DB, script đánh giá dùng đúng code của service thật, và hướng A3 (xếp hạng ứng viên) tái dùng nguyên vẹn.
2. **Phân công theo thế mạnh của từng kỹ thuật** (luận điểm học thuật, không chỉ là chi tiết cài đặt): luật xử lý phần **định lượng** (kỹ năng, số năm) — giải thích được từng điểm; embedding bổ sung **ngữ nghĩa** — chạy local; LLM chỉ dùng chỗ máy không đọc được **văn bản tự do** (yêu cầu của tin) và luôn có **Employer xác nhận**. GĐ1 là baseline để GĐ2 có cái so sánh; "embedding không tốt hơn luật" vẫn là kết quả hợp lệ.
3. **Điểm là gợi ý, không phải quyết định:** không đổi `ApplicationStatus`, không ẩn/loại ứng viên, không sắp xếp danh sách đơn theo điểm; API luôn trả kèm bằng chứng (khớp/thiếu, thành phần, `weightsVersion`, `confidence`). Thiếu dữ liệu làm giảm **độ tin cậy**, không trừ điểm ("unknown ≠ 0"): thành phần không áp dụng bị loại và trọng số chia lại.
4. **Vị trí port khác phác thảo ban đầu của Phase 11:** `shared/ports/JobMatcher.ts` (và `EmbeddingProvider.ts` ở GĐ2), adapter ở `infrastructure/`, logic ở `modules/job-matching/` — đúng chỗ repo đang đặt `CvExtractor.ts`/`CatalogMatchVerifier.ts`, thay vì `modules/ai/` như sơ đồ gốc của Phase 11. Phase 11 nên đọc theo quyết định này.
5. **Quyết định dữ liệu (D1–D5):** `CandidateSkill.yearsOfExperience = 0` nghĩa là *chưa khai*, không migrate cột nullable; GĐ1 dùng **tổng thời gian làm việc** từ `WorkExperience` (hợp các khoảng, chồng lấp tính một lần) — **hạn chế đã biết và chấp nhận:** chưa xét công việc có liên quan tới tin hay không, GĐ3 sửa bằng số năm theo từng kỹ năng; thành phố/`jobType`/ngành/giới tính/ngày sinh/tên trường **không vào điểm** và **không vào văn bản embed** (tránh thiên lệch, đồng thời `WorkExperience` không có liên kết kỹ năng nên không thể tự suy ra độ liên quan); điểm Employer thấy tính theo hồ sơ hiện tại (không snapshot lúc nộp).
6. **Embedding (GĐ2):** dùng lại đúng model đang chạy cho Skill qua adapter uỷ quyền `SkillEmbeddingService.embed` (không nạp model ~465MB lần hai, không sửa module `skills`); vector lưu ở **bảng riêng** `candidate_embeddings`/`job_post_embeddings` (cột `vector(384)`, pgvector đã bật từ AD-9), tính **lười theo hash nội dung** (`sha256(templateVersion|modelId|text)`) — không dirty flag, không cron, không index vector (chỉ so một cặp mỗi lần). Thiếu vector/model lỗi ⇒ điểm rơi về `rule-v1` và ghi đúng `weightsVersion`, không âm thầm chạy `hybrid` với trọng số bị lệch.
7. **Quy trình đánh giá chặn "chỉnh tham số trên dữ liệu khoe kết quả":** bộ nhãn ~30–50 cặp chia dev/test **cố định trong file**; `lo/hi` của chuẩn hoá cosine, ngưỡng nhãn và lưới trọng số chỉ chỉnh trên dev; test chỉ để báo cáo. **Quy tắc đổi mặc định `JOB_MATCHER_MODE` sang `hybrid` chốt trước khi có số** (xem PLAN backend GĐ2). Cỡ mẫu nhỏ ⇒ chỉ mang tính chỉ báo, phải nói rõ trong báo cáo.
8. **GĐ3 (dự kiến):** thêm `JobPost.requirementsConfirmed Json?` + `requirementsConfirmedAt`; `JobPostSkill` vẫn là nguồn sự thật của kỹ năng (LLM chỉ đề xuất `importance`), JSON chỉ chứa phần chưa có chỗ trong schema; bản nháp của LLM **không lưu DB** (giữ ở FE + cache Redis theo hash văn bản), chỉ ghi khi Employer bấm "Áp dụng"; AI không bao giờ tự ghi đè dữ liệu nghiệp vụ. Chỉ gửi nội dung **tin tuyển dụng** (công khai) tới LLM ngoài, **không** gửi dữ liệu cá nhân Candidate. Chi tiết sẽ nằm ở PLAN GĐ3 khi được viết.

**Lý do:** tách rõ "cái nào máy tính chắc chắn được" (luật) khỏi "cái cần ngữ nghĩa" (embedding) và "cái cần đọc hiểu văn bản" (LLM) để mỗi giai đoạn tự chạy và demo được, có thể dừng ở bất kỳ giai đoạn nào mà vẫn có sản phẩm nguyên vẹn — và để việc thêm AI có **số liệu so sánh** thay vì chỉ khẳng định là tốt hơn.

**Ảnh hưởng (GĐ1–2):** `schema.prisma` (enum `SkillImportance`; `JobPostSkill.importance`; `JobPost.minExperienceYears`; GĐ2: 2 bảng embedding + 2 quan hệ ngược — cần migration, **viết tay và xin xác nhận trước khi áp Neon**); module mới `apps/server/src/modules/job-matching/`; port `JobMatcher.ts`/`EmbeddingProvider.ts` + adapter `skill-embedding-provider.ts`; `job-posts` (DTO/service/repository/mapper nhận `preferredSkillIds`, `minExperienceYears`; `setSkills` nhận `importance`); `shared/config/env.ts` (`JOB_MATCHER_MODE`, `MATCH_EMBEDDING_TEMPLATE_VERSION`); `main.ts` (mount `jobMatchingRouter` **sau** `skillsRouter`); `packages/shared-types`; frontend: `hooks/useJobMatch.ts`, `JobMatchCard`, `MatchScoreBadge`, `SkillMultiSelect` (prop tuỳ chọn), `JobPostForm`, `app/jobs/[id]/page.tsx`, 2 trang đơn của Employer. **Không sửa** `applications`, `candidates`, `skills`.

## Phần ghi chú của chủ dự án

*(để trống)*
