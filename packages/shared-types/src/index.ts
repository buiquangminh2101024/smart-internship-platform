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
  | "JOB_POST_SUBMITTED"
  | "CANDIDATE_OUTREACH_INVITATION_RECEIVED"
  | "CANDIDATE_OUTREACH_INVITATION_RESPONDED"
  | "APPLICATION_RECEIVED"
  | "JOB_POST_EXPIRING"
  | "SUBSCRIPTION_EXPIRING"
  | "CATALOG_ENTRY_SUGGESTED"
  | "PAYMENT_COMPLETED"
  | "INTERVIEW_SCHEDULED"
  | "INTERVIEW_RESCHEDULED"
  | "INTERVIEW_CANCELLED"
  | "INTERVIEW_REMINDER";

export type InterviewMode = "ONLINE" | "ONSITE";

export type InterviewStatus = "SCHEDULED" | "CANCELLED";

export type OutreachInvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";

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
  /** REQUIRED = bắt buộc, PREFERRED = ưu tiên (Job Matcher — docs/06-backend/job-matcher-phase1/PLAN.md). */
  importance: SkillImportance;
  /** Số năm kinh nghiệm tối thiểu riêng cho kỹ năng này; null = không yêu cầu cụ thể (Job Matcher GĐ3). */
  minYears: number | null;
}

export type SkillImportance = "REQUIRED" | "PREFERRED";

/** PRIMARY = đúng ngành yêu cầu, RELATED = ngành liên quan được xác nhận là chấp nhận được (Job Matcher GĐ3). */
export type MajorRelevance = "PRIMARY" | "RELATED";

export interface JobPostMajorDto {
  majorId: string;
  name: string;
  relevance: MajorRelevance;
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
  /** Số năm kinh nghiệm tối thiểu; null = không yêu cầu. */
  minExperienceYears: number | null;
  /** Kỹ năng yêu cầu — chỉ skill đã duyệt mới lộ ra API công khai. */
  skills: JobPostSkillDto[];
  /** Ngành học phù hợp (Job Matcher GĐ3). */
  majors: JobPostMajorDto[];
  /** { languages: [...], other: string[] } trích từ AI — chỉ hiển thị, không chấm điểm (Job Matcher GĐ3). */
  requirementsExtra: { languages: Array<{ language: string; level: string | null; importance: SkillImportance }>; other: string[] } | null;
  /** null = Employer chưa dùng tính năng AI xác nhận yêu cầu (Job Matcher GĐ3). */
  requirementsConfirmedAt: string | null;
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
   * Các skill này có importance REQUIRED.
   */
  skillIds?: string[];
  /**
   * Kỹ năng ưu tiên (PREFERRED). Chỉ có tác dụng khi gửi kèm `skillIds` — cả hai
   * được ghi thành một khối; skill có ở cả hai danh sách được tính là REQUIRED.
   */
  preferredSkillIds?: string[];
  /** Số năm kinh nghiệm tối thiểu (0–20); null/0 = không yêu cầu. */
  minExperienceYears?: number | null;
  /**
   * Số năm tối thiểu cho từng kỹ năng (Job Matcher GĐ3), khoá = skillId. Chỉ có
   * tác dụng khi gửi kèm `skillIds`; kỹ năng không có trong map giữ nguyên giá
   * trị đang lưu, `null`/0 = xoá yêu cầu.
   */
  skillMinYears?: Record<string, number | null>;
  /** Ngành học phù hợp — ghi đè toàn bộ khi có mặt, bỏ qua khi undefined (Job Matcher GĐ3). */
  majors?: Array<{ majorId: string; relevance: MajorRelevance }>;
}

export type UpdateJobPostRequest = Partial<CreateJobPostRequest>;

// ─── Job Matcher GĐ3: AI phân tích yêu cầu của tin ──────────────────────
// docs/06-backend/job-matcher-phase3/PLAN.md. Bản nháp AI trả về, KHÔNG lưu DB
// tới khi Employer bấm "Áp dụng".

export type ExtractionConfidence = "LOW" | "MEDIUM" | "HIGH";

/** Cách một tên do AI đọc ra được khớp vào catalog APPROVED (chỉ tra cứu, không tạo mới). */
export type CatalogResolveMatchType = "ALIAS" | "EXACT" | "TOKEN";

export interface ExtractedJobRequirements {
  skills: Array<{
    rawName: string;
    importance: SkillImportance;
    /** "6 tháng" → 0.5; tin không nêu số → null (không bịa). */
    minYears: number | null;
    /** Câu trích trong tin, để Employer đối chiếu. */
    evidence: string;
    resolved: { skillId: string; name: string; matchType: CatalogResolveMatchType } | null;
    /** Chỉ để tô màu bảng xem trước, không vào công thức chấm điểm. */
    confidence: ExtractionConfidence;
  }>;
  overallMinExperienceYears: number | null;
  majors: Array<{
    rawName: string;
    resolved: { majorId: string; name: string; matchType: CatalogResolveMatchType } | null;
    relevance: MajorRelevance;
    evidence: string;
    confidence: ExtractionConfidence;
  }>;
  languages: Array<{ language: string; level: string | null; importance: SkillImportance; evidence: string }>;
  /** Yêu cầu khác — chỉ hiển thị. */
  other: string[];
  confidence: ExtractionConfidence;
}

/** Body của PUT /employer/job-posts/:id/requirements — Employer xác nhận bản đã sửa. */
export interface ConfirmRequirementsRequest {
  /** Đồng bộ toàn bộ tập kỹ năng của tin (importance + minYears). */
  skills: Array<{ skillId: string; importance: SkillImportance; minYears: number | null }>;
  minExperienceYears: number | null;
  /** Đồng bộ toàn bộ tập ngành của tin. */
  majors: Array<{ majorId: string; relevance: MajorRelevance }>;
  languages: Array<{ language: string; level: string | null; importance: SkillImportance }>;
  other: string[];
}

// ─── Job Matcher (A2) ────────────────────────────────────────────────────
// docs/06-backend/job-matcher-phase1/PLAN.md. Điểm chỉ mang tính tham khảo —
// không dùng để lọc/ẩn đơn ứng tuyển.

export type MatchStatus = "SCORED" | "INSUFFICIENT_PROFILE" | "INSUFFICIENT_JOB_DATA";

export type MatchConfidence = "LOW" | "MEDIUM" | "HIGH";

export type MatchComponentKey = "requiredSkills" | "preferredSkills" | "experience" | "education" | "semantic";

export interface MatchComponentResult {
  key: MatchComponentKey;
  applicable: boolean;
  /** 0..1; null khi không áp dụng. */
  score: number | null;
  weight: number;
  /** Trọng số sau khi chia lại trên các thành phần áp dụng được. */
  effectiveWeight: number;
}

export interface MatchSkillEvidence {
  skillId: string;
  name: string;
  importance: SkillImportance;
  status: "MATCHED" | "MISSING";
  /** Số năm ứng viên khai cho kỹ năng này; null = chưa khai (hoặc không có). */
  candidateYears: number | null;
  /** Số năm tin yêu cầu riêng cho kỹ năng này; null = không yêu cầu (GĐ3). */
  requiredYears: number | null;
}

/**
 * PRIMARY/RELATED = có ngành khớp; NONE = có học vấn nhưng không khớp ngành nào;
 * UNKNOWN = chưa có học vấn đối chiếu được; NOT_REQUIRED = tin không nêu ngành (GĐ3).
 */
export type MatchEducationStatus = "PRIMARY" | "RELATED" | "NONE" | "UNKNOWN" | "NOT_REQUIRED";

export interface MatchEducationEvidence {
  status: MatchEducationStatus;
  /** Ngành của ứng viên đã khớp (PRIMARY/RELATED); null ở các trạng thái khác. */
  matchedMajorName: string | null;
  /** Tên ngành tin yêu cầu, PRIMARY trước. */
  requiredMajors: string[];
}

export type MatchExperienceStatus = "MATCH" | "PARTIAL" | "BELOW" | "UNKNOWN" | "NOT_REQUIRED";

export interface MatchExperienceEvidence {
  status: MatchExperienceStatus;
  requiredYears: number | null;
  /** Tổng thời gian làm việc (chưa xét mức liên quan); null = không xác định. */
  candidateYears: number | null;
}

export interface MatchSemanticInfo {
  /** Cấu hình đang bật thành phần semantic (GĐ2). GĐ1 luôn false. */
  enabled: boolean;
  /** Đã có độ tương đồng cho cặp này. */
  available: boolean;
  similarity: number | null;
  normalized: number | null;
}

export interface MatchResult {
  status: MatchStatus;
  /** 0..100 nguyên; null khi status khác SCORED. */
  score: number | null;
  confidence: MatchConfidence;
  weightsVersion: string;
  components: MatchComponentResult[];
  skills: MatchSkillEvidence[];
  experience: MatchExperienceEvidence;
  education: MatchEducationEvidence;
  semantic: MatchSemanticInfo;
  /** Câu giải thích tiếng Việt do server sinh. */
  notes: string[];
}

export type MatchSemanticStatus = "OFF" | "AVAILABLE" | "PENDING";

export interface ApplicationMatchSummary {
  applicationId: string;
  candidateId: string;
  score: number | null;
  confidence: MatchConfidence;
  status: MatchStatus;
  semanticStatus: MatchSemanticStatus;
}

// ─── Việc làm phù hợp (B2, AD-14) ────────────────────────────────────────
// docs/06-backend/candidate-insights/PLAN.md. Không LLM, không lưu — tính lại
// mỗi lần gọi.

export interface JobRecommendation {
  jobPost: JobPost;
  match: MatchResult;
}

/**
 * INSUFFICIENT_PROFILE = hồ sơ chưa có kỹ năng nào (items luôn rỗng); OK với
 * items rỗng = có hồ sơ nhưng không tin nào đạt ngưỡng tối thiểu.
 */
export type JobRecommendationStatus = "OK" | "INSUFFICIENT_PROFILE";

export interface JobRecommendationList {
  status: JobRecommendationStatus;
  /** Tối đa 10, giảm dần theo điểm; có thể ít hơn — không phải lỗi. */
  items: JobRecommendation[];
}

// ─── Tìm & mời ứng viên (B3, AD-15) ──────────────────────────────────────
// docs/06-backend/candidate-outreach/PLAN.md. Không bao giờ có phone/email/
// dateOfBirth — NTD liên hệ qua lời mời/hội thoại.

/** Phần thẻ dùng chung cho "Gợi ý" và "Đã mời". */
export interface OutreachCandidateCardDto {
  candidateId: string;
  fullName: string | null;
  avatarUrl: string | null;
  headline: string | null;
  cityName: string | null;
  /** 1 dòng học vấn đại diện: đang học trước, rồi năm kết thúc mới nhất. */
  education: {
    universityName: string | null;
    majorName: string | null;
    degree: string | null;
  } | null;
}

/** Danh sách "Gợi ý" (D6) — tối đa 10, giảm dần theo điểm. */
export interface CandidateSearchResultDto extends OutreachCandidateCardDto {
  match: MatchResult;
  /** Từng có lời mời cho tin này nhưng đã hết hạn — được mời lại. */
  previouslyInvitedExpired: boolean;
}

/** Danh sách "Đã mời" (D6) — không chấm lại điểm. */
export interface SentOutreachInvitationDto extends OutreachCandidateCardDto {
  invitationId: string;
  status: OutreachInvitationStatus;
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  /** D7 — điểm LÚC GỬI lời mời (không phải điểm hiện tại); null nếu lúc đó không chấm được. */
  matchScore: number | null;
  matchWeightsVersion: string | null;
  canViewProfile: boolean;
}

/** Hộp lời mời của Candidate. */
export interface CandidateOutreachInvitationDto {
  invitationId: string;
  status: OutreachInvitationStatus;
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  jobPost: { id: string; title: string; status: JobPostStatus };
  company: { id: string; name: string; logoUrl: string | null };
  /** Chỉ có khi ACCEPTED và hội thoại đã được tạo. */
  conversationId: string | null;
}

export type OutreachInvitationAction = "ACCEPT" | "DECLINE";

export interface RespondOutreachInvitationRequest {
  action: OutreachInvitationAction;
}

export interface RespondOutreachInvitationResponse {
  status: OutreachInvitationStatus;
  conversationId: string | null;
}

export interface OutreachSettings {
  isOpenToOutreach: boolean;
}

// ─── Phân tích hồ sơ (A1 + A4, AD-14) ───────────────────────────────────
// docs/06-backend/candidate-insights/PLAN.md. Lưu persistent, chỉ tính lại khi
// Candidate bấm "Phân tích hồ sơ".

/**
 * WRITING do LLM viết; SKILL_GAP/INDUSTRY_MISMATCH do code tạo từ kết quả
 * "Việc làm phù hợp" — luôn kèm evidence.
 */
export type ProfileInsightSuggestionKind = "WRITING" | "SKILL_GAP" | "INDUSTRY_MISMATCH";

export interface ProfileInsightSuggestion {
  kind: ProfileInsightSuggestionKind;
  text: string;
  evidence?: string[];
}

export interface ProfileInsight {
  /** 0..100 — kỹ năng 40, kinh nghiệm 25, học vấn 25, headline/bio 10. */
  completenessScore: number;
  strengths: string[];
  suggestions: ProfileInsightSuggestion[];
  /** Số tin phù hợp dùng để tạo SKILL_GAP/INDUSTRY_MISMATCH lúc phân tích. */
  basedOnJobCount: number;
  generatedAt: string;
}

export interface JobPostSearchQuery {
  q?: string;
  companyId?: string;
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
  isBuilder?: boolean;
  templateId?: string | null;
  builderData?: any | null;
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

/**
 * Kỹ năng ở bước import: khác `CvExtractionResult.skills` (chỉ là tên) vì
 * Candidate nhập thêm số năm kinh nghiệm ngay trong preview. `0` nghĩa là
 * CHƯA KHAI, không phải "chắc chắn 0 năm" — cột không cho null nên đây là quy
 * ước chung của hệ thống.
 */
export interface ImportFromCvSkill {
  name: string;
  yearsOfExperience: number;
}

export interface ImportFromCvRequest {
  /** Chỉ để truy vết nguồn gốc, không bắt buộc. */
  cvId?: string;
  /** Kết quả trích xuất SAU KHI Candidate đã bỏ bớt mục/kỹ năng ở preview. */
  extractedData: Pick<
    CvExtractionResult,
    "candidate" | "educations" | "workExperiences" | "projects" | "certificates" | "awards"
  > & {
    skills: ImportFromCvSkill[];
  };
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

/**
 * Nhóm của trung tâm thông báo (AD-16). Mỗi loại thông báo thuộc đúng một nhóm;
 * mỗi vai trò chỉ thấy một số nhóm (ánh xạ ở server: notification-groups.ts).
 */
export type NotificationGroup =
  | "APPLICATIONS"
  | "JOB_POSTS"
  | "COMPANY"
  | "INVITATIONS"
  | "INTERVIEWS"
  | "SUBSCRIPTION"
  | "CATALOG"
  | "PAYMENTS";

/** GET /notifications/unread-count/by-group — `groups` chỉ gồm các nhóm của vai trò hiện tại, nhóm trống = 0. */
export interface UnreadCountByGroupResponse {
  total: number;
  groups: Partial<Record<NotificationGroup, number>>;
}

// ─── Dashboard Employer & Admin (AD-16) ──────────────────────────────────
// docs/06-backend/dashboard-employer-admin/PLAN.md. Mọi mốc "ngày" theo giờ
// Việt Nam (Asia/Ho_Chi_Minh); "7 ngày" = hôm nay và 6 ngày trước đó.

/** Nút 7/30/90 ngày — chỉ đổi chuỗi theo ngày và phễu (D10). */
export type DashboardRange = 7 | 30 | 90;

/** Một điểm của chuỗi theo ngày; server điền đủ ngày trống bằng 0. `date` dạng YYYY-MM-DD. */
export interface DailyPoint {
  date: string;
  value: number;
}

/** Kỳ này so với kỳ liền trước cùng độ dài. */
export interface PeriodComparison {
  current: number;
  previous: number;
}

/** Phân bố thời gian chờ của một hàng chờ (Dưới 24 giờ / 1 – 2 ngày / Trên 2 ngày). */
export interface WaitBuckets {
  under24h: number;
  oneToTwoDays: number;
  over2Days: number;
}

/**
 * Phân bố thời gian chờ của hàng chờ tin tuyển dụng (Dưới 6 giờ / 6 – 24 giờ /
 * Trên 24 giờ) — tin thường được duyệt trong ngày nên nhóm theo giờ (D14).
 */
export interface JobPostWaitBuckets {
  under6h: number;
  sixTo24h: number;
  over24h: number;
}

/**
 * Hạn mức lời mời ứng viên hôm nay của công ty (AD-15). BLOCKED = không có gói
 * còn hiệu lực. Bộ đếm làm mới lúc 7h sáng giờ Việt Nam.
 */
export type OutreachDailyQuotaStatus =
  | { mode: "BLOCKED" }
  | { mode: "TRIAL" | "SUBSCRIBED"; dailyQuota: number; usedToday: number; remainingToday: number };

/** GET /employer/dashboard/overview — số liệu của cả công ty, trừ `messages` (của riêng employer). */
export interface EmployerDashboardOverview {
  company: { id: string; name: string; verificationStatus: CompanyVerificationStatus };
  jobs: JobPostStats & {
    /** Tin PUBLISHED có expiresAt trong 7 ngày tới (còn lại của `published` là còn hạn > 7 ngày). */
    expiringIn7Days: number;
    /** Tin PUBLISHED có nhiều hồ sơ nhất (không tính hồ sơ đã huỷ). */
    topJob: { id: string; title: string; applicationCount: number } | null;
  };
  applications: {
    /** Hồ sơ mới trong 7 ngày so với 7 ngày trước đó. */
    newLast7Days: PeriodComparison;
    pendingCount: number;
    pendingWait: WaitBuckets;
    /** Mốc bắt đầu chờ của hồ sơ PENDING lâu nhất (ISO), null nếu không có. */
    oldestPendingSince: string | null;
  };
  messages: {
    unreadConversations: number;
    /** Số ứng viên khác nhau trong các hội thoại chưa đọc (một ứng viên có thể có nhiều hội thoại). */
    unreadCandidates: number;
    /** Tối đa 3 hội thoại chưa đọc, tin mới nhất trước. */
    recent: Array<{ conversationId: string; candidateName: string; lastMessageAt: string }>;
  };
  outreach: {
    quota: OutreachDailyQuotaStatus;
    /** Lời mời gửi trong 30 ngày qua; tỉ lệ chấp nhận = accepted / sent. */
    last30Days: { sent: number; accepted: number; declined: number };
  };
  /** Lịch SCHEDULED của hồ sơ đang INTERVIEWING, cả công ty. */
  interviews: {
    /** 7 ngày kể từ hôm nay (giờ Việt Nam), đủ 7 điểm — dùng cho DayColumns. */
    next7Days: DailyPoint[];
    /** Số buổi chưa diễn ra trong 7 ngày tới (ô "phỏng vấn sắp tới" của banner). */
    upcomingCount: number;
    /** Buổi chưa diễn ra gần nhất (không giới hạn 7 ngày). */
    next: { interviewId: string; scheduledAt: string; candidateName: string | null; jobPostTitle: string } | null;
  };
}

export interface DashboardPendingApplication {
  applicationId: string;
  candidateName: string | null;
  candidateAvatarUrl: string | null;
  /** Trường của học vấn đại diện (đang học trước, rồi năm kết thúc gần nhất); null nếu chưa khai. */
  universityName: string | null;
  jobPostId: string;
  jobPostTitle: string;
  /** Mốc bắt đầu chờ: lúc ứng tuyển, hoặc lúc ứng tuyển lại. */
  waitingSince: string;
}

export interface DashboardAttentionJob {
  jobPostId: string;
  title: string;
  /** EXPIRING: PUBLISHED hết hạn trong 7 ngày. REJECTED: bị Admin từ chối, đang là nháp. */
  kind: "EXPIRING" | "REJECTED";
  expiresAt: string | null;
  rejectedReason: string | null;
  rejectedAt: string | null;
  /** Số hồ sơ của tin, không tính hồ sơ đã huỷ. */
  applicationCount: number;
}

/** GET /employer/dashboard/tasks — mỗi nhóm tối đa 5 mục kèm tổng. */
export interface EmployerDashboardTasks {
  /** Chờ lâu nhất trước. */
  pendingApplications: { total: number; wait: WaitBuckets; items: DashboardPendingApplication[] };
  /** Sắp hết hạn trước (gần hạn nhất trước), rồi tới tin bị từ chối (mới nhất trước). */
  attentionJobs: { total: number; items: DashboardAttentionJob[] };
  /** Hồ sơ chờ đặt lịch phỏng vấn, chờ lâu nhất trước. */
  awaitingSchedule: { total: number; items: AwaitingScheduleApplication[] };
  /** `total` = số buổi chưa diễn ra trong 7 ngày tới; `items` = 5 buổi gần nhất trong khoảng đó. */
  upcomingInterviews: { total: number; items: EmployerInterview[] };
}

/** Các bước phễu trên đường chính (AD-16 mục 6). */
export type FunnelStep = "APPLIED" | "REVIEWING" | "SHORTLISTED" | "INTERVIEWING" | "ACCEPTED";

/** GET /employer/dashboard/analytics?range= */
export interface EmployerDashboardAnalytics {
  range: DashboardRange;
  applicationsDaily: DailyPoint[];
  viewsDaily: DailyPoint[];
  /**
   * Hồ sơ nộp trong kỳ (không tính hồ sơ đã huỷ), đếm "đã đạt bước". Hồ sơ cũ
   * bị từ chối trước khi có lịch sử chỉ tính ở APPLIED — `legacyRejected` là số đó.
   */
  funnel: { steps: Array<{ step: FunnelStep; count: number }>; legacyRejected: number };
  /** Từ lúc hồ sơ vào PENDING tới lần employer xem xét/từ chối đầu tiên, trong kỳ. */
  firstResponse: { averageHours: number | null; sampleSize: number };
}

/** GET /admin/dashboard/overview — `oldestSince`: mốc bắt đầu chờ của mục chờ lâu nhất (ISO), null nếu hàng chờ trống. */
export interface AdminDashboardOverview {
  queues: {
    companies: { total: number; wait: WaitBuckets; oldestSince: string | null };
    jobPosts: { total: number; wait: JobPostWaitBuckets; oldestSince: string | null };
    catalog: {
      total: number;
      skills: number;
      universities: number;
      majors: number;
      wait: WaitBuckets;
      oldestSince: string | null;
    };
  };
  /** Tài khoản Ứng viên + Nhà tuyển dụng mới, 7 ngày so với 7 ngày trước. */
  users: { newLast7Days: PeriodComparison };
  /** VND, theo thời điểm hoàn tất thanh toán (D11): tháng này so với tháng trước. */
  revenue: { thisMonth: PeriodComparison };
  subscriptions: {
    active: number;
    expiringIn7Days: number;
    byPlan: Array<{ planId: string; planName: string; count: number }>;
  };
}

export type CatalogEntryKind = "SKILL" | "UNIVERSITY" | "MAJOR";

/**
 * Người đề xuất một mục danh mục. `name`: họ tên ứng viên, tên công ty của nhà
 * tuyển dụng; null với Admin hoặc khi chưa khai tên (giao diện ghi theo vai trò).
 */
export interface CatalogSuggester {
  name: string | null;
  role: Role;
}

/** GET /admin/dashboard/tasks — mỗi hàng chờ tối đa 5 mục (chờ lâu nhất trước) kèm tổng. */
export interface AdminDashboardTasks {
  jobPosts: {
    total: number;
    items: Array<{ jobPostId: string; title: string; companyName: string; submittedAt: string }>;
  };
  companies: {
    total: number;
    items: Array<{
      companyId: string;
      name: string;
      taxCode: string | null;
      businessLicenseUrl: string | null;
      submittedAt: string;
    }>;
  };
  catalog: {
    total: number;
    /** `suggestedBy` null khi mục không có người tạo (vd. dữ liệu seed). */
    items: Array<{ id: string; kind: CatalogEntryKind; name: string; createdAt: string; suggestedBy: CatalogSuggester | null }>;
  };
}

/** GET /admin/dashboard/analytics?range= */
export interface AdminDashboardAnalytics {
  range: DashboardRange;
  /** Tài khoản Ứng viên + Nhà tuyển dụng mới theo ngày. */
  newUsersDaily: DailyPoint[];
  /** Tháng hiện tại, bốn khối ngày 1–7, 8–14, 15–21, 22–hết tháng; không đổi theo `range`. */
  revenueWeekly: { month: string; weeks: Array<{ fromDay: number; toDay: number; amount: number }> };
  /** Số tài khoản hiện tại theo vai trò; không đổi theo `range`. */
  usersByRole: Record<Role, number>;
}

// ─── Lịch phỏng vấn (AD-16 M2, D12) ──────────────────────────────────────
// docs/06-backend/dashboard-employer-admin/PLAN.md mục "Giai đoạn 5 — Interview".
// Mọi mốc giờ là ISO; giao diện hiển thị theo giờ Việt Nam.

/** Hồ sơ chờ đặt lịch: SHORTLISTED, hoặc INTERVIEWING chưa có lịch SCHEDULED nào. */
export interface AwaitingScheduleApplication {
  applicationId: string;
  status: "SHORTLISTED" | "INTERVIEWING";
  candidateName: string | null;
  candidateAvatarUrl: string | null;
  jobPostId: string;
  jobPostTitle: string;
  /** Lúc hồ sơ vào trạng thái hiện tại. */
  waitingSince: string;
}

export interface EmployerInterview {
  id: string;
  applicationId: string;
  candidateName: string | null;
  candidateAvatarUrl: string | null;
  jobPostId: string;
  jobPostTitle: string;
  scheduledAt: string;
  durationMinutes: number;
  mode: InterviewMode;
  location: string | null;
  /** Ghi chú gửi ứng viên. */
  note: string | null;
  status: InterviewStatus;
  cancelReason: string | null;
  /** userId của employer đặt lịch — giao diện dùng để cảnh báo trùng giờ với lịch của chính mình. */
  createdById: string;
  createdAt: string;
}

export interface CandidateInterview {
  id: string;
  applicationId: string;
  jobPostId: string;
  jobPostTitle: string;
  companyName: string;
  companyLogoUrl: string | null;
  scheduledAt: string;
  durationMinutes: number;
  mode: InterviewMode;
  location: string | null;
  note: string | null;
  status: InterviewStatus;
  cancelReason: string | null;
}

/** POST /employer/applications/:id/interviews */
export interface ScheduleInterviewRequest {
  scheduledAt: string;
  /** 15–240, mặc định 45. */
  durationMinutes?: number;
  mode: InterviewMode;
  /** Liên kết họp hoặc địa chỉ. */
  location: string;
  note?: string | null;
}

/** PATCH /employer/interviews/:id — gửi ít nhất một trường. */
export type RescheduleInterviewRequest = Partial<ScheduleInterviewRequest>;

/** POST /employer/interviews/:id/cancel */
export interface CancelInterviewRequest {
  reason: string;
}

/** SEQUENTIAL: chia khung giờ liên tiếp theo thứ tự `applicationIds`. GROUP: cùng một giờ. */
export type InterviewBatchArrangement = "SEQUENTIAL" | "GROUP";

/** POST /employer/interviews/batch — tối đa 20 hồ sơ, tất cả hoặc không (D12). */
export interface BatchScheduleInterviewsRequest {
  applicationIds: string[];
  arrangement: InterviewBatchArrangement;
  startAt: string;
  durationMinutes?: number;
  /** Chỉ dùng với SEQUENTIAL, 0–120, mặc định 0. */
  gapMinutes?: number;
  mode: InterviewMode;
  location: string;
  note?: string | null;
}

export type BatchScheduleFailureReason = "NOT_FOUND" | "INVALID_STATUS" | "ALREADY_SCHEDULED";

/** Nằm trong `data` của phản hồi 409 khi lô có hồ sơ không hợp lệ (không lịch nào được tạo). */
export interface BatchScheduleInterviewsFailure {
  failures: Array<{ applicationId: string; reason: BatchScheduleFailureReason }>;
}

/** Phản hồi 201: lịch vừa tạo, đúng thứ tự `applicationIds`. */
export interface BatchScheduleInterviewsResponse {
  items: EmployerInterview[];
}

/** GET /admin/activity?actor= — `admin` chỉ lấy thao tác của Admin, `all` (mặc định) lấy mọi dòng. */
export type ActivityActorFilter = "admin" | "all";

/** GET /admin/activity — một dòng nhật ký (AuditLog). */
export interface AuditActivityItem {
  id: string;
  actorId: string | null;
  actorRole: Role | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  /** Lý do Admin nhập khi từ chối/gỡ tin hoặc từ chối công ty; null với thao tác khác. */
  reason: string | null;
  createdAt: string;
}
