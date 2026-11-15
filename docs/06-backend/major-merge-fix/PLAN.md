# Sửa lỗi: gộp ngành (`Major`) làm mất yêu cầu ngành của tin tuyển dụng

Dòng 🔴 đầu tiên của mục 1 trong `docs/01-project/FEATURE_BACKLOG.md`. Làm **trước** `docs/06-backend/large-demo-data/PLAN.md` (mục 0.1), vì bước dọn danh mục của 0.1 có thể gộp ngành.

**Trạng thái: ✅ ĐÃ XONG (2026-11-08).** Không migration, không đổi API, không đổi giao diện. Kết quả kiểm ở mục "Ghi chú triển khai" cuối file.

## Thuật ngữ: nguồn và đích

Theo tên tham số của hàm `merge(sourceId, targetId)`:

- **Nguồn** (`source`): ngành **bị gộp**, sẽ bị xoá khỏi danh mục sau khi gộp.
- **Đích** (`target`): ngành **được giữ lại**, nhận mọi dữ liệu đang trỏ vào nguồn.

Ví dụ: danh mục có "CNTT" (nhập trùng) và "Công nghệ thông tin" (mục chuẩn). Admin gộp "CNTT" **vào** "Công nghệ thông tin" thì nguồn là "CNTT", đích là "Công nghệ thông tin".

| Dữ liệu đang trỏ vào "CNTT" (nguồn) | Hiện tại | Sau khi sửa |
|---|---|---|
| Học vấn của ứng viên (`Education`) | Chuyển sang "Công nghệ thông tin" | Như cũ |
| Tên gọi khác (`MajorAlias`) | Chuyển sang đích; "CNTT" thành alias của "Công nghệ thông tin" | Như cũ |
| Ngành yêu cầu của tin tuyển dụng (`JobPostMajor`) | **Bị xoá theo** khi xoá "CNTT" | Chuyển sang "Công nghệ thông tin" (M1, M2) |

Mức của ngành yêu cầu: **ngành chính** (`PRIMARY`, chấm 1) là đúng ngành tin cần; **ngành liên quan** (`RELATED`, chấm 0,65) là ngành gần mà nhà tuyển dụng chấp nhận. Khi một tin có cả nguồn lẫn đích, gộp xong hai dòng thành một, nên phải chọn giữ một mức (M2):

| Tin đang có | Sau khi gộp |
|---|---|
| "CNTT" là ngành chính, "Công nghệ thông tin" là ngành liên quan | "Công nghệ thông tin" thành ngành chính (nâng mức) |
| "CNTT" là ngành liên quan, "Công nghệ thông tin" là ngành chính | Giữ "Công nghệ thông tin" là ngành chính |
| Chỉ có "CNTT" | "Công nghệ thông tin" nhận đúng mức của "CNTT" |

Nguồn và đích là cùng một ngành, nên nếu nhà tuyển dụng đã coi ngành đó là ngành chính ở một trong hai dòng thì sau khi gộp nó vẫn là ngành chính, không bị hạ.

## Hiện trạng (đọc code ngày 2026-11-08)

| # | Phát hiện | Hệ quả |
|---|---|---|
| H1 | `MajorRepository.merge` (`apps/server/src/modules/education-catalog/major.repository.ts:163`) trong một transaction: chuyển `Education` sang ngành đích, chuyển `MajorAlias`, thêm alias tên nguồn, gỡ `pendingMatchMajorId`, rồi **xoá ngành nguồn**. Không đụng `JobPostMajor`. | `JobPostMajor` có `onDelete: Cascade` theo `Major`, nên liên kết tin–ngành nguồn **bị xoá theo** thay vì chuyển sang ngành đích. Tin mất yêu cầu ngành mà không báo lỗi. |
| H2 | `SkillsRepository.merge` có chuyển `JobPostSkill` và `CandidateSkill` sang đích (`createMany` + `skipDuplicates`). | Chỉ ngành bị lỗi. Gộp kỹ năng an toàn. |
| H3 | Có hai đường gọi `merge`: Admin gộp tay (`education-catalog.service.ts:142`, nguồn `ADMIN_MERGE`) và cron hỏi LLM (`catalog-suggestion-queue.job.ts:65`, nguồn `LLM_MERGE`, gộp ngành `PENDING` do ứng viên đề xuất vào ngành đã duyệt). | Đường Admin gộp hai ngành `APPROVED` trùng nhau là đường làm mất dữ liệu thật. Đường cron chỉ ảnh hưởng khi ngành `PENDING` đã gắn vào tin (H4). |
| H4 | `JobPostRepository.findExistingMajorIds` (`job-post.repository.ts:248`) chỉ kiểm id tồn tại, **không lọc `status`**. Hàm được dùng ở `job-posts.service.ts:175` (tạo/sửa tin) và `job-post-requirements.service.ts:120` (xác nhận yêu cầu AI). Giao diện (`/catalog/majors`, `MajorRequirementSelect`) chỉ liệt kê ngành `APPROVED`. | Qua giao diện không gắn được ngành `PENDING`, nhưng gọi API trực tiếp thì được. Khi đó ngành `PENDING` có thể bị cron gộp hoặc Admin từ chối, và liên kết của tin bị ảnh hưởng. |
| H5 | Thành phần "học vấn" của Job Matcher GĐ3 chấm theo `JobPostMajor` (`PRIMARY` = 1, `RELATED` = 0,65). | Mất liên kết thì thành phần này thành "chưa có dữ liệu" và thứ tự xếp hạng đổi. |

## Quyết định (đã duyệt 2026-11-08)

| # | Quyết định |
|---|---|
| M1 | Trong transaction của `merge`, trước khi xoá ngành nguồn, chuyển mọi `JobPostMajor` của nguồn sang đích. |
| M2 | Nếu tin đã có sẵn ngành đích thì giữ mức **mạnh hơn**: `PRIMARY` thắng `RELATED`. Cụ thể: nguồn `PRIMARY` và đích `RELATED` thì nâng đích lên `PRIMARY`; các trường hợp khác giữ nguyên đích. Khác với kỹ năng (`skipDuplicates` giữ nguyên đích), vì gộp hai tên của **cùng một ngành** thì không có lý do hạ mức. |
| M3 | `findExistingMajorIds` chỉ nhận ngành `APPROVED`. Gửi ngành `PENDING`/`REJECTED` thì trả 400 như id không tồn tại (thông báo lỗi giữ nguyên tiếng Anh như hiện tại). Phạm vi chặn ở mục "Ai vẫn thấy ngành chờ duyệt" bên dưới. |
| M4 | Không khôi phục dữ liệu đã mất (không có log để dựng lại). Chỉ chạy một truy vấn đọc để biết có tin nào đã xác nhận yêu cầu (`requirementsConfirmedAt` khác null) mà không còn ngành nào, ghi kết quả vào mục ghi chú triển khai. |

## Ai vẫn thấy ngành chờ duyệt (M3)

M3 **chỉ** áp dụng cho ngành học yêu cầu của **tin tuyển dụng** (tạo / sửa tin, xác nhận yêu cầu AI). Mọi chỗ khác giữ nguyên:

| Ai | Thấy gì | Có đổi không |
|---|---|---|
| Ứng viên đề xuất ngành mới | Ngành đang chờ duyệt vẫn hiện trong học vấn của hồ sơ mình: `candidate.repository.ts` đọc `include: { major: true }`, không lọc trạng thái | Không |
| Admin | Ngành chờ duyệt trong hàng đợi duyệt danh mục, duyệt / từ chối / gộp như cũ | Không |
| Nhà tuyển dụng (giao diện) | Ô "Ngành học yêu cầu" (`MajorRequirementSelect`, dữ liệu `/catalog/majors`) vốn chỉ liệt kê ngành `APPROVED` | Không |
| Ai gọi API tạo / sửa tin trực tiếp | Trước: gắn được ngành chờ duyệt vào tin. Sau: trả 400 | **Có**, server kiểm đúng như giao diện đã làm |

Lý do chặn: ngành chờ duyệt có thể bị Admin từ chối hoặc bị cron gộp, và khi đó tin mất yêu cầu ngành (đúng lỗi chính của plan này). Khi ngành được duyệt, nhà tuyển dụng chọn được bình thường.

## Phần 1 — Công nghệ / package / kiến trúc

- Không thêm dependency, không migration.
- Tách phần quyết định "chuyển liên kết thế nào" thành **hàm thuần** (ví dụ `planJobPostMajorMerge(sourceLinks, targetLinks)` trả về danh sách cần tạo và danh sách cần nâng mức), để unit test không cần DB. Repository chỉ đọc, gọi hàm thuần rồi ghi.

## Phần 2 — Liên kết giữa các phần

- Chỉ sửa `education-catalog/major.repository.ts` (M1, M2) và `job-posts/job-post.repository.ts` (M3).
- Hai đường gọi `merge` (Admin, cron) tự hưởng bản sửa, không phải sửa nơi gọi.
- Vector embedding của tin tự tính lại lần sau nhờ `contentHash` (nếu văn bản embedding có tên ngành); không cần xử lý riêng.

## Phần 3 — Các bước thực hiện

1. **Đọc trước (chỉ SELECT):** đếm `job_post_majors` theo ngành và tin `requirementsConfirmedAt` khác null mà không có ngành nào (M4). Ghi số vào mục ghi chú triển khai.
2. **Hàm thuần + unit test** (`tests/unit/major-merge-plan.test.ts`), các ca:
   - tin chỉ có nguồn `PRIMARY` → tạo đích `PRIMARY`;
   - tin chỉ có nguồn `RELATED` → tạo đích `RELATED`;
   - tin có cả hai, nguồn `PRIMARY`, đích `RELATED` → nâng đích lên `PRIMARY`;
   - tin có cả hai, nguồn `RELATED`, đích `PRIMARY` → giữ nguyên;
   - nguồn không có liên kết → không làm gì.
3. **Sửa `MajorRepository.merge`:** trong cùng transaction, sau bước chuyển `Education` và trước khi xoá ngành nguồn: đọc liên kết của nguồn và của đích trên các tin liên quan, gọi hàm thuần, `createMany` phần cần tạo, `updateMany` phần cần nâng mức. Ngành nguồn xoá như cũ (cascade dọn liên kết cũ).
4. **Sửa `findExistingMajorIds`:** thêm `status: "APPROVED"` vào điều kiện.
5. **Kiểm:**
   - `npm test` (toàn bộ unit test xanh), `tsc` sạch cho `apps/server`.
   - Thử thật bằng script tạm chạy trong một transaction trên Neon rồi **rollback** (cách đã dùng ở B3): tạo hai ngành và một tin gắn ngành nguồn, gộp, kiểm tin có ngành đích đúng mức; số dòng trước bằng sau. Script xoá sau khi chạy.
   - Gọi API tạo tin với `majorId` của một ngành `PENDING` → 400.
   - Ứng viên có học vấn gắn ngành `PENDING` vẫn thấy ngành đó trong hồ sơ của mình (không đổi).
6. **Cập nhật tài liệu:** đánh ✅ dòng tương ứng trong `FEATURE_BACKLOG.md` mục 1, trỏ về plan này.

## Phần 4 — Ghi chú của chủ dự án

*(để trống)*

## Ghi chú triển khai (2026-11-08)

**File đã sửa / thêm:**

- `apps/server/src/modules/education-catalog/major-merge-plan.ts` (mới): hàm thuần `planJobPostMajorMerge`.
- `apps/server/src/modules/education-catalog/major.repository.ts`: `merge` gọi `moveJobPostMajors` ngay sau bước chuyển `Education`, trước khi xoá ngành nguồn.
- `apps/server/src/modules/job-posts/job-post.repository.ts`: `findExistingMajorIds` thêm `status: "APPROVED"`.
- `apps/server/tests/unit/major-merge-plan.test.ts` (mới): 7 ca (5 ca trong plan, thêm "cùng mức" và "nhiều tin trộn lẫn").

**Bước 1, đọc DB trước khi sửa (M4):** 22 tin, 3 tin có ngành, 11 liên kết `job_post_majors` (6 `PRIMARY`, 5 `RELATED`), tất cả trỏ vào ngành `APPROVED`. 1.081 ngành, đều `APPROVED`. 2 tin đã xác nhận yêu cầu, không tin nào mất hết ngành. Kết luận: chưa có dữ liệu bị mất, không cần khôi phục.

**Bước 5, kiểm:**

- `tsc --noEmit` sạch cho `apps/server`. Toàn bộ unit test: 302/302 xanh.
- Thử thật trên Neon trong một transaction rồi rollback (script tạm, đã xoá): tạo ngành nguồn, đích (đều `APPROVED`) và một ngành `PENDING`, gắn vào 3 tin theo ba trường hợp của bảng M2, chuyển một học vấn sang nguồn, gọi `merge`. Kết quả đúng cả: không còn liên kết trỏ vào nguồn; ba tin đều có ngành đích `PRIMARY` đúng như bảng M2; nguồn bị xoá; tên nguồn thành alias của đích; học vấn sang đích; `findExistingMajorIds` bỏ ngành `PENDING`. Số dòng `job_post_majors`, `majors`, `major_aliases`, `educations` trước bằng sau.
- Lỗi 400 khi gắn ngành `PENDING`: kiểm ở tầng repository như trên, **không** gọi API thật. Lý do: `createDraft` (`job-posts.service.ts`) tạo tin **trước** rồi mới kiểm ngành trong `writeRelations`, nên gọi API với ngành sai sẽ trả 400 nhưng vẫn để lại một tin nháp và tính vào quota. Đây là lỗi có sẵn từ trước, ngoài phạm vi plan này (xem bên dưới).
- Ứng viên vẫn thấy ngành chờ duyệt của mình: `candidate.repository.ts` vẫn đọc `include: { university: true, major: true }`, không lọc trạng thái, không đổi.

**Phát hiện thêm, đã sửa cùng ngày:** `createDraft` tạo tin rồi mới kiểm ngành, nên kiểm sai thì trả 400 nhưng tin nháp vẫn nằm trong DB và tính vào quota tạo tin. Kỹ năng thì không được kiểm: id sai gây lỗi khoá ngoại (500) và cũng để lại tin nháp. `updateDraft` cũng ghi các trường của tin trước rồi mới kiểm. Giao diện chỉ gửi id hợp lệ nên ít gặp.

Đã sửa trong `job-posts.service.ts`:

- `assertRelationIdsExist` kiểm id kỹ năng (gồm cả kỹ năng ưu tiên, bỏ trùng) và ngành **trước** khi ghi; sai thì 400 (`One or more skills do not exist` / `One or more majors do not exist`).
- `createDraft` và `updateDraft` ghi tin cùng kỹ năng/ngành trong **một transaction**; `writeRelations` nhận transaction của nơi gọi.
- Unit test `tests/unit/job-post-draft-relations.test.ts` (6 ca): ngành sai, kỹ năng ưu tiên sai, sửa tin với kỹ năng sai đều 400 và không ghi gì; tạo hợp lệ ghi đủ ba phần trong một transaction; lỗi khi đang ghi ngành thì không còn tin nháp mồ côi; sửa tin không đụng kỹ năng/ngành chỉ cập nhật tin.
- `tsc` sạch, toàn bộ unit test 308/308 xanh. Chưa thử qua API thật vì server không chạy lúc kiểm.
