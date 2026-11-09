# Quy tắc viết thư viện dữ liệu demo lớn

Đi kèm `PLAN.md` (bước 1, Q4). Thư viện nằm ở `apps/server/scripts/data/large-demo/`, do Claude Code viết trực tiếp thành JSON trong phiên làm việc, chia đợt theo lĩnh vực, chủ dự án rà từng đợt. File này ghi lại quy tắc để viết lại hoặc viết thêm mà vẫn ăn khớp với phần đã có.

Sau mỗi đợt chạy bộ kiểm (chỉ đọc DB):

```bash
npm run check-large-demo-library --workspace server
```

Bộ kiểm ở `apps/server/scripts/lib/large-demo/library.ts`, test ở `apps/server/tests/unit/large-demo-library.test.ts`. Có lỗi thì sửa thư viện, không nới bộ kiểm.

## Quy tắc chung (mọi file)

1. **Tên trong danh mục viết đúng từng ký tự.** Kỹ năng, ngành học, ngành nghề, thành phố phải trùng khớp tên trong DB hoặc trong `catalog-additions.json`. Bộ chấm điểm so khớp theo id, không theo nghĩa.
2. **Không dùng tên đã thành alias** (`NodeJS`, `ReactJS`, `JS`, `Apache Kafka`, `MSSQL`). Dùng tên đích: `Node.js`, `React`, `JavaScript`, `Kafka`, `MS SQL Server`. Không dùng `.Net (C#)`, dùng `.NET` và `C#`.
3. **Ngành học chọn tên gọn**, ví dụ "Công nghệ thông tin", không chọn tên chương trình dài kiểu "Chương trình tiêu chuẩn…", "… - Chương trình tiên tiến". Danh mục có nhiều biến thể chính tả ("Thiết kế đồ hoạ" / "Thiết kế đồ họa"); chọn một biến thể và dùng thống nhất.
4. **Hư cấu hoàn toàn.** Không tên công ty, trường, người, sản phẩm có thật gắn với nội dung bịa. Không email, số điện thoại, đường link thật trong văn bản tự do.
5. **Tiếng Việt tự nhiên**, giọng sinh viên / nhà tuyển dụng Việt Nam thật, có dấu đầy đủ. Thuật ngữ nghề giữ nguyên tiếng Anh khi người trong nghề vẫn gọi vậy (REST API, Sprint, KPI).
6. **Giới hạn độ dài** theo ngưỡng cắt của `match-text.builder` (phần vượt không vào embedding): giới thiệu hồ sơ ≤ 300 ký tự, mô tả tin ≤ 300, yêu cầu tin ≤ 400.
7. **Ăn khớp trong một bản ghi**: tiêu đề, giới thiệu, dự án, kinh nghiệm, kỹ năng cùng nói về một hướng. Kỹ năng nhắc trong văn bản phải có trong danh sách kỹ năng của bản ghi đó.

## Đợt 1 — `positions.json`, `catalog-additions.json` (2026-11-08)

### `positions.json`

- `levels`: đúng 3 cấp độ, dùng chung cho mọi vị trí:
  - `nam-3`: sinh viên năm 3, chưa đi làm, kinh nghiệm 0–0,5 năm;
  - `nam-cuoi`: sinh viên năm cuối, đã thực tập hoặc làm thêm, kinh nghiệm 0,5–1 năm;
  - `moi-tot-nghiep`: mới tốt nghiệp, đã đi làm, kinh nghiệm 1–2,5 năm.
  Năm sinh trong khoảng 2001–2005 (PLAN, "Ứng viên"). `jobTypes` là loại hình tin người ở cấp đó hay nộp.
- `salaryBands`: khung lương VND/tháng theo loại hình tin (`it`, `office`, `service`, `engineering`). Mức tham khảo thị trường thực tập / mới ra trường 2026, không cần chính xác.
- `softSkills`: kỹ năng mềm rải thêm cho mọi lĩnh vực.
- `positions`: 25–40 vị trí. Mỗi vị trí:
  - `key`: chữ thường không dấu, gạch nối; là khoá các file sau tham chiếu tới, **không đổi** sau khi đã có file dùng nó;
  - `domain`: một trong 10 lĩnh vực của `DOMAINS` (bộ kiểm cảnh báo lĩnh vực trống);
  - `industries`: ngành nghề của công ty hay tuyển, mục đầu là chính;
  - `majors.primary` (≥ 2): ngành học đúng chuyên môn → `JobPostMajor` PRIMARY, ứng viên "rất hợp";
  - `majors.related` (≥ 1): ngành gần → RELATED, ứng viên "ngành gần";
  - `skills.core` (3–5): kỹ năng lõi, tin lấy phần lớn kỹ năng bắt buộc từ đây;
  - `skills.extra` (4–10): kỹ năng nên có của tin, kỹ năng thêm của ứng viên;
  - `salaryBand`: khoá trong `salaryBands`;
  - `adjacent`: vị trí gần, dùng cho ứng viên "đổi ngành" / "hợp một phần".
- Tỉ trọng: CNTT khoảng 40% số vị trí (công ty CNTT ~35%, PLAN "Công ty"), phần còn lại trải đủ 9 lĩnh vực.

### `catalog-additions.json`

- `skills`: kỹ năng thêm vào danh mục (Q1, ~80–120). Bộ kiểm báo **lỗi** nếu trùng tên / alias đã có hoặc giống ≥ 0,85 theo `skillSimilarity` (người dùng gõ tên đó sẽ tự khớp nhầm sang mục kia), **cảnh báo** nếu giống 0,6–0,85, và cảnh báo nếu không vị trí nào dùng.
- Tránh đặt hai kỹ năng cùng nghĩa khác tên (đúng lỗi 5 cặp trùng đã gộp ở bước 0). Ngoại ngữ đặt tên ngắn (`Tiếng Trung`, `Tiếng Hàn`, `Tiếng Nhật`); không đặt "Tiếng Trung giao tiếp" vì quá giống "Tiếng Anh giao tiếp".
- `industries` (Q2, 4–6) theo kiểu tên đang có ("Tài chính - Ngân hàng"); `cities` (Q2, ~2).
- **Thành phố phải còn là đơn vị hành chính sau sắp xếp 01/07/2025.** PLAN gợi ý "Bình Dương", nhưng tỉnh này đã nhập vào TP. Hồ Chí Minh nên đổi thành "Bắc Ninh" (vẫn là tỉnh, có nhiều khu công nghiệp, hợp với các công ty ngành Sản xuất).

## Đợt 2 — `names.json`, `companies.json` (2026-11-08)

### `names.json`

- `familyNames`: ~30 họ kèm `weight` gần tỉ lệ thật (Nguyễn ~38%, Trần ~11%, Lê ~9,5%…).
- `middleNames`, `givenNames`: tách `MALE` / `FEMALE` để giới tính khớp tên (PLAN "Ứng viên"). Mỗi danh sách ≥ 10 tên, không lặp; bộ sinh tránh ghép tên đệm trùng tên chính ("Ngọc Ngọc").
- Họ tên không cần duy nhất (người thật cũng trùng tên); email do bộ sinh đánh số để duy nhất.

### `companies.json`

- `employerTitles`: chức danh cho `Employer.title`.
- `companies`: 30–50 công ty. Mỗi công ty:
  - `key` chữ thường không dấu, gạch nối; `name` hư cấu, không trùng thương hiệu có thật mà mình biết;
  - `industry`, `companyType`, `city`, `branchCities` đúng tên danh mục (hoặc `catalog-additions.json`); chi nhánh không trùng trụ sở;
  - `address` chỉ ghi số nhà, tên đường hoặc tên khu công nghiệp, **không** ghi quận / phường (tên đơn vị hành chính cấp xã đã đổi nhiều sau 2025, tránh ghi sai);
  - `description` ≤ 500 ký tự, 2–3 câu: công ty làm gì, quy mô, điểm hấp dẫn với sinh viên; không email / số điện thoại / link;
  - `employerCount` 1–3 (công ty chính 3);
  - `positions`: khoá vị trí công ty tuyển, phải khớp nghề của công ty (công ty bán lẻ tuyển mua hàng, kế toán, CSKH… chứ không tuyển AI);
  - `demoRole`: đúng 1 `main` (công ty CNTT nhiều vị trí, cho nhà tuyển dụng "chính") và 2–3 `secondary` ở lĩnh vực khác (PLAN "Tài khoản dùng khi demo").
- Tỉ lệ mục tiêu (PLAN "Công ty"): CNTT ~35%; TP. HCM ~45%, Hà Nội ~35%, Đà Nẵng ~10%, còn lại các thành phố khác. Lệnh kiểm in tỉ lệ thực tế để so.
- Bộ kiểm cảnh báo vị trí có dưới 2 công ty tuyển (ứng viên vị trí đó sẽ thiếu tin hợp).

## Đợt 3 — `job-templates.json` (viết dần theo lĩnh vực)

- Đợt 3a (2026-11-08): kho dùng chung + 13 vị trí CNTT.
- Đợt 3b (2026-11-08): Thiết kế, Marketing, Tài chính, Nhân sự (12 vị trí).
- Đợt 3c (2026-11-09): 8 vị trí còn lại (Logistics, Kinh doanh, Du lịch, Giáo dục, Kỹ thuật) → đủ 33/33.
- Thêm vị trí mới vào `positions.json` thì phải viết mẫu tin cho nó: bộ kiểm cảnh báo vị trí chưa có mẫu.
- Tên kỹ năng tiếng Việt phải viết đúng dấu như danh mục ("hoá đơn điện tử", "nghiên cứu từ khoá", không viết "hóa", "khóa") thì bộ dò mới nhận ra trong văn bản.

### Cách bộ sinh ghép một tin

- **Tiêu đề:** lấy từ `titles[jobType]` của vị trí.
- **Mô tả:** `description` của một biến thể.
- **Yêu cầu:** một câu `audiences` rồi tới `requirements` của biến thể.
  - `student` dùng cho INTERNSHIP / PART_TIME.
  - `graduate` dùng cho FULL_TIME / CONTRACT.
  - Câu audience ≤ 130 ký tự, phần chuyên môn ≤ 260 ký tự, nên tổng < 400 (ngưỡng cắt H6).
- **Quyền lợi:** 3–4 dòng `benefits` chung cùng nhóm đối tượng, cộng `benefits` riêng của vị trí (≤ 3 dòng).
- **Kỹ năng:** `skills` của biến thể (`required` 2–4, `preferred` 1–4, tổng ≤ 7).
- **Do bộ sinh đặt, không viết vào mẫu:** lương, địa điểm, ngành học, `minExperienceYears`, `minYears`.

### Quy tắc

- Mỗi vị trí 3–4 biến thể, mỗi biến thể là **một bối cảnh sản phẩm / khách hàng khác nhau** (ví dụ ngân hàng, thương mại điện tử, nhà máy) để embedding của các tin không trùng nhau.
- Mô tả ≤ 300 ký tự, 2 câu: làm sản phẩm gì, công việc cụ thể, cách làm việc của đội. Yêu cầu nói kỹ năng cần có, mức độ, điểm cộng.
- Kỹ năng của biến thể lấy từ `core` / `extra` của vị trí hoặc `softSkills`; `required` có ≥ 2 kỹ năng lõi.
- **Văn bản nhắc đúng tên kỹ năng nào thì kỹ năng đó phải có trong `skills` của biến thể.** Bộ kiểm dò theo tên trong danh mục của vị trí (không phân biệt hoa thường, trừ tên ≤ 3 ký tự như "Go", "C#") và cảnh báo khi lệch.
  - Để ý các cụm tiếng Việt trùng tên kỹ năng mềm: "giao tiếp", "làm việc nhóm", "giải quyết vấn đề", "thống kê". Câu "trao đổi dữ liệu qua Kafka" an toàn hơn "giao tiếp qua Kafka".
- **Tiêu đề ghép ngẫu nhiên với biến thể**: tiêu đề chỉ được nhắc kỹ năng mà **mọi** biến thể đều có (bộ kiểm báo lỗi). Ví dụ không đặt "Backend Developer (Node.js/TypeScript)" khi có biến thể không dùng TypeScript.
- **Không ghi số năm kinh nghiệm** ("1 năm", "hai năm") trong `requirements` / `audiences`: số năm do `minExperienceYears` của tin quyết định. "Sinh viên năm 3" (năm học) vẫn được.
- **Không ghi tên thành phố**: địa điểm lấy theo công ty và chi nhánh.
- Tiêu đề không lặp trên toàn file; loại hình PART_TIME / CONTRACT ghi rõ trong tiêu đề ("(part-time)", "(hợp đồng dự án)").

## Đợt 4 — `personas.json` (viết dần theo lĩnh vực)

- Đợt 4a (2026-11-09): kho dùng chung + 3 vị trí CNTT mẫu (`backend-nodejs`, `frontend-react`, `tester`), 36 bộ.
- Đợt 4b (2026-11-09): 10 vị trí CNTT còn lại, đủ 13/13 vị trí CNTT (156 bộ). Bộ đổi ngành không bắt buộc ở cấp năm cuối: chọn cấp hợp với câu chuyện (ví dụ người đã đi làm marketing rồi mới chuyển sang phân tích dữ liệu thì ở cấp mới tốt nghiệp).
- Lưu ý khi viết: tên kỹ năng ngắn hay trùng chữ thường gặp. "thống kê", "thuyết trình", "giao tiếp", "bảo mật mạng", "mạng máy tính", "SQL" (kể cả "SQL Server" không có "MS"), "DevOps" trong tiêu đề — viết ra thì phải có kỹ năng đó trong `skills`, nếu không thì đổi từ.
- Các đợt sau: viết tiếp theo lĩnh vực. Bộ kiểm cảnh báo vị trí chưa có chân dung cho tới khi đủ 33.

### Cấu trúc

Kho dùng chung:

- `bioTails` (≥ 30): câu riêng ≤ 80 ký tự, ghép cuối giới thiệu. Không nhắc kỹ năng nào (bộ kiểm báo lỗi), không nói theo cấp độ (dùng cho cả sinh viên lẫn người đã đi làm).
- `unrelatedJobs` (≥ 8): việc làm thêm không liên quan nghề (phục vụ, gia sư, giao hàng…), cho ca khó "kinh nghiệm không liên quan nhưng đủ năm".
- `pastCompanies`: tên công ty cũ hư cấu theo lĩnh vực (≥ 5 mỗi lĩnh vực). **Không trùng tên công ty trong `companies.json`** (bộ kiểm báo lỗi), để hồ sơ không ghi "từng làm" ở chính công ty đang tuyển.

Mỗi vị trí một nhóm `groups[]`:

- `certificates`: 1–4 chứng chỉ; khoảng 30% ứng viên của vị trí được gán một chứng chỉ.
- `personas`: ≥ 4 bộ mỗi cấp độ (nên đúng 4), trong đó ≥ 1 bộ `career-switch`.

Mỗi bộ chân dung gồm:

- `headline` ≤ 100 ký tự;
- `bio` ≤ 210 ký tự (cộng câu riêng ≤ 80, tổng < 300, ngưỡng H6);
- `skills`: 4–10 kỹ năng;
- `experiences`: 0–2 dòng `{ position, months: [min, max], description }`;
- `projects`: 1–3 dòng `{ name, description }`.

Tên vị trí trong kinh nghiệm và tên dự án đi thẳng vào embedding, nên đặt tên mô tả được việc làm ("Hệ thống đặt lịch phòng khám", không phải "Đồ án 1").

### Bộ sinh dùng chân dung thế nào (bước 2)

| Nhóm ứng viên (PLAN) | Cách tạo từ chân dung |
|---|---|
| Rất hợp | Giữ nguyên bộ `standard`, ngành học lấy từ `majors.primary` |
| Hợp một phần | Bộ `standard`, bớt 1–2 kỹ năng lõi hoặc hạ số năm |
| Ngành gần | Bộ `standard`, ngành học lấy từ `majors.related` |
| Đổi ngành | Bộ `career-switch`, ngành học lấy từ `fromMajors` |
| Sơ sài | Chỉ giữ tiêu đề và 2–3 kỹ năng, bỏ kinh nghiệm, dự án, giới thiệu |
| Ca khó | Nhồi kỹ năng của vị trí khác, hoặc thay kinh nghiệm bằng `unrelatedJobs` đủ số năm |

Họ tên, giới tính, trường, thành phố, ngày tháng, số năm kỹ năng đều do bộ sinh đặt.

### Quy tắc

- **Đúng cấp độ.** Bộ kiểm báo lỗi khi văn bản nói sai cấp độ (`levelConflict`):
  - `nam-3` không ghi "năm cuối" / "năm 4", không có quá 1 dòng kinh nghiệm (việc ngắn: cộng tác viên, làm thêm);
  - `nam-cuoi` có ≥ 1 dòng kinh nghiệm (thực tập, bán thời gian), không ghi "đã / mới tốt nghiệp";
  - `moi-tot-nghiep` có ≥ 1 dòng kinh nghiệm, không ghi "sinh viên năm…", "năm cuối";
  - `months` tối đa không vượt số năm kinh nghiệm tối đa của cấp (6 / 12 / 30 tháng).
- **Không ghi số năm, số tháng** ("hai năm", "6 tháng"), **tên thành phố, tên trường**: bộ sinh đặt các thứ này. Viết "ngành CNTT", "dân kế toán" được, nhưng không ghi đúng tên một ngành học cụ thể, vì ngành do bộ sinh chọn trong nhóm ngành của vị trí. Riêng bộ đổi ngành được nói ngành cũ, vì `fromMajors` cố định.
- Tránh cụm "năm tháng" (bị bắt nhầm là số tháng).
- **Kỹ năng:**
  - bộ `standard` có ≥ 3 kỹ năng lõi của vị trí, bộ `career-switch` có ≥ 2;
  - kỹ năng ngoài vị trí, vị trí gần (`adjacent`) và kỹ năng mềm chỉ dùng cho bộ đổi ngành (bộ kiểm cảnh báo với bộ thường);
  - văn bản nhắc kỹ năng nào thì kỹ năng đó phải có trong `skills` (cảnh báo, dò theo tên của vị trí, vị trí gần và kỹ năng mềm).
- `fromMajors` phải là ngành có trong danh mục và **không** thuộc `majors.primary` / `related` của vị trí; chỉ bộ `career-switch` mới có.
- 4 bộ cùng cấp độ nên khác hẳn bối cảnh (sản phẩm, loại công ty, thế mạnh) để embedding không gần nhau.

## Đợt 8 — `showcase.json` (tài khoản demo, tin chính, hồ sơ trưng bày)

- Đợt 8a (2026-11-09): phần chung (4 nhà tuyển dụng, 10 tin chính) + 40 hồ sơ cho 5 tin CNTT của Mây Xanh.
- Đợt 8b (2026-11-09): 40 hồ sơ cho 5 tin còn lại (UI/UX, Kiểm toán, Quảng cáo, Content, Xuất nhập khẩu).
- Tên công ty cũ hư cấu vẫn có thể trùng `companies.json` (đợt 8b vướng "Sổ Vàng", "Cánh Buồm"): chạy lệnh kiểm rồi đổi tên.

### Cấu trúc

- `asOf`: tháng viết dữ liệu ("YYYY-MM"). Năm sinh, năm học, ngày kinh nghiệm, năm chứng chỉ đều tính theo tháng này. Bộ sinh dời cả bộ theo khoảng cách tới hôm chạy.
- `employers`: mỗi công ty có `demoRole` một tài khoản; `key` là phần trước @ của email.
- `jobs`: tin chính. Tham chiếu mẫu tin bằng `position` + `variant` (lấy mô tả, yêu cầu, kỹ năng của biến thể). `title` phải nằm trong `titles[jobType]` của mẫu. Các trường do tin này tự đặt:
  - ngành học: tập con ngành của vị trí;
  - `minExperienceYears`, `skillMinYears`;
  - lương;
  - `publishedDaysAgo` ≤ 29, để tin lọt vào "Việc làm phù hợp" (H3).
- `candidates`: hồ sơ viết trọn, mỗi người gắn một tin chính (`job`) và một nhóm (`tier`):

| `tier` | Điều kiện (bộ kiểm báo lỗi nếu sai) |
|---|---|
| `rat-hop` | Đủ kỹ năng bắt buộc của tin, học ngành chính của tin, đủ `minExperienceYears` và `skillMinYears` |
| `hop-mot-phan` | Thiếu 1–2 kỹ năng bắt buộc, hoặc thiếu số năm |
| `nganh-gan` | Học ngành liên quan của tin, không học ngành chính |
| `doi-nganh` | Không học ngành chính hay ngành liên quan của tin |
| `so-sai` | Chỉ tiêu đề + 2–3 kỹ năng, không giới thiệu / kinh nghiệm / dự án / chứng chỉ |
| `ca-kho` | Có `hardCase`: `nhoi-tu-khoa` (≥ 10 kỹ năng, văn bản rỗng nghĩa) hoặc `kinh-nghiem-khong-lien-quan` (đủ ngành, kỹ năng nhưng đi làm việc khác) |

Mỗi tin 8 hồ sơ: rất hợp 2, hợp một phần 2, mỗi nhóm còn lại 1. Như vậy điểm trên trang "Tìm ứng viên" trải từ cao xuống thấp.

### Quy tắc

- Mọi hồ sơ có chung ≥ 1 kỹ năng với tin chính. Trang "Tìm ứng viên" chỉ lấy người như vậy, và bỏ qua người đã nộp / đang được mời vào tin (bộ sinh không tạo đơn, lời mời của hồ sơ trưng bày vào tin chính của họ).
- Họ lấy từ `familyNames`, tên lấy từ `givenNames` đúng giới tính.
- Năm sinh trong `birthYears` của cấp độ. Sinh viên có đúng 1 dòng học vấn `isCurrent`, nhập học đúng khoá: năm 3 tại 2026-11 là khoá 2024, năm cuối là khoá 2023. Người đã tốt nghiệp không có dòng đang học.
- Trường, ngành ghi đúng tên danh mục (`University`, `Major` `APPROVED`).
- Kinh nghiệm tính từ đầu tháng `start` tới cuối tháng `end`; `end: null` là đang làm, tính tới `asOf`. Tổng không vượt mức của cấp độ (6 / 12 / 30 tháng). Năm 3 có tối đa 1 dòng; năm cuối và mới tốt nghiệp có ≥ 1 dòng (trừ `so-sai`).
- Công ty cũ hư cấu, không trùng `companies.json`. Có thể dùng `pastCompanies` của `personas.json`.
- `bio` ≤ 300 ký tự (viết trọn, không ghép câu riêng).
- Văn bản theo đúng quy tắc của chân dung: không số năm / số tháng, không thành phố, đúng cấp độ. Nhắc tên kỹ năng nào (dò theo **toàn bộ** danh mục) thì hồ sơ phải có kỹ năng đó. Các cụm hay vướng: "ERP", "mua hàng", "thống kê", "nghiên cứu thị trường", "tính lương".
- `demoLogin` (5–8 người) đặt ở hồ sơ rất hợp / hợp một phần / ngành gần / đổi ngành, không đặt ở `so-sai` / `ca-kho`.

## Các đợt sau

Viết thêm thư viện thì thêm mục cho đợt đó vào đây (schema trong `library.ts`, quy tắc ở file này).
