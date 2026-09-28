# Tìm & mời ứng viên chưa ứng tuyển (B3) — Backend

Quyết định kiến trúc: `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-15. Bản nháp lập luận đầy đủ (đối chiếu TopCV/ITviec): `docs/temp/AI_A1_A3_A4_B2_B3_MERGE_NOTES.md` (không commit).

Song song: `docs/05-frontend/phases/candidate-outreach/PLAN.md`.

**Trạng thái: MỚI LẬP KẾ HOẠCH (2026-09-27), CHƯA TRIỂN KHAI.** Khối nặng nhất trong 3 khối — module hoàn toàn mới, không tái dùng file code có sẵn (chỉ tái dùng hạ tầng `job-matching`/`notifications`/pattern cron).

## Quyết định đã chốt (chủ dự án chọn 2026-09-27)

| # | Quyết định |
|---|---|
| D1 | Tìm ứng viên: SQL lọc thô (`isOpenToOutreach=true` + tiêu chí cứng) còn ~30–50 người, rồi **xếp hạng bằng hybrid** (`ScoringJobMatcher(HYBRID_WEIGHTS_V2)` + `MatchEmbeddingService.similarityForCandidates` có sẵn) — không dừng ở lọc SQL thuần. |
| D2 | Ẩn danh **tối thiểu**: `fullName`, `phone`, `avatarUrl` (email vốn không lộ). **Vẫn hiện tên trường đại học.** |
| D3 | Lời mời hết hạn sau **14 ngày**. |
| D4 | Rate-limit gửi lời mời **theo gói Subscription** (không phải ngưỡng Redis cố định như GĐ3 Job Matcher). |
| D5 | Tên module: `candidate-outreach`. |

**Lưu ý so với bản nháp gốc:** D4 (theo Subscription) kéo theo **3 thay đổi schema**, không phải 2 như ước tính ban đầu — xem mục Migration.

## Thay đổi cơ sở dữ liệu (1 migration, nhiều statement)

```prisma
model Candidate {
  // ... các trường hiện có giữ nguyên ...
  isOpenToOutreach Boolean @default(false)
  outreachInvitations CandidateOutreachInvitation[]
}

enum OutreachInvitationStatus {
  PENDING
  ACCEPTED
  DECLINED
  EXPIRED
}

model CandidateOutreachInvitation {
  id           String   @id @default(cuid())
  employerId   String
  employer     Employer @relation(fields: [employerId], references: [id])
  jobPostId    String
  jobPost      JobPost  @relation(fields: [jobPostId], references: [id])
  candidateId  String
  candidate    Candidate @relation(fields: [candidateId], references: [id])
  status       OutreachInvitationStatus @default(PENDING)
  createdAt    DateTime @default(now())
  expiresAt    DateTime
  respondedAt  DateTime?

  @@index([candidateId, jobPostId, status])
  @@map("candidate_outreach_invitations")
}

model SubscriptionPlan {
  // ... các trường hiện có giữ nguyên ...
  outreachInvitationDailyQuota Int? // null = dùng ngưỡng mặc định trong code, không phải "không giới hạn"
}

enum NotificationType {
  // ... các giá trị hiện có giữ nguyên ...
  CANDIDATE_OUTREACH_INVITATION_RECEIVED   // Candidate nhận lời mời
  CANDIDATE_OUTREACH_INVITATION_RESPONDED  // Employer thấy phản hồi (accept/decline)
}
```

- Additive hoàn toàn: `ADD COLUMN ... DEFAULT`, `CREATE TABLE`, `ALTER TYPE ... ADD VALUE`. Không mất dữ liệu, không cần backfill (`outreachInvitationDailyQuota = null` cho mọi gói hiện có, code tự áp ngưỡng mặc định).
- Quy trình: viết SQL tay → `prisma migrate diff --from-migrations ... --to-schema-datamodel` xác nhận khớp `schema.prisma` → **dừng, xin xác nhận** → mới `migrate deploy` lên Neon.
- Không cho tạo `CandidateOutreachInvitation` mới nếu đã tồn tại 1 dòng `PENDING` cùng `(candidateId, jobPostId)` — kiểm ở tầng service (không phải unique constraint DB, vì lịch sử `DECLINED`/`EXPIRED` vẫn phải giữ lại).

## Tìm ứng viên — giai đoạn A (SQL lọc thô)

`candidate-outreach.repository.ts`, hàm `searchCandidatePool(jobPost, limit = 50)`:

- `Candidate.isOpenToOutreach = true`.
- Không có `Application` nào của candidate đó với `jobPostId` này.
- Không có `CandidateOutreachInvitation` trạng thái `PENDING` cho đúng cặp `(candidateId, jobPostId)`.
- Có giao ít nhất 1 `CandidateSkill` với tập `skillId` (REQUIRED ∪ PREFERRED, chỉ `APPROVED`) của tin — join `CandidateSkill`, `GROUP BY candidateId`, `LIMIT 50`.
- Không lọc theo `major`/kinh nghiệm tối thiểu ở bước này (để hybrid ở giai đoạn B tự phản ánh qua điểm) — tránh loại oan người có kỹ năng tốt nhưng học trái ngành.

## Xếp hạng — giai đoạn B (tái dùng nguyên vẹn A2)

1. `JobMatchProfileLoader.load(jobPost)` (đã có).
2. `CandidateMatchProfileLoader.loadMany(candidateIds)` (đã có, 1 truy vấn).
3. `matchEmbeddingService.similarityForCandidates(jobTarget, candidateTargets, maxNewCandidates)` (đã có, đúng chiều, không cần method mới — khác AD-14 phải thêm method đối xứng).
4. `hybridJobMatcher.match(...)` (đã đăng ký awilix ở `job-matching.routes.ts`, tái dùng qua container) cho từng ứng viên trong pool.
5. Sort giảm dần theo `score`, lấy top 10.

## Ẩn danh (DTO)

`AnonymizedCandidateMatchDto`:

```ts
interface AnonymizedCandidateMatchDto {
  candidateId: string;          // dùng để gửi lời mời, KHÔNG hiển thị trực tiếp trên UI
  displayLabel: string;         // "Ứng viên phù hợp #1" — sinh ở server, không phải fullName
  universityName: string | null; // D2: vẫn hiện
  majorName: string | null;
  degree: string | null;
  match: MatchResult;           // tái dùng nguyên kiểu đã có (skills/experience/score/confidence)
  alreadyInvited: boolean;      // có lời mời PENDING/ACCEPTED cho tin này chưa (để FE disable nút)
}
```

Không trả `fullName`, `phone`, `avatarUrl`, `email` (vốn không có ở luồng này). Sau khi Candidate `ACCEPTED`, Employer xem qua hội thoại/đơn như bình thường (danh tính lộ tự nhiên ở đó, không qua DTO này).

## Rate-limit gửi lời mời (D4)

`CandidateOutreachRateLimitService`:

- Cùng khuôn "kiểm trước/tăng sau" bằng Redis (`RequirementExtractionRateLimitService`), khoá theo `employerId` + ngày UTC.
- **Ngưỡng lấy động**: `plan.outreachInvitationDailyQuota` của gói `CompanySubscription` đang active (qua `SubscriptionsService`, tái dùng cách lấy gói hiện có kiểu `getCompanySubscriptionAccess`); nếu không có gói active hoặc `outreachInvitationDailyQuota = null` ⇒ dùng hằng số mặc định trong code (`DEFAULT_OUTREACH_DAILY_QUOTA = 3`, đặt ở `candidate-outreach.config.ts`, không phải env — nhất quán với cách `RULE_WEIGHTS_V1` đặt trong code).

## API

| Method | Đường dẫn | Guard | Trả về | Ghi chú |
|---|---|---|---|---|
| GET | `/employer/job-posts/:jobId/candidate-search` | Employer (chủ tin) | `AnonymizedCandidateMatchDto[]` (≤10) | Chạy toàn bộ giai đoạn A+B mỗi lần gọi (không cache — chi phí tương đương `listApplicationMatches`, tần suất dùng thấp) |
| POST | `/employer/job-posts/:jobId/candidates/:candidateId/invitations` | Employer (chủ tin) | `{ id, status, expiresAt }` | Kiểm: `isOpenToOutreach`, chưa ứng tuyển, chưa có `PENDING` trùng cặp, rate-limit theo D4; tạo `PENDING`, `expiresAt = now + 14 ngày`; bắn `NotificationType.CANDIDATE_OUTREACH_INVITATION_RECEIVED` cho Candidate |
| GET | `/candidate/outreach-invitations` | Candidate | `CandidateOutreachInvitationDto[]` | Cả `PENDING` và lịch sử, kèm tên công ty/tin (không ẩn danh phía này — Candidate luôn thấy ai mời mình) |
| POST | `/candidate/outreach-invitations/:id/respond` | Candidate (chủ lời mời) | `{ status }` | `action: "ACCEPT" \| "DECLINE"`; `ACCEPT` ⇒ set `ACCEPTED`, gọi `messagingService.createConversation(employerUserId, "EMPLOYER", jobPostId, candidateId)`, bắn `CANDIDATE_OUTREACH_INVITATION_RESPONDED` cho Employer; `DECLINE` ⇒ set `DECLINED`, bắn thông báo tương tự (payload khác) |
| PATCH | `/candidate/outreach-settings` | Candidate | `{ isOpenToOutreach }` | Chỉ ghi đúng 1 cột này, không đụng các trường khác của `Candidate` |

Lỗi dùng chung: 404 tin/lời mời không tồn tại hoặc không thuộc quyền; 409 nếu đã có `PENDING` trùng cặp hoặc candidate đã ứng tuyển tin đó; 429 khi vượt rate-limit; 403 nếu `isOpenToOutreach = false` (Employer cố mời candidateId không hợp lệ — chặn ở service dù FE không cho chọn tới).

## Sweep hết hạn

`candidate-outreach-expiry.job.ts` — cùng khuôn `job-post-expiry.job.ts`:

```ts
cron.schedule("0 * * * *", () => {
  // UPDATE candidate_outreach_invitations SET status='EXPIRED'
  // WHERE status='PENDING' AND expiresAt < now()
});
```

## Cấu trúc file mới

```text
apps/server/src/modules/candidate-outreach/
├─ candidate-outreach.types.ts
├─ candidate-outreach.config.ts        # PREFILTER_LIMIT=50, TOP_RESULT_COUNT=10, INVITATION_EXPIRY_DAYS=14, DEFAULT_OUTREACH_DAILY_QUOTA=3
├─ candidate-outreach.repository.ts    # searchCandidatePool, invitation CRUD, expireOverdue
├─ candidate-outreach-rate-limit.service.ts
├─ candidate-outreach.mapper.ts        # → AnonymizedCandidateMatchDto / CandidateOutreachInvitationDto
├─ candidate-outreach.service.ts
├─ candidate-outreach.controller.ts
├─ candidate-outreach.routes.ts
└─ candidate-outreach-expiry.job.ts
```

Sửa thêm (additive, không đổi hành vi cũ): `notifications/notification.types.ts` + `templates/notification-templates.ts` (2 khoá mới); `packages/shared-types` (`AnonymizedCandidateMatchDto`, `CandidateOutreachInvitationDto`); `main.ts` (mount router + `startCandidateOutreachExpiryJob`, cùng chỗ mount `startJobPostExpiryJob`).

Không sửa `applications`, `messaging`, `candidates` (chỉ thêm cột qua migration).

## Các bước thực hiện

1. **Migration** (4 thay đổi schema gộp 1 file) — viết tay, `migrate diff`, dừng xin xác nhận → áp Neon.
2. **Repository (search pool + invitation CRUD + expireOverdue)**. *Test:* script tạm gọi `searchCandidatePool` với 1 tin thật, kiểm loại đúng người đã ứng tuyển/đã có PENDING/chưa bật `isOpenToOutreach`.
3. **Service (search + invite + respond + settings) + rate-limit + mapper**. *Test:* toàn luồng qua service trực tiếp — mời thành công, mời trùng ⇒ 409, mời khi tắt `isOpenToOutreach` ⇒ 403, vượt rate-limit ⇒ 429, accept ⇒ tạo được `Conversation` (kiểm bằng `messagingRepository.findConversationByCandidateAndJobPost`).
4. **Controller + 5 route + đăng ký awilix + mount `main.ts` + cron job**.
5. **2 template notification mới** — kiểm bằng cách trigger thật, xem `title`/`body`/`link` hợp lý, email (nếu có) escape đúng tên công ty/tin.
6. `tsc` sạch cho `apps/server`, `packages/shared-types`.

## Ngoài phạm vi

- Employer tự chỉnh `outreachInvitationDailyQuota` qua UI (chỉ Admin sửa qua seed/DB trực tiếp ở bản đầu, giống cách `SubscriptionPlan` hiện quản lý).
- Candidate chặn một Employer cụ thể (chỉ có Accept/Decline từng lời mời).
- Thông báo hàng loạt/digest — mỗi lời mời là 1 notification riêng như các loại khác.

## Phần ghi chú của chủ dự án

*(để trống)*
