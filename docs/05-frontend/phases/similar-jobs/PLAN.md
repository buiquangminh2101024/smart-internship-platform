# Việc làm tương tự (trang chi tiết tin) — Frontend

Song song với `docs/06-backend/similar-jobs/PLAN.md` (API, quyết định S1–S7; **không chép lại ở đây**).

**Trạng thái: ĐÃ DUYỆT (2026-10-07), cập nhật theo S6–S7 của backend cùng ngày. Chưa code.** Làm sau phần quản lý người dùng + hỗ trợ.

## Quyết định

1. **Vị trí:** khối "Việc làm tương tự" đặt **dưới phần nội dung tin**, trong `<main>` của `app/jobs/[id]/page.tsx`, sau `JobPostContent`. Không đặt ở cột phụ, vì cột này đã có thẻ điểm phù hợp và thẻ công ty.
2. **Thẻ tin dùng lại `components/ui/JobCard.tsx`** (đang dùng ở `/jobs`, trang công ty, việc làm phù hợp), map `JobPostDto` sang props giống `JobRecommendationsClient.tsx`. Dòng "Cùng kỹ năng: React, SQL" đặt vào slot `footer` có sẵn của `JobCard`, chỉ hiện khi `sharedSkills` không rỗng (nhánh vector có thể trả tin không trùng kỹ năng nào). Không hiện con số cosine thô.
3. Lưới 1 cột trên điện thoại, 2 cột trên màn hình vừa, 4 cột trên màn hình rộng. Có skeleton khi đang tải. Rỗng hoặc lỗi thì **ẩn cả khối** (S4), không hiện thông báo lỗi.
4. Hook tải riêng, không chặn phần nội dung tin; chỉ gọi khi đã có `job`.
5. Không thêm thư viện; giao diện theo skill `sip-ui`.
6. **Hai nhánh của backend (S6) hiển thị giống nhau.** Khối giữ cùng tiêu đề "Việc làm tương tự" dù kết quả đến từ vector hay từ kỹ năng trùng. Frontend không đọc `similarity` (kiểu `number | null`), nên không cần phân biệt nhánh.

## Hook mới

| Hook | Query key | Ghi chú |
|---|---|---|
| `useSimilarJobs(jobId)` (trong `hooks/useJobPosts.ts`) | `["job-posts", jobId, "similar"]` | `publicFetch`, `staleTime` ~5 phút, `retry: false` |

## Các bước thực hiện

| Bước | Nội dung | Ước lượng |
|---|---|---|
| SJ1 | `useSimilarJobs` + component `components/jobs/SimilarJobsSection.tsx` | ~40 phút |
| SJ2 | Gắn vào `app/jobs/[id]/page.tsx`, kiểm trên trình duyệt ở trạng thái khách và ứng viên, kiểm hiển thị điện thoại | ~20 phút |

## Phần ghi chú của chủ dự án

*(để trống)*

## Lịch sử thay đổi

- **2026-10-07** — Theo S6–S7 của backend:
  - `SimilarJobItem.similarity` đổi thành `number | null`;
  - footer "Cùng kỹ năng" chỉ hiện khi có kỹ năng trùng;
  - hai nhánh hiển thị như nhau.

  Không đổi bước hay ước lượng.
