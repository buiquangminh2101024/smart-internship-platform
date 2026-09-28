# Tìm & mời ứng viên chưa ứng tuyển (B3) — Backend

Quyết định kiến trúc: `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-15. Bản nháp lập luận đầy đủ (đối chiếu TopCV/ITviec): `docs/temp/AI_A1_A3_A4_B2_B3_MERGE_NOTES.md` (không commit).

Song song: `docs/05-frontend/phases/candidate-outreach/PLAN.md`.

**Trạng thái: ĐÃ LẬP KẾ HOẠCH (2026-09-27), SỬA LẠI 2026-09-28 (bỏ ẩn danh, hạn mức theo công ty, chốt Q1–Q5), ĐANG TRIỂN KHAI — xong bước 1 (migration, đã áp Neon) và bước 2 (repository) ngày 2026-09-28. Sửa kế hoạch lần 3 cùng ngày: tách "Gợi ý"/"Đã mời" + lưu điểm lúc mời (D6, D7) ⇒ thêm bước 2b — đã xong (migration bổ sung đã áp Neon). Bước 3 (service) xong cùng ngày, kéo luôn phần code của bước 5 (payload + template notification) vì service phụ thuộc. Bước 4 (controller + 6 route + cron) và bước 5 (đổi link RECEIVED sang `/job-invitations` + trigger thật), bước 6 (`tsc` sạch) xong cùng ngày ⇒ BACKEND HOÀN TẤT.** Frontend (`docs/05-frontend/phases/candidate-outreach/PLAN.md`, CO-1..CO-4) cũng xong cùng ngày, chủ dự án đã kiểm trên trình duyệt ⇒ KHỐI 3 (B3) HOÀN TẤT. Khối nặng nhất trong 3 khối — module hoàn toàn mới, chỉ tái dùng hạ tầng `job-matching`/`notifications`/`messaging`/pattern cron.

## Quyết định đã chốt

| # | Quyết định |
|---|---|
| D1 | (2026-09-27) Tìm ứng viên: SQL lọc thô (`isOpenToOutreach=true` + tiêu chí cứng) còn ~30–50 người, rồi **xếp hạng bằng hybrid** (`ScoringJobMatcher(HYBRID_WEIGHTS_V2)` + `MatchEmbeddingService.similarityForCandidates` có sẵn) — không dừng ở lọc SQL thuần. |
| D2 | (**Sửa 2026-09-28 — bỏ ẩn danh**) Cờ `isOpenToOutreach` nghĩa là **"cho phép NTD tìm thấy và xem hồ sơ của tôi"** (kiểu "Open to work"/"Cho phép NTD tìm kiếm" của LinkedIn/TopCV). Bật ⇒ NTD thấy tên, ảnh, tiêu đề, học vấn, kỹ năng, kinh nghiệm và mở được trang hồ sơ. **Luôn ẩn `phone` và `email`** chừng nào ứng viên chưa ứng tuyển tin của công ty đó — NTD liên hệ qua lời mời/hội thoại. Tắt ⇒ không ai tìm thấy. Chế độ ẩn danh dời sang "Hướng phát triển" của báo cáo. |
| D3 | (2026-09-27) Lời mời hết hạn sau **14 ngày**. |
| D4 | (**Sửa 2026-09-28**) Hạn mức gửi lời mời **theo gói Subscription, tính chung cho cả công ty** (khoá theo `companyId`, giống cách đếm hạn mức đăng tin) — không theo từng `employerId`. |
| D5 | (2026-09-27) Tên module: `candidate-outreach`. |
| D6 | (2026-09-28) **Tách 2 danh sách** theo từng tin: **"Gợi ý"** = top 10 người chưa bị chặn mời theo Q4 (lọc SQL + hybrid như D1); **"Đã mời"** = mọi lời mời của tin, mới nhất trước, **không chấm lại hybrid**. Gửi lời mời xong, thẻ chuyển từ "Gợi ý" sang "Đã mời"; "Gợi ý" không tự tìm lại (tránh tốn thêm một lượt hybrid) — người dùng bấm "Tìm lại" mới lấy người tiếp theo. |
| D7 | (2026-09-28) **Lưu điểm lúc gửi lời mời** (ảnh chụp, không phải điểm hiện tại): `matchScore` + `matchWeightsVersion` trên lời mời. Server **tự chấm lại riêng ứng viên đó** lúc mời (không nhận điểm từ client, không cache điểm của lượt tìm). UI ghi rõ "Điểm lúc gửi lời mời". Chỉ lưu điểm tổng + phiên bản trọng số, không lưu chi tiết thành phần. Dữ liệu này cũng dùng được cho báo cáo (tỉ lệ Accept theo khoảng điểm). |

**Vì sao bỏ ẩn danh (rà soát 2026-09-28):** giữ ẩn danh thì phải trả `candidateId` thật cho NTD để gửi lời mời, mà `MessagingService.createConversation` hiện cho NTD tạo hội thoại với bất kỳ `candidateId` nào cho tin của mình, và DTO hội thoại trả `email`/`avatarUrl` ứng viên (`messaging.mapper.ts`, `messaging.repository.ts`) ⇒ NTD lộ được danh tính mà không cần Accept. Vá đúng phải thêm mã tạm/ký thay `candidateId` hoặc sửa `messaging` — tốn công mà với khoá luận không đáng. Opt-in công khai giải quyết gốc vấn đề: người không bật thì không ai tìm thấy.

## Quy tắc nghiệp vụ Q1–Q5 — ĐÃ CHỐT (chủ dự án giữ nguyên đề xuất, 2026-09-28)

| # | Câu hỏi | Đã chốt |
|---|---|---|
| Q1 | Công ty `BLOCKED` (hết gói/hết trial/chưa xác minh) có được tìm/mời không? Công ty đang trial dùng hạn mức nào? | `BLOCKED` ⇒ 403 cả tìm lẫn mời. `TRIAL` ⇒ `DEFAULT_OUTREACH_DAILY_QUOTA`. |
| Q2 | Tìm ứng viên cho tin ở trạng thái nào? | Chỉ tin `PUBLISHED` (tin nháp/hết hạn/bị gỡ ⇒ 409). |
| Q3 | Tin hết hạn/bị gỡ thì lời mời `PENDING` của tin đó thế nào? | Sweep hằng giờ chuyển luôn sang `EXPIRED` (cùng lượt với lời mời quá `expiresAt`). |
| Q4 | Ứng viên đã `DECLINED` thì NTD có được mời lại cùng tin không? | **Không** — chặn nếu cùng cặp `(candidateId, jobPostId)` đã có lời mời `PENDING`/`ACCEPTED`/`DECLINED`; chỉ `EXPIRED` mới cho mời lại. |
| Q5 | Ứng viên tắt `isOpenToOutreach` thì lời mời đang chờ thế nào? | Lời mời `PENDING` vẫn giữ, ứng viên vẫn trả lời được; chỉ biến mất khỏi kết quả tìm và NTD mất quyền xem hồ sơ qua đường outreach (trừ khi đã `ACCEPTED` hoặc đã ứng tuyển). |

## Thay đổi cơ sở dữ liệu (1 migration, 4 thay đổi)

```prisma
model Candidate {
  // ... các trường hiện có giữ nguyên ...
  isOpenToOutreach    Boolean @default(false)
  outreachInvitations CandidateOutreachInvitation[]
}

enum OutreachInvitationStatus {
  PENDING
  ACCEPTED
  DECLINED
  EXPIRED
}

model CandidateOutreachInvitation {
  id          String                   @id @default(cuid())
  companyId   String                   // D4: đếm hạn mức theo công ty
  company     Company                  @relation(fields: [companyId], references: [id])
  employerId  String                   // NTD đã bấm gửi (để báo lại khi phản hồi)
  employer    Employer                 @relation(fields: [employerId], references: [id])
  jobPostId   String
  jobPost     JobPost                  @relation(fields: [jobPostId], references: [id])
  candidateId String
  candidate   Candidate                @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  status      OutreachInvitationStatus @default(PENDING)
  createdAt   DateTime                 @default(now())
  expiresAt   DateTime
  respondedAt DateTime?

  @@index([candidateId, jobPostId, status])
  @@index([companyId, createdAt])
  @@map("candidate_outreach_invitations")
}

// Quan hệ ngược bắt buộc của Prisma:
model Company  { outreachInvitations CandidateOutreachInvitation[] }
model Employer { outreachInvitations CandidateOutreachInvitation[] }
model JobPost  { outreachInvitations CandidateOutreachInvitation[] }

model SubscriptionPlan {
  // ... các trường hiện có giữ nguyên ...
  outreachInvitationDailyQuota Int? // null = dùng ngưỡng mặc định trong code, không phải "không giới hạn"
}

enum NotificationType {
  // ... các giá trị hiện có giữ nguyên ...
  CANDIDATE_OUTREACH_INVITATION_RECEIVED  // Candidate nhận lời mời
  CANDIDATE_OUTREACH_INVITATION_RESPONDED // Employer thấy phản hồi (accept/decline)
}
```

4 thay đổi: (1) cột `Candidate.isOpenToOutreach`; (2) enum + bảng `candidate_outreach_invitations`; (3) cột `SubscriptionPlan.outreachInvitationDailyQuota`; (4) 2 giá trị `NotificationType`. Quan hệ ngược ở `Company`/`Employer`/`JobPost` chỉ là khai báo Prisma, không sinh SQL.

- Additive hoàn toàn: `ADD COLUMN ... DEFAULT`, `CREATE TYPE`/`CREATE TABLE`, `ALTER TYPE ... ADD VALUE`. Không mất dữ liệu, không cần backfill.
- Quy trình: viết SQL tay → `prisma migrate diff --from-migrations ... --to-schema-datamodel` (shadow DB **tạm, không bao giờ dùng `DATABASE_URL`**) xác nhận khớp `schema.prisma` → **dừng, xin xác nhận** → chủ dự án tự `migrate deploy` lên Neon.
- Chặn lời mời trùng theo Q4 ở tầng service (không phải unique constraint DB, vì lịch sử `EXPIRED` vẫn phải giữ nhiều dòng).

### Migration bổ sung (D7, 2026-09-28)

Migration trên đã áp Neon ⇒ **không sửa file cũ**, thêm 1 migration mới (vd. `20260928150000_add_outreach_invitation_match_snapshot`):

```prisma
model CandidateOutreachInvitation {
  // ... giữ nguyên ...
  matchScore          Int?    // D7 — MatchResult.score (0..100) lúc gửi; null nếu lúc đó status ≠ SCORED
  matchWeightsVersion String? // D7 — MatchResult.weightsVersion lúc gửi (vd. "hybrid-v2"; "rule-v1" nếu semantic chưa sẵn)
}
```

- 2 `ADD COLUMN` nullable, không default — bảng đang rỗng, không cần backfill.
- (Thêm khi code 2b) `@@index([jobPostId, createdAt])` cho truy vấn "Đã mời" theo tin — 2 index hiện có đều không bắt đầu bằng `jobPostId`. File thật: `20260928150000_add_outreach_invitation_match_snapshot`.
- Cùng quy trình: SQL tay → `migrate diff` với Postgres tạm trong Docker → dừng xin xác nhận → chủ dự án tự `migrate deploy`.

## Tìm ứng viên — giai đoạn A (SQL lọc thô)

`candidate-outreach.repository.ts`, hàm `searchCandidatePool(jobPost, limit = 50)`:

- `Candidate.isOpenToOutreach = true`.
- Không có `Application` nào của candidate đó với `jobPostId` này.
- Không có lời mời bị chặn theo Q4 (`PENDING`/`ACCEPTED`/`DECLINED`) cho đúng cặp `(candidateId, jobPostId)` — những người này nằm ở danh sách "Đã mời" (D6). Chỉ có lời mời `EXPIRED` ⇒ vẫn vào pool (được mời lại). (Lịch sử: bước 2 từng code theo hướng giữ người đã mời trong pool vì PLAN cũ mâu thuẫn với `invitationStatus`; D6 giải quyết mâu thuẫn theo hướng loại ra — sửa ở bước 2b.)
- Có giao ít nhất 1 `CandidateSkill` với tập `skillId` (REQUIRED ∪ PREFERRED, chỉ `APPROVED`) của tin — join `CandidateSkill`, `GROUP BY candidateId`, **xếp theo số skill giao giảm dần** (để `LIMIT` không cắt mất người khớp nhất), `LIMIT 50`.
- Không lọc theo ngành/kinh nghiệm tối thiểu ở bước này (để hybrid ở giai đoạn B phản ánh qua điểm) — tránh loại oan người có kỹ năng tốt nhưng học trái ngành.

## Xếp hạng — giai đoạn B (tái dùng nguyên vẹn A2)

1. `JobMatchProfileLoader.load(jobPost)` (đã có).
2. `CandidateMatchProfileLoader.loadMany(candidateIds)` (đã có, 1 truy vấn).
3. `matchEmbeddingService.similarityForCandidates(jobTarget, candidateTargets, maxNewCandidates)` (đã có, đúng chiều).
4. `hybridJobMatcher.match(...)` (đăng ký ở `job-matching.routes.ts`, lấy qua container) cho từng ứng viên trong pool.
5. Sort giảm dần theo `score`, lấy top 10.

## DTO (D2 — công khai, ẩn liên hệ)

```ts
// Phần thẻ dùng chung cho cả 2 danh sách.
interface OutreachCandidateCardDto {
  candidateId: string;
  fullName: string | null;
  avatarUrl: string | null;
  headline: string | null;
  cityName: string | null;
  education: {                   // 1 dòng Education đại diện, xem dưới
    universityName: string | null;
    majorName: string | null;
    degree: string | null;
  } | null;
}

// Danh sách "Gợi ý" (D6).
interface CandidateSearchResultDto extends OutreachCandidateCardDto {
  match: MatchResult;            // tái dùng nguyên kiểu đã có
  previouslyInvitedExpired: boolean; // có lời mời cũ đã EXPIRED cho tin này — FE hiện nhãn "Lời mời trước đã hết hạn"
}

// Danh sách "Đã mời" (D6) — không chấm lại hybrid.
interface SentOutreachInvitationDto extends OutreachCandidateCardDto {
  invitationId: string;
  status: OutreachInvitationStatus;
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  matchScore: number | null;          // D7 — điểm lúc gửi
  matchWeightsVersion: string | null; // D7
  canViewProfile: boolean;            // theo bảng "Quyền xem hồ sơ" bên dưới (Q5)
}
```

- **Không** trả `phone`, `email`, `dateOfBirth` ở cả 2 DTO.
- `Candidate` không có cột trường/ngành — lấy từ bảng `Education` (1-n). Dòng đại diện: ưu tiên `isCurrent = true`, sau đó `endYear` lớn nhất, sau đó `createdAt` mới nhất; không có dòng nào ⇒ `null`.
- "Đã mời" liệt kê **mọi** lời mời của tin (kể cả `EXPIRED`; 1 ứng viên có thể có nhiều dòng nếu từng hết hạn rồi được mời lại). Ứng viên đã tắt `isOpenToOutreach` vẫn hiện tên/ảnh/trạng thái (NTD đã thấy lúc mời), chỉ `canViewProfile = false` nếu không còn đường truy cập nào khác.

## Chấm điểm lúc gửi lời mời (D7)

- Trong `invite`, sau khi qua mọi kiểm tra và **trước** khi tạo lời mời: chạy lại đúng pipeline giai đoạn B cho **1 ứng viên** (`load(jobPost)` + `loadMany([candidateId])` + `similarityForCandidates(..., maxNewCandidates = 1)` + `hybridJobMatcher.match`). Embedding thường đã có từ lượt tìm nên nhanh.
- Lưu `matchScore = result.score` (null nếu `status ≠ SCORED`), `matchWeightsVersion = result.weightsVersion`.
- Chấm lỗi (vd. embedding service lỗi) ⇒ **vẫn tạo lời mời**, 2 cột để `null`, ghi log — điểm chỉ là thông tin phụ, không được chặn luồng mời.

## Quyền xem hồ sơ ứng viên (sửa `candidates`)

`CandidateService.getEmployerCandidateProfile` hiện chỉ cho xem khi ứng viên **đã ứng tuyển** tin của công ty. Mở rộng điều kiện (additive, không đổi hành vi cũ):

| Đường truy cập | Được xem | `phone` / `email` |
|---|---|---|
| Đã ứng tuyển tin của công ty (hiện có) | Có | Hiện như cũ |
| Có lời mời `ACCEPTED` của công ty | Có | Ẩn `phone`; `email` hiện (hội thoại vốn đã lộ email) |
| `isOpenToOutreach = true` (chưa có 2 điều kiện trên) | Có | Ẩn cả hai |
| Không thoả điều nào | 403 như cũ | — |

## Rate-limit gửi lời mời (D4)

`CandidateOutreachRateLimitService`:

- Cùng khuôn "kiểm trước/tăng sau" bằng Redis như `RequirementExtractionRateLimitService`, khoá `candidate-outreach-quota:company:{companyId}:day:{YYYY-MM-DD UTC}`.
- **Ngưỡng lấy động** qua `SubscriptionsService.getCompanySubscriptionAccess(company)`: `SUBSCRIBED` ⇒ `plan.outreachInvitationDailyQuota ?? DEFAULT_OUTREACH_DAILY_QUOTA`; `TRIAL` ⇒ `DEFAULT_OUTREACH_DAILY_QUOTA`; `BLOCKED` ⇒ 403 (Q1). `DEFAULT_OUTREACH_DAILY_QUOTA = 3` đặt trong `candidate-outreach.config.ts` (không phải env).
- Hiện `SubscriptionAccessStatus.subscription` chỉ là summary — cần kiểm tra summary có mang `planId`/quota không; nếu không, lấy thêm `plan` qua `companySubscriptionRepository.findActiveByCompany` (đã `include: plan`), không sửa DTO của module `subscriptions`.

## API

| Method | Đường dẫn | Guard | Trả về | Ghi chú |
|---|---|---|---|---|
| GET | `/employer/job-posts/:jobId/candidate-search` | Employer (chủ tin — `jobPost.employerId`) | `CandidateSearchResultDto[]` (≤10) | Danh sách "Gợi ý" (D6). Chạy toàn bộ A+B mỗi lần gọi, không cache. Tin phải `PUBLISHED` (Q2), công ty không `BLOCKED` (Q1). |
| GET | `/employer/job-posts/:jobId/invitations` | Employer (chủ tin) | `SentOutreachInvitationDto[]` | Danh sách "Đã mời" (D6), mới nhất trước, không phân trang (số lời mời/tin bị chặn trên bởi hạn mức/ngày). **Chỉ đọc ⇒ không** yêu cầu tin `PUBLISHED` hay công ty khác `BLOCKED` — xem lại lịch sử của tin đã hết hạn vẫn được. |
| POST | `/employer/job-posts/:jobId/candidates/:candidateId/invitations` | Employer (chủ tin) | `SentOutreachInvitationDto` | Kiểm: tin `PUBLISHED`, `isOpenToOutreach`, chưa ứng tuyển, không bị chặn theo Q4, hạn mức công ty (D4); chấm điểm 1 ứng viên (D7); tạo `PENDING`, `expiresAt = now + 14 ngày`; bắn `CANDIDATE_OUTREACH_INVITATION_RECEIVED` cho Candidate. Trả đúng DTO của "Đã mời" để FE chèn thẳng vào danh sách đó. |
| GET | `/candidate/outreach-invitations` | Candidate | `CandidateOutreachInvitationDto[]` | `PENDING` + lịch sử, kèm tên công ty/tin; `ACCEPTED` kèm `conversationId`. |
| POST | `/candidate/outreach-invitations/:id/respond` | Candidate (chủ lời mời) | `{ status, conversationId? }` | Body `action: "ACCEPT" \| "DECLINE"`; chỉ khi đang `PENDING` (khác ⇒ 409). `ACCEPT` ⇒ `ACCEPTED`, gọi `messagingService.createConversation(candidateUserId, "CANDIDATE", jobPostId)` (luồng Candidate tự lấy `candidateId` từ `userId`, hàm đã trả hội thoại cũ nếu có), bắn `CANDIDATE_OUTREACH_INVITATION_RESPONDED` cho Employer đã gửi. `DECLINE` ⇒ `DECLINED`, bắn cùng loại thông báo (nội dung khác). |
| PATCH | `/candidate/outreach-settings` | Candidate | `{ isOpenToOutreach }` | Chỉ ghi đúng 1 cột này. |

`isOpenToOutreach` cũng phải có trong response `GET /candidates/me` để FE hiển thị toggle (thêm 1 field vào DTO hiện có, additive).

Lỗi dùng chung: 404 tin/lời mời không tồn tại hoặc không thuộc quyền; 409 trùng lời mời (Q4) / đã ứng tuyển / tin không `PUBLISHED` / lời mời không còn `PENDING`; 429 vượt hạn mức; 403 ứng viên tắt `isOpenToOutreach` hoặc công ty `BLOCKED`.

## Link notification (chốt 2026-09-28)

| Loại | Người nhận | `link` | Email |
|---|---|---|---|
| `CANDIDATE_OUTREACH_INVITATION_RECEIVED` | Candidate | `/job-invitations` — trang riêng "Lời mời ứng tuyển" (chủ dự án chọn phương án trang riêng; frontend PLAN quyết định 4) | Có, nút "Xem lời mời" trỏ cùng link |
| `CANDIDATE_OUTREACH_INVITATION_RESPONDED` | Employer đã gửi | `/employer/jobs/:jobPostId/candidate-search` (tab "Đã mời") | Không |

`link` được lưu cố định vào từng notification lúc tạo, không render lại ⇒ phải đúng trước khi có dữ liệu thật. Đã đổi trong code ở bước 5, trước khi có bất kỳ notification loại này nào trong DB (mọi test đều rollback).

## Sweep hết hạn

`candidate-outreach-expiry.job.ts` — cùng khuôn `job-post-expiry.job.ts`, `cron.schedule("0 * * * *")`:

- `PENDING` và `expiresAt < now()` ⇒ `EXPIRED`.
- `PENDING` của tin không còn `PUBLISHED` ⇒ `EXPIRED` (Q3).

## Cấu trúc file mới

```text
apps/server/src/modules/candidate-outreach/
├─ candidate-outreach.types.ts
├─ candidate-outreach.config.ts        # PREFILTER_LIMIT=50, TOP_RESULT_COUNT=10, INVITATION_EXPIRY_DAYS=14, DEFAULT_OUTREACH_DAILY_QUOTA=3
├─ candidate-outreach.repository.ts    # searchCandidatePool, listForJobPost, invitation CRUD, expireOverdue
├─ candidate-outreach-rate-limit.service.ts
├─ candidate-outreach.mapper.ts        # → CandidateSearchResultDto / SentOutreachInvitationDto / CandidateOutreachInvitationDto
├─ candidate-outreach.service.ts
├─ candidate-outreach.controller.ts
├─ candidate-outreach.routes.ts
└─ candidate-outreach-expiry.job.ts
```

Sửa thêm (additive, không đổi hành vi cũ):

- `notifications/notification.types.ts` + `templates/notification-templates.ts` (2 khoá mới).
- `packages/shared-types` (`OutreachCandidateCardDto`, `CandidateSearchResultDto`, `SentOutreachInvitationDto`, `CandidateOutreachInvitationDto`, `OutreachInvitationStatus`; thêm `isOpenToOutreach` vào DTO hồ sơ Candidate).
- `candidates/candidate.service.ts` — mở rộng `getEmployerCandidateProfile` theo bảng quyền ở trên; thêm `isOpenToOutreach` vào `me`.
- `main.ts` — mount router (sau `jobMatchingRouter`, vì cần `hybridJobMatcher`/loader đăng ký ở đó) + `startCandidateOutreachExpiryJob` cạnh `startJobPostExpiryJob`.

Không sửa `applications`, `messaging`, `subscriptions`.

## Các bước thực hiện

1. **Migration** (4 thay đổi gộp 1 file) — viết tay, `migrate diff` với shadow DB tạm, dừng xin xác nhận ⇒ chủ dự án áp Neon.
2. **Repository (search pool + invitation CRUD + expireOverdue)**. *Test:* script tạm gọi `searchCandidatePool` với 1 tin thật, kiểm loại đúng người đã ứng tuyển / bị chặn theo Q4 / chưa bật `isOpenToOutreach`.
   - **2b (thêm 2026-09-28 theo D6/D7):** migration bổ sung `matchScore`/`matchWeightsVersion` (dừng xin xác nhận ⇒ chủ dự án áp Neon); `searchCandidatePool` thêm `NOT EXISTS` lời mời chặn theo Q4; `findLatestInvitationStatuses` đổi thành `findExpiredInvitedCandidateIds` (chỉ cần biết ai từng có lời mời `EXPIRED`); thêm `listForJobPost(jobPostId)`; `create` nhận thêm 2 cột điểm. *Test:* script rollback như bước 2 — người `PENDING`/`ACCEPTED`/`DECLINED` không vào pool, chỉ `EXPIRED` vào pool; `listForJobPost` mới nhất trước, gồm cả `EXPIRED`; `create` lưu đúng 2 cột điểm.
3. **Service (search + listSent + invite + respond + settings) + rate-limit + mapper + mở rộng quyền xem hồ sơ**. *Test:* mời thành công, lời mời có `matchScore` khớp điểm lúc tìm (sai lệch chỉ khi hồ sơ vừa đổi); giả lập lỗi chấm điểm ⇒ vẫn mời được, điểm `null`; người vừa mời biến khỏi "Gợi ý", có trong "Đã mời"; mời trùng / mời lại sau `DECLINED` ⇒ 409; mời khi tắt `isOpenToOutreach` ⇒ 403; 2 NTD cùng công ty dùng chung hạn mức, vượt ⇒ 429; accept ⇒ có `Conversation` (`messagingRepository.findConversationByCandidateAndJobPost`); ứng viên tắt cờ sau khi được mời ⇒ vẫn trong "Đã mời", `canViewProfile = false`; kết quả tìm, "Đã mời" và hồ sơ xem qua outreach không có `phone`/`email`.
4. **Controller + 6 route + awilix + mount `main.ts` + cron job**.
5. **2 template notification mới** — (code template đã làm cùng bước 3) đổi link `CANDIDATE_OUTREACH_INVITATION_RECEIVED` từ `/profile` sang `/job-invitations` (cả `link` in-app lẫn nút "Xem lời mời" trong email); trigger thật, xem `title`/`body`/`link` hợp lý, email escape đúng tên công ty/tin.
6. `tsc` sạch cho `apps/server`, `packages/shared-types`.

## Ngoài phạm vi

- Chế độ ẩn danh (ẩn tên/ảnh tới khi Accept) — ghi vào "Hướng phát triển" của báo cáo, kèm lý do ở trên.
- Employer tự chỉnh `outreachInvitationDailyQuota` qua UI (chỉ Admin sửa qua seed/DB ở bản đầu).
- Candidate chặn một Employer cụ thể (chỉ có Accept/Decline từng lời mời).
- Thông báo hàng loạt/digest.
- Employer xem lịch sử lời mời **gộp mọi tin** của công ty (chỉ có "Đã mời" theo từng tin — D6).
- Chấm lại điểm hiện tại cho danh sách "Đã mời" (chỉ hiện điểm lúc gửi — D7).
- Vá lỗ `createConversation` cho NTD với `candidateId` bất kỳ (có từ trước, ngoài phạm vi B3 — ghi nhận để xử lý riêng).

## Ghi chú triển khai

- (2026-09-28) **Bước 1:** `prisma/migrations/20260928120000_add_candidate_outreach/migration.sql` viết tay, `migrate diff` với Postgres tạm trong Docker (`pgvector/pgvector:pg16`, xoá ngay sau) ⇒ khớp tuyệt đối `schema.prisma`. Chủ dự án đã áp Neon (`migrate status`: up to date). `tsc` server tạm còn 6 lỗi ở `notifications` vì 2 `NotificationType` mới chưa có template/payload — hết ở bước 5.
- (2026-09-28) **Bước 2:** `candidate-outreach.config.ts` (hằng số + `BLOCKING_INVITATION_STATUSES`) và `candidate-outreach.repository.ts`:
  - `searchCandidatePool(jobPostId, limit)` — 1 câu `$queryRaw` (join `candidate_skills`/`job_post_skills`/`skills` APPROVED/`candidates` bật cờ, `NOT EXISTS applications` mọi trạng thái kể cả `CANCELLED`). Bản này **giữ** người đã mời trong pool — sẽ đổi ở bước 2b theo D6.
  - `findSearchCards(ids)` — giữ thứ tự id, chỉ select trường hiển thị (không `phone`/`email`/`dateOfBirth`), học vấn đại diện qua `orderBy isCurrent desc, endYear desc nulls last, createdAt desc` + `take: 1`.
  - `findLatestInvitationStatuses`, `findCandidateForInvite`, `hasApplied`, `hasBlockingInvitation` (Q4), `create`, `findById`, `listForCandidate`, `findConversationIdsByJobPost`, `findCandidateIdByUserId`, `updateOpenToOutreach`.
  - `respondIfPending(id, status)` — `updateMany` có điều kiện `status = PENDING AND expiresAt > now` trong 1 câu ⇒ 2 lần trả lời đồng thời / chạy đua với sweep chỉ 1 bên thắng; trả `false` ⇒ service trả 409.
  - `expireOverdue()` — `PENDING` và (`expiresAt <= now` HOẶC tin không còn `PUBLISHED`) ⇒ `EXPIRED` (gộp Q3 vào cùng 1 câu).
  - **Test:** script tạm chạy trên Neon trong 1 transaction rồi rollback (kiểm lại sau: 0 lời mời, 0 ứng viên bật cờ) — 25/25 PASS: pool rỗng khi chưa ai bật; pool = người giao skill trừ người đã ứng tuyển; tắt cờ ⇒ biến mất; thẻ không có liên hệ; Q4 chặn PENDING/DECLINED, EXPIRED cho mời lại; trả lời 2 lần / trả lời lời mời quá hạn ⇒ thất bại; sweep hết hạn + Q3. Hạn chế: tin dùng để test chỉ có 1 skill nên phép thử thứ tự "số skill giao giảm dần" chưa phân biệt được. Script đã xoá.

- (2026-09-28) **Bước 2b:**
  - Migration `20260928150000_add_outreach_invitation_match_snapshot` (2 cột + index `jobPostId, createdAt`), `migrate diff` với Postgres tạm trong Docker ⇒ khớp tuyệt đối; chủ dự án đã áp Neon.
  - `searchCandidatePool` thêm `NOT EXISTS` lời mời `PENDING`/`ACCEPTED`/`DECLINED` của tin (so `status::text` với `BLOCKING_INVITATION_STATUSES` — tham số raw là text, không so trực tiếp với enum được).
  - `findLatestInvitationStatuses` → `findExpiredInvitedCandidateIds` (trả `Set`); thêm `listForJobPost`; `CreateInvitationData` thêm `matchScore`/`matchWeightsVersion` (bắt buộc truyền, `null` khi không chấm được).
  - **Test:** script rollback trên Neon (trước/sau: 0 lời mời, 0 bật cờ) — 20/20 PASS, trên 1 tin 5 skill/12 ứng viên: pool đúng 12; thứ tự số skill giao `5,3,3,2,1,…` (lần này đã phân biệt được); PENDING/ACCEPTED/DECLINED rời pool, EXPIRED và chưa mời ở lại; mời lại người EXPIRED ⇒ rời pool; `listForJobPost` đủ 5 dòng kể cả EXPIRED, mới nhất trước, kèm điểm; lưu đúng điểm/`null`. Tin lần này không có người ứng tuyển — ca "loại người đã ứng tuyển" đã PASS ở test bước 2. Script đã xoá.

- (2026-09-28) **Bước 3:**
  - File mới: `candidate-outreach-rate-limit.service.ts` (khoá Redis theo `companyId`, ngưỡng do service truyền vào), `candidate-outreach.mapper.ts`, `candidate-outreach.service.ts` (`searchCandidates`, `listSentInvitations`, `invite`, `listForCandidate`, `respond`, `updateSettings`).
  - Repository thêm: `findEmployerByUserId`, `findJobPost`, `findProfileAccessibleCandidateIds` (3 đường truy cập hồ sơ, 1 truy vấn cho cả danh sách "Đã mời"); `create`/`respondIfPending` nhận `db` tuỳ chọn để chạy trong transaction.
  - **Chấm điểm theo đúng quy tắc của `JobMatchingService`** (không chỉ `hybridJobMatcher`): `JOB_MATCHER_MODE=rule` ⇒ rule-v1; hybrid mà thiếu cosine ⇒ rule-v1 + semantic PENDING. Nhờ vậy điểm ở "Gợi ý" khớp điểm NTD thấy ở danh sách đơn.
  - Tạo lời mời + notification trong **1 transaction** (AD-8); `respond`: `respondIfPending` + notification trong transaction, `createConversation` chạy sau (lỗi ⇒ log, trả `conversationId: null`, không hoàn tác Accept — Candidate vẫn tự mở hội thoại từ tin được). `respond` chặn thêm tin không còn `PUBLISHED` (Q3, trước khi sweep chạy).
  - Mapper hiển thị `PENDING` đã quá hạn / tin không còn `PUBLISHED` là `EXPIRED` ngay (sweep chỉ chạy mỗi giờ).
  - `getEmployerCandidateProfile` mở rộng theo bảng quyền (ACCEPTED ⇒ `phone: null`; `isOpenToOutreach` ⇒ `phone: null`, `user.email: null`); đường "đã ứng tuyển" giữ nguyên.
  - `/candidates/me` **không cần sửa**: repository dùng `include` nên đã trả mọi cột scalar, kể cả `isOpenToOutreach`. `packages/shared-types` không có DTO hồ sơ Candidate để thêm field.
  - **Kéo phần code bước 5 lên:** 2 payload trong `notification.types.ts`, 2 template (RECEIVED có email, escape tên công ty/tin; RESPONDED không email — NTD theo dõi ở "Đã mời"), `NotificationType` + DTO outreach trong `shared-types` ⇒ `tsc` server/web/shared-types sạch (hết 6 lỗi `notifications`). Link: Candidate `/profile` (tạm — **đã đổi sang `/job-invitations` ở bước 5**), Employer `/employer/jobs/:id/candidate-search`. Bước 5 còn lại: đổi link Candidate + trigger qua API thật.
  - Hạn chế đã biết (chấp nhận cho khoá luận): 2 request mời cùng cặp gửi đúng cùng lúc có thể tạo 2 lời mời (kiểm rồi tạo, không có unique constraint vì phải giữ lịch sử `EXPIRED`); hạn mức kiểm trước/tăng sau có thể vượt 1 lượt khi gửi đồng thời; `PENDING` quá hạn mà sweep chưa chạy vẫn chặn mời lại tối đa 1 giờ.
  - Lưu ý bước 4: service resolve `subscriptionsService` (kéo theo `paymentsService`), `messagingService`, `notificationsService`, `hybridJobMatcher`/loader ⇒ router phải mount sau các router đăng ký chúng (sau `jobMatchingRouter` là đủ; `messagingService`/`notificationsService` resolve lúc request nên thứ tự mount không ảnh hưởng).
  - **Test:** script tạm dựng container thật (Redis giả trong bộ nhớ, realtime no-op), chạy trong 1 transaction trên Neon rồi rollback (số dòng invitations/notifications/outbox/conversations/employers/jobPosts/bật cờ trước = sau) — **50/50 PASS**, trên tin 9 skill/1 đơn: Gợi ý 10 người, điểm giảm dần `48,25,22,…`, `hybrid-v2`, loại người đã ứng tuyển, không có `phone`/`email`/`dateOfBirth`; mời ⇒ `matchScore` 48 khớp điểm lúc tìm, hết hạn đúng 14 ngày, notification + email outbox (tên công ty `<b>"…"</b> &` đã escape); người vừa mời rời Gợi ý, vào Đã mời; 409 mời trùng/đã ứng tuyển/mời lại sau DECLINED; 403 tắt cờ / công ty BLOCKED; 404 tin của NTD khác; lỗi chấm điểm giả lập ⇒ vẫn mời, điểm `null`; NTD thứ 2 cùng công ty dùng chung hạn mức (mặc định 3 ⇒ lượt 4 bị 429; gói đặt 5 ⇒ lượt 4 được); Accept ⇒ có `Conversation` + notification cho NTD, trả lời lần 2 ⇒ 409; tắt cờ sau khi mời ⇒ vẫn ở Đã mời, `canViewProfile` false (PENDING) / true (ACCEPTED); 3 đường xem hồ sơ đúng bảng quyền; quá hạn/tin CLOSED ⇒ hiển thị EXPIRED, trả lời ⇒ 409, EXPIRED quay lại Gợi ý kèm nhãn. Script đã xoá.

- (2026-09-28) **Bước 4:**
  - File mới: `candidate-outreach.dto.ts` (zod cho body `respond` và `outreach-settings` — theo quy ước `*.dto.ts` của repo; **không** tạo `candidate-outreach.types.ts` như cây file dự kiến vì mọi kiểu đã nằm ở `shared-types`/repository), `candidate-outreach.controller.ts`, `candidate-outreach.routes.ts` (`candidateOutreachRouter` đăng ký repository/rate-limit/service/controller vào awilix), `candidate-outreach-expiry.job.ts` (`runCandidateOutreachExpirySweep` + `startCandidateOutreachExpiryJob`, `"0 * * * *"`, gọi `expireOverdue()`).
  - `main.ts`: mount ngay sau `candidateInsightsRouter` (tức sau `jobMatchingRouter`); cron khởi động cạnh `startJobPostExpiryJob`.
  - `POST .../invitations` trả **201**; route param không validate riêng (id là cuid dạng text ⇒ id sai chỉ ra 404).
  - **Test:** script tạm dựng app Express với container thật (Redis giả, realtime no-op), gọi qua HTTP thật, mọi ghi trong 1 transaction trên Neon rồi rollback (số dòng invitations/notifications/outbox/conversations/bật cờ trước = sau) — **32/32 PASS**: 401 không token, 403 sai vai trò 2 chiều, 404 NTD công ty khác; Gợi ý 10 người (`48,25,22,…`), không lộ liên hệ; mời 201 + điểm khớp, trùng 409, candidateId sai 404; rời Gợi ý/vào Đã mời; notification RECEIVED (link vẫn `/profile` — đổi ở bước 5); list Candidate; body `respond` sai/thiếu 400; trả lời lời mời người khác 404; ACCEPT 200 + `conversationId`, lần 2 409, NTD nhận RESPONDED, list Candidate kèm `conversationId`; DECLINE 200 `conversationId: null`; hạn mức mặc định 3 ⇒ lượt 4 bị 429; PATCH settings body sai 400, tắt cờ 200 và `/candidates/me` phản ánh; sweep hạ PENDING quá hạn ⇒ EXPIRED. Script đã xoá. Chưa khởi động server thật (`npm run dev:server`) — chỉ kiểm qua `tsc` + app dựng cùng thứ tự router.

- (2026-09-28) **Bước 5 + 6:**
  - `notification-templates.ts`: link `CANDIDATE_OUTREACH_INVITATION_RECEIVED` `/profile` → `/job-invitations` (1 biến `link` dùng chung cho in-app và nút "Xem lời mời" trong email).
  - **Trigger thật qua HTTP** (cùng khuôn test bước 4, rollback; tên công ty/tin được đổi tạm trong transaction thành chuỗi có `<b>`, `<script>`, `&`, `"`) — **16/16 PASS**:
    - RECEIVED: title "Bạn nhận được lời mời ứng tuyển", body có tên công ty + tin + hạn (14 ngày, định dạng `dd/mm/yyyy` giờ VN), `link = /job-invitations`; có trong `GET /notifications` của Candidate; outbox có email, nút trỏ `{WEB_URL}/job-invitations`, HTML đã escape (`&lt;script&gt;`, `&amp;`, `&quot;`), không còn thẻ thô.
    - RESPONDED: ACCEPT/DECLINE ra đúng tiêu đề, `link = /employer/jobs/:id/candidate-search`, không tạo email; tên ứng viên `null` ⇒ body mở đầu "Ứng viên"; có trong `GET /notifications` của NTD.
  - Ghi nhận: `title`/`body` in-app lưu dạng text thô (không escape) như các template cũ — an toàn vì `apps/web` không dùng `dangerouslySetInnerHTML` (React tự escape); FE outreach phải giữ nguyên quy tắc này. `subject` email chứa ký tự đặc biệt thô là bình thường (header text, không render HTML).
  - **Bước 6:** `tsc --noEmit` sạch cho `apps/server` và `packages/shared-types`. Script tạm đã xoá.

## Phần ghi chú của chủ dự án

*(để trống)*
