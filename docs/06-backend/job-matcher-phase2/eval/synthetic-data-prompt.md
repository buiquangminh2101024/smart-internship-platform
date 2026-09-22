# Prompt sinh dữ liệu demo cho bộ đánh giá Job Matcher GĐ2

Phương pháp sinh dữ liệu demo dùng ở **bước 5** của `docs/06-backend/job-matcher-phase2/PLAN.md`. Kết quả (một file JSON) là đầu vào của `apps/server/scripts/seed-match-demo.ts`. Tài liệu này mô tả cách tái tạo lại `apps/server/scripts/data/match-demo.json` nếu cần sinh lại (vd. catalog kỹ năng đổi, cần bộ dữ liệu demo khác) — không phải nguồn sự thật; nguồn sự thật là bộ kiểm trong `apps/server/scripts/lib/match-demo-fixture.ts`.

## Model LLM đã dùng và chỉnh sửa tay

- **Model:** ChatGPT (chủ dự án chạy trực tiếp, không qua API).
- **Chỉnh sửa tay:** không viết lại toàn bộ file để tiết kiệm token. Khi `npm run seed-match-demo -- --check` báo lỗi, chủ dự án dán nguyên các dòng lỗi cho ChatGPT; ChatGPT chỉ ra **đoạn cần sửa** (không in lại toàn bộ JSON), chủ dự án tự sửa tay đúng đoạn đó trong `match-demo.json` rồi chạy lại `--check` tới khi hợp lệ. Không có chỉnh sửa nội dung nào khác ngoài các lần sửa lỗi này.

## Cách dùng

1. Copy **toàn bộ phần trong khung "PROMPT"** bên dưới vào một cuộc trò chuyện mới với LLM mạnh (nên chọn model lớn, ngữ cảnh dài — đầu ra khoảng 12–15 nghìn token).
2. Lưu phần JSON LLM trả về thành `apps/server/scripts/data/match-demo.json` (tạo thư mục `data` nếu chưa có).
3. Kiểm (chỉ đọc DB, chưa ghi gì): từ `apps/server` chạy `npm run seed-match-demo -- --check`.
   - Lỗi được liệt kê từng dòng ("kỹ năng X không có trong catalog", "thiếu ca khó Y"…). Dán **nguyên các dòng lỗi** cho LLM, bảo sửa **chỉ những chỗ đó** (không cần in lại toàn bộ JSON, chỉ cần chỉ rõ đoạn cần sửa để tự sửa tay cho đỡ tốn token), lặp tới khi `✓ Fixture hợp lệ`.
   - Nếu LLM bị cắt giữa chừng: nhắn "tiếp tục đúng từ chỗ bị cắt, không lặp lại phần đã in", rồi ghép tay.
4. Đọc lướt fixture bằng mắt (bộ kiểm không biết được câu văn có vô lý hay không): nghề nghiệp có hợp ngành, năm tháng có hợp lý, không có tên người/công ty thật.
5. Seed: `npm run seed-match-demo` (chạy lại được — idempotent). Dọn hết: `npm run seed-match-demo -- --reset`.
6. Sinh phiếu nhãn: `npm run seed-match-demo -- --label-sheet` → `docs/06-backend/job-matcher-phase2/eval/labels.json` (không ghi đè nếu đã tồn tại). Bạn (và người thứ hai) điền `ratings` độc lập, rồi điền `label` cuối cùng.

Lưu ý:
- Danh sách kỹ năng/ngành trong prompt là ảnh chụp catalog Neon ngày **2026-09-21** (21 kỹ năng `APPROVED`). Nếu catalog đã đổi, `--check` là căn cứ; sửa danh sách trong prompt cho khớp trước khi chạy.
- Các kỹ năng trong `extraSkills` sẽ được **thêm vào catalog thật** ở trạng thái `APPROVED` (đánh dấu để `--reset` gỡ lại nếu không có dữ liệu thật nào dùng).
- **Không** nhờ LLM gán nhãn GOOD/PARTIAL/POOR. Nhãn phải do người gán — nếu để chính LLM đã viết dữ liệu tự chấm thì bộ đánh giá đo "LLM đồng ý với LLM", không đo được gì về hệ thống.

---

## PROMPT (bắt đầu)

````text
Bạn là chuyên gia tuyển dụng thực tập sinh tại Việt Nam, đồng thời là người thiết kế bộ dữ liệu kiểm thử. Hãy sinh MỘT file JSON chứa dữ liệu GIẢ LẬP (ứng viên, tin tuyển dụng, kỹ năng bổ sung, danh sách cặp cần gán nhãn) cho việc đánh giá thuật toán gợi ý mức phù hợp giữa hồ sơ sinh viên và tin thực tập.

## 1. Bối cảnh (để bạn thiết kế dữ liệu đúng ý)

Hệ thống chấm điểm "hồ sơ – tin" theo hai cách, cần so sánh:
- Luật: so tên kỹ năng (bắt buộc / ưu tiên) và số năm kinh nghiệm.
- Ngữ nghĩa: mô hình ngôn ngữ đọc đoạn văn hồ sơ (chức danh, ngành học, kỹ năng, vị trí đã làm, dự án, giới thiệu) và đoạn văn tin (vị trí, kỹ năng, yêu cầu, mô tả) rồi đo độ gần nghĩa.
Con người sẽ tự gán nhãn từng cặp (rất hợp / hợp một phần / không hợp) SAU khi bạn sinh xong. Vì vậy dữ liệu phải:
- đủ đa dạng để hai cách chấm cho kết quả KHÁC nhau ở nhiều cặp;
- KHÔNG để lộ hay ngầm chỉ ra nhãn (không ghi chú "ứng viên này rất hợp tin kia" ở bất kỳ đâu);
- giống dữ liệu thật: có chỗ thiếu, chỗ viết tắt, chỗ mơ hồ, không "sạch" hoàn hảo.

Giả sử hôm nay là tháng 9/2026.

## 2. Ràng buộc CỨNG (vi phạm là file bị từ chối)

1. Đầu ra là MỘT khối JSON duy nhất, hợp lệ tuyệt đối: không chú thích, không dấu phẩy thừa, không văn bản ngoài khối JSON. Không thêm trường nào ngoài đặc tả ở mục 5.
2. Kỹ năng trong hồ sơ và tin CHỈ được lấy từ (a) danh sách "kỹ năng có sẵn" ở mục 3 hoặc (b) chính mảng `extraSkills` bạn khai báo. Viết ĐÚNG TỪNG KÝ TỰ (kể cả hoa/thường, dấu, dấu chấm), ví dụ "Node.js" chứ không phải "NodeJS" hay "node.js".
3. `extraSkills` không được trùng nghĩa-chữ với kỹ năng có sẵn về mặt ghi chữ (vd. không thêm "react" vì đã có "React"). Ngoại lệ có chủ đích: xem ca khó `synonym-skill` ở mục 4 — cách viết khác hẳn (vd. "ReactJS") thì được.
4. `majorName` của học vấn CHỈ được chọn trong danh sách ngành ở mục 3, đúng từng ký tự.
5. Không dùng thông tin thật hoặc nhận dạng được: không email, không số điện thoại, không tên người, không tên công ty/trường/sản phẩm có thật. Tên công ty trong kinh nghiệm làm việc phải bịa hẳn (vd. "Công ty TNHH Alpha Soft", "Studio Nắng"). Hồ sơ không có họ tên nên không cần đặt tên người.
6. Ngày tháng dạng "YYYY-MM". Kinh nghiệm đang làm (`isCurrent: true`) thì `end` là null; đã kết thúc thì `end` có giá trị và không sớm hơn `start`. Dự án `end` null nghĩa là đang làm.
7. Độ dài trường (phần vượt sẽ bị bỏ khỏi phép đo): `bio` ≤ 300 ký tự; `requirements` của tin ≤ 400 ký tự; `description` của tin ≤ 300 ký tự. Viết tiếng Việt có dấu, tự nhiên.
8. Mỗi hồ sơ có ≥ 1 kỹ năng. Mỗi tin có ≥ 1 kỹ năng `REQUIRED`.
9. Tiêu đề tin (`title`) là khoá tham chiếu nên phải DUY NHẤT giữa các tin. `ref` của hồ sơ chỉ gồm chữ thường a-z, số và dấu gạch nối, duy nhất.

## 3. Danh mục cho phép

Kỹ năng có sẵn (21):
Cloudinary, DevOps, Express, Figma, Giao tiếp, Java, JavaScript, MSSQL, MariaDB, MongoDB, Node.js, Python, Quản lý thời gian, RabbitMQ, React, React Native, Redis, Redpanda, SQL, Spring Boot, TypeScript

Ngành học (`majorName`) được phép dùng:
Công nghệ thông tin; Kỹ thuật phần mềm; Khoa học máy tính; Hệ thống thông tin; Khoa học dữ liệu; Trí tuệ nhân tạo; An toàn thông tin; Mạng máy tính và truyền thông dữ liệu; Kỹ thuật máy tính; Điện tử viễn thông; Tự động hóa; Marketing; Truyền thông đa phương tiện; Quan hệ công chúng; Thương mại điện tử; Quản trị kinh doanh; Kinh tế; Kinh tế quốc tế; Tài chính - Ngân hàng; Kế toán; Kiểm toán; Logistics; Ngôn ngữ Anh; Thiết kế đồ họa; Luật

`degree` (bằng cấp) tự do nhưng ngắn gọn: "Đại học", "Cao đẳng", "Thạc sĩ"…

## 4. Nội dung cần sinh

### 4.1 `extraSkills` (30–40 mục)
Catalog có sẵn gần như chỉ có kỹ năng CNTT, thiếu hẳn marketing/kế toán/thiết kế, nên hãy bổ sung tên kỹ năng NGẮN, CHUẨN, đúng kiểu người ta ghi trong CV/tin tuyển dụng tại Việt Nam, phủ các nhóm:
- CNTT: HTML, CSS, Vue.js, Next.js, Docker, Git, PostgreSQL, C#, .NET, Flutter, Kotlin, Machine Learning, Pandas, Power BI, Selenium, Manual Testing…
- Marketing/truyền thông: Content Marketing, SEO, Google Analytics, Facebook Ads, Copywriting, Email Marketing…
- Kinh tế/kế toán/tài chính: Excel, Kế toán tổng hợp, MISA, Phân tích tài chính, Báo cáo tài chính…
- Thiết kế: Photoshop, Illustrator, UI/UX Design…
- Kỹ năng mềm phổ biến: Tiếng Anh giao tiếp, Làm việc nhóm, Thuyết trình.
Chỉ chọn những gì bạn thực sự dùng trong dữ liệu; không liệt kê thừa.

### 4.2 `jobs` (8–10 tin thực tập, `jobType` mặc định thực tập nên không có trường này)
Phủ các nhóm, mỗi nhóm có tin ở CẢ hai tập dev và test khi nhóm có ≥ 2 tin:
- Frontend (2 tin), Backend (2 tin: một Node.js/TypeScript, một Java/Spring Boot), Mobile hoặc Data/AI (1 tin), DevOps hoặc QA (1 tin), Marketing/Content (1–2 tin), Kế toán/Tài chính (1 tin), Thiết kế (1 tin).
Cách viết:
- Viết `description` và `requirements` theo phong cách nhà tuyển dụng thật, KHÔNG sao chép nguyên tên kỹ năng từ danh sách `skills` sang mô tả cho đủ; có tin viết dài, có tin ngắn, có tin dùng viết tắt/không chuẩn (vd. "SV năm 3-4, biết React/Node, ưu tiên có exp, làm việc T2-T6 tại HCM").
- `minExperienceYears`: null (không yêu cầu) hoặc 0.5–2. Thực tập thường không yêu cầu nhiều.
- Mỗi tin 2–6 kỹ năng, phân `REQUIRED`/`PREFERRED` hợp lý; tin phi CNTT có thể gồm cả "Giao tiếp", "Quản lý thời gian" (kỹ năng chung, có mặt ở nhiều lĩnh vực — cố ý để tạo nhiễu).
- `split`: "dev" cho khoảng 60% số tin, "test" cho phần còn lại (vd. 10 tin → 6 dev, 4 test). Chia theo tin, không chia theo cặp.

### 4.3 `candidates` (15–20 hồ sơ sinh viên/mới ra trường)
Mỗi hồ sơ: `headline` ngắn kiểu tự giới thiệu ("Sinh viên năm 3 CNTT | Frontend"), `bio` 1–3 câu, 1–10 kỹ năng (riêng hồ sơ `keyword-stuffing` được nhiều hơn) với `yearsOfExperience` (0–10, số lẻ được, đa số 0–2), 1 học vấn (hiếm khi 2), 0–3 kinh nghiệm làm việc, 0–3 dự án.
Phân bố: khoảng 8–9 hồ sơ CNTT (frontend/backend/mobile/data…), còn lại marketing, kinh tế/kế toán, thiết kế, ngôn ngữ, logistics…; trong đó có cả sinh viên năm 2–4 lẫn vừa tốt nghiệp.

### 4.4 Ca khó bắt buộc (ghi vào trường `hardCase` của hồ sơ hoặc tin; mỗi kiểu ≥ 1 lần)
- `irrelevant-experience`: hồ sơ có kinh nghiệm làm việc dài nhưng TOÀN việc không liên quan (vd. phục vụ, bán hàng, gia sư), số năm kinh nghiệm cao trong khi kỹ năng ngành ít hoặc mới học.
- `abbreviated-jd`: tin viết tắt, không chuẩn (xem 4.2).
- `adjacent-field`: ứng viên ngành gần nhưng khác tên (vd. ngành "Khoa học máy tính" hoặc "Hệ thống thông tin" ứng tuyển tin ghi "CNTT"; hoặc "Kỹ thuật máy tính"/"Điện tử viễn thông" sang phần mềm).
- `synonym-skill`: kỹ năng cùng nghĩa nhưng khác tên nên là hai kỹ năng riêng trong catalog. Làm thế này: thêm vào `extraSkills` một biến thể của kỹ năng có sẵn (vd. "ReactJS", "NodeJS", "MS SQL Server", "JS"); tin yêu cầu tên có sẵn, ứng viên ghi biến thể (hoặc ngược lại). Thêm 2–3 cặp như vậy.
Ca khó tuỳ chọn thêm: `keyword-stuffing` (hồ sơ liệt kê 15+ kỹ năng nhưng kinh nghiệm/dự án nghèo nàn), `sparse-profile` (hồ sơ chỉ có headline + 1–2 kỹ năng, gần như không có bio), `career-switch` (đổi ngành: học một ngành, dự án/kỹ năng thuộc ngành khác).
Trường `hardCase` chỉ mô tả KIỂU ĐẶC ĐIỂM của hồ sơ/tin, tuyệt đối không mô tả nhãn.

### 4.5 `pairsToLabel` (36–48 cặp)
Là danh sách cặp (hồ sơ, tin) để con người gán nhãn sau. KHÔNG kèm nhãn hay lý do.
- Mỗi tin xuất hiện trong 4–6 cặp (bắt buộc ≥ 4, vì cần xếp hạng ≥ 3 ứng viên cho mỗi tin).
- Mỗi hồ sơ xuất hiện trong ≥ 2 cặp; các cặp phải bao gồm cả ứng viên ĐÚNG lĩnh vực, GẦN lĩnh vực, KHÁC lĩnh vực và các ca khó — theo `category`:
  - `same-domain`: cùng lĩnh vực (mức phù hợp vẫn có thể cao hoặc thấp);
  - `adjacent`: lĩnh vực gần (frontend ↔ backend, CNTT ↔ data, marketing ↔ thiết kế…);
  - `cross-domain`: khác hẳn lĩnh vực;
  - `hard-case`: cặp có mặt hồ sơ/tin mang `hardCase`.
- QUAN TRỌNG: đừng chọn cặp quá hiển nhiên. Ít nhất 1/3 số cặp phải khó đoán ngay (vd. cùng lĩnh vực nhưng thiếu kỹ năng bắt buộc; khác lĩnh vực nhưng trùng "Giao tiếp"/"Quản lý thời gian"; kỹ năng đủ mà nội dung hồ sơ lạc đề).
- Không đưa cặp trùng lặp.

## 5. Đặc tả JSON (đúng từng tên trường)

```json
{
  "extraSkills": ["Vue.js", "ReactJS"],
  "jobs": [
    {
      "title": "Thực tập sinh Frontend (React)",
      "description": "Tham gia xây dựng giao diện web cho sản phẩm quản lý đơn hàng.",
      "requirements": "Sinh viên năm 3-4 ngành CNTT; biết React; đọc hiểu tài liệu tiếng Anh cơ bản.",
      "minExperienceYears": null,
      "hardCase": "abbreviated-jd",
      "split": "dev",
      "skills": [
        { "name": "React", "importance": "REQUIRED" },
        { "name": "TypeScript", "importance": "PREFERRED" }
      ]
    }
  ],
  "candidates": [
    {
      "ref": "fe-nam3-01",
      "headline": "Sinh viên năm 3 CNTT | Frontend",
      "bio": "Thích làm giao diện, đang tìm nơi thực tập để học quy trình làm việc nhóm.",
      "hardCase": "synonym-skill",
      "skills": [
        { "name": "ReactJS", "yearsOfExperience": 1 },
        { "name": "JavaScript", "yearsOfExperience": 1.5 }
      ],
      "educations": [
        { "majorName": "Công nghệ thông tin", "degree": "Đại học", "startYear": 2023, "endYear": 2027, "isCurrent": true }
      ],
      "workExperiences": [
        { "company": "Studio Nắng", "position": "Cộng tác viên giao diện", "start": "2025-06", "end": "2025-09", "isCurrent": false, "description": "Dựng trang landing page theo bản thiết kế." }
      ],
      "projects": [
        { "name": "Web đặt món ăn", "description": "Đồ án môn học, làm nhóm 4 người.", "start": "2025-02", "end": "2025-05" }
      ]
    }
  ],
  "pairsToLabel": [
    { "candidateRef": "fe-nam3-01", "jobTitle": "Thực tập sinh Frontend (React)", "category": "same-domain" }
  ]
}
```

Ghi chú về đặc tả:
- `hardCase` là tuỳ chọn (bỏ trường nếu không phải ca khó); giá trị hợp lệ: "irrelevant-experience", "abbreviated-jd", "adjacent-field", "synonym-skill", "keyword-stuffing", "sparse-profile", "career-switch".
- `importance`: "REQUIRED" hoặc "PREFERRED". `split`: "dev" hoặc "test". `category`: "same-domain", "adjacent", "cross-domain", "hard-case".
- `educations`, `workExperiences`, `projects` có thể là mảng rỗng nhưng vẫn phải có mặt. `endYear` có thể null (đang học, chưa rõ năm ra trường); nếu có thì không nhỏ hơn `startYear`.
- Ví dụ trên chỉ để minh hoạ hình dạng; ĐỪNG dùng lại nguyên nội dung ví dụ.

## 6. Tự kiểm trước khi trả lời (làm trong đầu, không in ra)

- [ ] Mọi tên kỹ năng dùng trong hồ sơ/tin đều nằm trong mục 3 hoặc `extraSkills`, đúng từng ký tự.
- [ ] `majorName` đều nằm trong danh sách ngành.
- [ ] Số lượng: 15–20 hồ sơ, 8–10 tin, 36–48 cặp, mỗi tin ≥ 4 cặp; cả "dev" lẫn "test" đều có ≥ 2 tin.
- [ ] Đủ 4 ca khó bắt buộc (irrelevant-experience, abbreviated-jd, adjacent-field, synonym-skill).
- [ ] Không có email, số điện thoại, tên người hay tên tổ chức có thật; không ghi nhãn/nhận định về độ phù hợp ở bất cứ đâu.
- [ ] `bio` ≤ 300 ký tự, `requirements` ≤ 400, `description` ≤ 300.
- [ ] JSON hợp lệ, không dấu phẩy thừa.

Bây giờ hãy in ra DUY NHẤT khối JSON.
````

## PROMPT (kết thúc)
