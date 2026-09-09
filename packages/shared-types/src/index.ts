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

// ─── Catalog (danh mục dùng chung, admin-managed) ────────────────────────
// Chỉ Industry/CompanyType/City — cần cho form công ty (Phase 4). University/
// Major thuộc phạm vi Candidate (Phase 3, module khác đảm nhiệm).

export interface CatalogItem {
  id: string;
  name: string;
}

// ─── Companies & Employers (Phase 4) ─────────────────────────────────────

export type CompanyVerificationStatus = "PENDING" | "VERIFIED" | "REJECTED";

export type CompanyVerificationMethod = "AUTO_TAX_MATCH" | "MANUAL_REVIEW";

// Trạng thái onboarding của một tài khoản Employer, dùng để điều hướng
// /employer/hoan-tat-thu-tuc vs /employer/profile vs /employer (xem
// GET /employers/me và apps/web/src/proxy.ts).
export type EmployerStage = "ONBOARDING" | "PENDING_VERIFICATION" | "ACTIVE";

export interface Company {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  website: string | null;
  industryId: string | null;
  companyTypeId: string | null;
  cityId: string | null;
  address: string | null;
  taxCode: string | null;
  foundedYear: number | null;
  isVerified: boolean;
  requiresApproval: boolean;
  verifiedAt: string | null;
  verificationStatus: CompanyVerificationStatus;
  verificationMethod: CompanyVerificationMethod | null;
  businessLicenseUrl: string | null;
  verificationNote: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyDetail extends Company {
  /** Đếm JobPostModerationAction action=RETRACTED — derived, xem DATABASE_DESIGN.md. */
  retractionCount: number;
}

export interface EmployerProfile {
  id: string;
  userId: string;
  companyId: string;
  isCompanyAdmin: boolean;
  title: string | null;
  phone: string | null;
}

export interface EmployerMeResponse {
  hasEmployerProfile: boolean;
  stage: EmployerStage;
  employer?: EmployerProfile;
  company?: Company;
}

export interface UpdateEmployerProfileRequest {
  title?: string;
  phone?: string;
}

export interface VerificationCheckRequest {
  taxCode: string;
}

export type VerificationOutcomeReason =
  | "COMMON_EMAIL_DOMAIN"
  | "DOMAIN_MISMATCH"
  | "NO_MAIL_SERVER"
  | "TAX_CODE_INVALID"
  | "TAX_CODE_NOT_FOUND"
  | "TAX_LOOKUP_FAILED";

export type VerificationCheckResponse =
  | { outcome: "AUTO_VERIFIED"; shortName: string }
  | { outcome: "NEEDS_MANUAL_REVIEW"; reason: "COMMON_EMAIL_DOMAIN" | "DOMAIN_MISMATCH"; shortName?: string }
  | { outcome: "BLOCKED"; reason: "NO_MAIL_SERVER" | "TAX_CODE_INVALID" | "TAX_CODE_NOT_FOUND" | "TAX_LOOKUP_FAILED" };

export interface CreateCompanyRequest {
  name: string;
  taxCode: string;
  industryId?: string;
  companyTypeId?: string;
  cityId?: string;
  address?: string;
  description?: string;
  website?: string;
  foundedYear?: number;
  title?: string;
  phone?: string;
  /** Gửi lại true khi employer chủ động xác nhận nộp thủ công sau outcome BLOCKED. */
  forceManualReview?: boolean;
}

export interface JoinCompanyRequest {
  inviteCode: string;
}

export interface InviteCodeResponse {
  code: string;
  expiresInSeconds: number;
}

export interface RejectCompanyRequest {
  reason: string;
}

export interface SetRequiresApprovalRequest {
  requiresApproval: boolean;
}
