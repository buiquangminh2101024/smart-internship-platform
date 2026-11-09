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
| Q2 | Thêm ngành nghề (`Industry`) và thành phố? | **Có, ít**: thêm ~4–6 ngành nghề (ví dụ Kế toán – Kiểm toán, Nhân sự, Logistics, Thiết kế – Sáng tạo, Bán lẻ, Du lịch – Khách sạn) và ~2 thành phố (Bắc Ninh, Huế — ban đầu ghi Bình Dương, đổi vì tỉnh này đã nhập vào TP. Hồ Chí Minh từ 01/07/2025). Hai bảng này không có cột người tạo, nên đánh dấu bằng tiền tố id; `--reset` chỉ xoá khi không còn tin / công ty / hồ sơ nào dùng. |
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
   - **Tiến độ:**
     - Đợt 1 (2026-11-08, chờ chủ dự án rà): `positions.json` (33 vị trí, 10 lĩnh vực, 3 cấp độ, 4 khung lương), `catalog-additions.json` (122 kỹ năng, 6 ngành nghề, 2 thành phố — file thêm so với danh sách trên, cho Q1–Q2), bộ kiểm `scripts/lib/large-demo/library.ts` + 9 test, lệnh `npm run check-large-demo-library` (chỉ đọc DB). Kết quả kiểm: 0 lỗi, 3 cảnh báo tên gần giống đã xem (Cypress/Express, InDesign/UI/UX Design, Kiểm toán báo cáo tài chính/Báo cáo tài chính — đều là kỹ năng khác nhau). Chủ dự án đã duyệt.
     - Đợt 2 (2026-11-08, chủ dự án đã duyệt): `names.json` (30 họ có trọng số, tên đệm / tên theo giới tính), `companies.json` (43 công ty, 77 nhà tuyển dụng; CNTT 33%; TP. HCM 42%, Hà Nội 33%, Đà Nẵng 9%; 1 công ty `main` — Mây Xanh, CNTT; 3 `secondary` — kiểm toán, agency marketing, logistics). Đổi thành phố thêm "Bình Dương" → "Bắc Ninh" vì Bình Dương đã nhập vào TP. Hồ Chí Minh từ 01/07/2025 (Q2). Bộ kiểm thêm phần names / companies, tổng 14 test. Kiểm: 0 lỗi, mọi vị trí có ≥ 2 công ty tuyển; thư viện hiện 64 KB.
     - Đợt 3a (2026-11-08, chủ dự án đã duyệt): `job-templates.json` phần dùng chung + 13 vị trí CNTT. Gồm:
       - 4 câu đối tượng mỗi nhóm (sinh viên / đã tốt nghiệp) và 8 quyền lợi chung mỗi nhóm;
       - 39 biến thể, mỗi biến thể một bối cảnh sản phẩm riêng, kèm kỹ năng bắt buộc / nên có;
       - 90 tiêu đề theo loại hình.

       Bộ kiểm thêm phần mẫu tin, tổng 20 test:
       - kỹ năng phải thuộc vị trí;
       - văn bản nhắc kỹ năng nào thì kỹ năng đó phải có trong mẫu;
       - tiêu đề chỉ nhắc kỹ năng mà mọi biến thể đều có;
       - không ghi số năm kinh nghiệm hay tên thành phố.

       Kiểm: 0 lỗi; cảnh báo còn 20 vị trí chưa có mẫu (đợt 3b, 3c). Thư viện hiện 98 KB.
     - Đợt 3b (2026-11-08, chủ dự án đã duyệt): thêm mẫu tin cho 12 vị trí. Gồm:
       - Thiết kế: UI/UX, đồ hoạ;
       - Marketing: quảng cáo số, content, SEO, PR & sự kiện;
       - Tài chính: kế toán, kiểm toán, phân tích tài chính, tín dụng ngân hàng;
       - Nhân sự: tuyển dụng, hành chính nhân sự / C&B.

       Tổng 25/33 vị trí, 75 biến thể, 174 tiêu đề. Kiểm: 0 lỗi; còn 8 vị trí chưa có mẫu (đợt 3c). Thư viện hiện 127 KB.
     - Đợt 3c (2026-11-09, chủ dự án đã duyệt): mẫu tin cho 8 vị trí cuối:
       - Logistics: xuất nhập khẩu, mua hàng / chuỗi cung ứng;
       - Kinh doanh: kinh doanh B2B, vận hành sàn thương mại điện tử, chăm sóc khách hàng;
       - Khách sạn: lễ tân;
       - Giáo dục: trợ giảng tiếng Anh;
       - Kỹ thuật: kỹ sư tự động hoá.

       `job-templates.json` **đủ 33/33 vị trí**: 99 biến thể, 230 tiêu đề, 83 KB. Kiểm: 0 lỗi, chỉ còn 3 cảnh báo tên kỹ năng gần giống đã xem từ đợt 1. Thư viện hiện 147 KB.
     - Đợt 4a (2026-11-09, chủ dự án đã duyệt cấu trúc): `personas.json` gồm schema, bộ kiểm, kho dùng chung và 3 vị trí mẫu.
       - Kho dùng chung: 32 câu riêng ghép cuối giới thiệu, 10 việc làm thêm không liên quan, tên công ty cũ hư cấu cho đủ 10 lĩnh vực.
       - 3 vị trí mẫu: Backend Node.js, Frontend React, Tester; 36 bộ, mỗi cấp độ 4 bộ, mỗi vị trí 1 bộ đổi ngành.
       - Cách bộ sinh dùng chân dung cho từng nhóm ứng viên ghi ở `library-prompt.md` (Đợt 4).

       Bộ kiểm thêm phần chân dung, tổng 25 test:
       - văn bản nói đúng cấp độ;
       - số dòng / độ dài kinh nghiệm theo cấp độ;
       - không ghi số năm, số tháng, thành phố;
       - đủ kỹ năng lõi;
       - ngành đổi ngành nằm ngoài nhóm ngành của vị trí;
       - câu riêng không nhắc kỹ năng;
       - công ty cũ không trùng công ty đang tuyển.

       Kiểm: 0 lỗi; còn 30 vị trí chưa có chân dung. Thư viện hiện 192 KB.
     - Đợt 4b (2026-11-09, chủ dự án đã duyệt): chân dung cho 10 vị trí CNTT còn lại (Java, .NET, Vue / Angular, Fullstack, Mobile, DevOps, Phân tích dữ liệu, AI / ML, BA, IT Helpdesk), 120 bộ.
       - Đủ 13/13 vị trí CNTT: 156 bộ, mỗi cấp độ 52; 13 bộ đổi ngành.
       - Ngành cũ của bộ đổi ngành: Cơ khí, Kế toán, Kiến trúc, Quản trị kinh doanh, Điện tử, Vật lý kỹ thuật, Marketing, Vật lý, Ngôn ngữ Nhật, Sư phạm Tin học.
       - Bộ đổi ngành của Phân tích dữ liệu và BA đặt ở cấp mới tốt nghiệp (đã đi làm nghề cũ rồi mới chuyển); các vị trí khác ở cấp năm cuối.

       Kiểm: 0 lỗi, không cảnh báo chân dung; còn 20 vị trí chưa có chân dung. `personas.json` 178 KB, thư viện hiện 325 KB.
     - Đợt 5 (2026-11-09, chủ dự án đã duyệt): chân dung cho Thiết kế + Marketing (UI/UX, Thiết kế đồ hoạ, Quảng cáo số, Content, SEO, PR & Sự kiện), 72 bộ.
       - Ngành cũ của bộ đổi ngành: Tâm lý học (UI/UX), Sư phạm Mỹ thuật (Thiết kế đồ hoạ, cấp mới tốt nghiệp: từng dạy mỹ thuật), Tài chính - Ngân hàng (Quảng cáo số), Văn học (Content), Ngôn ngữ học (SEO), Quản trị khách sạn (PR & Sự kiện).
       - Chữ dễ trùng tên kỹ năng ở nhóm này: "tổ chức sự kiện", "lập kế hoạch truyền thông", "viết thông cáo báo chí", "quản lý mạng xã hội", "nghiên cứu từ khoá", "chăm sóc khách hàng", "wireframe", "design system" — chỉ viết khi chân dung có kỹ năng đó.

       Kiểm: 0 lỗi, không cảnh báo chân dung; 19/33 vị trí, 228 bộ; còn 14 vị trí. `personas.json` 262 KB, thư viện hiện 408 KB. Unit test 344/344.
     - Đợt 6 (2026-11-09, chủ dự án đã duyệt): chân dung cho Tài chính + Nhân sự (Kế toán, Kiểm toán, Phân tích tài chính, Tín dụng ngân hàng, Tuyển dụng, Hành chính - Nhân sự C&B), 72 bộ.
       - Ngành cũ của bộ đổi ngành: Kinh tế nông nghiệp (Kế toán, cấp mới tốt nghiệp: từng làm sổ sách hợp tác xã), Công nghệ thông tin (Kiểm toán: hướng kiểm toán hệ thống), Kỹ thuật điện (Phân tích tài chính, cấp mới tốt nghiệp: kỹ sư dự án điện), Quản trị dịch vụ du lịch và lữ hành (Tín dụng ngân hàng, cấp mới tốt nghiệp: từng điều hành tour), Ngôn ngữ Anh (Tuyển dụng), Bảo hiểm (Hành chính - Nhân sự C&B).
       - Chữ dễ trùng tên kỹ năng ở nhóm này: "báo cáo tài chính", "kế toán thuế", "kế toán công nợ", "hoá đơn điện tử", "kiểm soát nội bộ", "thẩm định tín dụng", "tuyển dụng", "phỏng vấn ứng viên", "sàng lọc hồ sơ", "bảo hiểm xã hội", "luật lao động", "thống kê" — chỉ viết khi chân dung có kỹ năng đó.

       Kiểm: 0 lỗi, không cảnh báo chân dung; 25/33 vị trí, 300 bộ (mỗi cấp độ 100, 25 bộ đổi ngành); còn 8 vị trí. `personas.json` 344 KB, thư viện hiện 491 KB. Unit test 344/344.
     - Đợt 7 (2026-11-09, chủ dự án đã duyệt): chân dung cho 8 vị trí còn lại — Logistics (Xuất nhập khẩu, Mua hàng - Chuỗi cung ứng), Kinh doanh (Sales B2B, Vận hành sàn TMĐT, Chăm sóc khách hàng), Lễ tân khách sạn - Điều hành tour, Trợ giảng tiếng Anh, Kỹ sư Tự động hoá - Bảo trì; 96 bộ.
       - Ngành cũ của bộ đổi ngành: Luật (Xuất nhập khẩu, cấp năm cuối: hướng pháp chế hải quan), Kỹ thuật thực phẩm (Chuỗi cung ứng, cấp mới tốt nghiệp: từng kiểm soát chất lượng nguyên liệu), Kỹ thuật hóa học (Sales B2B, cấp mới tốt nghiệp: từ phòng thí nghiệm sang hỗ trợ kỹ thuật bán hàng), Kinh doanh nông nghiệp (Vận hành sàn TMĐT, cấp năm cuối: bán trái cây của gia đình), Kỹ thuật sinh học (Chăm sóc khách hàng, cấp mới tốt nghiệp: dịch vụ xét nghiệm), Kế toán (Lễ tân khách sạn, cấp năm cuối: lễ tân ca đêm), Kỹ thuật phần mềm (Trợ giảng tiếng Anh, cấp năm cuối), Công nghệ thông tin (Tự động hoá, cấp mới tốt nghiệp: IT nhà máy).
       - Chữ dễ trùng tên kỹ năng ở nhóm này: "mua hàng", "quản lý kho", "khai báo hải quan", "chứng từ xuất nhập khẩu", "thanh toán quốc tế", "chăm sóc khách hàng", "xử lý khiếu nại", "quản lý đơn hàng", "tư vấn bán hàng", "livestream bán hàng", "lễ tân khách sạn", "điều hành tour", "soạn giáo án", "quản lý lớp học", "tiếng Anh giao tiếp", "giao tiếp", "bảo trì thiết bị", "điện công nghiệp", "đọc bản vẽ kỹ thuật", "mạng máy tính" — chỉ viết khi chân dung có kỹ năng đó. Ngoài ra không để số đứng trước "năm"/"tháng", và không ghi tên tỉnh, thành phố khi tả khách sạn, khu nghỉ dưỡng.

       Kiểm: 0 lỗi, không cảnh báo chân dung (còn 3 cảnh báo cặp kỹ năng tên gần giống đã biết); **33/33 vị trí, 396 bộ** (mỗi cấp độ 132, 33 bộ đổi ngành — mỗi vị trí một bộ). `personas.json` 457 KB, thư viện hiện 604 KB. Unit test 344/344. Phần chân dung của bước 1 xong; còn `showcase.json`.
     - Đợt 8a (2026-11-09, chủ dự án đã duyệt): `showcase.json` phần chung + 40 hồ sơ trưng bày. Gồm:
       - schema và bộ kiểm phần trưng bày; lệnh kiểm đọc thêm danh mục trường (University `APPROVED`, chỉ đọc);
       - 4 tài khoản nhà tuyển dụng demo, mỗi công ty `main` / `secondary` một tài khoản: Mây Xanh, Chính Trực, Hạt Giống, Con Thoi;
       - 10 tin chính: Mây Xanh 6 tin (Backend, Frontend, Fullstack toàn thời gian, Tester, Phân tích dữ liệu, UI/UX); Chính Trực 1 (Kiểm toán); Hạt Giống 2 (Quảng cáo, Content bán thời gian); Con Thoi 1 (Xuất nhập khẩu);
       - 40 hồ sơ cho 5 tin CNTT đầu, mỗi tin 8 người theo 6 nhóm: rất hợp 2, hợp một phần 2, ngành gần 1, đổi ngành 1, sơ sài 1, ca khó 1;
       - 4 tài khoản ứng viên đăng nhập demo (`demoLogin`).

       Cách bộ sinh dùng file này (bước 2–3):
       - Email là `<key>@` + domain demo.
       - Tài khoản nhà tuyển dụng demo thay tài khoản `isCompanyAdmin` của công ty.
       - Mọi hồ sơ trưng bày bật `isOpenToOutreach`.
       - **Không** sinh đơn ứng tuyển hay lời mời của hồ sơ trưng bày vào chính tin chính của người đó. Trang "Tìm ứng viên" bỏ qua người đã nộp hoặc đang được mời vào tin (`candidate-outreach.repository.ts`, `searchCandidatePool`). Trang này cũng chỉ lấy người có chung ≥ 1 kỹ năng với tin; bộ kiểm đã chặn hồ sơ không có kỹ năng chung.
       - Mốc thời gian viết theo `asOf` (2026-11). Bộ sinh dời cả bộ theo khoảng cách tới hôm chạy, để cấp độ vẫn đúng.

       Bộ kiểm thêm 4 test, tổng 29 test. Các phần được kiểm:
       - nhóm (`tier`) khớp dữ liệu thật so với tin: rất hợp phải đủ kỹ năng bắt buộc, học ngành chính, đủ số năm;
       - họ tên khớp giới tính;
       - năm sinh và năm nhập học đúng cấp độ;
       - trường, ngành có trong danh mục;
       - tổng kinh nghiệm theo cấp độ;
       - tiêu đề tin nằm trong mẫu, ngành của tin thuộc vị trí.

       Kiểm: 0 lỗi; cảnh báo còn 5 tin chưa có hồ sơ và 4 tài khoản đăng nhập demo (cần 5–8), sẽ đủ ở đợt 8b. `showcase.json` 65 KB, thư viện hiện 669 KB. Unit test 348/348.
     - Đợt 8b (2026-11-09, chủ dự án đã duyệt): 40 hồ sơ trưng bày cho 5 tin còn lại — UI/UX (Mây Xanh), Kiểm toán (Chính Trực), Quảng cáo và Content bán thời gian (Hạt Giống), Xuất nhập khẩu (Con Thoi); cùng cơ cấu 6 nhóm như đợt 8a.
       - Ngành cũ của nhóm đổi ngành: Kiến trúc → UI/UX, Luật kinh tế → Kiểm toán, Công nghệ thực phẩm → Quảng cáo, Sư phạm Ngữ văn → Content, Kế toán → Xuất nhập khẩu (đều cấp mới tốt nghiệp).
       - Ca khó: nhồi từ khoá ở UI/UX, Quảng cáo, Xuất nhập khẩu; kinh nghiệm không liên quan ở Kiểm toán, Content.
       - Thêm 2 tài khoản đăng nhập demo: `uv-content-1` (Content, rất hợp) và `uv-audit-5` (Kiểm toán, ngành gần: Tài chính - Ngân hàng).

       Kiểm: 0 lỗi, không cảnh báo trưng bày (còn 3 cảnh báo cặp kỹ năng tên gần giống đã biết); **10/10 tin chính, 80 hồ sơ** (rất hợp 20, hợp một phần 20, mỗi nhóm còn lại 10), 6 tài khoản đăng nhập demo. `showcase.json` 126 KB, thư viện hiện 730 KB. Unit test 348/348. **Bước 1 xong.**
2. **Bộ sinh thuần + unit test** (`tests/unit/large-demo-generator.test.ts`): cùng seed ra cùng kết quả; tỉ lệ các nhóm đúng mục tiêu (sai số nhỏ); mọi tham chiếu nằm trong danh mục; mọi email thuộc domain demo; mọi `expiresAt` trước ngày kết thúc gói; chuỗi trạng thái đơn hợp lệ; không có đơn trùng `(jobPostId, candidateId)`.
   - **Tiến độ:**
     - Đợt 2a (2026-11-09, chủ dự án đã duyệt): `scripts/lib/large-demo/generate.ts`, hàm `generateLargeDemo(library, catalog, options)`. Test ở `tests/unit/large-demo-generate.test.ts` (đổi tên so với dự kiến cho cùng kiểu tên file `generate.ts`), 15 test.
       - **Đầu vào:** thư viện đã kiểm; bảng tên → id của danh mục (writer tạo các mục `catalog-additions.json` trước rồi truyền vào); `seed`, `scale`, giờ chạy `now`, mật khẩu đã băm, `fileUrl` CV mẫu, id gói "Doanh nghiệp", id một Admin (cho dòng kiểm duyệt của công ty cần duyệt tin).
       - **Đầu ra:** các mảng đúng khuôn `createMany` cho `User`, `Company`, `Employer`, `CompanySubscription`, `JobPost`, `JobPostSkill`, `JobPostMajor`, `JobPostModerationAction`, `JobPostDailyStat`, `Candidate`, `Education`, `WorkExperience`, `Project`, `Certificate`, `CandidateSkill`, `Cv`. Kèm `facts` (vị trí, nhóm, kỹ năng, ngành, tin chính của từng ứng viên; kỹ năng / ngành / ngày của từng tin) cho đợt 2b, và danh sách tài khoản demo để in cuối lần chạy.
       - **Quy mô đủ** (seed 20261109): 43 công ty, 77 nhà tuyển dụng, 400 tin (10 tin chính), 1.500 ứng viên (80 hồ sơ trưng bày), ~9.500 dòng lượt xem, ~7.700 kỹ năng ứng viên, 1.362 CV. `--scale` nhỏ vẫn giữ đủ 4 công ty demo, 10 tin chính và 80 hồ sơ trưng bày.
       - **Cách làm chính:**
         - id `clargedemo…`, email `@large-demo.local`;
         - kiểm duyệt giống `job-posts.service.ts`: `SUBMITTED` do nhà tuyển dụng, `APPROVED` actor null khi công ty không cần duyệt;
         - công ty demo không bật `requiresApproval`;
         - kinh nghiệm xếp lùi từ hôm chạy, không vượt mức cấp độ; người đã tốt nghiệp đi làm sau khi ra trường;
         - hồ sơ trưng bày dời năm học và tháng theo `asOf`.
       - **Lỗi thư viện phát hiện khi chạy thử, xử lý trong bộ sinh:** một số bộ chân dung `standard` nhắc tên ngành của vị trí (ví dụ `import-export-nam-3-d`: "Mình học Ngôn ngữ Anh", trong khi Ngôn ngữ Anh là ngành gần). Bộ sinh chỉ chọn bộ không nhắc ngành nằm ngoài nhóm được phép, và nếu bộ có nhắc thì gán đúng ngành đó. Phần lớn các chỗ "nhắc" khác là tên lĩnh vực ("ngân hàng", "thương mại điện tử"), không ảnh hưởng.
       - **Trường của ứng viên sinh thêm:** lĩnh vực có hồ sơ trưng bày lấy trường của các hồ sơ đó; 5 lĩnh vực còn lại (nhân sự, kinh doanh, du lịch, giáo dục, kỹ thuật) dùng danh sách cố định trong `generate.ts`. Tên thiếu trong danh mục thì bộ sinh dừng và báo tên.

       Kiểm: unit test 363/363, `tsc` sạch.
     - Đợt 2b (2026-11-09, chủ dự án đã duyệt): `scripts/lib/large-demo/history.ts`, hàm `generateLargeDemoHistory(demo, { seed, now })` nhận kết quả đợt 2a. Test ở `tests/unit/large-demo-history.test.ts`, 12 test.
       - **Đầu ra:** các mảng `createMany` cho `Application`, `ApplicationStatusHistory`, `Interview`, `CandidateOutreachInvitation`, `Conversation`, `Message`, `SavedJob`, `Notification`.
       - **Seed riêng**, dẫn từ seed chung, nên chỉnh phần lịch sử không làm đổi dữ liệu đợt 2a.
       - **Quy mô đủ** (seed 20261109): ~4.400 đơn, ~9.700 dòng lịch sử trạng thái, ~310 lịch phỏng vấn, ~340 lời mời, ~380 hội thoại / ~1.250 tin nhắn, ~3.500 tin đã lưu, 34 thông báo. Chạy ~2 giây.
       - **Đơn ứng tuyển:**
         - Mỗi ứng viên có CV nộp 0–6 tin.
         - Tin được chọn trong số tin có chung kỹ năng, theo điểm của bộ chấm thật (`ScoringJobMatcher`, trọng số `hybrid-v2` khi không có cosine, nên có cả ngành học), nghiêng về tin hợp. ~10% nộp thêm một tin lệch hẳn.
         - Đơn nộp trong lúc tin hiển thị, sau khi tải CV. Không đơn nào vào tin chính của chính hồ sơ trưng bày.
         - Trạng thái theo tuổi đơn, điểm càng thấp càng hay bị từ chối.
         - Chuỗi trạng thái đi đúng bảng chuyển của `applications.service.ts`; ứng viên chỉ huỷ được từ Chờ duyệt. Dòng khởi tạo do ứng viên, các bước sau do nhà tuyển dụng đăng tin.
         - Mỗi công ty 2–4 đơn Chờ duyệt đã 20–60 ngày ở tin còn hiển thị (nếu có đơn đủ cũ).
       - **Lịch phỏng vấn:**
         - Mọi đơn đã tới bước phỏng vấn đều có lịch.
         - Đơn đang phỏng vấn: ~55% có buổi trong 14 ngày tới (ngày thường, 8:30–16:30 giờ Việt Nam), còn lại buổi đã qua.
         - Đơn đã có kết quả sau phỏng vấn có buổi đã qua, trước lúc có kết quả.
         - ~8% từng có một lịch bị huỷ rồi hẹn lại.
       - **Lời mời:**
         - Chỉ mời người bật `isOpenToOutreach`, có chung kỹ năng với tin, chưa nộp tin đó; không mời hồ sơ trưng bày vào tin chính của mình.
         - Nhà tuyển dụng chọn trong 30 người điểm cao nhất. Tối đa 3 lời mời / ngày / công ty (`DEFAULT_OUTREACH_DAILY_QUOTA`), hạn 14 ngày.
         - Trạng thái khớp thời gian: Đang chờ chỉ khi còn hạn và tin còn hiển thị; trả lời trước hạn, khi tin còn hiển thị.
         - `matchScore` chấm lúc seed bằng `rule-v1`, đúng cấu hình service dùng khi chưa có embedding.
       - **Hội thoại:**
         - Mọi lời mời đã chấp nhận đều có hội thoại; ngoài ra một phần đơn đang phỏng vấn / được nhận / rút gọn, và vài câu hỏi của ứng viên.
         - 2–6 tin nhắn theo kịch bản ngắn viết sẵn trong `history.ts`; ~35% còn tin chưa đọc ở phía nhận.
       - **Tin đã lưu:** 0–5 tin mỗi ứng viên, nghiêng về tin hợp, lưu trong lúc tin hiển thị.
       - **Thông báo:** chỉ cho tài khoản demo, đều chưa đọc, render bằng chính `renderNotification`:
         - nhà tuyển dụng: 3 hồ sơ mới nhất và lời mời vừa được trả lời;
         - ứng viên: lời mời đang chờ, lịch phỏng vấn sắp tới, lần đổi trạng thái gần nhất.
       - **Tài khoản ứng viên demo** nộp ít nhất 3 tin (khi có đủ tin hợp), luôn có một lời mời đang chờ, và một đơn đang phỏng vấn có lịch sắp tới (nếu có đơn đủ cũ).
       - Đổi nhỏ ở `generate.ts`: export `idOf` để hai phần dùng chung cách đặt id.
       - Thêm khi làm bước 3: `reminderGuards` — với mỗi lịch phỏng vấn sắp tới, một thông báo `INTERVIEW_REMINDER` đã đọc cho ứng viên, đúng `dedupeKey` của cron `interview-reminder`, để cron không gửi email nhắc lịch tới địa chỉ `@large-demo.local` (cách của `seed-dashboard-demo.ts`). Tách khỏi `notifications` vì không phải thông báo "chuông". Thêm 1 test.

       Kiểm: unit test 375/375, `tsc` sạch. **Bước 2 xong.**
3. **Script ghi + `--dry-run` + `--reset`:** kiểm trước khi ghi (có file CV mẫu, gói "Doanh nghiệp" tồn tại, in host DB và số dòng sẽ tạo / xoá, ước dung lượng). Dừng nếu dung lượng DB sau ghi dự kiến vượt ~200 MB. Đo `pg_database_size` trước / sau.
   - **Tiến độ:** Bước 3 (2026-11-09, chủ dự án đã duyệt). Script `scripts/seed-large-demo.ts`, npm script `seed-large-demo`; phần thuần ở `scripts/lib/large-demo/write-plan.ts` (4 test trong `tests/unit/large-demo-write-plan.test.ts`).
     - **Lệnh:** `--dry-run` (chỉ đọc), mặc định (xoá phần demo cũ rồi ghi lại), `--reset` (chỉ xoá); kèm `--scale <0..1>`, `--seed <số>` (mặc định 20261109). Tham số sai thì dừng trước khi đụng DB.
     - **Thứ tự một lần ghi:**
       1. In host DB và `pg_database_size`.
       2. Gộp 5 cặp kỹ năng trùng (`mergeDuplicateSkills`; ở `--dry-run` chỉ xem).
       3. Đọc thư viện, kiểm bằng `validateLargeDemoLibrary` với danh mục thật (bỏ các mục id `clargedemo…` do chính seed tạo).
       4. Kiểm: CV mẫu `cv-mau-demo.pdf`, gói "Doanh nghiệp", một Admin; mục danh mục định thêm không trùng tên mục có sẵn (kể cả kỹ năng chờ duyệt).
       5. Sinh dữ liệu (2a + 2b) và kiểm trước khi ghi: mọi id có tiền tố và không trùng, mọi email `@large-demo.local`, mọi tin hết hạn trước ngày kết thúc gói.
       6. In sẽ xoá / tạo bao nhiêu dòng, ước dung lượng (độ dài JSON × 2,5), dừng nếu DB dự kiến vượt 200 MB.
       7. Xoá phần demo cũ (một transaction), tạo mục danh mục còn thiếu, ghi 4 nhóm (công ty / tin / ứng viên / lịch sử), mỗi nhóm một transaction, lô 500 dòng. Mỗi nhóm đếm `outbox_events` trước / sau, đổi thì huỷ nhóm đó.
       8. In thời gian, dung lượng trước / sau, danh sách tài khoản demo.
     - **Danh mục thêm (Q1, Q2):** đánh dấu bằng tiền tố id (`clargedemoskill…`, `clargedemoind…`, `clargedemocity…`, phần sau là băm FNV của tên nên không phụ thuộc thứ tự trong file). Lần ghi sau dùng lại mục đã có theo tên. Chỉ `--reset` xoá, và chỉ xoá mục không còn tin / hồ sơ / công ty nào dùng. `check-large-demo-library` cũng bỏ các mục này khi kiểm.
     - **Phạm vi xoá:** dòng có id `clargedemo…`, tài khoản `@large-demo.local`, và mọi thứ gắn vào chúng dù không do seed tạo (ví dụ đơn ai đó nộp thử vào tin demo, tin nhà tuyển dụng demo tự đăng trên giao diện). Bản in tách riêng số dòng "không do seed tạo". Kỹ năng / ngành / trường do tài khoản demo gõ thêm trên giao diện được giữ, chỉ bỏ người tạo. Dừng, không xoá, nếu có giao dịch thanh toán gắn với gói của công ty demo hoặc nhà tuyển dụng ngoài bộ demo thuộc công ty demo.
     - **Email:** không gọi service nghiệp vụ. Cron `interview-reminder` bị chặn bằng `reminderGuards` (đợt 2b). Cron hết hạn tin / lời mời và báo tin sắp hết hạn chỉ tạo thông báo trong app. Còn lại email nhắc gói ~7 ngày trước khi gói demo hết hạn: script in lời nhắc chạy lại trước ngày đó (như `seed-dashboard-demo`).
     - **`--dry-run` trên DB của chủ dự án (chỉ đọc, 2026-11-09):** 5 cặp kỹ năng đã gộp trước đó; thư viện hợp lệ; sẽ thêm 122 kỹ năng, 6 ngành nghề, 2 thành phố; CV mẫu có sẵn; chưa có dữ liệu demo lớn để xoá. Sẽ tạo 50.403 dòng (1.577 tài khoản, 400 tin, 1.500 ứng viên, 4.467 đơn, 9.731 dòng lịch sử, 305 lịch phỏng vấn, 328 lời mời, 417 hội thoại / 1.355 tin nhắn, 3.485 tin đã lưu, 32 thông báo + 91 nhắc lịch đặt sẵn). Ước thêm ~25,6 MB → DB ~39,6 MB (hiện 14 MB). `--scale 0.1`: 6.812 dòng, ~3,6 MB. Sinh dữ liệu ~2 giây.
     - **Chưa chạy ghi thật / `--reset`** (bước 5, chủ dự án chạy hoặc xác nhận trước). Embedding thuộc bước 4.

     Kiểm: unit test 380/380, `tsc` sạch.
4. **Bước embedding** (`--embed-only` hoặc tự chạy sau bước ghi): tính cho mọi tin đang hiển thị và mọi ứng viên, in tiến độ và thời gian.
   - **Tiến độ:** Bước 4 (2026-11-09, chủ dự án đã duyệt và đã chạy). `scripts/lib/large-demo/embed.ts`, phần thuần (`staleTargets`, `remainingSeconds`) ở `write-plan.ts`, 2 test mới trong `large-demo-write-plan.test.ts`.
     - **Lệnh:** mặc định tự tính ngay sau khi ghi; `--no-embed` để bỏ qua; `--embed-only` chỉ tính phần còn thiếu cho dữ liệu demo đang có. `--dry-run` dùng kèm được với `--embed-only` (đếm phần cần tính, không nạp model) và với `--reset` (in sẽ xoá gì, không xoá).
     - **Tính gì:**
       - Kỹ năng seed thêm chưa có cột `embedding` (H7): embed tên, ghi bằng `SkillEmbeddingService.saveEmbedding` như cron backfill.
       - Mọi tin demo (`clargedemo…`, kể cả tin đã đóng / hết hạn: danh sách đơn của Employer vẫn chấm điểm các tin này) và mọi hồ sơ ứng viên demo.
     - **Cách tính:** dùng đúng các mảnh của service thật, không sửa `src/`. `JobMatchProfileLoader` / `CandidateMatchProfileLoader` dựng `matchText`, `computeContentHash` (model + phiên bản mẫu + văn bản), `MatchEmbeddingRepository.upsertMany` ghi `job_post_embeddings` / `candidate_embeddings`. Lô 50 dòng, embed tuần tự (model CPU đơn luồng). Vector đã có và khớp hash thì bỏ qua, nên bị ngắt thì chạy `--embed-only` để tính tiếp. Model không dùng được thì dừng và báo; các lô trước vẫn giữ.
     - **Xoá:** vector của tin / hồ sơ xoá theo cascade khi xoá phần demo; vector của kỹ năng nằm trên dòng kỹ năng.
     - **Đo trên máy chủ dự án:** nạp model ~2,4 giây, ~26 ms / văn bản. Quy mô đủ ~2.022 văn bản (400 tin, 1.500 hồ sơ, 122 kỹ năng), ước 1–2 phút kể cả các lượt gọi Neon. Dung lượng vector ước thêm vài MB (384 số thực / dòng); số thật in ra sau khi chạy.
     - **`--dry-run` trên DB của chủ dự án (chỉ đọc):** chế độ ghi in thêm dòng embedding (400 tin, 1.500 hồ sơ, 122 kỹ năng mới); `--embed-only --dry-run` ra 0/0 vì chưa có dữ liệu demo lớn. Chưa tính embedding thật (cần ghi dữ liệu trước, bước 5).

     Kiểm: unit test 382/382, `tsc` sạch.
5. **Chạy thật trên Neon** (chủ dự án chạy hoặc xác nhận trước):
   - `--scale 0.1 --dry-run` → `--scale 0.1` → kiểm nhanh trên giao diện → `--reset`;
   - rồi `--dry-run` → chạy đủ quy mô.
6. **Kiểm trên giao diện** bằng các tài khoản demo:
   - `/jobs`: hàng trăm tin, các bộ lọc đều ra kết quả;
   - "Tìm ứng viên phù hợp" của 8–10 tin chính: đủ 10 người, điểm trải rộng;
   - "Việc làm phù hợp" của ứng viên trưng bày: đủ 10 tin;
   - tổng quan, Ứng viên, Lịch phỏng vấn, Lời mời, Tin nhắn của nhà tuyển dụng chính có số liệu khớp nhau;
   - bộ `@match-demo.local` không đổi (đếm trước / sau).
   - **Tiến độ:** Bước 6 (2026-11-09, chủ dự án đã duyệt). Chủ dự án đã ghi quy mô đủ lên Neon (bước 5). Kiểm bằng API của server local, đối chiếu DB (chỉ đọc), và xem giao diện `localhost:3000` bằng tài khoản demo.
     - **DB sau khi ghi:** 1.577 tài khoản, 43 công ty, 400 tin (303 đang hiển thị, 17 đã đóng, 23 hết hạn, 39 nháp, 18 chờ duyệt), 1.500 ứng viên, 4.467 đơn. Embedding đủ: 400 tin, 1.500 hồ sơ, 0 kỹ năng seed thiếu vector. DB 35 MB. `outbox_events` vẫn 36 (không có email nào được xếp hàng). Bộ `@match-demo.local` vẫn 22 tài khoản (21 ứng viên + 1 nhà tuyển dụng, đúng fixture).
     - **`/jobs`:** 311 tin công khai (303 demo + 8 có sẵn). Bộ lọc đều ra kết quả: "thực tập" 203, "kế toán" 24, theo thành phố 10, theo ngành 28, thực tập 223 / bán thời gian 40 / toàn thời gian 34, lương từ 8 triệu 124, theo kỹ năng 3.
     - **Tìm ứng viên phù hợp:** 6 tin trưng bày của Mây Xanh và 3 tin của Chính Trực / Con Thoi đều đủ 10 người. Điểm top 10 từ 63–100 (UI/UX) đến 88–100 (Backend). Chỉ người đăng tin mới tìm được: gọi trên tin của đồng nghiệp cùng công ty trả 404, đúng thiết kế (`candidate-outreach.service.ts`).
     - **Việc làm phù hợp:** 6 ứng viên trưng bày đều đủ 10 tin, tin đầu đúng tin trưng bày (Backend, Fullstack, Data, Kiểm toán, Content 100% / 96%; ứng viên đổi ngành Data 78%).
     - **Nhà tuyển dụng chính (Mây Xanh), giao diện khớp DB:** 32 tin đang hiển thị / 1 chờ duyệt / 5 nháp / 5 đã đóng hoặc hết hạn; 130 hồ sơ chờ; 3 buổi phỏng vấn trong 7 ngày tới (đơn đang phỏng vấn), 8 buổi 7 ngày qua; lịch 30 ngày từ hôm nay 11 buổi; 24 hội thoại của chính người này (tin nhắn tính theo từng nhà tuyển dụng, công ty có 3 người), 3 chưa đọc. Lời mời: 36 tin trong tóm tắt. Không có lịch sắp tới nào gắn với đơn đã kết thúc.
     - **Thời gian phản hồi (server local, DB Neon, đã có embedding):** "Tìm ứng viên" ~1,5–2,9 giây; "Việc làm phù hợp" ~1,4–1,9 giây (lần đầu sau khi server khởi động tới ~5,5 giây vì nạp model); trang đầu `/job-posts` ~0,6–0,9 giây; tổng quan nhà tuyển dụng ~1,2 giây. Dùng cho bước 7.
     - **Điều thấy trên giao diện, chưa sửa (ngoài phạm vi seed):**
       - Logo chữ cái mặc định của mọi công ty demo đều là "C" (tên đều bắt đầu bằng "Công ty"). Có thể thêm `logoUrl` cho công ty trưng bày, hoặc lấy chữ cái từ tên rút gọn.
       - Hàng chip "Kỹ năng" ở `/jobs` dài hơn nhiều sau khi thêm 122 kỹ năng.
       - Một lần ở trang tổng quan: thanh bên hiện tên công ty cũ ("Công ty Demo Job Matcher", từ phiên đăng nhập trước) lúc đang tải, và tên công ty dài tràn ra ngoài thanh bên. Ở trang "Tìm ứng viên" tên hiển thị đúng.
7. **Đo và ghi số:** thời gian ghi, thời gian embedding, dung lượng tăng thêm, thời gian phản hồi của "Tìm ứng viên" và "Việc làm phù hợp" ở quy mô này (đưa vào báo cáo, làm căn cứ cho quyết định không tách server).
   - **Tiến độ:** Bước 7 (2026-11-09, chờ chủ dự án duyệt). Đo trên máy chủ dự án: server local, DB Neon. Mọi lượt đo chỉ đọc DB.
     - **Quy mô:** 50.403 dòng (1.577 tài khoản, 43 công ty, 400 tin, 1.500 ứng viên, 4.467 đơn), 2.022 văn bản embedding (400 tin, 1.500 hồ sơ, 122 kỹ năng).
     - **Thời gian ghi:** chủ dự án chạy (bước 5). Script in dòng "Ghi xong trong … giây" và "Embedding xong trong … giây"; *(chủ dự án bổ sung số từ log)*. Sinh dữ liệu ~2 giây (đo ở `--dry-run`).
     - **Thời gian embedding** (đo lại phần tính, không ghi): nạp model 2,4 giây; nạp profile 1.900 tin / hồ sơ từ Neon 16,8 giây; 122 kỹ năng 0,7 giây; 400 tin 16,3 giây (40,8 ms / văn bản); 1.500 hồ sơ 46,0 giây (30,7 ms / văn bản). Tổng ~82 giây chưa kể ghi vector, khớp ước 1–2 phút ở bước 4. `matchText` dài trung bình 473 ký tự. Một lượt gọi Neon ~46 ms.
     - **Dung lượng:** DB 14 MB → 35 MB (+21 MB; `--dry-run` ước +25,6 MB). Vector chiếm ~4,2 MB: `candidate_embeddings` 3,2 MB (1.523 dòng), `job_post_embeddings` 1,0 MB (419 dòng), kể cả các dòng có sẵn ngoài bộ demo lớn. Bảng lớn nhất còn lại: `application_status_history` 3,2 MB, `job_post_daily_stats` 2,3 MB, `applications` 2,2 MB. Còn xa giới hạn 512 MB của gói Neon miễn phí.
     - **Thời gian phản hồi** (gọi thẳng API `localhost:4000`; mỗi endpoint 1 lần đầu + 5 lần lặp; model đã nạp sẵn):

       | Chức năng | Mẫu | Trung vị | p90 | Max |
       |---|---|---|---|---|
       | "Tìm ứng viên phù hợp" (6 tin của Mây Xanh) | 30 | 1,63 giây | 2,38 giây | 2,98 giây |
       | "Việc làm phù hợp" (6 ứng viên trưng bày) | 30 | 1,36 giây | 1,52 giây | 1,65 giây |
       | `/job-posts` trang đầu | 5 | 0,53 giây | — | 0,57 giây |
       | Tổng quan nhà tuyển dụng | 5 | 0,58 giây | — | 0,63 giây |

       Lần gọi đầu mỗi endpoint chậm hơn một chút (0,96–2,7 giây). Lần gọi đầu sau khi server khởi động tới ~5,5 giây vì nạp model (bước 6).
     - **Kết luận cho báo cáo:** ở quy mô ~400 tin / 1.500 ứng viên, hai chức năng chấm điểm trả kết quả trong khoảng 1,3–3 giây, phần lớn là các lượt gọi Neon (~46 ms / lượt) chứ không phải tính model, vì vector đã tính sẵn. Chạy model trong cùng process Express vẫn đủ cho demo, chưa cần tách server embedding riêng. Nếu sau này cần nhanh hơn, nên giảm số lượt gọi DB hoặc lưu sẵn kết quả chấm (0.3) trước khi nghĩ tới tách server.
8. **Cập nhật tài liệu:** đánh ✅ dòng 0.1 trong `FEATURE_BACKLOG.md`; thêm lệnh chạy vào mục Setup của `PROJECT_OVERVIEW.md` cạnh các script demo khác.
   - **Tiến độ:** Bước 8 (2026-11-09, chờ chủ dự án duyệt). Đã đánh ✅ dòng 0.1 (ghi chú làm ở đâu, số đo chính). Đã thêm bước "(Tuỳ chọn) Dữ liệu demo lớn" vào mục Setup của `PROJECT_OVERVIEW.md`: lệnh chạy, các tham số, tài khoản demo.
     - **Tài khoản demo** (mật khẩu `123456789`, script in lại cuối mỗi lần ghi):
       - Nhà tuyển dụng: `tuyendung-mayxanh@large-demo.local` (Mây Xanh, công ty CNTT chính); `tuyendung-chinhtruc@…` (kiểm toán); `tuyendung-hatgiong@…` (truyền thông); `tuyendung-conthoi@…` (logistics).
       - Ứng viên: `uv-backend-1@…` (rất hợp, Backend); `uv-fullstack-1@…` (rất hợp, Fullstack); `uv-frontend-3@…` (hợp một phần, Frontend); `uv-data-6@…` (đổi ngành, Data); `uv-audit-5@…` (ngành gần, Kiểm toán); `uv-content-1@…` (rất hợp, Content).

**Ước lượng:** ~2,5–3 ngày (bước 1 chiếm khoảng một nửa).

## Ngoài phạm vi

- Nới giới hạn 30 ngày của "Việc làm phù hợp" (0.5), nâng hạn mức lời mời (0.2), đổi sắp xếp mặc định hay hiện tên thay email (0.4).
- Ảnh đại diện / logo công ty (để trống, giao diện đã có chữ cái thay thế).
- Sửa bộ đánh giá Job Matcher hay số liệu GĐ2 / GĐ3 đã ghi.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*
