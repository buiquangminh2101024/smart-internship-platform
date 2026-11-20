# Chấm điểm chất lượng tin và duyệt / từ chối hàng loạt — Backend

> **Trạng thái: ĐANG LÀM (lập 2026-11-20).** Chủ dự án chốt Q1–Q7 cùng ngày (Q4 đổi thành **có** tự chấm lại; thêm chấm lại khi sửa tin đang hiển thị) và duyệt code. Bước 1 xong, migration `20261120120000_add_job_quality_score` **đã áp lên Neon** (2026-11-20). Bước 2 xong (bộ chấm thuần + 18 unit test). Quyết định kiến trúc: AD-29 trong `docs/02-architecture/ARCHITECTURE_DECISIONS.md` (bản đề xuất). Frontend: `docs/05-frontend/phases/job-quality-moderation/PLAN.md`. Backlog: dòng 📌 ở mục 2 của `docs/01-project/FEATURE_BACKLOG.md`.

## Mục tiêu

Admin hiện phải mở từng tin để duyệt hoặc từ chối. Sau thay đổi này:

1. Mỗi tin gửi duyệt được hệ thống **chấm điểm chất lượng 0–100** theo các quy tắc có trọng số, giải thích được. Điểm, vùng và chi tiết từng tiêu chí được **lưu vào DB**.
2. Hàng đợi chia theo **ba vùng**: *Đề xuất duyệt*, *Cần xem kỹ*, *Đề xuất từ chối*. Hàng đợi xem được hết (có phân trang), sắp theo điểm hoặc thời điểm gửi duyệt.
3. Admin **duyệt hoặc từ chối hàng loạt** các tin đã chọn. Từ chối hàng loạt có lý do tự sinh từ lỗi của từng tin.
4. Điểm **chỉ là gợi ý**. Hệ thống không tự duyệt hay tự từ chối; Admin luôn là người bấm xác nhận (cùng nguyên tắc "không bao giờ tự từ chối" của AD-25).

Đợt này gộp các điểm 8, 1, 2, 7 khi rà chức năng duyệt tin ngày 2026-11-20 (xem backlog).

## Hiện trạng (đọc code 2026-11-20)

- `JobPostsService.approve` / `reject` / `retract` (`job-posts.service.ts:495`, `:525`, `:562`): đọc tin, kiểm `status` **ngoài** transaction, rồi trong transaction ghi `JobPostModerationAction`, đổi trạng thái, gửi thông báo cho mọi employer của công ty, ghi audit log. Hai admin bấm cùng lúc có thể cùng vượt qua bước kiểm (điểm 8).
- `approve` sau commit gọi `autoOutreachTrigger(companyId)` (AD-23) và `matchScoreTrigger(jobId)` (AD-24). `matchScoreTrigger` chạy ngay, không xếp hàng: duyệt 30 tin là 30 lượt chấm bảng điểm chạy song song.
- `findModerationQueue` (`job-post.repository.ts:253`): lọc theo `status`, sắp `createdAt desc`, phân trang cursor. Frontend không dùng `nextCursor` (điểm 1). Không có cột thời điểm gửi duyệt; trang hiện "Ngày gửi" bằng `createdAt` (điểm 2).
- `assertReadyForSubmission` (`job-posts.service.ts:696`) **đã bắt buộc** lúc gửi duyệt: hạn nộp (trong `MAX_EXPIRY_DAYS`), ngành, thành phố, địa chỉ, lương hoặc "thoả thuận", ít nhất 1 kỹ năng. Tiêu chí "độ đầy đủ" vì thế chỉ chấm các mục **không** bắt buộc.
- `ReviewChecklist` (frontend, `admin/(console)/jobs/[id]/page.tsx:94`) tự tính 4 kiểm tự động trên client (mô tả ≥ 150, yêu cầu ≥ 50, có kỹ năng bắt buộc, đã xác nhận yêu cầu bằng AI). Các kiểm này chuyển xuống backend thành một phần của bộ chấm.
- Tín hiệu sẵn có: `CompanyRepository.countRetractions`, bảng `job_reports` (`status`, `resolution = TAKE_DOWN`), `job_post_moderation_actions` (đếm `SUBMITTED` / `REJECTED`), `JobPost.requirementsConfirmedAt`, `JobPostSkill.importance`, trạng thái kỹ năng (`PENDING` / `APPROVED`).
- **Tin đang hiển thị sửa được mà không phải duyệt lại** (`updateDraft`, `job-posts.service.ts:286`). Mọi công ty sửa được hạn nộp, lương, quyền lợi, địa chỉ. Công ty được miễn kiểm duyệt sửa được mọi thứ trừ tiêu đề. Sau khi sửa, hệ thống chỉ gọi `matchScoreTrigger`. Như vậy một tin được duyệt với nội dung sạch có thể bị sửa thành có "phí đào tạo" mà Admin không biết.
- `JobPost.updatedAt` **không** dùng được để biết "gửi lại mà không sửa gì": cập nhật trạng thái, cài đặt tự mời, `matchScoresAt`… đều làm nó đổi. Plan dùng mã băm nội dung (xem tiêu chí 5).
- Lương lưu bằng VND (frontend hiển thị theo triệu / tháng).
- Audit log: duyệt và từ chối tin **không** thuộc nhóm "thao tác nguy hiểm dồn dập" (`audit-log.highlights.ts:26`), nên duyệt hàng loạt không làm bật cảnh báo đó.

## Thuật toán chấm điểm

### Nguyên tắc

- **Quy tắc có trọng số, không học máy.** Dự án chưa có dữ liệu đã gán nhãn. Bộ EMSCAD (17.880 tin tiếng Anh, 2012–2014, nhãn lừa đảo / không) không khớp ngôn ngữ, loại việc và schema. Cách chấm theo tiêu chí, mỗi tiêu chí trừ điểm theo quy tắc ghi rõ, giống công cụ chấm tin của SocialTalent.
- **Mỗi tiêu chí bắt đầu 100 điểm**, mỗi lỗi trừ một số điểm cố định, thấp nhất là 0. Mỗi lỗi có **mã**, **mức trừ** và **câu giải thích tiếng Việt**, nên Admin thấy được vì sao tin bị trừ.
- **Điểm tổng** = Σ (điểm tiêu chí × trọng số), làm tròn, thang 0–100.
- **Cờ chặn** cho lỗi nghiêm trọng: có cờ thì tin không bao giờ vào vùng *Đề xuất duyệt*, dù tổng cao. Lý do: một tin lừa đảo điền đầy đủ thông tin vẫn có thể đạt 85 điểm nếu chỉ cộng trọng số.
- **Điểm sàn từng tiêu chí**: tin có tiêu chí nào dưới 50 thì không vào vùng *Đề xuất duyệt*. Lý do: điểm cao ở tiêu chí này không được che lỗi nặng ở tiêu chí khác.
- **Điểm sàn cứng** (thêm sau bước 3): tiêu chí 1–5 nào dưới 40 thì vào *Đề xuất từ chối*. Lý do: rủi ro + công ty + thực tập (45 điểm) hầu như luôn đầy, nên tin chỉ thiếu thông tin không bao giờ có tổng < 50.
- **Chỉ xét nội dung tin và lịch sử công ty.** Không dùng dữ liệu của ứng viên, không dùng việc ứng viên từ chối lời mời (đó là chuyện bình thường, đã có mời bù của AD-23).
- Mọi con số (trọng số, mức trừ, ngưỡng, từ khoá) nằm trong **một file cấu hình** có `QUALITY_SCORE_VERSION`. Đổi số nào thì tăng version.

### Bảng trọng số (v1, chốt lại sau bước hiệu chỉnh)

| # | Tiêu chí | Trọng số | Vì sao trọng số này |
|---|---|---|---|
| 1 | Độ đầy đủ | 20% | Tin đủ thông tin thì ứng viên quyết định được có nộp không (SocialTalent cho 20%). Không cao hơn vì các trường quan trọng nhất đã bị bắt buộc lúc gửi duyệt. |
| 2 | Chất lượng nội dung | 20% | Mô tả rõ thì ứng viên hiểu việc, và Job Matcher có đủ chữ để chấm độ phù hợp. |
| 3 | Minh bạch | 15% | Lương và địa điểm rõ ràng là yếu tố các trang tuyển dụng lớn đều ưu tiên; sinh viên thực tập đặc biệt quan tâm có lương hay không. |
| 4 | Phù hợp với thực tập | 10% | Đặc thù của khoá luận: tin thực tập không nên đòi kinh nghiệm như việc chính thức. Trọng số thấp vì đây là chất lượng, không phải rủi ro. |
| 5 | Dấu hiệu rủi ro | 25% | **Cao nhất**, vì duyệt nhầm tin lừa đảo là hậu quả nặng nhất: duyệt xong hệ thống tự gửi lời mời cho ứng viên ngay (AD-23). |
| 6 | Uy tín công ty | 10% | Là lịch sử, không phải nội dung tin này. Để thấp để công ty mới hoặc từng mắc lỗi một lần không bị dìm điểm mãi. |

### Tiêu chí 1 — Độ đầy đủ (20%)

Chỉ chấm các mục **không bắt buộc** lúc gửi duyệt. Hạn nộp, ngành, thành phố, địa chỉ, lương / thoả thuận và ≥ 1 kỹ năng đã bị `assertReadyForSubmission` chặn, nên tin nào vào hàng đợi cũng có.

| Mã lỗi | Điều kiện | Trừ | Giải thích |
|---|---|---|---|
| `NO_REQUIREMENTS` | Phần "Yêu cầu ứng viên" trống | 30 | Ứng viên không biết mình có đủ điều kiện không. |
| `NO_REQUIRED_SKILL` | Có kỹ năng nhưng không kỹ năng nào là "bắt buộc" | 25 | Job Matcher và ứng viên không phân biệt được kỹ năng cốt lõi với kỹ năng cộng điểm. |
| `NO_BENEFITS` | Phần "Quyền lợi" trống | 20 | Thiếu lý do để ứng viên chọn tin này. |
| `NO_MAJOR` | Không chọn ngành phù hợp | 15 | Sinh viên khó biết ngành mình có hợp không; matching mất một tín hiệu. |

### Tiêu chí 2 — Chất lượng nội dung (20%)

| Mã lỗi | Điều kiện | Trừ | Giải thích |
|---|---|---|---|
| `DESCRIPTION_TOO_SHORT` | Mô tả < 150 ký tự | 35 | Gần như chưa mô tả công việc. Ngưỡng 150 lấy từ `ReviewChecklist` hiện tại. |
| `DESCRIPTION_SHORT` | Mô tả 150–299 ký tự | 10 | Có nội dung nhưng còn sơ sài. |
| `REQUIREMENTS_TOO_SHORT` | Có yêu cầu nhưng < 50 ký tự | 15 | Ngưỡng 50 lấy từ `ReviewChecklist`. |
| `TITLE_LENGTH` | Tiêu đề < 10 hoặc > 100 ký tự | 15 | Quá ngắn thì không rõ vị trí; quá dài thường là nhồi từ khoá. |
| `TITLE_SHOUTING` | ≥ 70% chữ cái trong tiêu đề viết HOA (tiêu đề ≥ 10 chữ cái) | 15 | Kiểu giật gân, hay gặp ở tin kém chất lượng. |
| `SPAMMY_FORMAT` | Một ký tự lặp ≥ 4 lần liên tiếp ("!!!!") hoặc > 3 emoji trong tiêu đề | 10 | Dấu hiệu spam. |
| `CONTACT_IN_CONTENT` | Mô tả / yêu cầu / quyền lợi chứa số điện thoại, email hoặc đường link | 20 | Kéo ứng viên ra khỏi nền tảng, nơi hệ thống không bảo vệ được họ (Indeed cũng hạ hạng tin có link ngoài). |

### Tiêu chí 3 — Minh bạch (15%)

| Mã lỗi | Điều kiện | Trừ | Giải thích |
|---|---|---|---|
| `SALARY_NEGOTIABLE` | Chọn "Thoả thuận" | 25 | Ứng viên không biết có lương hay không. Không phải lỗi, chỉ kém minh bạch hơn tin ghi rõ. |
| `SALARY_ONE_SIDED` | Chỉ có "từ" hoặc chỉ có "tới" | 10 | Minh bạch một nửa. |
| `SALARY_RANGE_WIDE` | `salaryMax / salaryMin > 3` | 15 | Khoảng quá rộng gần như không cho thông tin. |
| `SALARY_INVALID` | `salaryMin > salaryMax` | 30 | Dữ liệu sai (phòng trường hợp lọt qua validate). |
| `ADDRESS_VAGUE` | Địa chỉ < 10 ký tự | 10 | Địa chỉ bắt buộc nhưng có thể chỉ ghi "HN". |
| `DEADLINE_TOO_SOON` | Hạn nộp còn < 7 ngày tính từ lúc gửi duyệt | 10 | Ứng viên gần như không kịp nộp, dễ là tin đăng cho có. |

### Tiêu chí 4 — Phù hợp với thực tập (10%)

| Mã lỗi | Điều kiện | Trừ | Giải thích |
|---|---|---|---|
| `INTERN_EXPERIENCE_HIGH` | Loại tin `INTERNSHIP` và yêu cầu ≥ 1 năm kinh nghiệm | 40 | Sinh viên thực tập thường chưa có kinh nghiệm đi làm. |
| `INTERN_EXPERIENCE_SOME` | Loại tin `INTERNSHIP`, yêu cầu > 0 và < 1 năm | 10 | Chấp nhận được nhưng thu hẹp người nộp. |
| `TOO_MANY_REQUIRED_SKILLS` | > 8 kỹ năng bắt buộc | 20 | Yêu cầu dàn trải, khó có ai đạt (SocialTalent gọi là "requirements bloat"). |
| ~~`REQUIREMENTS_NOT_CONFIRMED`~~ | **Bỏ sau bước 3** | — | 99,5% tin dính nên không phân biệt được tin tốt / kém; dùng hay không dùng tính năng AI không phải chất lượng tin. |
| `PENDING_SKILLS` | Có kỹ năng còn chờ duyệt trong danh mục | 10 | Kỹ năng chưa duyệt không hiện công khai và chưa được dùng đầy đủ khi chấm phù hợp. |

Hai lỗi kinh nghiệm chỉ áp dụng cho tin thực tập. Các loại tin khác vẫn chấm các dòng còn lại.

### Tiêu chí 5 — Dấu hiệu rủi ro (25%)

So khớp từ khoá trên tiêu đề, mô tả, yêu cầu, quyền lợi **sau khi bỏ dấu và chuyển chữ thường** (để "phi ho so", "phí hồ sơ", "PHÍ HỒ SƠ" đều khớp). Mỗi nhóm trừ tối đa một lần.

| Mã lỗi | Điều kiện | Trừ | Cờ chặn | Giải thích |
|---|---|---|---|---|
| `ASKS_FOR_MONEY` | Nhóm "đòi tiền": phí hồ sơ, phí đào tạo, phí giữ chỗ, đặt cọc, tiền cọc, thế chấp, nộp tiền, chuyển khoản trước, mua đồng phục, mua tài liệu… | 60 | **Có** | Dấu hiệu lừa đảo việc làm phổ biến nhất: bắt ứng viên trả tiền trước. |
| `OFF_PLATFORM_CONTACT` | Nhóm "kênh ngoài": zalo, telegram, inbox, nhắn tin riêng, kết bạn… | 55 (25 trước bước 3) | Không | Kéo ứng viên sang kênh hệ thống không kiểm soát. |
| `TOO_GOOD_TO_BE_TRUE` | Nhóm "dụ dỗ": việc nhẹ lương cao, thu nhập khủng, không cần kinh nghiệm lương cao, kiếm tiền online, làm tại nhà thu nhập… | 25 | Không | Lời hứa quá mức thường gặp ở tin lừa đảo, đa cấp. |
| `INTERN_SALARY_OUTLIER` | Tin `INTERNSHIP` có `salaryMax` (hoặc `salaryMin`) > 20.000.000 VND/tháng | 55 (30 trước bước 3) | Không | Lương thực tập cao bất thường, hay dùng để câu người. Ngưỡng chỉnh trong cấu hình sau bước hiệu chỉnh. |
| `RESUBMITTED_UNCHANGED` | Lần gửi trước bị từ chối, và nội dung **không đổi** so với lần gửi đó (mã băm nội dung trùng) | 30 | Không | Gửi lại mà không sửa theo góp ý. **Gửi lại có sửa thì không bị trừ**: đó là quy trình mong muốn. |
| `REJECTED_MANY_TIMES` | Tin đã bị từ chối ≥ 3 lần | 20 | Không | Lặp lại nhiều lần mà vẫn không đạt. |

**Mã băm nội dung:** SHA-256 của tiêu đề, mô tả, yêu cầu, quyền lợi, lương, loại tin, thành phố, ngành, địa chỉ, kinh nghiệm, danh sách kỹ năng (id + mức) và ngành phù hợp (id + mức), xếp theo thứ tự cố định. Mã được lưu vào cột riêng `submittedContentHash`, **chỉ ghi lúc gửi duyệt**. Lần chấm lại (nút của Admin, sự kiện công ty, sửa tin đang hiển thị) không ghi cột này. Nếu dùng chung cột với lần chấm gần nhất thì sẽ sai: Admin bấm "Chấm lại" một tin nháp vừa được NTD sửa sau khi bị từ chối, mã bị ghi đè bằng nội dung mới, và lần gửi lại bị tính nhầm là "không sửa gì". Khi NTD gửi lại, so mã mới với `submittedContentHash`, và chỉ trừ khi thao tác kiểm duyệt gần nhất là `REJECTED`.

### Tiêu chí 6 — Uy tín công ty (10%)

| Mã lỗi | Điều kiện | Trừ | Giải thích |
|---|---|---|---|
| `COMPANY_RETRACTIONS` | Mỗi tin của công ty bị thu hồi trong 180 ngày gần nhất | 25 / tin, tối đa 75 | Admin đã từng phải gỡ tin của công ty này. |
| `COMPANY_CONFIRMED_REPORTS` | Mỗi báo cáo vi phạm đã xử lý bằng gỡ tin (`resolution = TAKE_DOWN`) trên tin của công ty, 180 ngày | 25 / báo cáo, tối đa 50 | Vi phạm đã được xác nhận. |
| `COMPANY_OPEN_REPORTS` | Báo cáo vi phạm đang chờ xử lý trên tin của công ty | 10 / báo cáo, tối đa 30 | Có người phản ánh nhưng chưa xác nhận, nên trừ nhẹ. |
| `COMPANY_HIGH_REJECTION` | ≥ 4 lần gửi duyệt và ≥ 50% bị từ chối | 20 | Công ty thường gửi tin chưa đạt. |
| `COMPANY_NO_HISTORY` | Công ty chưa có tin nào được duyệt | 10 | Chưa có lịch sử để tin tưởng. Trừ nhẹ để công ty mới không bị dìm. |

Lỗi của tiêu chí 6 **không** đưa vào lý do từ chối gửi cho NTD (đây là lịch sử, không phải lỗi của tin). Admin vẫn thấy chúng trong bảng điểm.

### Ba vùng

| Vùng | Điều kiện | Khi duyệt hàng loạt |
|---|---|---|
| `SUGGEST_APPROVE` — *Đề xuất duyệt* | Tổng ≥ 80, **không** cờ chặn, **không** tiêu chí nào < 50 | Chọn sẵn ở tab của vùng |
| `SUGGEST_REJECT` — *Đề xuất từ chối* | Tổng < 50 **hoặc** có cờ chặn **hoặc** tiêu chí 1–5 nào < 40 | Chọn sẵn ở tab của vùng |
| `NEEDS_REVIEW` — *Cần xem kỹ* | Còn lại | Không chọn sẵn; Admin nên mở từng tin |

Ngưỡng 80 / 50 được chọn để thận trọng ở vùng duyệt (đọc lý do ở tiêu chí 5). Hai ngưỡng được chốt lại sau bước hiệu chỉnh (bước 3).

### Ví dụ

Tin thực tập "Thực tập sinh Backend NodeJS", mô tả 240 ký tự, có yêu cầu, không ghi quyền lợi, lương 3–5 triệu, công ty chưa có tin nào được duyệt:

```
1 Độ đầy đủ       80  (− 20 NO_BENEFITS)                     × 0,20 = 16,0
2 Chất lượng      90  (− 10 DESCRIPTION_SHORT)               × 0,20 = 18,0
3 Minh bạch      100                                          × 0,15 = 15,0
4 Thực tập       100                                          × 0,10 = 10,0
5 Rủi ro         100                                          × 0,25 = 25,0
6 Uy tín          90  (− 10 COMPANY_NO_HISTORY)              × 0,10 =  9,0
Tổng 93 · không cờ chặn · không tiêu chí < 50 → Đề xuất duyệt
```

Cùng tin đó nhưng mô tả có câu "ứng viên nộp phí đào tạo 500k": tiêu chí 5 còn 40, có cờ `ASKS_FOR_MONEY` → **Đề xuất từ chối**, dù tổng vẫn là 78.

### Lý do từ chối tự sinh

Mỗi mã lỗi của tiêu chí 1–5 gắn với một lý do chọn sẵn của `RejectJobModal`:

| Lý do chọn sẵn | Mã lỗi |
|---|---|
| Thiếu thông tin | tiêu chí 1, `DESCRIPTION_TOO_SHORT`, `REQUIREMENTS_TOO_SHORT`, `ADDRESS_VAGUE` |
| Thông tin không hợp lệ | `SALARY_INVALID`, `SALARY_RANGE_WIDE`, `DEADLINE_TOO_SOON`, `INTERN_EXPERIENCE_HIGH`, `TOO_MANY_REQUIRED_SKILLS` |
| Nội dung không phù hợp | `TITLE_LENGTH`, `TITLE_SHOUTING`, `SPAMMY_FORMAT`, `CONTACT_IN_CONTENT`, `OFF_PLATFORM_CONTACT`, `TOO_GOOD_TO_BE_TRUE`, `INTERN_SALARY_OUTLIER` |
| Vi phạm chính sách | `ASKS_FOR_MONEY` |
| (không đưa vào lý do) | `SALARY_NEGOTIABLE`, `SALARY_ONE_SIDED`, `INTERN_EXPERIENCE_SOME`, `PENDING_SKILLS`, `DESCRIPTION_SHORT`, `RESUBMITTED_UNCHANGED`, `REJECTED_MANY_TIMES`, tiêu chí 6 |

Chuỗi lý do có cùng dạng với chuỗi `RejectJobModal` đang ghép: `"<các lý do chọn sẵn>. <chi tiết từng lỗi>"`. Ví dụ: `"Thiếu thông tin, Vi phạm chính sách. Mô tả công việc quá ngắn (90/150 ký tự); nội dung yêu cầu ứng viên nộp tiền."`

### Khi nào chấm (chốt 2026-11-20)

Chấm **ngay theo sự kiện**, không chờ theo giờ hay chạy ban đêm:

| # | Lúc chấm | Tin được chấm | Ghi `submittedContentHash`? |
|---|---|---|---|
| 1 | NTD **gửi duyệt** (cả công ty được miễn kiểm duyệt) | Tin vừa gửi, trong cùng transaction | Có |
| 2 | **Sự kiện của công ty** (Q4): có báo cáo vi phạm mới; báo cáo được xử lý bằng gỡ tin; Admin thu hồi tin | Mọi tin `PENDING` của công ty đó | Không |
| 3 | NTD **sửa tin đang hiển thị** | Tin vừa sửa. Tụt xuống *Đề xuất từ chối* hoặc mới dính cờ chặn thì báo Admin | Không |
| 4 | Admin bấm **"Chấm lại"** | Tin đó (mọi trạng thái) | Không |
| 5 | **Đổi phiên bản thuật toán** | Chạy script `score-job-quality` | Không |

Vì sao không chờ 1 tiếng hay chạy ban đêm:

- Admin có thể mở hàng đợi ngay sau khi tin được gửi. Nếu chờ thì tin chưa có điểm, rơi vào nhóm "Chưa chấm" và không chọn hàng loạt được.
- Chấm một tin chỉ gồm vài câu đếm và so chuỗi (dự kiến < 50 ms, đo ở bước 3). Không có gì nặng như bảng điểm ứng viên–tin cần dồn sang ban đêm.
- Nội dung tin `PENDING` không đổi, nên chấm lại định kỳ không có ích. Phần đổi được là lịch sử công ty, đã có lượt 2 lo.

Sự kiện "Admin từ chối một tin khác của công ty" cũng làm đổi `COMPANY_HIGH_REJECTION`, nhưng **không** kích hoạt chấm lại: ảnh hưởng nhỏ (tối đa 20 điểm × 10%), và khi từ chối hàng loạt sẽ gây chấm lại dây chuyền cho cùng một công ty.

## Phần 1 — Công nghệ / kiến trúc

- **Không thêm dependency.** SHA-256 dùng `node:crypto`; bỏ dấu dùng `String.prototype.normalize("NFD")` (hai chỗ đang tự viết riêng: `applications.repository.ts:83`, `company-verification.service.ts:34`; bộ chấm có helper riêng, không sửa hai chỗ đó).
- **Hàm chấm thuần** trong module `job-posts`: không truy cập DB, nhận một input đã nạp sẵn, trả kết quả. Unit test được từng quy tắc.
- **Lưu vào cột của `job_posts`**, không tạo bảng riêng: quan hệ 1–1, hàng đợi cần sắp / lọc theo điểm mà không phải join.
- 1 migration viết tay bằng `prisma migrate diff --from-schema-datamodel <HEAD> --to-schema-datamodel <mới>` (so hai file, không cần DB). **Không** dùng `--shadow-database-url` trỏ vào DB thật. Xin xác nhận trước khi áp lên Neon.
- Không tách worker, không thêm hàng đợi ngoài. Chấm một tin chỉ gồm vài câu đếm và so chuỗi (dự kiến < 50 ms, đo ở bước 3).

## Phần 2 — Liên kết giữa các phần

```
submitForApproval ──► JobQualityService.submissionColumns(jobPost)   (ngay trước transaction, không ném lỗi)
                         ├─ JobQualityInputLoader (nội dung tin + lịch sử công ty, báo cáo, số lần bị từ chối)
                         └─ scoreJobPost(input)  ← job-quality.config.ts (trọng số, mức trừ, từ khoá, ngưỡng)
                   └─ trong transaction: update trạng thái + quality* + submittedAt + submittedContentHash

nút Chấm lại / script / sự kiện ──► JobQualityService.scoreAndStore(Many)(ids, { reason })
                                     ghi quality* (không ghi submittedContentHash)

job-reports (createReport, executeAction TAKE_DOWN), JobPostsService.retract
   └─ sau commit: jobQualityCompanyTrigger(companyId) ──► chấm lại các tin PENDING của công ty

updateDraft (tin PUBLISHED) ──► sau commit: JobQualityService.scoreAndStore
   └─ tụt xuống SUGGEST_REJECT / mới có cờ chặn ──► thông báo JOB_POST_QUALITY_DROPPED cho Admin

GET /admin/job-posts (band, sort, cursor) ──► JobPostRepository.findModerationQueue
POST /admin/job-posts/:id/quality/rescore ──► JobQualityService.scoreAndStore

approve / reject (một tin, bulk) ──► JobPostsService
   └─ trong transaction mỗi tin: updateMany where status = PENDING (đổi trạng thái có điều kiện)
                                  + moderation action (kèm điểm, vùng, bulk) + thông báo + audit
   └─ sau commit (chỉ khi duyệt): PublishFollowUpService.enqueue(jobIds)
        ├─ theo từng công ty: chấm bảng điểm từng tin lần lượt (matchScoreService.rescoreJob)
        └─ rồi autoOutreachTrigger(companyId) một lần cho công ty đó
```

- `JobQualityService` thuộc module `job-posts`, đăng ký trong awilix như các service hiện có. Không phụ thuộc `job-reports` service; chỉ đọc bảng `job_reports` qua repository của chính nó (như `countRetractions` đang đọc moderation action).
- `PublishFollowUpService` resolve `matchScoreService` và `autoOutreachTrigger` lúc gọi (giống `matchScoreTrigger`) để không tạo vòng DI.
- `jobQualityCompanyTrigger` đăng ký bằng `asValue` và resolve `JobQualityService` lúc gọi (giống `matchScoreTrigger`), để module `job-reports` gọi được mà không phụ thuộc ngược vào `job-posts`.

## Phần 3 — Các bước

### Bước 1 — AD-29 và schema

- Chủ dự án duyệt AD-29 (bản đề xuất đã ghi trong `ARCHITECTURE_DECISIONS.md`).
- `schema.prisma`:
  - `enum JobQualityBand { SUGGEST_APPROVE NEEDS_REVIEW SUGGEST_REJECT }`.
  - `JobPost`: `submittedAt DateTime?`, `qualityScore Int?`, `qualityBand JobQualityBand?`, `qualityBreakdown Json?`, `qualityVersion Int?`, `qualityScoredAt DateTime?`, `submittedContentHash String?` (chỉ ghi lúc gửi duyệt, xem tiêu chí 5). Index `(status, qualityScore)` và `(status, submittedAt)`.
  - `JobPostModerationAction`: `qualityScore Int?`, `qualityBand JobQualityBand?`, `bulk Boolean @default(false)`. Lưu điểm tại thời điểm Admin quyết định, làm dữ liệu hiệu chỉnh trọng số về sau.
  - `NotificationType` thêm `JOB_POST_QUALITY_DROPPED` (Admin: tin đang hiển thị bị sửa và tụt điểm, bước 4b).
- Migration `202611xx_add_job_quality_score`: thêm cột, enum, giá trị enum thông báo, index. Backfill `submittedAt` bằng SQL từ dòng `SUBMITTED` mới nhất của mỗi tin.
- `prisma generate`, `tsc`.
- **Đã làm (2026-11-20):** schema + migration `20261120120000_add_job_quality_score` (sinh bằng `prisma migrate diff` giữa schema HEAD và schema mới, không đụng DB). Khai báo luôn payload / mẫu / nhóm của `JOB_POST_QUALITY_DROPPED` (server `notification.types.ts`, `notification-templates.ts`, `notification-groups.ts`; `shared-types` `NotificationType`; web `lib/notifications.ts` nhóm + nhãn nút) vì các map `Record<NotificationType, …>` bắt buộc đủ khoá. Icon / màu của thông báo để F4b. `tsc` server + web sạch, 665/665 unit test. Đã áp migration lên Neon (`npm run db:deploy`, 2026-11-20).

### Bước 2 — Bộ chấm thuần và cấu hình

- `job-posts/job-quality.config.ts`: `QUALITY_SCORE_VERSION = 1`, trọng số, mức trừ theo mã lỗi, ngưỡng (150 / 300 / 50 ký tự, 20 triệu, 7 ngày, 180 ngày…), ba nhóm từ khoá, ngưỡng vùng 80 / 50, điểm sàn 50, điểm sàn cứng 40 (trừ tiêu chí 6), bảng mã lỗi → lý do chọn sẵn.
- `job-posts/job-quality.ts`:
  - `scoreJobPost(input: JobQualityInput, now: Date): JobQualityResult`.
  - `JobQualityResult = { score, band, version, criteria: [{ key, score, weight, issues: [{ code, penalty, message }] }], flags: string[], contentHash }`.
  - `buildRejectReason(result): string | null`: lý do tự sinh; `null` khi không có lỗi nào được phép đưa vào lý do.
  - `contentHash(input)`, `foldText(s)` (bỏ dấu, chữ thường).
- `JobQualityInput` gồm: các trường của tin, kỹ năng (mức + trạng thái), ngành, và tín hiệu đã nạp (`previousContentHash`, `lastModerationAction`, `rejectionCount`, `companyRetractions180d`, `companyConfirmedReports180d`, `companyOpenReports`, `companySubmitCount`, `companyRejectCount`, `companyApprovedCount`).

- **Đã làm (2026-11-20):** `job-quality.config.ts`, `job-quality.ts`, `tests/unit/job-quality.test.ts` (18 test, gồm hai ví dụ của plan — nay là 93 / 78 điểm sau hiệu chỉnh bước 3). Toàn bộ 683/683 unit test qua. Khác / bổ sung so với mô tả trên:
  - **Tín hiệu "gửi lại không sửa"** là một cờ `signals.resubmittedUnchanged` do loader (bước 4) tính, thay cho cặp `previousContentHash` + `lastModerationAction`. Lý do: lúc chấm lại một tin `PENDING` (sự kiện công ty, nút Chấm lại), thao tác gần nhất đã là `SUBMITTED` và `submittedContentHash` đã là mã của lần gửi này, nên không còn gì để so; nếu tính lại từ hai giá trị đó thì lỗi `RESUBMITTED_UNCHANGED` sẽ biến mất sau lần chấm lại. Loader: lúc gửi duyệt so mã mới với `submittedContentHash` cũ khi thao tác trước là `REJECTED`; lúc chấm lại tin `PENDING` thì giữ cờ từ `qualityBreakdown` của lần chấm trước; tin ở trạng thái khác thì `false`.
  - **Phủ định trước từ khoá đòi tiền** không bị tính (`QUALITY_MONEY_NEGATION`): "miễn phí đào tạo", "không thu phí hồ sơ", "không cần nộp tiền hay đặt cọc" là quyền lợi. Phủ định ở câu khác ("Không cần kinh nghiệm. Đặt cọc 500k") vẫn bị bắt.
  - Từ khoá khớp theo ranh giới từ ("Zalora" không phải "zalo"); câu giải thích trích nguyên cụm từ gốc có dấu.
  - Số điện thoại không bắt đầu sau chữ số / dấu chấm, để khoảng lương "8.000.000-10.000.000" không bị nhầm. Link chỉ tính `http(s)://`, `www.` và tên miền `.com / .vn / .com.vn / .net.vn / .me / .ly` (không bắt "ASP.NET", "Node.js").
  - `SPAMMY_FORMAT`: ký tự lặp không tính chữ số ("10000" không phải spam).
  - Không ghi lương và không chọn "Thoả thuận" (chỉ gặp khi chấm lại tin nháp) ⇒ `SALARY_NEGOTIABLE` với câu "Chưa ghi mức lương".
  - `DEADLINE_TOO_SOON` tính từ `submittedAt` (lúc gửi duyệt), không phải lúc chấm lại.
  - Mã băm gộp khoảng trắng, sắp kỹ năng / ngành theo id, **không** gồm hạn nộp và `requirementsConfirmedAt` (đổi những thứ đó không phải "sửa theo góp ý").
  - `TITLE_LENGTH` đưa vào lý do "Nội dung không phù hợp" (bảng lý do trước đây bỏ sót mã này).

### Bước 3 — Hiệu chỉnh trên dữ liệu (trước khi chốt số)

- Script `npm run score-job-quality --workspace=apps/server -- --dry-run`: chấm mọi tin (400 tin large-demo, tin match-demo, tin `PENDING` thật) và in phân bố điểm, số tin mỗi vùng, top mã lỗi, thời gian chấm mỗi tin. Không ghi DB.
- Thêm vài tin mẫu cố ý xấu (đòi phí, Zalo, mô tả 1 dòng, lương thực tập 30 triệu) vào **test**, không vào DB, để kiểm mỗi tin rơi đúng vùng.
- Báo kết quả cho chủ dự án; chỉnh trọng số / ngưỡng nếu phân bố lệch (ví dụ > 90% tin demo vào *Đề xuất duyệt* hoặc tin xấu không vào *Đề xuất từ chối*). Chốt rồi mới làm bước 4.
- Lưu ý: tin demo là dữ liệu sinh ra, nên con số chỉ để kiểm bộ chấm chạy hợp lý, không chứng minh độ chính xác.
- **Đã chạy (2026-11-20):** `scripts/score-job-quality.ts` (chỉ `--dry-run`; chế độ ghi để bước 4) + `job-posts/job-quality-input.loader.ts` (nạp input theo lô, chỉ đọc; bước 4 dùng lại). 4 test tin mẫu xấu trong `job-quality.test.ts` (22 test, 687/687 toàn bộ). Kết quả trên Neon, 384 tin (trừ nháp):
  - Vùng: duyệt 372 (96,9%), xem kỹ 12, từ chối 0; không tin nào có cờ chặn. Điểm 73–96, trung vị 93.
  - Mã lỗi hay gặp: `REQUIREMENTS_NOT_CONFIRMED` 99,5%, `DESCRIPTION_SHORT` 94%, `NO_MAJOR` 35%, `SALARY_NEGOTIABLE` 31%.
  - Thời gian: chấm 0,6 ms/tin; nạp dữ liệu 5,4 ms/tin khi nạp theo lô 200.
  - Tin mẫu: đòi phí hồ sơ ⇒ từ chối (cờ chặn, 85 điểm); gộp nhiều dấu hiệu ⇒ từ chối (45); lương 30 triệu + "việc nhẹ lương cao" ⇒ xem kỹ (86, rủi ro 45 dưới sàn). **Lệch:** tin có "kết bạn Zalo + số điện thoại" ra 90 điểm, *đề xuất duyệt*; tin mô tả 1 dòng, không yêu cầu, không quyền lợi, không lương, không địa chỉ chỉ ra 75, *xem kỹ*.
  - Nhận xét: rủi ro + công ty + phù hợp thực tập chiếm 45 điểm và hầu như luôn đầy, nên tin chỉ "thiếu thông tin" không bao giờ xuống dưới 50. Vùng từ chối hiện chỉ đạt được qua cờ chặn hoặc nhiều dấu hiệu rủi ro.
  - **Chốt (Q5, 2026-11-20), chủ dự án đồng ý cả 3:** (1) bỏ `REQUIREMENTS_NOT_CONFIRMED` (cùng trường `requirementsConfirmedAt` khỏi input); (2) `OFF_PLATFORM_CONTACT` 25 → 55; (3) điểm sàn cứng 40 cho tiêu chí 1–5 ⇒ đề xuất từ chối (tiêu chí 6 không xét vì không đưa vào lý do gửi NTD). Thêm (4) `INTERN_SALARY_OUTLIER` 30 → 55, để tin thực tập lương > 20 triệu luôn qua người xem. Giữ `QUALITY_SCORE_VERSION = 1` vì chưa có điểm nào được lưu. 25 test bộ chấm (thêm Zalo ⇒ xem kỹ, mô tả 1 dòng ⇒ từ chối với lý do "Thiếu thông tin", sàn cứng bỏ qua tiêu chí 6), 690/690 toàn bộ.
  - Chạy lại (sau cả 4 thay đổi): duyệt 372 (96,9%), xem kỹ 10, từ chối 2 (hai tin hết hạn không có yêu cầu, mô tả quá ngắn, đòi ≥ 1 năm kinh nghiệm). Điểm 75–98, trung vị 95. Tin duy nhất dính `INTERN_SALARY_OUTLIER` nằm ở *xem kỹ*.

### Bước 4 — Nạp tín hiệu và lưu điểm

- `JobQualitySignalsLoader` (hoặc hàm trong `JobPostRepository`): nạp tín hiệu ở bước 2 trong **một** lượt (`Promise.all` các câu đếm, có `tx`).
- `JobQualityService.scoreAndStore(jobId, db)`: nạp tin + tín hiệu → `scoreJobPost` → ghi các cột `quality*`.
- `scoreAndStore` nhận tuỳ chọn `{ reason, recordSubmission }`: `reason` (`SUBMITTED` / `COMPANY_EVENT` / `PUBLISHED_EDIT` / `MANUAL` / `SCRIPT`) lưu trong `qualityBreakdown` để trang chi tiết hiện vì sao điểm đổi; chỉ lối gửi duyệt truyền `recordSubmission: true` để ghi `submittedContentHash`.
- `submitForApproval`: trong transaction hiện có, đặt `submittedAt = now` và gọi `scoreAndStore(..., { recordSubmission: true })`. Chấm **cả** khi công ty được miễn kiểm duyệt (tin tự đăng), để Admin lọc được tin đang hiển thị có điểm thấp (Q6). Lỗi khi chấm **không** chặn việc gửi duyệt: ghi log, để `qualityScore = null`, tin vẫn vào hàng đợi (vùng "chưa chấm").
- `POST /admin/job-posts/:id/quality/rescore`: chấm lại một tin (mọi trạng thái), trả DTO.
- Script `score-job-quality` (bỏ `--dry-run`): chấm và ghi cho tin `PENDING` (mặc định) hoặc `--all`; dùng sau khi áp migration và mỗi khi đổi version.
- **Đã làm (2026-11-20):** `job-posts/job-quality.service.ts` (`JobQualityService`), `job-posts/job-quality.mapper.ts` (`toJobQualityDto`, bước 9 dùng lại), route `POST /admin/job-posts/:id/quality/rescore`, chế độ ghi của script, type `JobQualityDto` / `JobQualityBand` / `JobQualityScoredReason` trong `shared-types` (bước 9 sẽ gắn vào `JobPost`). 13 test trong `tests/unit/job-quality-service.test.ts`, 704/704 toàn bộ, `tsc` sạch. Probe trên Neon: ghi điểm 3 tin `PENDING` trong một transaction, đọc lại qua mapper đúng, rồi rollback (DB không đổi). Dry-run vẫn 372 / 10 / 2. **Chưa chạy chế độ ghi trên Neon** (bước 11, chờ chủ dự án). Khác / bổ sung so với mô tả trên:
  - **Không có `JobQualitySignalsLoader` riêng:** dùng lại `JobQualityInputLoader` của bước 3 (nạp nội dung tin + tín hiệu theo lô, một tin cũng gọi cùng hàm).
  - **Gửi duyệt chấm ngay trước transaction, không chấm bên trong:** `JobQualityService.submissionColumns(jobPost, { now, autoPublished })` trả các cột (`submittedAt`, `quality*`, `submittedContentHash`), `submitForApproval` trải chúng vào lệnh `update` đổi trạng thái (`PENDING` hoặc `PUBLISHED`) trong transaction. Lý do: một câu lỗi trong transaction Postgres làm hỏng cả transaction, nên chấm bên trong thì không thể "chấm lỗi vẫn gửi duyệt được". Hàm không ném lỗi: lỗi thì ghi log, trả cột điểm `null` (vùng "chưa chấm"), giữ `submittedContentHash` cũ.
  - Tín hiệu lúc gửi tính như thể lần gửi này đã ghi: `companySubmitCount + 1`, và `companyApprovedCount + 1` khi tự đăng. Nhờ vậy điểm lúc gửi bằng điểm của một lần chấm lại ngay sau đó (bước 4b so vùng trước / sau sẽ không lệch vì chuyện này).
  - "Gửi lại không sửa" lúc gửi: thao tác kiểm duyệt gần nhất (đã có trong `findById`) là `REJECTED` **và** mã băm mới bằng `submittedContentHash` cũ. Cờ lưu trong `qualityBreakdown.resubmittedUnchanged`, các lần chấm lại tin `PENDING` giữ cờ này.
  - `qualityBreakdown = { criteria, flags, reason, resubmittedUnchanged }`.
  - `scoreAndStore` / `scoreAndStoreMany(ids, { reason })` cho mọi lối chấm lại (nút Chấm lại = `MANUAL`, script = `SCRIPT`; bước 4b dùng `COMPANY_EVENT` / `PUBLISHED_EDIT`). **Không** có tuỳ chọn `recordSubmission`: chỉ lối gửi duyệt ghi `submittedContentHash`, và lối đó đi qua `submissionColumns`. Ghi bằng `updateMany` để tin nháp bị xoá giữa chừng không làm dừng cả lượt.
  - API chấm lại trả `JobQualityDto`; tin không tồn tại ⇒ 404. Không ghi audit log (chấm lại không đổi gì ngoài điểm gợi ý).
  - Script thêm `--outdated` (chỉ tin chưa có điểm hoặc điểm của phiên bản khác) để dùng khi tăng `QUALITY_SCORE_VERSION`. `--all` và `--status` không dùng cùng nhau.

### Bước 4b — Chấm lại theo sự kiện (Q4 và sửa tin đang hiển thị)

**Sự kiện của công ty (Q4):**

- `JobQualityService.rescorePendingForCompany(companyId)`: chấm lại lần lượt mọi tin `PENDING` của công ty. Mỗi tin ghi riêng, một tin lỗi chỉ ghi log rồi chạy tiếp.
- Trigger `jobQualityCompanyTrigger(companyId)`: gọi, không chờ, lỗi chỉ ghi log (giống `autoOutreachTrigger`). Gọi **sau commit** ở ba chỗ:
  1. `JobReportsService.createReport`: có báo cáo vi phạm mới;
  2. `JobReportsService.executeAction` khi `resolution = TAKE_DOWN`: báo cáo được xác nhận và tin bị gỡ;
  3. `JobPostsService.retract`: Admin thu hồi tin.
- Admin đang mở trang chi tiết một tin đúng lúc chấm lại: lần tải sau hiện điểm mới, không cần realtime.
- Còn một khoảng hở nhỏ: sự kiện xảy ra, rồi Admin bấm duyệt hàng loạt **trước khi** lượt chấm lại chạy xong. Lượt chấm chỉ mất cỡ vài trăm ms cho vài tin, nên chấp nhận.

**Sửa tin đang hiển thị:**

- `updateDraft`: tin `PUBLISHED` thì sau commit gọi `scoreAndStore` (không ghi `submittedContentHash`), **chờ** kết quả rồi mới trả response, vì việc chấm rẻ. Lỗi khi chấm chỉ ghi log, không làm hỏng việc sửa tin.
- So vùng / cờ trước và sau khi chấm. Báo Admin bằng `JOB_POST_QUALITY_DROPPED` (gửi mọi Admin qua `findAdminIds` + `notifyMany`) **chỉ khi chuyển sang xấu**:
  - vùng trước khác `SUGGEST_REJECT` và vùng sau là `SUGGEST_REJECT`; **hoặc**
  - có cờ chặn mà lần chấm trước chưa có.
  Sửa tiếp mà vẫn ở vùng xấu thì không báo lại, để tránh spam.
- Payload: `{ jobPostId, jobPostTitle, companyName, score, flags }`. Template: "Tin **X** của **Công ty** vừa được sửa và tụt xuống vùng đề xuất từ chối (N điểm)", link `/admin/jobs/:id`. Thêm vào `notification.types.ts`, `notification-templates.ts`, `notification-groups.ts`.
- Không thêm audit log cho việc sửa tin: hiện sửa tin không ghi audit, đợt này giữ nguyên. Thông báo cho Admin đã đủ.
- **Không** tự gỡ tin, không đổi trạng thái tin. Admin mở tin và quyết định có thu hồi không (giữ nguyên tắc "chỉ gợi ý").
- Tin `DRAFT` sửa thì không chấm (sẽ chấm lúc gửi duyệt).
- **Đã làm (2026-11-20):** `JobQualityService.triggerCompany` / `rescorePendingForCompany` / `rescoreAfterPublishedEdit`, hàm thuần `qualityTurnedBad`, `jobQualityCompanyTrigger` (`asValue` trong `job-posts.routes.ts`), gọi ở `JobReportsService.createReport`, `JobReportsService.executeAction`, `JobPostsService.retract` và `updateDraft` (tin `PUBLISHED`). Thêm 11 test vào `job-quality-service.test.ts` (24 test), kiểm trigger trong `job-reports-service.test.ts`; 713/713 toàn bộ, `tsc` sạch. Probe trên Neon trong một transaction rồi rollback: chấm lại 2 tin `PENDING` của một công ty (lý do `COMPANY_EVENT`); thêm "đóng phí hồ sơ" vào một tin đang hiển thị ⇒ 65 điểm, *Đề xuất từ chối*, cờ `ASKS_FOR_MONEY`, đúng một thông báo (bản giả, không gửi thật). Khác / bổ sung so với mô tả trên:
  - **Gộp lần gọi trùng công ty:** `triggerCompany` giữ một Map công ty đang chấm (trong bộ nhớ, service singleton). Sự kiện tới giữa lượt chỉ bật cờ, lượt đang chạy chấm thêm đúng một vòng khi xong; không chạy chồng cho cùng công ty. Cần vì "gỡ tin theo báo cáo" gây hai sự kiện liền nhau: `retract` (commit trước) rồi báo cáo mới được ghi `RESOLVED / TAKE_DOWN`; vòng đầu có thể chưa thấy báo cáo đã xác nhận, vòng sau thấy.
  - **`executeAction` kích hoạt với cả `DISMISS`**, không chỉ `TAKE_DOWN`: bỏ qua báo cáo làm bớt một báo cáo đang chờ (`COMPANY_OPEN_REPORTS`), không chấm lại thì tin chờ duyệt bị trừ điểm oan cho tới lần chấm sau.
  - Payload thông báo là `{ jobPostId, jobPostTitle, companyName, score, blocked }` (đã khai báo ở bước 1; `blocked` thay cho danh sách `flags`, vì template chỉ cần biết có cờ chặn hay không).
  - Tin đang hiển thị **chưa từng được chấm** (đăng trước khi có tính năng) mà sửa xong rơi vào *Đề xuất từ chối* thì cũng báo (vùng trước là `null`, khác `SUGGEST_REJECT`).
  - `rescoreAfterPublishedEdit` nhận bản tin **trước khi sửa** (đã có từ `findById` đầu `updateDraft`), lấy vùng và cờ cũ từ đó, không đọc DB thêm. Hàm không ném lỗi; `updateDraft` chờ hàm này rồi mới trả response.
  - Đo (probe, trong transaction nên các câu nạp chạy nối tiếp, là cận trên): chấm lại một tin ~0,7 giây từ máy dev tới Neon. Ngoài transaction, các câu nạp tín hiệu chạy song song nên nhanh hơn.

### Bước 5 — Đổi trạng thái có điều kiện (điểm 8)

- Repository: `transitionIfStatus(id, from, data, tx): Promise<boolean>` dùng `updateMany({ where: { id, status: from }, data })`, trả `count === 1`.
- `approve` / `reject` / `retract`: gọi hàm này **đầu tiên** trong transaction. `false` ⇒ ném 409 "Tin đã được xử lý bởi người khác" và transaction không ghi gì (không moderation action, không thông báo, không audit).
- Moderation action ghi kèm `qualityScore`, `qualityBand` hiện tại của tin.
- Hành vi khi chỉ một admin thao tác: **không đổi** (test hiện có phải xanh nguyên).
- **Đã làm (2026-11-20):** `JobPostRepository.transitionIfStatus` và helper `JobPostsService.moderateTransition` dùng chung cho `approve` / `reject` / `retract`. `createModerationAction` nhận thêm `qualityScore`, `qualityBand`; thêm `JobPostRepository.findQuality`. Thêm `tests/unit/job-post-moderation-transition.test.ts` (6 test); 719/719, `tsc` sạch cho `src` và `tests`. Chi tiết:
  - Kiểm trạng thái ở đầu hàm (đọc tin) **giữ nguyên**, cùng thông báo 409 tiếng Anh như cũ. Chỉ khi tin đúng trạng thái lúc đọc nhưng bị Admin khác chuyển trước lúc ghi thì mới ra 409 "Tin đã được xử lý bởi người khác".
  - Thứ tự trong transaction: đổi trạng thái có điều kiện → đọc điểm / vùng (`findQuality`) → ghi moderation action → đọc lại tin (`findById` trong `tx`, để DTO trả về có action mới nhất cho banner lý do) → thông báo → audit. Ném 409 ở bước đầu ⇒ rollback, các trigger sau commit (tự mời, bảng điểm, chấm lại tin chờ) cũng không chạy.
  - Điểm / vùng ghi vào moderation action được **đọc lại sau khi đổi trạng thái**, không lấy từ bản đọc đầu hàm. Lối chấm nền (bước 4b) có thể ghi điểm mới xen giữa lúc đọc tin và lúc ghi; sau khi `UPDATE` thắng, dòng tin bị khoá tới hết transaction nên lần chấm nền nào muốn ghi đều phải chờ, và giá trị đọc được chính là điểm của tin lúc được quyết định (dữ liệu hiệu chỉnh đúng nghĩa). Đổi lại phải thêm một câu đọc 2 cột theo khoá chính. Đã cân nhắc và bỏ: (a) dùng bản đọc đầu hàm, có thể lệch; (b) đổi thứ tự để tận dụng câu `findById` cuối, nhưng banner cần email Admin (`actor`) nên vẫn tốn thêm một câu; (c) `UPDATE … RETURNING` bằng SQL thuần, mất kiểm tra kiểu và phải tự xử lý enum / `updatedAt`; (d) map trong bộ nhớ, không thấy điểm do script hay tiến trình khác ghi và không có khoá dòng nên vẫn có thể lệch.
  - Không probe ghi trên Neon: muốn thấy hai transaction tranh nhau thì transaction đầu phải commit thật. Cơ chế dựa vào Postgres READ COMMITTED: `UPDATE … WHERE id AND status` thứ hai chờ khoá dòng, rồi đánh giá lại `WHERE` trên bản đã commit ⇒ khớp 0 dòng.

### Bước 6 — Hàng đợi (điểm 1, 2)

- `moderationQueueQuerySchema` thêm:
  - `band?: JobQualityBand | "UNSCORED"`;
  - `sort?: "submitted_asc" | "score_desc" | "score_asc" | "created_desc"`. Mặc định: `submitted_asc` khi `status = PENDING` (tin gửi trước xử lý trước), `created_desc` cho trạng thái khác (như hiện tại).
- `findModerationQueue`: `orderBy` theo sort, luôn kèm `id` làm khoá phụ để cursor ổn định. Tin chưa có điểm xếp cuối khi sắp theo điểm (`nulls: "last"`).
- Response thêm `total` (số tin khớp bộ lọc) để frontend hiện "N tin" và "Chọn tất cả N".
- `GET /admin/job-posts/stats` thêm `pendingByBand: { SUGGEST_APPROVE, NEEDS_REVIEW, SUGGEST_REJECT, UNSCORED }`.
- `GET /admin/job-posts/ids?status=PENDING&band=…` trả tối đa 50 id khớp bộ lọc (theo đúng sort): dùng cho nút "Chọn tất cả tin trong vùng" mà không phải tải hết trang.
- **Đã làm (2026-11-20):** `moderationQueueQuerySchema` (+ `band`, `sort`), `moderationIdsQuerySchema`, `MODERATION_BATCH_LIMIT = 50` (`job-posts.dto.ts`, bước 7 dùng lại). Trong `job-post.repository.ts`: các hàm thuần `resolveModerationSort` / `moderationWhere` / `moderationOrderBy` / `moderationKeysetWhere`, cùng `findModerationQueue(filter, cursor)` (kèm `total`), `findModerationIds`, `countPendingByBand`. Route mới `GET /admin/job-posts/ids` khai báo trước `/:id`. Shared-types: `JobQualityBandFilter`, `ModerationQueueSort`, `ModerationQueueQuery`, `ModerationQueueIdsResponse`, `JobPostStats.pendingByBand?` (`PaginatedResponse.total?` đã có sẵn). Thêm `tests/unit/job-post-moderation-queue.test.ts` (8 test); 727/727, `tsc` sạch cho server (`src`, `tests`) và web. Khác / bổ sung so với mô tả trên:
  - **Không dùng `cursor` của Prisma.** Prisma phân trang bằng cách so giá trị cột sắp xếp với dòng mốc, và sai khi cột cho phép null (`qualityScore`, `submittedAt`). Tự dựng điều kiện "đứng sau mốc" (`moderationKeysetWhere`): mốc có giá trị v ⇒ (sau v) hoặc (= v và id > mốc) hoặc (null); mốc null ⇒ (null và id > mốc). Cursor vẫn là **id tin cuối trang**, như cũ.
  - Không dùng cursor dạng offset (như `sort=match` của AD-26): Admin duyệt vài tin ở trang 1 rồi tải trang 2 thì offset trượt và bỏ sót tin. Mốc theo khoá thì không: tin mốc đã rời hàng đợi vẫn được đọc theo id để lấy giá trị. Cursor trỏ tới tin không còn tồn tại ⇒ 400 `INVALID_CURSOR`.
  - Mỗi trang có trang sau tốn thêm một câu đọc dòng mốc (3 cột), và `total` là một câu `count` chạy song song.
  - `created_desc` cũng thêm `id` làm khoá phụ (trước đây chỉ `createdAt`).
  - `band` lọc được với mọi trạng thái (ví dụ tin đang hiển thị có điểm thấp, Q6), không chỉ `PENDING`.
  - `/ids` trả `{ ids, total }`: `total > ids.length` thì frontend biết danh sách đã bị cắt ở 50.
  - Probe trên Neon (chỉ đọc): đi hết từng trang của 3 bộ lọc (tất cả / `PENDING` / `PUBLISHED`) × 4 thứ tự, 426 / 18 / 304 tin, so với một lần đọc toàn bộ cùng `orderBy` ⇒ khớp, không trùng, không sót, `total` đúng. Trên Neon chưa tin nào có điểm (chưa chạy script ghi), nên kiểm thêm trong một transaction rồi rollback: gán điểm giả có trùng và 84 / 304 null ⇒ hai thứ tự theo điểm vẫn khớp, null xếp cuối. Sau rollback DB không đổi. Mỗi trang ~0,6–0,8 giây từ máy dev tới Neon (3 câu, trong đó câu chính kèm `jobPostInclude`).

### Bước 7 — Duyệt / từ chối hàng loạt (điểm 7)

- `POST /admin/job-posts/bulk-approve`, body `{ ids: string[] }` (1–50 id, không trùng).
- `POST /admin/job-posts/bulk-reject`, body `{ ids: string[], reason?: string }`.
  - Có `reason` ⇒ dùng cho mọi tin.
  - Không có ⇒ mỗi tin dùng `buildRejectReason` của chính nó. Tin không sinh được lý do (không có lỗi nào) ⇒ bỏ qua với `REASON_REQUIRED`.
- Xử lý **lần lượt từng tin, mỗi tin một transaction riêng**, dùng chung lõi với `approve` / `reject` một tin (tách lõi thành hàm nhận `tx`). Không gộp cả lô vào một transaction: một tin lỗi không được làm hỏng các tin khác, và transaction dài giữ khoá lâu trên Neon.
- Response: `{ succeeded: string[], skipped: { id, reason: "NOT_FOUND" | "NOT_PENDING" | "REASON_REQUIRED" }[] }`. Tin đã được admin khác xử lý ⇒ `NOT_PENDING` (nhờ bước 5).
- Moderation action ghi `bulk = true`. Audit log mỗi tin một dòng như duyệt tay, `metadata` thêm `{ bulk: true, batchId, qualityScore, qualityBand }`. Không thêm loại audit action mới.
- Thông báo: mỗi tin một thông báo cho employer của công ty, như hiện tại (Q3).
- Rate limit nhẹ cho hai endpoint (dùng cơ chế Redis sẵn có), ví dụ 10 lần / phút / admin.

### Bước 8 — Việc sau khi duyệt hàng loạt chạy lần lượt

- `PublishFollowUpService.enqueue(jobIds)`: một hàng đợi trong bộ nhớ, chạy **một lượt tại một thời điểm**.
  - Nhóm tin theo công ty. Với mỗi công ty: chấm bảng điểm từng tin **lần lượt** (`matchScoreService.rescoreJob`, rồi `jobScoredListener` như `trigger` đang làm, để job alert vẫn chạy), sau đó gọi `autoOutreachTrigger(companyId)` **một lần**. Tự mời đọc bảng điểm (AD-27), nên phải chấm xong rồi mới mời.
  - `yieldToEventLoop` giữa các tin.
  - Lỗi một tin chỉ ghi log, chạy tiếp tin sau. Server khởi động lại giữa chừng thì job đêm 3h30 (AD-24) và cron tự mời 15 phút là lưới an toàn.
- Duyệt **một** tin vẫn gọi `matchScoreTrigger` + `autoOutreachTrigger` như cũ (không đổi hành vi).
- Đo trên Neon: duyệt hàng loạt 20 tin, ghi thời gian đến khi chấm xong tin cuối và độ trễ request khác trong lúc chạy (mốc: duyệt một tin chấm xong ~4 giây theo backlog 0.3).

### Bước 9 — DTO và shared-types

- `JobPost` DTO thêm `submittedAt: string | null` và `quality: JobQualityDto | null`. **Chỉ mapper của Admin** điền `quality`; API công khai và của employer trả `null` (Q1).
- `JobQualityDto = { score, band, version, scoredAt, scoredReason: "SUBMITTED" | "COMPANY_EVENT" | "PUBLISHED_EDIT" | "MANUAL" | "SCRIPT", criteria: [{ key, label, score, weight, issues: [{ code, message, penalty }] }], flags, suggestedRejectReason: string | null, outdated: boolean }` (`outdated` = `version` khác version hiện tại).
- `ModerationQueueQuery`, `BulkApproveRequest`, `BulkRejectRequest`, `BulkModerationResult`, `JobPostStats.pendingByBand`.
- Payload thông báo `JOB_POST_QUALITY_DROPPED` trong `NotificationPayloadMap`.
- Cập nhật `packages/shared-types`.

### Bước 10 — Test

Unit test (theo mẫu `tests/unit/job-post-*.test.ts`):

- Bộ chấm: mỗi mã lỗi một case (đúng điều kiện thì trừ, sát ngưỡng thì không); từ khoá khớp cả có dấu / không dấu / viết hoa; mỗi nhóm từ khoá trừ một lần; điểm không âm; làm tròn tổng.
- Vùng: tổng ≥ 80 nhưng có cờ chặn ⇒ `SUGGEST_REJECT`; tổng ≥ 80 nhưng một tiêu chí < 50 ⇒ `NEEDS_REVIEW`; < 50, hoặc tiêu chí 1–5 < 40 ⇒ `SUGGEST_REJECT`.
- Mã băm: gửi lại không sửa sau khi bị từ chối ⇒ `RESUBMITTED_UNCHANGED`; sửa một chữ ⇒ không trừ; lần gửi trước được duyệt rồi gửi lại ⇒ không trừ.
- Lý do tự sinh: đúng nhóm, không chứa lỗi tiêu chí 6; không lỗi ⇒ `null`.
- Đổi trạng thái có điều kiện: `updateMany` trả 0 ⇒ 409, không ghi moderation action / thông báo / audit.
- Hàng loạt: lô có tin `PENDING`, tin đã duyệt, id không tồn tại ⇒ đúng `succeeded` / `skipped`; từ chối không lý do và tin không có lỗi ⇒ `REASON_REQUIRED`; moderation action có `bulk = true` và điểm.
- `PublishFollowUpService`: chấm lần lượt (không chồng nhau), tự mời gọi một lần mỗi công ty và sau khi chấm xong tin của công ty đó, một tin lỗi không dừng lượt.
- Gửi duyệt: ghi `submittedAt`, điểm và `submittedContentHash`; bộ chấm ném lỗi ⇒ vẫn gửi duyệt được, `qualityScore = null`.
- "Chấm lại" một tin nháp đã sửa sau khi bị từ chối **không** ghi đè `submittedContentHash`; gửi lại sau đó không bị `RESUBMITTED_UNCHANGED`.
- Sự kiện công ty: tạo báo cáo / xử lý gỡ tin / thu hồi tin ⇒ gọi `jobQualityCompanyTrigger` đúng một lần với đúng `companyId`; `rescorePendingForCompany` chỉ chấm tin `PENDING` của công ty đó, một tin lỗi không dừng lượt.
- Sửa tin đang hiển thị: chấm lại; chuyển sang `SUGGEST_REJECT` ⇒ một thông báo cho mỗi Admin; sửa tiếp vẫn ở vùng xấu ⇒ không báo nữa; mới có cờ chặn dù vẫn ở vùng xấu ⇒ báo; tin nháp sửa ⇒ không chấm.
- `tsc` và toàn bộ test server.

### Bước 11 — Kiểm thật và tài liệu

- Áp migration lên Neon (sau khi chủ dự án xác nhận), chạy `score-job-quality` cho tin `PENDING`.
- Qua gateway 8080: gửi duyệt vài tin (tốt, thiếu, có "phí đào tạo") bằng tài khoản Mây Xanh; Admin thấy đúng vùng; duyệt hàng loạt và từ chối hàng loạt; hai tab admin cùng duyệt một tin ⇒ một bên nhận 409 / `NOT_PENDING`; sau khi duyệt hàng loạt, bảng điểm và tự mời chạy lần lượt.
- Q4: Mây Xanh có tin chờ duyệt; ứng viên báo cáo một tin đang hiển thị khác của Mây Xanh ⇒ điểm tiêu chí 6 của tin chờ giảm, "chấm lúc" đổi.
- Sửa tin đang hiển thị của Mây Xanh, thêm "đóng phí đào tạo" vào quyền lợi ⇒ Admin nhận thông báo, trang chi tiết hiện cờ chặn; sửa lại cho sạch ⇒ điểm trở lại.
- Cập nhật AD-29 (trạng thái), backlog, FAQ trợ lý hỗ trợ của employer nếu có câu nói về lý do từ chối tin.

## Câu hỏi đã chốt (2026-11-20)

Q1–Q3, Q5, Q6 chốt theo đề xuất. Q4 đổi so với đề xuất ban đầu. Thêm Q7.

- **Q1 — Nhà tuyển dụng có thấy điểm không?** **Không** trong đợt này. NTD chỉ nhận lý do từ chối cụ thể. Lộ điểm và quy tắc từ khoá thì dễ bị lách (ví dụ viết "ph1 đào tạo"). Có thể làm sau dưới dạng "gợi ý hoàn thiện tin" trên form tạo tin, không hiện điểm.
- **Q2 — Trần mỗi lần hàng loạt:** **50 tin**.
- **Q3 — Thông báo khi duyệt hàng loạt:** **giữ mỗi tin một thông báo** (đơn giản, mỗi thông báo có link tới đúng tin). Gộp thông báo theo công ty có thể làm sau nếu thấy phiền.
- **Q4 — Tự chấm lại tin đang chờ khi công ty có báo cáo / bị thu hồi tin mới?** **Có** (bước 4b). Ban đầu đề xuất không, nhưng duyệt hàng loạt dựa vào vùng đã lưu: không chấm lại thì tin của công ty vừa bị gỡ tin lừa đảo vẫn nằm ở *Đề xuất duyệt* và được chọn sẵn. Chỉ chấm tin `PENDING` của đúng công ty đó, nên rẻ.
- **Q5 — Trọng số, mức trừ, ngưỡng 80 / 50, ngưỡng lương thực tập 20 triệu:** chốt sau bước 3 (hiệu chỉnh).
- **Q6 — Chấm cả tin của công ty được miễn kiểm duyệt?** **Có** (cùng một lệnh gọi trong `submitForApproval`), chỉ để Admin lọc tin đang hiển thị có điểm thấp; không chặn việc tự đăng.
- **Q7 — Sửa tin đang hiển thị thì sao?** (thêm 2026-11-20) **Chấm lại** sau mỗi lần sửa; tụt xuống *Đề xuất từ chối* hoặc mới dính cờ chặn thì **báo Admin** (`JOB_POST_QUALITY_DROPPED`). Không tự gỡ tin (bước 4b).

## Hướng phát triển (không làm trong đợt này)

- Mỗi moderation action đã lưu điểm và vùng lúc Admin quyết định. Khi đủ dữ liệu (vài trăm quyết định thật), có thể so tỉ lệ "Admin làm khác đề xuất" theo từng mã lỗi để chỉnh mức trừ, rồi thử học trọng số bằng hồi quy logistic. Đây là cách LinkedIn làm với XGBoost, ở quy mô lớn hơn nhiều.
- Dùng embedding sẵn có để phát hiện tin gần trùng với tin từng bị từ chối / thu hồi.
- Các điểm 3, 4, 5, 6, 9 khi rà chức năng duyệt tin (đã ghi ở backlog mục 2).

## Phần 4 — Ghi chú của chủ dự án

<!-- Dành cho chủ dự án. -->
