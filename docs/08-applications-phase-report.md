# PHASE 8 IMPLEMENTATION REPORT

## 1. Summary
Đã hoàn thành triển khai luồng nộp đơn ứng tuyển (Application Module) đáp ứng đủ yêu cầu bảo mật, toàn vẹn dữ liệu (chặn duplicate, state transition validation), bảo vệ lịch sử CV và tích hợp UI cho Candidate/Employer mà không làm hỏng kiến trúc hiện tại của dự án.

## 2. Files Created
- pps/server/src/modules/applications/applications.dto.ts
- pps/server/src/modules/applications/applications.repository.ts
- pps/server/src/modules/applications/applications.service.ts
- pps/server/src/modules/applications/applications.controller.ts
- pps/server/src/modules/applications/applications.routes.ts
- pps/server/src/modules/applications/application.mapper.ts
- pps/web/src/hooks/useApplications.ts
- pps/web/src/app/(candidate)/applications/page.tsx
- pps/web/src/app/jobs/[id]/apply/page.tsx
- pps/web/src/app/employer/(portal)/jobs/[id]/applications/page.tsx
- pps/web/src/app/employer/(portal)/applications/[id]/page.tsx

## 3. Files Modified
- pps/server/prisma/schema.prisma
- pps/server/src/modules/cv/cv.service.ts
- packages/shared-types/src/index.ts
- pps/server/src/main.ts
- pps/web/src/app/jobs/[id]/page.tsx
- pps/web/src/app/employer/(portal)/jobs/[id]/page.tsx

## 4. Database Changes
- Bổ sung CANCELLED vào enum ApplicationStatus trong schema.prisma.
- Đã chạy thành công 
px prisma migrate dev --name add_application_cancelled_status và generate lại Prisma client.

## 5. Backend Implementation
- Tạo mới module pplications theo đúng architecture và layer (routes -> controller -> service -> repository).
- Validate 100% logic nộp đơn ở Service (Candidate đã có profile, JobPost đang PUBLISHED và còn hạn, CV thuộc về Candidate).
- Quản lý State Transition qua map cấu hình trong pplications.service.ts, chặn việc sửa/đảo trạng thái sai nghiệp vụ.

## 6. API Endpoints
- POST /candidate/applications (Create)
- GET /candidate/applications (List own)
- GET /candidate/applications/:id (Detail)
- PATCH /candidate/applications/:id/cancel (Cancel if PENDING/REVIEWING)
- GET /employer/job-posts/:jobId/applications (List for specific JobPost)
- GET /employer/applications/:id (Detail with Candidate Profile & CV attached)
- PATCH /employer/applications/:id/status (Transition Status)
- PATCH /employer/applications/:id/evaluation (Employer Notes & Rating)

## 7. Frontend Implementation
- Thêm modal/trang Apply riêng cho Candidate, bắt phải có CV mới được apply.
- Trang lịch sử ứng tuyển cho Candidate (/applications) với tuỳ chọn Cancel đơn.
- Gắn nút "Ứng viên" vào Dashboard Job Detail của Employer.
- Thêm table hiển thị ứng viên và trang chi tiết với chức năng đánh giá điểm, ghi chú và update status của ứng viên.

## 8. Authorization & Security
- candidateGuard bảo vệ IDOR và ẩn employerNotes, ating ở tầng DTO/Mapper.
- employerGuard và kiểm tra logic companyId đảm bảo Employer không thể view/update đơn ứng tuyển của công ty khác.
- Kiểm tra tính hợp lệ của CV ownership khi nộp đơn qua Service layer.

## 9. CV Lifecycle Fix
- Đã tích hợp logic chặn xóa CV ở CvService.deleteForCandidate nếu CV đó được dùng bởi 1 Application trở lên. 
- Ngăn chặn triệt để lỗi HTTP 500 do Foreign Key restriction của Prisma. (Fix tại: pps/server/src/modules/cv/cv.service.ts).

## 10. State Transition Rules
- Được validate nghiêm ngặt ở API: PENDING -> REVIEWING -> SHORTLISTED -> INTERVIEWING -> ACCEPTED.
- Tất cả trạng thái đều có thể dẫn đến REJECTED (ngoại trừ ACCEPTED, CANCELLED). 
- Không cho phép Employer cập nhật đơn đã CANCELLED (terminal state của ứng viên).

## 11. Verification / Test Results
- Database sync thành công.
- 100% build thành công (cả Server và Web Client không có lỗi TypeScript).

## 12. Remaining Issues
- (None) Mọi thay đổi đều được kiểm tra an toàn, bảo vệ dữ liệu CV và tránh lỗi IDOR.

## 13. Documentation Updated
- Ghi nhận báo cáo tại docs/08-applications-phase-report.md.

## 14. Final Status
HOÀN THÀNH
