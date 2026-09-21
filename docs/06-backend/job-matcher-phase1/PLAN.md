# Job Matcher — Giai đoạn 1: Rule baseline + giải thích (Backend)

Hướng A2 trong `docs/temp/AI_APPLICATION_DIRECTIONS.md`: chấm điểm mức phù hợp giữa hồ sơ Candidate và tin tuyển dụng, kèm bằng chứng. Không thuộc phase đánh số nào trong `PROJECT_PHASES.md` (đi trước Phase 11). Ba giai đoạn A2 dùng chung một bộ chấm điểm thuần; GĐ1 là **baseline không dùng AI**, GĐ2 thêm embedding (`docs/06-backend/job-matcher-phase2/PLAN.md`), GĐ3 thêm LLM trích yêu cầu (dự kiến, **chưa có PLAN** — chờ số liệu đánh giá của GĐ2). Quyết định kiến trúc: `docs/02-architecture/ARCHITECTURE_DECISIONS.md` AD-13.

Bản nháp đầy đủ (lập luận, ví dụ tính tay, mọi phương án đã loại): `docs/temp/A2_JOB_MATCHER_3_PHASES.md` — file này chỉ ghi **cái sẽ làm**, không chép lại lập luận.

**Trạng thái: ĐÃ TRIỂN KHAI (2026-09-21)** — migration đã áp lên Neon, bước 1–4 xong; xem "Ghi chú triển khai" cuối file. Còn thiếu: kiểm thử 3 endpoint qua HTTP bằng tài khoản thật (đã kiểm ở tầng service với dữ liệu thật).

## Quyết định đã chốt (chủ dự án duyệt Q1–Q8 ngày 2026-09-20)

| # | Quyết định |
|---|---|
| D1 | `CandidateSkill.yearsOfExperience = 0` nghĩa là **chưa khai** (unknown), không phải "0 năm". Không đổi cột thành nullable, không migrate (khớp cách import CV và ô số năm ở profile đang hoạt động). |
| D2 | Kinh nghiệm ở GĐ1 = **tổng thời gian làm việc** (hợp các khoảng của `WorkExperience`, chồng lấp chỉ tính một lần), so với `JobPost.minExperienceYears`. Chưa xét công việc có liên quan hay không — hạn chế đã biết: việc làm không liên quan vẫn cộng vào. Giảm thiểu: kinh nghiệm chỉ chiếm 25% và chỉ áp dụng khi tin có yêu cầu năm; giao diện gọi đúng tên là "Tổng thời gian làm việc: X năm (chưa xét mức liên quan)"; ghi vào mục hạn chế của báo cáo; GĐ3 sửa bằng số năm theo từng kỹ năng. |
| D3 | Số năm của từng kỹ năng chỉ **hiển thị** ở GĐ1–2; GĐ3 mới dùng để so sánh. |
| D4 | Thành phố, `jobType`, ngành (`Industry`), giới tính, ngày sinh, tên trường **không vào điểm**. |
| D5 | Điểm Employer thấy tính theo **hồ sơ hiện tại** (không đóng băng lúc nộp đơn, không thêm bảng snapshot), giao diện ghi nhãn "theo hồ sơ hiện tại". |
| Q4 | Làm ô "Kinh nghiệm tối thiểu (năm)" ngay ở GĐ1. |
| Q8 | Làm cả 3 giai đoạn theo thứ tự GĐ1 → GĐ2 → GĐ3. |

## Quyết định mới chốt khi lên kế hoạch

1. **Module mới `apps/server/src/modules/job-matching/`**, không sửa module `applications`. Employer lấy điểm qua **endpoint mới** thay vì nhét vào response của `applications` — đúng quy tắc "không sửa file không liên quan"; FE ghép theo `applicationId`.
2. **Port đặt ở `shared/ports/JobMatcher.ts`, adapter/thực thi ở module** — đúng chỗ repo đang đặt mọi port (`CvExtractor.ts`, `CatalogMatchVerifier.ts`), khác với sơ đồ `modules/ai/` ở Phase 11 ban đầu (ghi trong AD-13). Kiểu **đầu ra** (`MatchResult`…) nằm ở `@sip/shared-types` vì FE cần; kiểu **đầu vào** (`MatchInput`, profile) chỉ dùng ở server nên ở file port.
3. **Bộ chấm điểm là hàm thuần** (`match(input) → MatchResult`, đồng bộ, không chạm DB/mạng). Loader (DB → profile) tách riêng để test hàm thuần không cần DB và để script đánh giá ở GĐ2 dùng chung đúng loader thật.
4. **Chỉ kỹ năng `APPROVED` của tin được tính** vào `R`/`P`. Skill `PENDING` do Employer vừa tự đề xuất chưa được Admin duyệt: nếu tính thì mẫu số phình ra bởi kỹ năng mà Candidate không thể có (họ không thấy trên trang công khai — `job-post.mapper.ts` cũng đang ẩn chúng theo `publicOnly`). Phía Candidate lấy toàn bộ kỹ năng của họ.
5. **Quy tắc dòng `WorkExperience` dùng được** khi tính tổng năm: có `startDate` và (`endDate` hoặc `isCurrent`), `end ≥ start`. Dòng còn lại bỏ qua. `isCurrent` ⇒ `end = hôm nay`. Không dòng nào dùng được ⇒ `null` (unknown, **không phải 0**). Đổi ngày sang năm: `ngày / 365.25`.
6. **Ghi `skills` của tin là thao tác một khối**: nếu request có `skillIds`, tập kỹ năng mới = `skillIds` (REQUIRED) ∪ `preferredSkillIds ?? []` (PREFERRED); kỹ năng xuất hiện ở cả hai ⇒ REQUIRED thắng. Client cũ chỉ gửi `skillIds` vẫn chạy (mọi kỹ năng REQUIRED), nhưng sẽ xoá mất kỹ năng PREFERRED đã có — chấp nhận vì FE duy nhất là app này và luôn gửi cả hai.
7. **Không cache, không hạn mức**: chấm điểm là hàm thuần rẻ. Danh sách đơn nạp hồ sơ hàng loạt bằng **một** `findMany({ id: { in } })`, không N+1.
8. Thông báo lỗi `AppError` giữ tiếng Anh như phần còn lại của backend; câu giải thích hiển thị cho người dùng (`MatchResult.notes`) là tiếng Việt do server sinh.

## Thay đổi cơ sở dữ liệu

```prisma
enum SkillImportance {
  REQUIRED
  PREFERRED
}

model JobPostSkill {
  // ... khoá và quan hệ hiện có giữ nguyên ...
  // Default REQUIRED ⇒ mọi tin cũ tự hoạt động như trước, không cần backfill.
  importance SkillImportance @default(REQUIRED)
}

model JobPost {
  // ... các cột hiện có ...
  minExperienceYears Float?   // null = không yêu cầu
}
```

- Migration chỉ có `CREATE TYPE`, `ADD COLUMN ... DEFAULT`, `ADD COLUMN` nullable — additive, không mất dữ liệu. Tên: `2026MMDDHHMMSS_job_matcher_phase1`.
- **Không** thêm cột nào vào `Candidate`.
- Quy trình: viết SQL tay → `prisma migrate diff --from-migrations ... --to-schema-datamodel` xác nhận khớp `schema.prisma` → **dừng, xin chủ dự án xác nhận** → mới `migrate deploy` lên Neon.

## Kiểu dữ liệu

`shared/ports/JobMatcher.ts` (server) và phần đầu ra ở `packages/shared-types/src/index.ts`. Cấu trúc đầy đủ ở bản nháp mục 3.3; tóm tắt các trường quyết định hành vi:

```ts
// ── shared-types (FE dùng) ──
type SkillImportance = "REQUIRED" | "PREFERRED";
type MatchStatus = "SCORED" | "INSUFFICIENT_PROFILE" | "INSUFFICIENT_JOB_DATA";
type MatchComponentKey = "requiredSkills" | "preferredSkills" | "experience" | "education" | "semantic";

interface MatchComponentResult { key; applicable: boolean; score: number | null /*0..1*/; weight: number; effectiveWeight: number }
interface MatchSkillEvidence   { skillId; name; importance; status: "MATCHED" | "MISSING"; candidateYears: number | null /*null = chưa khai*/ }
interface MatchExperienceEvidence { status: "MATCH" | "PARTIAL" | "BELOW" | "UNKNOWN" | "NOT_REQUIRED"; requiredYears: number | null; candidateYears: number | null }
interface MatchResult {
  status: MatchStatus;
  score: number | null;                    // 0..100 nguyên; null khi không SCORED
  confidence: "LOW" | "MEDIUM" | "HIGH";
  weightsVersion: string;                  // "rule-v1"
  components: MatchComponentResult[];
  skills: MatchSkillEvidence[];
  experience: MatchExperienceEvidence;
  // enabled = cấu hình đang bật thành phần này (GĐ2: JOB_MATCHER_MODE=hybrid); available = đã có cosine.
  // FE cần cả hai để phân biệt "tính năng tắt" (ẩn dòng) với "model lỗi" (ghi "chưa tính được").
  semantic: { enabled: boolean; available: boolean; similarity: number | null; normalized: number | null }; // GĐ1: cả hai false
  notes: string[];                         // tiếng Việt
}
interface ApplicationMatchSummary { applicationId; candidateId; score: number | null; confidence; status: MatchStatus }

// ── server-only (port) ──
interface CandidateMatchProfile { candidateId; skills: {skillId; name; yearsOfExperience}[]; totalExperienceYears: number | null;
  educations: {majorId: string | null; majorName: string | null; degree: string | null}[];
  completeness: { hasSkills; hasWorkExperience; hasEducation; hasHeadlineOrBio } }
interface JobMatchProfile { jobPostId; skills: {skillId; name; importance}[]; minExperienceYears: number | null }
interface MatchInput { candidate; job; semanticSimilarity: number | null }   // GĐ1 luôn null
interface JobMatcher { match(input: MatchInput): MatchResult }
```

`educations`, `semanticSimilarity` có mặt từ GĐ1 để **không đổi chữ ký** ở GĐ2/GĐ3.

## Công thức chấm điểm (`rule-v1`)

`R` = tập `skillId` REQUIRED của tin, `P` = tập PREFERRED, `C` = tập `skillId` của ứng viên.

| Thành phần | Áp dụng khi | Điểm (0..1) |
|---|---|---|
| `requiredSkills` | `R ≠ ∅` | `\|R ∩ C\| / \|R\|` |
| `preferredSkills` | `P ≠ ∅` | `\|P ∩ C\| / \|P\|` |
| `experience` | `minExperienceYears > 0` **và** `totalExperienceYears ≠ null` | `min(1, candidateYears / requiredYears)` |

Trọng số `RULE_WEIGHTS_V1 = { requiredSkills: 0.60, preferredSkills: 0.15, experience: 0.25, education: 0, semantic: 0 }` ở `job-matching.config.ts` (đổi được không sửa logic; **không** đặt ở env để có version và đi cùng code được review).

Chia lại trọng số: `effectiveWeight_i = weight_i / Σ weight_j (j áp dụng)`; `score = round(100 × Σ effectiveWeight_i × score_i)`. Ví dụ: R = {Java, Spring, PostgreSQL}, P = {Docker}, không yêu cầu năm, ứng viên có Java+Spring+Docker ⇒ `(0.60×0.667 + 0.15×1) / 0.75 = 0.733 → 73` (không chia lại chỉ ra 55 — tin nào không ghi số năm đều bị thiệt 25%).

- Trạng thái kinh nghiệm hiển thị: `≥ required` → `MATCH`; `≥ 50%` → `PARTIAL`; còn lại `BELOW`; ứng viên `null` → `UNKNOWN` (không tính điểm); tin không yêu cầu → `NOT_REQUIRED`.
- Không chấm: ứng viên chưa có kỹ năng nào → `INSUFFICIENT_PROFILE`; không thành phần nào áp dụng được → `INSUFFICIENT_JOB_DATA`. Thứ tự kiểm tra: `INSUFFICIENT_PROFILE` trước.
- `confidence` chỉ theo độ đầy đủ hồ sơ: số cờ true trong `completeness` — ≥3 HIGH, 2 MEDIUM, ≤1 LOW. Thiếu dữ liệu làm giảm **độ tin cậy**, không tự trừ điểm.
- `candidateYears` trong `MatchSkillEvidence` = `null` khi `yearsOfExperience = 0` (D1).

## Luồng và API

Tất cả nằm trong `job-matching.routes.ts` (đăng ký awilix trong file này, giống `applications.routes.ts`), mount `app.use("/api", jobMatchingRouter(container))` trong `main.ts` cạnh các router khác.

| Method | Đường dẫn | Guard | Trả về | Lỗi |
|---|---|---|---|---|
| GET | `/candidate/job-posts/:id/match` | Candidate | `MatchResult` | 404 tin không tồn tại hoặc không `PUBLISHED`; 404 chưa có hồ sơ Candidate |
| GET | `/employer/job-posts/:jobId/application-matches` | Employer | `ApplicationMatchSummary[]` | 404 nếu tin không thuộc công ty của Employer |
| GET | `/employer/applications/:id/match` | Employer | `MatchResult` | 404 nếu đơn không thuộc công ty của Employer |

```text
Candidate mở /jobs/:id ─► GET /candidate/job-posts/:id/match
   JobMatchingService.matchForCandidate(userId, jobPostId)
     ├─ requireCandidate(userId)                       404 nếu chưa có hồ sơ
     ├─ jobPost = PUBLISHED?                            404 nếu không
     ├─ job  = JobMatchProfileLoader.load(jobPost)      (chỉ skill APPROVED)
     ├─ cand = CandidateMatchProfileLoader.load(candidateId)
     └─ JobMatcher.match({ candidate, job, semanticSimilarity: null })

Employer mở danh sách đơn ─► (giữ nguyên GET .../applications) + GET .../application-matches
   listApplicationMatches(userId, jobId)
     ├─ kiểm sở hữu tin: cùng cách ApplicationsService.requireEmployer + prisma.jobPost.findFirst({ id, companyId })
     ├─ prisma.application.findMany({ where: { jobPostId }, select: { id, candidateId } })
     ├─ CandidateMatchProfileLoader.loadMany(candidateIds)   ── 1 truy vấn
     └─ match từng người → ApplicationMatchSummary[]
```

Không đổi `ApplicationStatus` và không ẩn/loại đơn theo điểm ở bất kỳ endpoint nào.

## Thay đổi ở module hiện có (đều additive)

| File | Thay đổi |
|---|---|
| `job-posts/job-posts.dto.ts` | `createJobPostSchema`/`updateJobPostSchema` thêm `preferredSkillIds?: string[]` (≤30) và `minExperienceYears?: number` (0–20) |
| `job-posts/job-posts.service.ts` | `create`/`update` gọi `setSkills` theo quyết định #6; ghi `minExperienceYears` |
| `job-posts/job-post.repository.ts` | `setSkills(jobPostId, skills: {skillId; importance}[], db)`: xoá phần không còn, cập nhật `importance` của phần đã có, thêm phần mới; `JobPostWriteData` nhận `minExperienceYears` |
| `job-posts/job-post.mapper.ts` | `skills[]` thêm `importance` (lấy từ dòng nối `link.importance`), trả thêm `minExperienceYears` |
| `packages/shared-types` | `JobPostSkillDto.importance`, `JobPost.minExperienceYears`, `CreateJobPostRequest`/`UpdateJobPostRequest` 2 trường mới, các kiểu Match* |
| `main.ts` | mount `jobMatchingRouter` |

Không sửa `applications`, `candidates`, `skills`, `saved-jobs`. `jobPostInclude` đã `include` cả dòng nối nên `importance` tự đi theo mà không phải đổi select.

## Cấu trúc file mới

```text
apps/server/src/
├─ shared/ports/JobMatcher.ts
└─ modules/job-matching/
    ├─ job-matching.types.ts
    ├─ job-matching.config.ts
    ├─ scoring-job-matcher.ts                 # hàm thuần, nhận bảng trọng số ở constructor
    ├─ candidate-experience.util.ts           # computeTotalExperienceYears(rows, today) — hàm thuần
    ├─ candidate-match-profile.loader.ts      # DB → CandidateMatchProfile (load, loadMany)
    ├─ job-match-profile.loader.ts            # DB → JobMatchProfile
    ├─ job-matching.service.ts
    ├─ job-matching.controller.ts
    └─ job-matching.routes.ts
apps/server/tests/unit/
    ├─ scoring-job-matcher.test.ts
    └─ candidate-experience.test.ts
```

`ScoringJobMatcher` nhận `weights` ở constructor ngay từ GĐ1 (GĐ2 chỉ thêm 2 bảng trọng số khác, không viết matcher mới).

## Các bước thực hiện (mỗi bước tự test được)

1. **Migration + schema**: viết tay, `migrate diff`, **dừng xin xác nhận** → áp Neon. Cập nhật `schema.prisma`, `setSkills`, DTO, mapper, shared-types. *Test:* tạo tin cũ/mới qua API, `importance` lưu đúng, tin cũ mặc định REQUIRED, client chỉ gửi `skillIds` vẫn chạy.
2. **Bộ chấm điểm thuần + test đơn vị** (`types`, `config`, `scoring-job-matcher`, `candidate-experience.util`). *Test:* bảng dưới.
3. **Loader + service + 3 route + đăng ký awilix + mount `main.ts`**. *Test:* curl 3 endpoint với dữ liệu thật; kiểm sở hữu (Employer khác công ty ⇒ 404); tin `DRAFT`/`CLOSED` ⇒ 404 ở endpoint Candidate.
4. `tsc` sạch cho `apps/server` và `packages/shared-types`; `node --import tsx --test tests/unit/*.test.ts` xanh.

### Test đơn vị `ScoringJobMatcher`

| # | Tình huống | Kỳ vọng |
|---|---|---|
| T1 | Đủ mọi kỹ năng bắt buộc + ưu tiên | 100 |
| T2 | Thiếu 1/3 bắt buộc, có 1/1 ưu tiên, không yêu cầu năm | 73 |
| T3 | Chỉ thiếu kỹ năng ưu tiên | Điểm giảm ít hơn nhiều so với thiếu 1 bắt buộc |
| T4 | Tin yêu cầu 1 năm, ứng viên 2 năm | `MATCH`, thành phần = 1 |
| T5 | Tin yêu cầu 1 năm, ứng viên 0.5 năm | `PARTIAL`, thành phần = 0.5 |
| T6 | Tin yêu cầu 1 năm, ứng viên không có `WorkExperience` dùng được | `UNKNOWN`, thành phần **không áp dụng** (không phải 0) |
| T7 | Tin không yêu cầu năm | `NOT_REQUIRED`, trọng số được chia lại (như T2) |
| T8 | Ứng viên chưa có kỹ năng | `INSUFFICIENT_PROFILE`, `score = null` |
| T9 | Tin không có kỹ năng và không yêu cầu năm | `INSUFFICIENT_JOB_DATA` |
| T10 | Tin chỉ có kỹ năng ưu tiên | Vẫn chấm, `requiredSkills.applicable = false` |
| T11 | Kỹ năng khớp có `yearsOfExperience = 0` | `candidateYears = null` |
| T12 | `completeness` n = 4 / 2 / 0 | HIGH / MEDIUM / LOW |
| T13 | Ứng viên toàn `WorkExperience` không liên quan nhưng đủ năm | Vẫn `MATCH` — **test ghi lại hạn chế D2 có chủ đích**, để không ai tưởng là bug |

`computeTotalExperienceYears`: các khoảng chồng lấp (chỉ tính một lần), `isCurrent`, dòng thiếu `startDate`, dòng có `end < start`, không có dòng nào ⇒ `null`.

## Ngoài phạm vi GĐ1

- Embedding, độ tương đồng nội dung → GĐ2.
- LLM đọc `requirements`, kinh nghiệm theo từng kỹ năng, khớp ngành học → GĐ3.
- Xếp hạng ứng viên (A3), gợi ý tin cho Candidate (B2): dùng lại `ScoringJobMatcher` sau này, chưa làm.
- Snapshot điểm lúc nộp đơn (D5), khớp mờ giữa hai skill khác `skillId` (chỉ khớp chính xác).

## Rủi ro / hạn chế (nên nêu thẳng trong báo cáo)

- Chỉ khớp chính xác `skillId`: "React" ≠ "React Native"; hai skill trùng nghĩa chưa được gộp trong catalog bị coi là khác nhau.
- Không hiểu nội dung `requirements`/`description`.
- Kinh nghiệm là tổng thời gian làm việc, không xét liên quan (D2).
- Thực tập sinh: nhiều tin không yêu cầu năm ⇒ điểm chủ yếu là điểm kỹ năng.
- Trọng số 0.60/0.15/0.25 là **đề xuất chưa có căn cứ khoa học**; GĐ2 điều chỉnh trên tập dev của bộ đánh giá.

## Ghi chú triển khai (2026-09-21)

- **Migration:** tên thực tế `20260921000000_add_job_matcher_fields` (kế hoạch ghi `..._job_matcher_phase1`). `prisma migrate diff` (DB → schema) sinh SQL trùng khớp file viết tay; chủ dự án tự chạy `db:deploy`.
- **Lệch nhỏ so với kế hoạch:**
  - `minExperienceYears` ở request nhận cả `null` (để xoá yêu cầu đã lưu); service lưu `0` thành `null` ⇒ bộ chấm điểm chỉ phải xét một trường hợp "không yêu cầu".
  - Thêm kiểu `MatchConfidence`, `MatchExperienceStatus`, `MatchSemanticInfo`, `MatchSemanticStatus` ở shared-types (tách từ các kiểu inline trong kế hoạch). `ApplicationMatchSummary.semanticStatus` có từ GĐ1, luôn `"OFF"`.
  - `job-matching.types.ts` chỉ chứa `MatchWeights` (`{ version, weights }`); kiểu đầu vào nằm ở `shared/ports/JobMatcher.ts` như kế hoạch.
  - `ScoringJobMatcher` coi một thành phần có trọng số 0 là không áp dụng (để bảng `EMBEDDING_ONLY` ở GĐ2 dùng lại được mà không đổi logic).
- **Test:** 36/36 xanh (`node --import tsx --test tests/unit/*.test.ts`), gồm T1–T13, thêm T8b (hồ sơ trống + tin trống ⇒ `INSUFFICIENT_PROFILE`), `BELOW`, 7 test `computeTotalExperienceYears`. `tsc` sạch cho server, shared-types, web.
- **Kiểm với dữ liệu thật (script tạm, đã xoá):** service chấm đúng một đơn thật (100%, `rule-v1`); Employer công ty khác ⇒ 404; tin `CLOSED` ⇒ 404 ở endpoint Candidate; mọi `job_post_skills` cũ là `REQUIRED`. `setSkills` kiểm trong transaction rồi rollback: thêm mới, đổi `importance`, xoá, và client cũ chỉ gửi `skillIds` ⇒ PREFERRED bị xoá như quyết định #6.
- **Độ trễ:** danh sách điểm của một tin ~0.7 s với Neon (5 truy vấn tuần tự, mỗi truy vấn ~130 ms tới region ap-southeast-1); `Promise.all` cho 2 truy vấn cuối không cải thiện rõ. Chấp nhận ở GĐ1; phần tính điểm không đáng kể.

## Phần ghi chú của chủ dự án

*(để trống)*
