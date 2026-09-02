// Kiểu dữ liệu dùng chung server + web cho smart-internship-platform.
// Không import Prisma Client ở đây — package này được apps/web dùng trực tiếp,
// và Prisma Client chỉ nên chạy ở phía server.

// ─── Enums (mirror của schema.prisma) ────────────────────────────────────

export type Role = "CANDIDATE" | "EMPLOYER" | "ADMIN";

export type UserStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";

export type JobPostType = "INTERNSHIP" | "PART_TIME" | "FULL_TIME" | "CONTRACT";

export type JobPostStatus = "DRAFT" | "PENDING" | "PUBLISHED" | "EXPIRED" | "CLOSED" | "TAKEN_DOWN";

export type ModerationActionType = "SUBMITTED" | "APPROVED" | "REJECTED" | "RETRACTED";

export type ApplicationStatus =
  | "PENDING"
  | "REVIEWING"
  | "SHORTLISTED"
  | "INTERVIEWING"
  | "ACCEPTED"
  | "REJECTED";

export type NotificationType =
  | "APPLICATION_STATUS_CHANGED"
  | "JOB_POST_APPROVED"
  | "JOB_POST_REJECTED"
  | "JOB_POST_TAKEN_DOWN"
  | "COMPANY_VERIFIED";

// ─── Wrapper response chuẩn cho REST API ─────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

// ─── Health check (Phase 1) ──────────────────────────────────────────────

export interface HealthCheckResult {
  status: "ok";
  db: "connected";
}

// ─── Auth & Users (Phase 2) ──────────────────────────────────────────────
// Role đăng ký được qua API luôn giới hạn CANDIDATE/EMPLOYER — ADMIN chỉ
// tồn tại qua bootstrap script (apps/server/scripts/create-admin.ts).
export type RegistrableRole = Exclude<Role, "ADMIN">;

export interface RegisterRequest {
  email: string;
  password: string;
  role: RegistrableRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface VerifyOtpRequest {
  email: string;
  otp: string;
}

export interface ResendOtpRequest {
  email: string;
}

export interface GoogleAuthRequest {
  idToken: string;
  role: RegistrableRole;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken?: string;
}

export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface UserProfile {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: string | null;
}
