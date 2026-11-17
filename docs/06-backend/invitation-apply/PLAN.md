# Nhận lời mời = ứng tuyển vào tin (0.7) — Backend

> **Trạng thái: XONG CODE BACKEND BƯỚC 1–8 (2026-11-17), CHƯA ÁP MIGRATION LÊN NEON, CHƯA KIỂM THẬT (bước 9).** Chủ dự án duyệt từng điểm; Q1–Q4 đã chốt cùng ngày (cuối plan). tsc server + web sạch, 665/665 test. Chi tiết ở mục Ghi chú triển khai. Quyết định kiến trúc: AD-28 trong `docs/02-architecture/ARCHITECTURE_DECISIONS.md`. Frontend: `docs/05-frontend/phases/invitation-apply/PLAN.md`.

## Mục tiêu

Hiện nay ứng viên bấm **Chấp nhận** lời mời thì chỉ mở được hội thoại chat (AD-15 mục 6). Hệ thống không tạo đơn ứng tuyển, nên ứng viên **không có trong danh sách ứng viên của tin**, nhà tuyển dụng không xét duyệt, hẹn phỏng vấn hay tuyển được theo luồng chuẩn.

Sau thay đổi: nhận lời mời **là** ứng tuyển. Ứng viên chọn CV, bấm xác nhận, hệ thống tạo đơn ở trạng thái "Đang xem xét", gắn với lời mời, rồi vẫn mở hội thoại như cũ.

## Hiện trạng (đọc code 2026-11-17)

- `CandidateOutreachService.respond` (`candidate-outreach.service.ts:496`): kiểm tin `PUBLISHED`; trong transaction `respondIfPending` rồi gửi `CANDIDATE_OUTREACH_INVITATION_RESPONDED` cho **người mời**; ACCEPT thì gọi `MessagingService.createConversation` ngoài transaction (lỗi chỉ ghi log).
- `ApplicationsService.createApplication` (`applications.service.ts:127`): đơn bắt buộc có `cvId` thuộc ứng viên; tin phải `PUBLISHED`, chưa hết hạn; mỗi cặp tin–ứng viên một đơn (`@@unique([jobPostId, candidateId])`), đơn `CANCELLED` thì mở lại bản ghi cũ (`reappliedAt`); ghi `ApplicationStatusHistory` và gửi `APPLICATION_RECEIVED` cho **mọi employer của công ty** trong cùng transaction; sau commit gọi `autoReviewTrigger` (AD-25).
- `cancelApplication`: ứng viên chỉ huỷ được đơn `PENDING`.
- Lời mời không được gửi cho người đã có đơn vào tin (`hasApplied`, câu lọc tự mời). Nhưng ứng viên **có thể** tự nộp đơn sau khi đã nhận lời mời `PENDING`.
- Phễu / số liệu tự động đọc lịch sử trạng thái theo kiểu chịu được dòng khởi tạo `null → REVIEWING`: "hệ thống tự chuyển" chỉ đếm `PENDING → REVIEWING` với `actorId` null (`live-rescore.repository.ts:164`, `applications.repository.ts:159`). Không phải sửa.

## Các quyết định đã chốt (2026-11-17)

| # | Vấn đề | Chốt |
|---|---|---|
| 1 | Cách nhận lời | **Phương án B.** Nút "Nhận lời & ứng tuyển" mở hộp thoại chọn CV (chọn sẵn CV mặc định) và thư giới thiệu không bắt buộc. Xác nhận thì lời mời `ACCEPTED` + tạo đơn trong **một transaction**, rồi mở hội thoại như cũ. Không còn lối "nhận lời mà không nộp đơn" |
| 2 | Đánh dấu đơn đến từ lời mời | Cột mới `Application.invitationId String? @unique`, trỏ về `CandidateOutreachInvitation` (`onDelete: SetNull`). Danh sách ứng viên hiện nhãn "Được mời" (kèm "Tự động" nếu lời mời `AUTO`); số liệu đo được tỉ lệ mời → đơn |
| 3 | Trạng thái ban đầu | **Vào thẳng `REVIEWING`**, bất kể điểm và công tắc `autoReviewEnabled`. Lý do: nhà tuyển dụng đã chủ động chọn người này. Lịch sử ghi `fromStatus = null` (hoặc `CANCELLED` nếu mở lại đơn cũ) → `REVIEWING`, `actorId` = userId ứng viên. Không gọi `autoReviewTrigger` |
| 4 | Thông báo | **Một** thông báo gộp "X đã nhận lời và ứng tuyển", thay cho cặp `CANDIDATE_OUTREACH_INVITATION_RESPONDED` + `APPLICATION_RECEIVED`. Người nhận: **người mời + người đăng tin**, trùng thì gửi một lần (Q2) |
| 5 | Lời mời cũ đã `ACCEPTED` nhưng chưa có đơn | Không tự tạo đơn bằng migration (chưa có CV, ứng viên chưa đồng ý). Thêm endpoint ứng tuyển từ lời mời đã nhận; frontend hiện nút "Ứng tuyển ngay" |
| 6 | Tin đóng / hết hạn giữa chừng | Kiểm lại tin (`PUBLISHED`, chưa quá `expiresAt`) **trong** transaction. Không còn tuyển thì 409 "Lời mời không còn hiệu lực", không ghi gì |

## Phần 1 — Công nghệ / kiến trúc

- Không thêm dependency.
- 1 migration viết tay bằng `prisma migrate diff`: thêm cột `applications."invitationId"` (nullable, unique, FK `SET NULL`). Không backfill. Xin xác nhận trước khi áp lên Neon. **Không** dùng `--shadow-database-url` trỏ vào DB thật; chỉ dùng shadow DB tạm.
- Logic tạo đơn ở **một chỗ**: `ApplicationsService` tách phần lõi thành hàm nhận `tx`; module `candidate-outreach` gọi qua DI (awilix), không tự ghi bảng `applications`. Giữ đúng ranh giới ghi trong comment đầu `candidate-outreach.repository.ts` ("Không sửa module candidates/applications/messaging") ở phía repository.

## Phần 2 — Các bước

### Bước 1 — Schema + migration

- `schema.prisma`:
  - `Application`: `invitationId String? @unique` + quan hệ `invitation CandidateOutreachInvitation? @relation(fields: [invitationId], references: [id], onDelete: SetNull)`.
  - `CandidateOutreachInvitation`: quan hệ ngược `application Application?`.
- Migration `2026111x_add_application_invitation`: `ALTER TABLE` thêm cột, unique index, FK.
- Chạy `prisma generate`, `tsc`.

### Bước 2 — Tách lõi tạo đơn trong `ApplicationsService`

Hàm mới (tên dự kiến) `submitInTx(tx, input)`:

```ts
input: {
  candidate: { id: string; userId: string; fullName: string | null };
  jobPost: { id: string; title: string; companyId: string };
  cvId: string;
  coverLetter?: string | null;
  initialStatus: "PENDING" | "REVIEWING";
  invitationId?: string;
}
```

- Kiểm CV thuộc ứng viên; đọc đơn hiện có của cặp tin–ứng viên.
- Đơn đang hoạt động (khác `CANCELLED`) thì ném lỗi như hiện tại — riêng trường hợp lời mời xem bước 3.
- Tạo mới hoặc mở lại đơn `CANCELLED` (giữ quy ước `reappliedAt`); ghi `invitationId` nếu có; ghi lịch sử với `toStatus = initialStatus`.
- **Không** tự gửi thông báo: người gọi quyết định loại thông báo (đơn thường gửi `APPLICATION_RECEIVED`, đơn từ lời mời gửi thông báo gộp).
- `createApplication` gọi lại hàm này với `initialStatus = "PENDING"`, gửi `APPLICATION_RECEIVED` và gọi `autoReviewTrigger` như cũ ⇒ hành vi nộp đơn thường **không đổi** khi ứng viên không có lời mời đang chờ (test hiện có phải xanh nguyên).
- **Ngoại lệ (Q4):** ứng viên có lời mời `PENDING`, chưa quá hạn cho đúng tin ⇒ `createApplication` đi luồng nhận lời: trong cùng transaction `respondIfPending(…, "ACCEPTED")`, `submitInTx` với `initialStatus = "REVIEWING"` và `invitationId`, thông báo gộp thay cho `APPLICATION_RECEIVED`, không gọi `autoReviewTrigger`. Sau commit mở hội thoại như bước 3. Đơn trả về đã ở `REVIEWING` và có `invitationId` ⇒ frontend biết để báo. Phần dùng chung giữa luồng này và bước 3 đặt ở một hàm của `CandidateOutreachService` (`acceptWithApplicationInTx`), `ApplicationsService` gọi qua DI. Nếu awilix báo phụ thuộc vòng (`candidate-outreach` đã gọi `applications`) thì tách phần nhận lời thành service nhỏ riêng mà cả hai cùng gọi.

### Bước 3 — `respond` khi ACCEPT

- DTO: `respondOutreachInvitationSchema` thành discriminated union:
  - `{ action: "DECLINE" }`;
  - `{ action: "ACCEPT", cvId: string, coverLetter?: string (≤ giới hạn của đơn thường) }`.
- Trong **một** transaction:
  1. đọc lại tin, kiểm `PUBLISHED` và chưa quá `expiresAt` (quyết định 6);
  2. `respondIfPending(…, "ACCEPTED")` — điều kiện PENDING + chưa quá hạn vẫn nằm trong câu UPDATE;
  3. `applicationsService.submitInTx(tx, { …, initialStatus: "REVIEWING", invitationId })`;
  4. gửi thông báo gộp (bước 5).
- Ứng viên **đã có đơn đang hoạt động** vào tin (Q4): không gọi `submitInTx`. Lời mời chuyển `ACCEPTED`, gắn `invitationId` vào đơn nếu đơn chưa gắn lời mời nào, **không** đổi trạng thái đơn, không tạo đơn mới. Response có `applicationId` của đơn đó và `linkedExisting: true` để frontend báo "lời mời đã được gắn vào đơn". Không gửi thông báo gộp (nhà tuyển dụng đã có đơn), chỉ gửi `CANDIDATE_OUTREACH_INVITATION_RESPONDED` như cũ cho người mời. `cvId` trong body bỏ qua.
- Sau commit: `createConversation` như hiện tại (lỗi chỉ ghi log).
- Response thêm `applicationId` và `linkedExisting`: `{ status, conversationId, applicationId, linkedExisting }`.
- DECLINE: giữ nguyên (kể cả `autoOutreachTrigger`).

### Bước 4 — Ứng tuyển từ lời mời đã nhận (lời mời cũ)

- `POST /candidate/outreach-invitations/:id/apply`, body `{ cvId, coverLetter? }`.
- Điều kiện: lời mời của chính ứng viên, `status = ACCEPTED`, chưa có đơn gắn lời mời này, ứng viên chưa có đơn đang hoạt động vào tin, tin còn tuyển. Sai điều kiện ⇒ 404 / 409 với thông báo tiếng Việt.
- Cùng transaction như bước 3 từ mục 3 trở đi (đơn `REVIEWING`, gắn `invitationId`, thông báo gộp). Không tạo lại hội thoại (đã có).
- Không đặt giới hạn thời gian sau khi nhận lời: còn tin là còn ứng tuyển được.

### Bước 5 — Thông báo gộp

- Mở rộng payload `CANDIDATE_OUTREACH_INVITATION_RESPONDED`: thêm `applicationId?: string`. Template: `accepted && applicationId` ⇒ "**X** đã nhận lời và ứng tuyển vào **Tin**", link sang hồ sơ ứng tuyển; còn lại giữ chữ cũ. Không thêm loại thông báo mới, không đổi enum ⇒ không thêm migration.
- Người nhận (Q2): `userId` của người mời (`invitation.employer`) và của người đăng tin (`jobPost.employer`), bỏ trùng. Lời mời tự động đứng tên người đăng tin (`auto-outreach.service.ts:378`) nên chỉ một người nhận. Gửi bằng `notifyMany`.
- Không gửi `APPLICATION_RECEIVED` cho đơn từ lời mời. Đồng nghiệp khác vẫn thấy đơn trong danh sách; nhắc hằng tuần của AD-25 (gửi cả công ty khi hồ sơ đứng yên quá 7 ngày) là lưới an toàn.

### Bước 6 — DTO đọc

- `CandidateOutreachInvitationDto` thêm `applicationId: string | null` (đơn gắn lời mời này, hoặc đơn đang hoạt động của cặp tin–ứng viên) để frontend biết hiện "Ứng tuyển ngay" hay "Xem đơn".
- `EmployerApplicationListItem` (và `EmployerApplicationDetail`) thêm `invitation: { id: string; source: "MANUAL" | "AUTO" } | null`.
- `CandidateApplicationSummary` (trang "Đơn ứng tuyển" của ứng viên) thêm `invitationId: string | null` cho nhãn "Được mời".
- Trang `/jobs/[id]/apply` biết có lời mời đang chờ bằng danh sách lời mời sẵn có (`GET /candidate/outreach-invitations`), không thêm API.
- `RespondOutreachInvitationRequest` / `Response` cập nhật theo bước 3; thêm `ApplyFromInvitationRequest`.
- Cập nhật `packages/shared-types`.

### Bước 7 — Ảnh hưởng tới số liệu (kiểm, không sửa nếu đúng)

- Tiến độ tuyển (AD-24): "Nhận lời" vẫn đếm lời mời `ACCEPTED`; đơn từ lời mời vào nhóm "đã nộp" như đơn thường. Kiểm số trên trang tổng quan sau khi nhận lời.
- Tự mời (AD-23): lời mời `ACCEPTED` vẫn tính như cũ; ứng viên có đơn vẫn bị loại khỏi pool. Không đổi.
- Tự xử lý hồ sơ (AD-25): đơn vào thẳng `REVIEWING` không qua lối tự chuyển, không bị đếm là "hệ thống tự chuyển".

### Bước 8 — Test

- Sửa test `respond` hiện có theo DTO mới.
- Thêm (unit, theo mẫu `tests/unit/outreach-*.test.ts`):
  - ACCEPT tạo đơn `REVIEWING`, gắn `invitationId`, lịch sử `null → REVIEWING`, thông báo gộp gửi người mời + người đăng tin (cùng một người ⇒ một thông báo);
  - nộp đơn thường khi có lời mời `PENDING` ⇒ lời mời `ACCEPTED`, đơn `REVIEWING`, không có `APPLICATION_RECEIVED`, không gọi `autoReviewTrigger`;
  - nộp đơn thường khi lời mời đã quá hạn ⇒ đơn `PENDING` như thường;
  - ACCEPT mở lại đơn `CANCELLED`;
  - ACCEPT với CV không thuộc ứng viên ⇒ 400, lời mời vẫn `PENDING` (transaction hoàn tác);
  - tin vừa đóng / hết hạn ⇒ 409, không ghi gì;
  - ACCEPT khi đã có đơn đang hoạt động ⇒ lời mời `ACCEPTED`, đơn giữ nguyên trạng thái, gắn `invitationId`, `linkedExisting: true`;
  - `apply` cho lời mời `ACCEPTED` cũ; gọi lần hai ⇒ 409;
  - nộp đơn thường không đổi (PENDING, `APPLICATION_RECEIVED`, `autoReviewTrigger`).
- `tsc`, eslint, toàn bộ test server.

### Bước 9 — Kiểm thật và tài liệu

- Qua gateway 8080 với tài khoản demo: gửi lời mời → ứng viên nhận lời với CV → đơn hiện ở tab "Đang xem xét" của tin, có nhãn "Được mời"; thông báo đúng; hội thoại mở được.
- Cập nhật AD-28 (trạng thái), backlog 0.7, FAQ trợ lý hỗ trợ: `02-ung-vien-ho-so-cv.md` (dòng 152, "Chấp nhận sẽ tạo một hội thoại"), `03-tim-viec-ung-tuyen.md` (dòng 185), `07-quan-ly-ung-vien.md` (dòng 96).

## Câu hỏi đã chốt (2026-11-17)

- **Q1 — Huỷ đơn từ lời mời:** giữ quy tắc hiện tại (ứng viên chỉ huỷ đơn `PENDING`), nên đơn từ lời mời không huỷ được. Hộp thoại nhận lời ghi rõ điều này.
- **Q2 — Người nhận thông báo gộp:** người mời + người đăng tin, bỏ trùng. Không chọn "cả công ty": hệ thống không có người phụ trách đơn, báo cả công ty dễ thành không ai nhận việc hoặc hai người cùng xử lý; người mời là người có ngữ cảnh (đã chọn ứng viên, đang có hội thoại); nhắc tuần của AD-25 đã phủ cả công ty.
- **Q3 — Tải CV từ máy trong hộp thoại:** không. Chỉ chọn CV đã lưu; chưa có CV thì dẫn sang `/cv`.
- **Q4 — Lời mời và đơn tự nộp trùng tin:** nộp đơn thường khi có lời mời `PENDING` ⇒ coi như nhận lời (bước 2); nhận lời khi đã có đơn ⇒ chỉ gắn lời mời, không đổi trạng thái đơn (bước 3). Chủ dự án yêu cầu **luôn báo cho ứng viên** việc hồ sơ được đưa thẳng vào "Đang xem xét" (các chỗ báo ở plan frontend F2–F4).

## Ghi chú triển khai (2026-11-17)

- **Bước 1:** migration `20261117120000_add_application_invitation` sinh bằng `prisma migrate diff --from-schema-datamodel <schema HEAD> --to-schema-datamodel <schema mới>` (so hai file, không cần DB, không shadow DB). Chưa áp lên Neon.
- **Bước 2, khác plan một chút:** lõi tạo đơn là hàm `submitApplicationInTx` trong `applications/application-submit.ts` thay cho method của `ApplicationsService`. Phần nhận lời nằm ở service mới `candidate-outreach/invitation-application.service.ts` (`InvitationApplicationService`: `acceptInTx`, `applyFromAccepted`, `openConversation`, `findOpenPendingForJob`), đăng ký trong `candidateOutreachRouter`. `ApplicationsService` và `CandidateOutreachService` cùng phụ thuộc service này, service này không phụ thuộc hai service kia ⇒ không có vòng DI.
- `CandidateOutreachService` bỏ phụ thuộc `messagingService` (hội thoại chuyển sang `InvitationApplicationService.openConversation`).
- `listForCandidate` trả `applicationId` theo đơn khác `CANCELLED` của cặp tin–ứng viên (không chỉ đơn gắn lời mời), để lời mời có đơn tự nộp cũng hiện "Xem đơn".
- Danh sách đơn cấp công ty đọc `invitationId` + `source` bằng subquery trong câu SQL hiện có; danh sách theo tin và chi tiết đơn `include` `invitation { id, source }`.
- Email lời mời của ứng viên đổi câu cuối thành "Nhận lời để ứng tuyển bằng CV của bạn và trò chuyện với nhà tuyển dụng."
- **Test:** `tests/unit/invitation-apply.test.ts` (11 case theo bước 8); sửa `auto-outreach-run.test.ts` (ACCEPT phải kèm CV). Server không có cấu hình eslint nên chỉ chạy tsc.
- **Lưu ý tới khi xong frontend:** hộp lời mời hiện tại gửi ACCEPT không kèm CV ⇒ nhận 400 "Cần chọn CV để nhận lời mời." cho tới khi làm F1–F3.
- Sau khi áp migration phải khởi động lại server: lúc `prisma generate`, file engine đang bị server dev khoá (types đã sinh đủ).
