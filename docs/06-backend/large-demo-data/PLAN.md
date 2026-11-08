# Dữ liệu demo lớn (mục 0.1)

Mục 0.1 trong `docs/01-project/FEATURE_BACKLOG.md` (phần "Đăng tin, ứng tuyển và tự động hoá — theo nhận xét của giáo viên"). Chỉ thêm script trong `apps/server/scripts/` và file dữ liệu đi kèm. **Không** đổi schema, API hay giao diện.

**Trạng thái: ĐÃ LẬP KẾ HOẠCH (2026-11-08), đã chốt Q1–Q4, chờ chủ dự án duyệt plan.**

Làm sau `docs/06-backend/major-merge-fix/PLAN.md` (sửa lỗi gộp ngành), vì bước dọn danh mục ở đây có thể gộp ngành.

## Mục tiêu

Buổi demo sau có đủ dữ liệu để thấy hệ thống chọn lọc và xếp ưu tiên:

- Trang "Tìm ứng viên phù hợp" của các tin chính ra đủ 10 người, điểm trải từ thấp tới cao.
- Trang "Việc làm phù hợp" của ứng viên ra đủ 10 tin, có thứ tự rõ ràng.
- Trang tìm việc công khai có hàng trăm tin, lọc theo ngành / thành phố / mức lương / loại hình đều có kết quả.
- Trang tổng quan, Ứng viên, Lịch phỏng vấn, Lời mời, Tin nhắn của nhà tuyển dụng có số liệu thật, gồm cả hồ sơ chờ lâu (cần cho 0.3, 0.4).
- Có số đo (thời gian chạy, dung lượng, thời gian phản hồi) để đưa vào báo cáo.

## Quyết định đã chốt (chủ dự án, 2026-11-08)

| # | Quyết định |
|---|---|
| D1 | Quy mô **Lớn**: ~40 công ty, ~400 tin, ~1.500 ứng viên. |
| D2 | Cách tạo nội dung: **B cải tiến**. LLM viết một lần các **bộ chân dung** (giới thiệu, kinh nghiệm, dự án, kỹ năng đi cùng nhau theo vị trí × cấp độ) và mẫu tin; script ghép bằng bộ sinh số ngẫu nhiên có **seed cố định** (chạy lại ra đúng bộ cũ). Thêm ~80 **hồ sơ trưng bày** viết trọn từng hồ sơ cho các tài khoản dùng khi demo. |
| D3 | **Giữ nguyên** bộ `@match-demo.local` (bộ đánh giá Job Matcher GĐ2/GĐ3 và số liệu đã ghi trong báo cáo). Bộ mới dùng domain email riêng; script chỉ ghi / xoá dữ liệu của chính nó. |
| D4 | Seed **lịch sử vừa phải**: đơn ứng tuyển ở nhiều trạng thái và độ tuổi, lời mời, lịch phỏng vấn, hội thoại, tin đã lưu. |
| D5 | Mọi tài khoản demo dùng mật khẩu `123456789` (giống bộ cũ). |
| D6 | Mọi công ty demo đã xác minh, có gói "Doanh nghiệp" `ACTIVE` dài hơn hạn của mọi tin, để cron `job-post-expiry` không đóng tin. |
| D7 | Ghi thẳng bằng Prisma, **không tạo `outbox_events`** (không gửi email thật qua Resend). Đếm outbox trước/sau, tăng thì rollback (cách của `seed-dashboard-demo.ts`). |
| D8 | Dung lượng dự kiến ~40–60 MB trên giới hạn 0,5 GB của Neon (đo 2026-11-08: DB hiện 14 MB). Không chạy `--reset` liên tục nhiều lần trong ngày (mỗi lần đều sinh lịch sử ghi WAL). |

## Hiện trạng (đọc DB và code ngày 2026-11-08, chỉ SELECT)

| # | Phát hiện | Hệ quả |
|---|---|---|
| H1 | Danh mục: 1.081 ngành, 300 trường (đều `APPROVED`); **67 kỹ năng**, trong đó có cặp trùng (`Node.js`/`NodeJS`, `React`/`ReactJS`, `JS`/`JavaScript`, `Kafka`/`Apache Kafka`, `MSSQL`/`MS SQL Server`); **6 ngành nghề** (`Industry`), **5 thành phố**, 5 loại hình công ty. | 67 kỹ năng không đủ cho ~30 vị trí nhiều lĩnh vực (Q1). 6 ngành nghề hơi ít cho 40 công ty (Q2). Kỹ năng trùng làm lệch so khớp (Q3). |
| H2 | Gói: "Cơ bản" (5 tin/30 ngày), "Tiêu chuẩn" (20/30), "Doanh nghiệp" (100/90); cả ba `outreachInvitationDailyQuota = null` → 3 lời mời/ngày. | Dùng "Doanh nghiệp" cho mọi công ty demo. Hạn mức lời mời để 0.2 xử lý, không đổi ở đây. |
| H3 | "Việc làm phù hợp" chỉ lấy tin đăng trong 30 ngày gần nhất (`RECOMMENDATION_RECENT_DAYS = 30`). | Rải `publishedAt` sao cho phần lớn tin đang hiển thị nằm trong 30 ngày (mục "Phân bố"). Việc nới giới hạn thuộc 0.5. |
| H4 | `Application.cvId` bắt buộc. Bộ cũ dùng file `cv-mau-demo.pdf` đã tải lên Cloudinary (`seed-dashboard-demo.ts` tìm theo `fileName`). | Mọi CV demo trỏ chung `fileUrl` của file mẫu đó, không tải thêm lên Cloudinary. Chưa có file mẫu thì script dừng và báo cách tải (như bộ cũ). |
| H5 | Embedding hồ sơ/tin tính lười lúc có người xem điểm, lưu kèm `contentHash` (`match-embedding.service.ts`); model ONNX chạy trong process (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`). Script đánh giá `eval-job-matching.ts` đã dựng `MatchEmbeddingService` ngoài server. | Script seed tính sẵn embedding cho mọi tin đang hiển thị và mọi ứng viên, để buổi demo không chờ tính lần đầu. Dựng service giống `eval-job-matching.ts`. |
| H6 | `match-text.builder` cắt văn bản đưa vào embedding (bộ kiểm fixture cũ ghi ngưỡng: `bio` 300, `requirements` 400, `description` 300 ký tự). | Văn bản trong bộ chân dung và mẫu tin viết trong các ngưỡng này để phần cắt không mất ý chính. |
| H7 | Kỹ năng mới cần cột `embedding` cho bước chống trùng (`SkillEmbeddingService`). `seed-match-demo.ts` đã có đường tạo kỹ năng bổ sung `APPROVED`. | Nếu thêm kỹ năng (Q1), đi cùng đường đó để có embedding. |

## Câu hỏi đã chốt (chủ dự án, 2026-11-08, theo đề xuất)

| # | Câu hỏi | Quyết định |
|---|---|---|
| Q1 | Thêm kỹ năng vào danh mục? | **Có**, ~80–120 kỹ năng `APPROVED` cho các lĩnh vực ngoài CNTT (kế toán, marketing, nhân sự, logistics, thiết kế, bán hàng…), tạo theo đường của `seed-match-demo.ts` (có embedding). Kỹ năng do script tạo được đánh dấu để `--reset` nhận ra; chỉ xoá khi không còn ai dùng. |
| Q2 | Thêm ngành nghề (`Industry`) và thành phố? | **Có, ít**: thêm ~4–6 ngành nghề (ví dụ Kế toán – Kiểm toán, Nhân sự, Logistics, Thiết kế – Sáng tạo, Bán lẻ, Du lịch – Khách sạn) và ~2 thành phố (ví dụ Bình Dương, Huế). Hai bảng này không có cột người tạo, nên đánh dấu bằng tiền tố id; `--reset` chỉ xoá khi không còn tin / công ty / hồ sơ nào dùng. |
| Q3 | Gộp 5 cặp kỹ năng trùng bằng cách nào? | **Bằng script riêng `merge-duplicate-skills`, chạy được nhiều lần** (đổi ngày 2026-11-08, cách B). Ban đầu định gộp tay trên giao diện Admin, nhưng kiểm lại thì giao diện **không làm được**: chỉ gộp được kỹ năng `PENDING` (`skills.service.ts:113` trả 409 với kỹ năng đã duyệt), và danh sách chỉ hiện 20 dòng mới nhất, không có "Xem thêm". Chi tiết ở mục "Gộp kỹ năng trùng" bên dưới. |
| Q4 | Ai viết thư viện bộ chân dung và mẫu tin (bước 1)? | **Claude Code viết trực tiếp** thành file JSON trong phiên làm việc, chia nhiều đợt theo lĩnh vực, chủ dự án đọc rà từng đợt. Prompt và quy tắc viết lưu ở `docs/06-backend/large-demo-data/library-prompt.md` để làm lại được. Bộ chân dung là gì: mục "Bộ chân dung" bên dưới. |

## Gộp kỹ năng trùng (Q3)

Danh mục đang có 5 cặp **cùng một kỹ năng nhưng là hai mục riêng**:

| Giữ lại (đề xuất) | Gộp vào |
|---|---|
| Node.js | NodeJS |
| React | ReactJS |
| JavaScript | JS |
| Kafka | Apache Kafka |
| MS SQL Server | MSSQL |

Bộ chấm điểm so khớp theo `skillId`, không theo nghĩa. Tin yêu cầu "Node.js" mà ứng viên khai "NodeJS" thì bị tính là thiếu kỹ năng, điểm bị hạ oan.

Phải gộp **trước** khi seed. Nếu không, script chọn lẫn cả hai mục và dữ liệu demo lệch điểm ngay từ đầu. Bộ kiểm của script seed sẽ dừng nếu thư viện còn tham chiếu tới tên đã thành alias.

**Cách gộp (cách B):** script `apps/server/scripts/merge-duplicate-skills.ts`, npm script `merge-duplicate-skills`.

- Gọi `SkillsRepository.merge(sourceId, targetId, "ADMIN_MERGE")`: chuyển `JobPostSkill`, `CandidateSkill` sang mục đích, biến tên nguồn thành alias (sau này gõ "NodeJS" tự hiểu là "Node.js"), xoá mục nguồn. Không đi qua `SkillsService.merge` vì hàm đó chỉ nhận mục `PENDING`.
- Tìm nguồn/đích **theo tên** (không phân biệt hoa thường). Nguồn không còn thì in "đã gộp trước đó" và bỏ qua; đích không có thì dừng, không gộp gì. Nhờ vậy **chạy nhiều lần vẫn an toàn**.
- `--dry-run`: chỉ in mỗi cặp có bao nhiêu hồ sơ / tin đang dùng mục nguồn, không ghi.
- `seed-large-demo` gọi lại bước này ở đầu mỗi lần chạy (cùng mã), nên ai chạy seed cũng được gộp, không phải nhớ chạy riêng.

**Mỗi người một DB Neon:** script chỉ đổi DB trong `.env` của người chạy. Người làm chung cần tự chạy trên DB của mình (hoặc chỉ cần chạy `seed-large-demo`). Code không đổi gì với người đó: không migration, không đổi API.

**Lưu ý với `seed-match-demo`:** `scripts/data/match-demo.json` có "NodeJS", "ReactJS", "JS" trong `extraSkills`. Chạy lại `seed-match-demo` sau khi gộp sẽ **tạo lại** các mục trùng này (không báo lỗi). Không sửa file đó, để giữ nguyên bộ dữ liệu đánh giá Job Matcher. Gặp trường hợp này thì chạy lại `merge-duplicate-skills` (hoặc `seed-large-demo`).

**Lỗi phát hiện khi đọc `SkillsRepository.merge` (sửa trong bước 0):** khi chuyển `JobPostSkill`, hàm chỉ chép `jobPostId` và `skillId`, nên **mất `importance` và `minYears`**: kỹ năng ưu tiên (`PREFERRED`) thành bắt buộc (`REQUIRED`, giá trị mặc định), số năm tối thiểu thành null. Lỗi cùng loại với lỗi gộp ngành. Cách sửa, cùng kiểu M2 của `major-merge-fix`: chép đủ hai trường; tin đã có sẵn mục đích thì giữ mức mạnh hơn (`REQUIRED` thắng `PREFERRED`), `minYears` lấy giá trị đã có của mục đích, mục đích null thì lấy của nguồn. Tách thành hàm thuần có unit test.

### Kết quả bước 0 (✅ 2026-11-08)

- **Code:** hàm thuần `src/modules/skills/skill-merge-plan.ts` (11 test trong `tests/unit/skill-merge-plan.test.ts`), `SkillsRepository.merge` dùng hàm này. Thêm so với dự kiến, cùng loại lỗi "gộp làm mất dữ liệu":
  - hồ sơ đã có cả hai mục: `yearsOfExperience` lấy số lớn hơn (trước đây giữ của đích);
  - alias đang trỏ vào mục nguồn được chuyển sang đích (trước đây bị cascade xoá cùng mục nguồn).
- **Script:** `scripts/merge-duplicate-skills.ts`, phần dùng chung ở `scripts/lib/merge-duplicate-skills.ts` (`mergeDuplicateSkills`, `seed-large-demo` sẽ gọi hàm này). Kiểm đủ 5 mục đích (đúng 1 mục, `APPROVED`) trước khi gộp; thiếu là dừng, không gộp cặp nào.
- **Đính chính hiện trạng:** dry-run cho thấy tin của bộ `@match-demo.local` **không** gắn "NodeJS"/"ReactJS"/"JS" (chỉ hồ sơ dùng). Mục nguồn dùng trên DB của chủ dự án: NodeJS, ReactJS, JS, MSSQL mỗi mục 1 hồ sơ; Apache Kafka 1 tin (`REQUIRED`, `minYears` 3 — hàm cũ sẽ làm mất số năm này). Không hồ sơ / tin nào gắn cả nguồn lẫn đích.
- **Kiểm:** diễn tập trong transaction rồi rollback (DB trở lại y nguyên), sau đó chạy thật trên DB của chủ dự án. Sau khi chạy: không còn 5 mục nguồn; 5 alias `nodejs`, `reactjs`, `js`, `apache kafka`, `mssql` trỏ đúng mục đích; tin Kafka giữ `REQUIRED` / 3 năm; kỹ năng 67 → 62, liên kết hồ sơ (124) và tin (100) không đổi; chạy lại lần hai cả 5 cặp báo "đã gộp trước đó". Toàn bộ unit test (319) và `tsc` sạch.
- **Người làm chung:** chưa chạy trên DB của họ; họ chạy `npm run merge-duplicate-skills --workspace server` (hoặc `seed-large-demo` khi có).

## Bộ chân dung (D2, Q4)

Một **bộ chân dung** là một mẫu hồ sơ hoàn chỉnh, mạch lạc cho **một vị trí ở một cấp độ**, do LLM viết sẵn. Ví dụ:

> **Vị trí:** Backend · **Cấp độ:** sinh viên năm 3, đã đi làm thêm
> - **Tiêu đề:** "Sinh viên CNTT định hướng Backend Node.js"
> - **Giới thiệu:** "Mình đã làm hai đồ án có server Express kết nối PostgreSQL, quen viết API REST và xử lý xác thực JWT…"
> - **Dự án:** "Hệ thống đặt lịch phòng khám: API Node.js + PostgreSQL, có Redis cache lịch trống…"
> - **Kinh nghiệm:** "Cộng tác viên lập trình 6 tháng tại một công ty phần mềm nhỏ…"
> - **Kỹ năng:** lõi Node.js, Express, PostgreSQL, Git; có thể thêm Redis, Docker

Từ một bộ, script tạo **nhiều ứng viên khác nhau**:

- đổi họ tên, trường, ngành (cùng nhóm ngành của vị trí), năm sinh, thành phố;
- bớt / thêm vài kỹ năng, đổi số năm kinh nghiệm;
- chọn biến thể câu khác nhau, ghép thêm một câu giới thiệu riêng cho từng người, để vector embedding của các hồ sơ cùng bộ không trùng nhau.

Mỗi hồ sơ vẫn ăn khớp với chính nó (giới thiệu, dự án, kỹ năng cùng nói về một hướng), mà không phải nhờ LLM viết riêng 1.500 hồ sơ. Dự tính ~400 bộ: ~30 vị trí × 3 cấp độ × 4–5 biến thể. Mẫu tin tuyển dụng làm theo cùng cách.

## Phân bố dữ liệu

Các con số là mục tiêu; script nhận tham số `--scale` (ví dụ `0.1`) để chạy thử nhỏ.

### Công ty và nhà tuyển dụng

- ~40 công ty trải đều các ngành nghề (CNTT nhiều nhất, khoảng 35%). Thành phố: TP. HCM ~45%, Hà Nội ~35%, Đà Nẵng ~10%, còn lại các thành phố khác.
- Mỗi công ty 1–3 nhà tuyển dụng (1 `isCompanyAdmin`), tổng ~80 tài khoản.
- Đã xác minh (`isVerified`, `verificationStatus` đã duyệt, `verifiedAt` trong quá khứ). `requiresApproval` khoảng 30% bật.
- Gói "Doanh nghiệp" `ACTIVE`: bắt đầu hôm chạy, kết thúc +90 ngày. Script **từ chối chạy** nếu có tin hết hạn sau ngày kết thúc gói (quy tắc của `seed-dashboard-demo.ts`).

### Tin tuyển dụng (~400)

| Thuộc tính | Phân bố |
|---|---|
| Trạng thái | Đang hiển thị ~75%; Đã đóng / Hết hạn ~12%; Nháp ~6%; Chờ duyệt ~4%; Nháp bị từ chối (có lý do) ~3% |
| `publishedAt` (tin đang hiển thị) | Rải trong 75 ngày qua, ~60% trong 30 ngày gần nhất (H3) |
| `expiresAt` | Hôm chạy +7 tới +85 ngày, rải đều; luôn trước ngày kết thúc gói |
| Loại hình | Thực tập sinh ~70%, Bán thời gian ~15%, Toàn thời gian ~10%, Hợp đồng ~5% |
| Lương | ~30% thoả thuận; còn lại khoảng lương theo loại hình và lĩnh vực |
| Địa điểm | `cityId` theo công ty (có chi nhánh khác thành phố với ~10% tin), `address` cụ thể |
| Kỹ năng | 3–7 kỹ năng: 2–4 bắt buộc, phần còn lại nên có; ~30% kỹ năng có `minYears` |
| Ngành học | ~70% tin có 1–2 ngành chính và 0–3 ngành liên quan, lấy từ danh mục thật |
| `minExperienceYears` | Phần lớn `null`; ~20% từ 0,5 tới 2 |
| Kiểm duyệt | Tin đang hiển thị có dòng `APPROVED` trong `JobPostModerationAction` (actor `null` khi công ty không cần duyệt) |
| Lượt xem | `JobPostDailyStat` 60 ngày, `viewCount` bằng tổng |

### Ứng viên (~1.500)

| Nhóm | Tỉ lệ | Mô tả |
|---|---|---|
| Rất hợp | ~15% | Đúng bộ kỹ năng của một vị trí, đúng ngành học, có dự án liên quan |
| Hợp một phần | ~40% | Thiếu 1–2 kỹ năng bắt buộc hoặc thiếu năm kinh nghiệm |
| Ngành gần / đổi ngành | ~20% | Ngành học gần (CNTT ↔ Khoa học máy tính…) hoặc đang chuyển ngành |
| Hồ sơ sơ sài | ~15% | Ít kỹ năng, không kinh nghiệm, không dự án |
| Ca khó | ~10% | Nhồi từ khoá, kinh nghiệm không liên quan nhưng đủ năm… (các kiểu trong `HARD_CASES`) |

- Họ tên tiếng Việt từ danh sách họ / tên đệm / tên; giới tính khớp tên. Ngày sinh 2001–2005. Số điện thoại dạng giả trong một dải cố định.
- Học vấn 1 dòng (~15% có 2 dòng), trường và ngành lấy từ danh mục thật, ngành khớp nhóm vị trí.
- Kỹ năng 4–12, số năm 0–3 (một phần để 0 = chưa khai, đúng quy ước D1 của Job Matcher GĐ1).
- Kinh nghiệm 0–2 dòng, dự án 1–3 dòng, ~30% có chứng chỉ.
- `isOpenToOutreach` bật ~70%.
- Mỗi ứng viên 1 CV mặc định trỏ file mẫu (H4); ~10% không có CV.

### Lịch sử

| Thứ | Quy mô | Cách sinh |
|---|---|---|
| Đơn ứng tuyển | ~4.000–5.000 | Mỗi ứng viên có CV ứng tuyển 0–6 tin. Chọn tin bằng **bộ chấm quy tắc thật** (`ScoringJobMatcher`, hàm thuần) có thêm nhiễu, để người hợp hay nộp tin hợp nhưng vẫn có người nộp lệch. Trạng thái theo độ tuổi đơn: đơn càng cũ càng đi xa trong quy trình. Mỗi công ty có vài đơn `PENDING` chờ 20–60 ngày (cho 0.4). |
| Lịch sử trạng thái | Theo đơn | Chuỗi chuyển trạng thái hợp lệ theo bảng chuyển của `applications.service.ts`, ngày tăng dần |
| Lịch phỏng vấn | ~300 | Cho đơn `INTERVIEWING`: buổi đã qua và buổi trong 14 ngày tới |
| Lời mời | ~300 | Chấp nhận / Từ chối / Hết hạn / Đang chờ (đang chờ còn hạn trong 14 ngày), có `matchScore` tính lúc seed |
| Hội thoại | ~400 | Cho lời mời đã chấp nhận và một phần đơn đang phỏng vấn, 2–6 tin nhắn mỗi hội thoại |
| Tin đã lưu | ~3.000 | Ứng viên lưu tin hợp với mình |
| Thông báo | Ít | Chỉ vài thông báo chưa đọc cho các tài khoản trưng bày, để chuông không trống |

### Tài khoản dùng khi demo

Plan cố định trước các tài khoản này để kịch bản demo không phụ thuộc số ngẫu nhiên:

- 1 nhà tuyển dụng "chính" của một công ty CNTT nhiều tin, nhiều hồ sơ.
- 2–3 nhà tuyển dụng ở lĩnh vực khác (marketing, kế toán…).
- 5–8 ứng viên trưng bày (rất hợp, hợp một phần, đổi ngành), mỗi người thấy đủ 10 tin trong "Việc làm phù hợp".
- ~80 hồ sơ trưng bày viết trọn (D2) xếp đầu "Tìm ứng viên" của 8–10 tin chính.

Danh sách email cụ thể in ra cuối lần chạy và ghi vào mục ghi chú triển khai.

## Phần 1 — Công nghệ / package / kiến trúc

- **Không thêm dependency.** Bộ sinh ngẫu nhiên có seed viết tay (ví dụ mulberry32, vài dòng). Nếu thư viện dữ liệu vượt ~1,5 MB thì nén `.json.gz` bằng `zlib` có sẵn của Node.
- Không migration, không đổi API / giao diện.
- Chạy bằng `tsx` qua npm script `seed-large-demo` (cùng khuôn `seed-match-demo`, `seed-dashboard-demo`).
- Tách **sinh dữ liệu** (hàm thuần: nhận thư viện + danh mục + seed, trả về các mảng bản ghi) khỏi **ghi DB** để unit test không cần DB và để `--dry-run` dùng đúng bộ sinh thật.
- Ghi theo lô `createMany` (~500 dòng / lần), mỗi nhóm thực thể một transaction ngắn; không ghi từng dòng (mỗi lần gọi Neon ~50–150 ms).
- Mọi id script tạo có tiền tố riêng (ví dụ `clargedemo…`, chữ thường + số, bắt đầu bằng `c` để qua `z.string().cuid()`, như `seed-dashboard-demo.ts`). Email dùng domain riêng (ví dụ `@large-demo.local`). `--reset` chỉ xoá theo tiền tố id và domain này.

## Phần 2 — Liên kết giữa các phần

```text
scripts/data/large-demo/*.json        thư viện (LLM viết một lần, rà tay)
        │  đọc + kiểm bằng zod (không tin đầu vào, giống match-demo-fixture.ts)
        ▼
scripts/lib/large-demo/generate.ts    hàm thuần: thư viện + danh mục DB + seed → bản ghi
        │                           (dùng ScoringJobMatcher để chọn tin nộp / tính matchScore)
        ▼
scripts/seed-large-demo.ts            --dry-run: in số lượng, ước dung lượng, không ghi
                                    (mặc định): xoá phần cũ của chính nó → ghi theo lô
                                    --reset: chỉ xoá   --embed-only: chỉ tính embedding
        │
        ├── Prisma (ghi thẳng, kiểm outbox không tăng — D7)
        └── MatchEmbeddingService + SkillEmbeddingService (dựng như eval-job-matching.ts)
```

Tên file trên chỉ là đề xuất; giữ khuôn thư mục `scripts/lib/`, `scripts/data/` đang có.

- Đọc danh mục thật (ngành, trường, kỹ năng, thành phố, ngành nghề, loại hình, gói) trước khi sinh; tham chiếu không tìm thấy thì dừng và báo tên.
- Không gọi service nghiệp vụ (`NotificationsService`, `ApplicationsService`…) để không phát sinh email / thông báo / nhật ký ngoài ý muốn.
- Embedding: sau khi ghi xong, gọi `MatchEmbeddingService` theo lô có tiến độ. So `contentHash` nên chạy lại chỉ tính phần thiếu (chạy tiếp được nếu bị ngắt).

## Phần 3 — Các bước thực hiện

0. ✅ **(Xong 2026-11-08, xem "Kết quả bước 0")** **Điều kiện trước:** xong `major-merge-fix` (✅ 2026-11-08). Sửa lỗi mất `importance`/`minYears` của `SkillsRepository.merge` (hàm thuần + unit test), viết `merge-duplicate-skills` (`--dry-run` trước, rồi chạy thật), kiểm 5 mục nguồn đã thành alias (mục "Gộp kỹ năng trùng"). Khoảng 1 giờ.
1. **Thư viện dữ liệu** (`scripts/data/large-demo/`):
   - `positions.json`: ~30 vị trí × 3 cấp độ, mỗi vị trí gắn ngành nghề, nhóm ngành học, kỹ năng lõi / phụ.
   - `personas.json`: ~400 bộ chân dung (vị trí × cấp độ × 4–5 biến thể), mỗi bộ gồm tiêu đề, giới thiệu, kinh nghiệm, dự án, kỹ năng đi cùng nhau, cộng mảnh câu để ghép câu giới thiệu riêng từng người.
   - `job-templates.json`: mẫu tin theo vị trí (mô tả, yêu cầu, quyền lợi, vài biến thể).
   - `companies.json`: ~40 công ty (tên hư cấu, mô tả, ngành nghề, thành phố, địa chỉ).
   - `showcase.json`: ~80 hồ sơ trưng bày viết trọn và các tài khoản demo cố định.
   - `names.json`: họ, tên đệm, tên.
   - Kèm `library-prompt.md` (Q4) và bộ kiểm zod. *Kiểm:* bộ kiểm chạy sạch; chủ dự án rà mẫu ngẫu nhiên mỗi đợt; tổng dung lượng ghi vào ghi chú.
2. **Bộ sinh thuần + unit test** (`tests/unit/large-demo-generator.test.ts`): cùng seed ra cùng kết quả; tỉ lệ các nhóm đúng mục tiêu (sai số nhỏ); mọi tham chiếu nằm trong danh mục; mọi email thuộc domain demo; mọi `expiresAt` trước ngày kết thúc gói; chuỗi trạng thái đơn hợp lệ; không có đơn trùng `(jobPostId, candidateId)`.
3. **Script ghi + `--dry-run` + `--reset`:** kiểm trước khi ghi (có file CV mẫu, gói "Doanh nghiệp" tồn tại, in host DB và số dòng sẽ tạo / xoá, ước dung lượng). Dừng nếu dung lượng DB sau ghi dự kiến vượt ~200 MB. Đo `pg_database_size` trước / sau.
4. **Bước embedding** (`--embed-only` hoặc tự chạy sau bước ghi): tính cho mọi tin đang hiển thị và mọi ứng viên, in tiến độ và thời gian.
5. **Chạy thật trên Neon** (chủ dự án chạy hoặc xác nhận trước):
   - `--scale 0.1 --dry-run` → `--scale 0.1` → kiểm nhanh trên giao diện → `--reset`;
   - rồi `--dry-run` → chạy đủ quy mô.
6. **Kiểm trên giao diện** bằng các tài khoản demo:
   - `/jobs`: hàng trăm tin, các bộ lọc đều ra kết quả;
   - "Tìm ứng viên phù hợp" của 8–10 tin chính: đủ 10 người, điểm trải rộng;
   - "Việc làm phù hợp" của ứng viên trưng bày: đủ 10 tin;
   - tổng quan, Ứng viên, Lịch phỏng vấn, Lời mời, Tin nhắn của nhà tuyển dụng chính có số liệu khớp nhau;
   - bộ `@match-demo.local` không đổi (đếm trước / sau).
7. **Đo và ghi số:** thời gian ghi, thời gian embedding, dung lượng tăng thêm, thời gian phản hồi của "Tìm ứng viên" và "Việc làm phù hợp" ở quy mô này (đưa vào báo cáo, làm căn cứ cho quyết định không tách server).
8. **Cập nhật tài liệu:** đánh ✅ dòng 0.1 trong `FEATURE_BACKLOG.md`; thêm lệnh chạy vào mục Setup của `PROJECT_OVERVIEW.md` cạnh các script demo khác.

**Ước lượng:** ~2,5–3 ngày (bước 1 chiếm khoảng một nửa).

## Ngoài phạm vi

- Nới giới hạn 30 ngày của "Việc làm phù hợp" (0.5), nâng hạn mức lời mời (0.2), đổi sắp xếp mặc định hay hiện tên thay email (0.4).
- Ảnh đại diện / logo công ty (để trống, giao diện đã có chữ cái thay thế).
- Sửa bộ đánh giá Job Matcher hay số liệu GĐ2 / GĐ3 đã ghi.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
