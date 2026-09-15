# Phase 9 (Backend) — Realtime Communication Implementation

Tài liệu này mô tả chi tiết implementation thực tế đã hoàn thành cho Phase 9 (Realtime Chat) ở phía Backend.

## 1. Phạm vi và Mục tiêu

Phase 9 thiết lập cơ sở hạ tầng thời gian thực thông qua Socket.IO và cung cấp API REST để quản lý hội thoại, tin nhắn.
- Triển khai mô hình **Modular Monolith** (chạy Socket.IO trên cùng tiến trình Express thay vì tách microservice) để giảm độ phức tạp vận hành.
- **Tính toàn vẹn Dữ liệu**: Tin nhắn phải được persist xuống Database (PostgreSQL) thông qua API REST rồi mới kích hoạt sự kiện Socket qua Gateway.
- Cơ chế xác thực thông qua thư viện `jsonwebtoken` tại middleware của Socket.
- Cơ chế bảo mật và phân quyền truy cập phòng chat chặt chẽ.

## 2. Database Changes (Prisma Schema)

Các model được cập nhật/thêm mới để hỗ trợ Chat:
- **`Conversation`**: Hội thoại 1-1 giữa Candidate và Employer.
  - Bắt buộc gắn với một `jobPostId`.
  - Quản lý trạng thái đã đọc qua `candidateLastReadAt` và `employerLastReadAt`.
  - Có ràng buộc (Constraint) `@@unique([jobPostId, candidateId])` để đảm bảo 1 Candidate chỉ có tối đa 1 hội thoại với 1 JobPost.
- **`Message`**: Các tin nhắn thực tế trong hội thoại.
  - Lưu trữ `senderId` (là User ID của người gửi).
  - Có quan hệ tới `Conversation`.

## 3. Kiến trúc và Các Module

### 3.1 Socket Gateway (`apps/server/src/infrastructure/socket/index.ts`)
- Được mount trực tiếp vào Express HTTP Server trong `main.ts` tại path `/api/socket.io`.
- Middleware `io.use()` kiểm tra JWT Token (Bearer Auth).
- Hỗ trợ kiểm tra danh sách đen (`TokenBlacklist`) để ngắt truy cập ngay lập tức nếu token bị thu hồi.
- Tự động join người dùng vào các Room riêng tư dạng `user:${userId}`. Clients không được phép tự do join các room khác.

### 3.2 Module `messaging`
- **Controller**: `MessagingController` xử lý các yêu cầu REST API (`GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations`, v.v.).
- **Service**: `MessagingService` chứa toàn bộ business logic.
  - Phân quyền (Access Policy): Đảm bảo người dùng chỉ được đọc tin nhắn trong các hội thoại mà họ là một phần tử.
  - Định tuyến Tin Nhắn (Message Routing): Khi một tin nhắn mới được tạo và lưu vào DB thành công, service sẽ emit sự kiện lên Socket Server để broadcast cho người nhận qua Room `user:${receiverUserId}`.
  - Bảo mật Hội thoại: Employer ID luôn được suy ra từ Chủ sở hữu của JobPost (`JobPost.employerId`), ngăn chặn việc Candidate tự truyền `employerId` giả mạo.
- **Repository**: `MessagingRepository` phụ trách các truy vấn Prisma.
- Tích hợp chuẩn **Awilix DI**: Sử dụng Object Constructor Injection (Proxy Injection) để tránh lỗi không phân giải được dependencies (`AwilixResolutionError`).

## 4. API Endpoints

- `GET /api/conversations`: Liệt kê tất cả hội thoại của người dùng hiện tại (hỗ trợ cả Candidate và Employer).
- `POST /api/conversations`: Tạo hội thoại mới. Payload yêu cầu `jobPostId` (và `candidateId` đối với Employer).
- `GET /api/conversations/:id/messages`: Lấy danh sách tin nhắn theo hội thoại (Hỗ trợ Pagination).
- `POST /api/conversations/:id/messages`: Gửi tin nhắn mới. REST API này chịu trách nhiệm persist message rồi mới kích hoạt socket broadcast.
- `PUT /api/conversations/:id/read`: Đánh dấu hội thoại là đã đọc (cập nhật mốc thời gian `candidateLastReadAt` hoặc `employerLastReadAt`).

## 5. Các Issue Nổi Bật Đã Giải Quyết

- **Sự cố Awilix Proxy Injection**: Gây ra lỗi `Could not resolve 'getConversations'`. Khắc phục bằng cách điều chỉnh cấu trúc hàm tạo của Controller/Service từ Positional Argument sang Destructured Object (đúng chuẩn của thư viện).
- **Hardcode Placeholder Values**: Giải quyết sự cố 0 ứng viên (0 applications) hiển thị ở phần UI của nhà tuyển dụng do truy vấn Prisma không kèm thuộc tính `_count.applications` (đã bị hardcode thành 0 từ Phase 6). Bổ sung đếm tự động vào Mapper và cấu hình truy vấn của repository JobPosts/SavedJobs.
