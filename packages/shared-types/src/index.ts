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
  | "REJECTED"
  | "CANCELLED";

export type NotificationType =
  | "APPLICATION_STATUS_CHANGED"
  | "JOB_POST_APPROVED"
  | "JOB_POST_REJECTED"
  | "JOB_POST_TAKEN_DOWN"
  | "COMPANY_VERIFIED"
  | "COMPANY_REJECTED"
  | "COMPANY_LINK_REQUESTED"
  | "JOB_POST_SUBMITTED";

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

/**
 * Vòng đời một mục catalog do người dùng đóng góp — dùng chung cho Skill,
 * University, Major (docs/06-backend/cv-ai-extraction-phase2/PLAN.md Quyết định #1).
 */
export type CatalogEntryStatus = "APPROVED" | "PENDING";

// ─── Skills (JobPost Skill — Hướng B) ────────────────────────────────────
// Xem docs/06-backend/jobpost-skill-huong-b/PLAN.md. Catalog kỹ năng cho phép
// Candidate/Employer tự gõ tên chưa có; hệ thống khử trùng lặp rồi Admin duyệt.

/**
 * Cách một tên gõ vào được giải quyết (Skill/University/Major):
 * - ALIAS: trùng một tên gọi khác đã biết của mục có sẵn;
 * - AUTO: khớp đủ gần với mục có sẵn (so khớp chuỗi, hoặc embedding với Skill);
 * - PENDING_REVIEW: đã tạo mục mới, đang chờ duyệt — UI phải báo rõ cho người
 *   dùng biết mục này chưa công khai.
 */
export type CatalogMatchType = "ALIAS" | "AUTO" | "PENDING_REVIEW";

export interface SuggestSkillRequest {
  name: string;
}

export interface SuggestSkillResponse {
  skillId: string;
  name: string;
  status: CatalogEntryStatus;
  matchType: CatalogMatchType;
}

export interface AdminSkillDto {
  id: string;
  name: string;
  status: CatalogEntryStatus;
  createdByEmail: string | null;
  /** Skill gần nhất hệ thống tìm được — gợi ý sẵn cho Admin khi gộp. */
  pendingMatchSkill: { id: string; name: string } | null;
  /** Số hồ sơ + tin tuyển dụng đang gắn skill này (mất hết nếu từ chối). */
  usageCount: number;
  createdAt: string;
}

export interface MergeSkillRequest {
  targetSkillId: string;
}

/**
 * Kỹ năng gắn trên tin tuyển dụng. API công khai chỉ trả skill APPROVED; API của
 * chính Employer trả cả PENDING để form sửa tin không làm mất kỹ năng họ vừa đề xuất.
 */
export interface JobPostSkillDto extends CatalogItem {
  status: CatalogEntryStatus;
}

// ─── Education catalog: University / Major ───────────────────────────────
// docs/06-backend/cv-ai-extraction-phase2/PLAN.md. Cùng cơ chế PENDING/duyệt với
// Skill, thêm hành động "Sửa tên & duyệt".

export interface SuggestCatalogEntryRequest {
  name: string;
}

export interface SuggestCatalogEntryResponse {
  id: string;
  name: string;
  status: CatalogEntryStatus;
  matchType: CatalogMatchType;
}

export type SuggestUniversityResponse = SuggestCatalogEntryResponse;
export type SuggestMajorResponse = SuggestCatalogEntryResponse;

export interface AdminEducationCatalogEntryDto {
  id: string;
  name: string;
  /** Mã trường theo Bộ GD&ĐT — chỉ University seed sẵn mới có; Major luôn null. */
  code: string | null;
  status: CatalogEntryStatus;
  createdByEmail: string | null;
  /** Mục gần nhất hệ thống tìm được — gợi ý sẵn cho Admin khi gộp. */
  pendingMatch: { id: string; name: string } | null;
  /** Số dòng học vấn đang gắn mục này (mất liên kết nếu từ chối). */
  usageCount: number;
  createdAt: string;
}

export type AdminUniversityDto = AdminEducationCatalogEntryDto;
export type AdminMajorDto = AdminEducationCatalogEntryDto;

export interface MergeCatalogEntryRequest {
  targetId: string;
}

export interface RenameApproveCatalogRequest {
  correctedName: string;
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

// ─── Subscription & Payment (Phase 5) ────────────────────────────────────

export type SubscriptionStatus = "PENDING" | "ACTIVE" | "EXPIRED" | "CANCELLED";

export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED";

export type TransactionStatus = "INIT" | "SUCCESS" | "FAILED";

export type PaymentProvider = "VNPAY" | "MOMO";

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  jobPostQuota: number;
  durationDays: number;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySubscriptionSummary {
  id: string;
  planId: string;
  plan: SubscriptionPlan;
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
  createdAt: string;
}

export type SubscriptionAccessMode = "TRIAL" | "SUBSCRIBED" | "BLOCKED";

/**
 * Trạng thái quyền đăng tin của 1 company, trả bởi
 * GET /employers/company/subscription (xem SUBSCRIPTION_BILLING_DESIGN.md §5).
 * - TRIAL: publishRemaining/draftRemaining là 2 hạn mức MIỄN PHÍ tách biệt.
 * - SUBSCRIBED: publishRemaining là tổng quota JobPost còn lại của gói hiện
 *   tại trong kỳ (1 con số duy nhất, không tách publish/draft) — draftRemaining
 *   không có ý nghĩa ở mode này.
 * - BLOCKED: hết trial (hết hạn/chạm hạn mức) và chưa có gói ACTIVE.
 */
export interface SubscriptionAccessStatus {
  mode: SubscriptionAccessMode;
  publishRemaining?: number;
  draftRemaining?: number;
  trialEndsAt?: string;
  subscription?: CompanySubscriptionSummary;
}

export interface CheckoutRequest {
  planId: string;
  provider: PaymentProvider;
}

export interface CheckoutResponse {
  paymentUrl: string;
  orderCode: string;
}

export interface PaymentStatusResponse {
  status: PaymentStatus;
  companySubscriptionStatus?: SubscriptionStatus;
}

export interface CreateSubscriptionPlanRequest {
  name: string;
  description?: string;
  jobPostQuota: number;
  durationDays: number;
  price: number;
}

export interface UpdateSubscriptionPlanRequest {
  name?: string;
  description?: string;
  jobPostQuota?: number;
  durationDays?: number;
  price?: number;
  isActive?: boolean;
}

// ─── Job Posts (Phase 6) ─────────────────────────────────────────────────
// Vòng đời: DRAFT → PENDING → PUBLISHED → EXPIRED/CLOSED/TAKEN_DOWN
// (xem INITIAL_ARCHITECTURE_PLAN.md §12 và
// docs/06-backend/phase-06-job-recruitment/PLAN.md).

// Hạn tối đa của JobPost.expiresAt là 90 ngày kể từ lúc đặt — hằng số đặt
// riêng ở mỗi app (package này chỉ chứa type, không export giá trị runtime):
// MAX_EXPIRY_DAYS ở apps/server/src/modules/job-posts/job-posts.service.ts và
// apps/web/src/lib/job-post-display.ts.

export interface JobPostModerationActionDto {
  id: string;
  action: ModerationActionType;
  /** null khi hệ thống tự hành động (company.requiresApproval=false, cron hết hạn). */
  actorName: string | null;
  reason: string | null;
  createdAt: string;
}

/** Thông tin công ty kèm theo tin — đủ để render card "Thông tin công ty". */
export interface JobPostCompanySummary {
  id: string;
  name: string;
  logoUrl: string | null;
  website: string | null;
  isVerified: boolean;
  industryId: string | null;
  cityId: string | null;
  address: string | null;
  taxCode: string | null;
  description: string | null;
}

export interface JobPost {
  id: string;
  companyId: string;
  company: JobPostCompanySummary;
  title: string;
  description: string;
  jobType: JobPostType;
  status: JobPostStatus;
  salaryMin: number | null;
  salaryMax: number | null;
  isNegotiable: boolean;
  requirements: string | null;
  benefits: string | null;
  cityId: string | null;
  cityName: string | null;
  address: string | null;
  industryId: string | null;
  industryName: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  closedAt: string | null;
  viewCount: number;
  /** Kỹ năng yêu cầu — chỉ skill đã duyệt mới lộ ra API công khai. */
  skills: JobPostSkillDto[];
  /** Số hồ sơ ứng tuyển — luôn 0 cho tới Phase 8 (module applications). */
  applicationCount: number;
  /** Hành động kiểm duyệt mới nhất — nguồn dữ liệu banner từ chối/thu hồi. */
  latestModerationAction: JobPostModerationActionDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobPostRequest {
  title: string;
  description: string;
  jobType: JobPostType;
  industryId?: string;
  cityId?: string;
  address?: string;
  salaryMin?: number;
  salaryMax?: number;
  isNegotiable?: boolean;
  requirements?: string;
  benefits?: string;
  /** ISO date — bắt buộc trước khi gửi duyệt, tối đa 90 ngày kể từ lúc đặt. */
  expiresAt?: string;
  /**
   * Danh sách kỹ năng yêu cầu — ghi đè toàn bộ (diff-write) khi có mặt, bỏ qua
   * khi undefined. Chấp nhận cả skill PENDING mà chính employer vừa đề xuất.
   */
  skillIds?: string[];
}

export type UpdateJobPostRequest = Partial<CreateJobPostRequest>;

export interface JobPostSearchQuery {
  q?: string;
  cityId?: string;
  industryId?: string;
  jobType?: JobPostType;
  salaryMin?: number;
  /** Lọc theo kỹ năng — tin phải có ĐỦ tất cả skill được chọn. */
  skillIds?: string[];
  cursor?: string;
}

export interface EmployerJobPostListQuery {
  status?: JobPostStatus;
  q?: string;
  cursor?: string;
}

export interface RejectJobPostRequest {
  reason: string;
}

export interface RetractJobPostRequest {
  reason: string;
}

/** Kết quả gửi duyệt — frontend dùng để chọn bước dừng của stepper. */
export interface SubmitJobPostResponse {
  jobPost: JobPost;
  /** true khi company.requiresApproval=false → publish thẳng, không qua hàng đợi Admin. */
  autoPublished: boolean;
}

/** Thống kê cho dashboard Employer (/employer/jobs) và Admin (/admin/jobs). */
export interface JobPostStats {
  published: number;
  pending: number;
  draft: number;
  closed: number;
}

// ─── CV & Saved Jobs (Phase 7) ───────────────────────────────────────────

export interface CvRecord {
  id: string;
  candidateId: string;
  fileUrl: string;
  fileName: string;
  isDefault: boolean;
  uploadedAt: string;
}

/**
 * CV nhìn từ phía chính chủ (GET/POST /candidates/me/cvs...) — thêm kết quả
 * phân tích AI. Tách khỏi CvRecord vì CvRecord còn đi kèm Application sang
 * phía Employer, không có lý do để lộ dữ liệu trích xuất ra đó.
 */
export interface CandidateCvRecord extends CvRecord {
  extractionStatus: CvExtractionStatus;
  extractedData: CvExtractionResult | null;
  extractedAt: string | null;
}

// ─── CV AI Extraction (docs/06-backend/cv-ai-extraction-phase1/PLAN.md) ───

export type CvExtractionStatus = "NOT_STARTED" | "PROCESSING" | "DONE" | "FAILED";

/**
 * Kết quả LLM đọc CV, lưu nguyên vào Cv.extractedData. Ngày tháng giữ dạng
 * chuỗi như model trả về ("YYYY-MM" hoặc "YYYY-MM-DD") — Phase 2 mới chuẩn hoá
 * khi ghi vào hồ sơ.
 */
export interface CvExtractionResult {
  isValidCv: boolean;
  invalidReason: string | null;
  extractionConfidence: "high" | "low";
  // Chỉ có giá trị khi cả 2 LLM đều lỗi và phải rơi về OCR offline (Tesseract).
  rawOcrText: string | null;
  candidate: {
    // Không có field tương ứng trong hồ sơ — giữ lại để dùng sau.
    fullName: string | null;
    headline: string | null;
    bio: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    gender: "MALE" | "FEMALE" | "OTHER" | null;
    // Thêm ở Phase 2 (map sang Candidate.cityId) — CV phân tích trước đó không có.
    city?: string | null;
  };
  educations: Array<{
    universityName: string | null;
    majorName: string | null;
    degree: string | null;
    startYear: number | null;
    endYear: number | null;
    isCurrent: boolean;
    description: string | null;
  }>;
  workExperiences: Array<{
    company: string;
    position: string;
    startDate: string | null;
    endDate: string | null;
    isCurrent: boolean;
    description: string | null;
  }>;
  projects: Array<{
    name: string;
    description: string | null;
    url: string | null;
    isWorkingOn: boolean;
    startDate: string | null;
    endDate: string | null;
  }>;
  certificates: Array<{
    name: string;
    issuer: string | null;
    issueDate: string | null;
    credentialUrl: string | null;
    description: string | null;
  }>;
  awards: Array<{
    name: string;
    issuer: string | null;
    date: string | null;
    description: string | null;
  }>;
  skills: string[];
}

// ─── CV → hồ sơ (docs/06-backend/cv-ai-extraction-phase2/PLAN.md) ────────

/**
 * Field đơn lẻ trên Candidate được ghi đè bằng giá trị trích từ CV. Không có
 * cờ (hoặc false) = giữ giá trị hiện tại (Quyết định #8).
 */
export interface ImportFromCvFieldOverrides {
  headline?: boolean;
  bio?: boolean;
  phone?: boolean;
  dateOfBirth?: boolean;
  gender?: boolean;
  cityId?: boolean;
}

export interface ImportFromCvRequest {
  /** Chỉ để truy vết nguồn gốc, không bắt buộc. */
  cvId?: string;
  /** Kết quả trích xuất SAU KHI Candidate đã bỏ bớt mục/kỹ năng ở preview. */
  extractedData: Pick<
    CvExtractionResult,
    "candidate" | "educations" | "workExperiences" | "projects" | "certificates" | "awards" | "skills"
  >;
  fieldOverrides: ImportFromCvFieldOverrides;
}

export interface ImportFromCvResponse {
  created: {
    educations: number;
    workExperiences: number;
    projects: number;
    certificates: number;
    awards: number;
    /** Kỹ năng mới gắn vào hồ sơ (không tính kỹ năng đã có sẵn). */
    skills: number;
  };
  updatedFields: Array<keyof ImportFromCvFieldOverrides>;
  /**
   * Phần không ghi được nhưng không làm hỏng cả lần import (hết lượt đề xuất
   * kỹ năng/trường mới, tên thành phố không có trong danh mục...).
   */
  warnings: string[];
}

export interface SavedJobEntry {
  id: string;
  candidateId: string;
  jobPostId: string;
  createdAt: string;
  jobPost: JobPost;
}

export interface SavedJobCheckResponse {
  jobPostId: string;
  saved: boolean;
}
// ─── Applications (Phase 8) ──────────────────────────────────────────────

export interface Application {
  id: string;
  jobPostId: string;
  candidateId: string;
  cvId: string;
  status: ApplicationStatus;
  coverLetter: string | null;
  employerNotes?: string | null;
  rating?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApplicationRequest {
  jobPostId: string;
  cvId: string;
  coverLetter?: string;
}

export interface UpdateApplicationStatusRequest {
  status: ApplicationStatus;
}

export interface UpdateApplicationEvaluationRequest {
  employerNotes?: string | null;
  rating?: number | null;
}

export interface CandidateApplicationSummary extends Application {
  jobPost: JobPost;
  cv: CvRecord;
}

export interface EmployerApplicationDetail extends Application {
  jobPost: JobPost;
  cv: CvRecord;
  candidate: any; 
}

// --- Messaging (Phase 9) -------------------------------------------------

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export interface ConversationParticipant {
  id: string; // Candidate/Employer ID
  name: string;
  avatarUrl: string | null;
}

export interface ConversationJobPostInfo {
  id: string;
  title: string;
  companyName: string;
  /** CLOSED/EXPIRED/TAKEN_DOWN → hội thoại được phép xoá (AD-11). */
  status: JobPostStatus;
}

export interface Conversation {
  id: string;
  jobPostId: string;
  candidateId: string;
  employerId: string;
  candidateLastReadAt: string | null;
  employerLastReadAt: string | null;
  /** Soft-delete từng phía — phía kia đã xoá thì hội thoại chỉ còn xem lịch sử. */
  candidateDeletedAt: string | null;
  employerDeletedAt: string | null;
  createdAt: string;
  updatedAt: string;

  // Relations loaded for UI
  jobPost: ConversationJobPostInfo;
  candidate: ConversationParticipant;
  employer: ConversationParticipant;
  
  // Latest message for list view
  latestMessage?: Message | null;

  /**
   * Chỉ có ở phía employer: Application khớp (candidateId, jobPostId) để link
   * tới CV ứng viên — null khi ứng viên chưa nộp đơn vào tin này.
   */
  applicationId?: string | null;
}

/** Payload event socket `notification:new_message` (không gắn bản ghi Notification). */
export interface MessageNotificationEvent {
  conversationId: string;
  senderName: string;
  preview: string;
  createdAt: string;
}

/** Payload event socket `conversation:unavailable` — phía kia vừa xoá hội thoại. */
export interface ConversationUnavailableEvent {
  conversationId: string;
}

/** Response `DELETE /conversations/:id`. */
export interface DeleteConversationResponse {
  /** true khi cả 2 phía đã xoá → hội thoại bị xoá thật khỏi DB. */
  hardDeleted: boolean;
}

/** Payload event socket `notification:new` — thông báo nghiệp vụ (Phase 10). */
export interface NotificationEvent {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
}

export interface CreateConversationRequest {
  jobPostId: string;
}

export interface SendMessageSocketPayload {
  conversationId: string;
  content: string;
}
// ─── Notifications (Phase 10) ────────────────────────────────────────────

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface UnreadCountResponse {
  count: number;
}
