// AD-29 — cấu hình bộ chấm điểm chất lượng tin (docs/06-backend/job-quality-moderation/PLAN.md,
// mục "Thuật toán chấm điểm"). Mọi con số của thuật toán nằm ở đây: đổi trọng số, mức trừ,
// ngưỡng hay từ khoá nào thì TĂNG `QUALITY_SCORE_VERSION`, để UI báo điểm cũ đã lỗi thời và
// script `score-job-quality` biết tin nào cần chấm lại.

export const QUALITY_SCORE_VERSION = 1;

export type JobQualityCriterionKey = "COMPLETENESS" | "CONTENT" | "TRANSPARENCY" | "INTERNSHIP_FIT" | "RISK" | "COMPANY";

/** Thứ tự hiển thị + trọng số (tổng 100). */
export const QUALITY_CRITERIA: ReadonlyArray<{ key: JobQualityCriterionKey; label: string; weight: number }> = [
  { key: "COMPLETENESS", label: "Độ đầy đủ", weight: 20 },
  { key: "CONTENT", label: "Chất lượng nội dung", weight: 20 },
  { key: "TRANSPARENCY", label: "Minh bạch", weight: 15 },
  { key: "INTERNSHIP_FIT", label: "Phù hợp với thực tập", weight: 10 },
  { key: "RISK", label: "Dấu hiệu rủi ro", weight: 25 },
  { key: "COMPANY", label: "Uy tín công ty", weight: 10 },
];

/** Mức trừ theo mã lỗi (điểm trên thang 100 của tiêu chí). Lỗi "mỗi …" ghi mức một lần + trần. */
export const QUALITY_PENALTIES = {
  // Tiêu chí 1 — độ đầy đủ (chỉ các mục không bắt buộc lúc gửi duyệt)
  NO_REQUIREMENTS: 30,
  NO_REQUIRED_SKILL: 25,
  NO_BENEFITS: 20,
  NO_MAJOR: 15,
  // Tiêu chí 2 — chất lượng nội dung
  DESCRIPTION_TOO_SHORT: 35,
  DESCRIPTION_SHORT: 10,
  REQUIREMENTS_TOO_SHORT: 15,
  TITLE_LENGTH: 15,
  TITLE_SHOUTING: 15,
  SPAMMY_FORMAT: 10,
  CONTACT_IN_CONTENT: 20,
  // Tiêu chí 3 — minh bạch
  SALARY_NEGOTIABLE: 25,
  SALARY_ONE_SIDED: 10,
  SALARY_RANGE_WIDE: 15,
  SALARY_INVALID: 30,
  ADDRESS_VAGUE: 10,
  DEADLINE_TOO_SOON: 10,
  // Tiêu chí 4 — phù hợp với thực tập
  INTERN_EXPERIENCE_HIGH: 40,
  INTERN_EXPERIENCE_SOME: 10,
  TOO_MANY_REQUIRED_SKILLS: 20,
  REQUIREMENTS_NOT_CONFIRMED: 20,
  PENDING_SKILLS: 10,
  // Tiêu chí 5 — dấu hiệu rủi ro
  ASKS_FOR_MONEY: 60,
  OFF_PLATFORM_CONTACT: 25,
  TOO_GOOD_TO_BE_TRUE: 25,
  INTERN_SALARY_OUTLIER: 30,
  RESUBMITTED_UNCHANGED: 30,
  REJECTED_MANY_TIMES: 20,
  // Tiêu chí 6 — uy tín công ty
  COMPANY_RETRACTIONS: 25,
  COMPANY_CONFIRMED_REPORTS: 25,
  COMPANY_OPEN_REPORTS: 10,
  COMPANY_HIGH_REJECTION: 20,
  COMPANY_NO_HISTORY: 10,
} as const;

export type JobQualityIssueCode = keyof typeof QUALITY_PENALTIES;

/** Trần trừ của các lỗi tính theo số lần. */
export const QUALITY_PENALTY_CAPS: Partial<Record<JobQualityIssueCode, number>> = {
  COMPANY_RETRACTIONS: 75,
  COMPANY_CONFIRMED_REPORTS: 50,
  COMPANY_OPEN_REPORTS: 30,
};

/** Lỗi gắn cờ chặn: có cờ thì không bao giờ vào vùng đề xuất duyệt. */
export const QUALITY_BLOCKING_CODES: ReadonlySet<JobQualityIssueCode> = new Set<JobQualityIssueCode>(["ASKS_FOR_MONEY"]);

export const QUALITY_THRESHOLDS = {
  descriptionMinChars: 150,
  descriptionGoodChars: 300,
  requirementsMinChars: 50,
  titleMinChars: 10,
  titleMaxChars: 100,
  /** Tiêu đề phải có ít nhất ngần này chữ cái mới xét "viết hoa toàn bộ". */
  titleShoutingMinLetters: 10,
  titleShoutingRatio: 0.7,
  /** Một ký tự (không phải chữ số / khoảng trắng) lặp liên tiếp từ ngần này lần. */
  repeatedCharRun: 4,
  titleMaxEmoji: 3,
  salaryRangeMaxRatio: 3,
  addressMinChars: 10,
  deadlineMinDays: 7,
  internMaxExperienceYears: 1,
  maxRequiredSkills: 8,
  /** VND / tháng. */
  internSalaryOutlierVnd: 20_000_000,
  rejectedManyTimes: 3,
  companyHistoryDays: 180,
  companyHighRejectionMinSubmits: 4,
  companyHighRejectionRatio: 0.5,
} as const;

/** Ba vùng (Q3): ≥ approveMin, không cờ chặn, không tiêu chí < criterionFloor → đề xuất duyệt. */
export const QUALITY_BANDS = {
  approveMin: 80,
  rejectBelow: 50,
  criterionFloor: 50,
} as const;

/**
 * Từ khoá tiêu chí 5, viết KHÔNG DẤU, chữ thường (so trên văn bản đã `foldText`). Khớp theo
 * ranh giới từ. Mỗi nhóm trừ tối đa một lần.
 */
export const QUALITY_KEYWORDS = {
  ASKS_FOR_MONEY: [
    "phi ho so",
    "phi dao tao",
    "phi giu cho",
    "phi dang ky",
    "phi nhan viec",
    "phi dong phuc",
    "le phi",
    "dong phi",
    "nop phi",
    "dat coc",
    "tien coc",
    "coc truoc",
    "the chap",
    "nop tien",
    "chuyen khoan truoc",
    "mua dong phuc",
    "mua tai lieu",
    "mua giao trinh",
  ],
  OFF_PLATFORM_CONTACT: ["zalo", "telegram", "whatsapp", "inbox", "nhan tin rieng", "ket ban"],
  TOO_GOOD_TO_BE_TRUE: [
    "viec nhe luong cao",
    "thu nhap khung",
    "luong khung",
    "khong can kinh nghiem luong cao",
    "kiem tien online",
    "lam tai nha thu nhap",
    "thu nhap thu dong",
  ],
} as const satisfies Partial<Record<JobQualityIssueCode, readonly string[]>>;

/**
 * Từ phủ định đứng ngay trước từ khoá "đòi tiền" thì bỏ qua lần khớp đó: "miễn phí đào tạo",
 * "không thu phí hồ sơ", "không mất phí đăng ký" là quyền lợi, không phải dấu hiệu lừa đảo.
 * So trên đoạn không dấu ngay trước từ khoá. Phủ định kéo dài qua "hay / hoặc / và" trong cùng
 * vế ("không cần nộp tiền hay đặt cọc"), tối đa 20 ký tự giữa chừng.
 */
export const QUALITY_MONEY_NEGATION =
  /(?:^|[^a-z0-9])(?:mien|khong|ko)(?:\s+(?:thu|mat|can|co|yeu cau|phai|ton))?(?:\s+[a-z ]{0,20}?\s(?:hay|hoac|va))?\s*$/;

/** Lý do chọn sẵn của `RejectJobModal` (giữ đúng chữ và thứ tự của frontend). */
export const REJECT_PRESET_REASONS = ["Thiếu thông tin", "Nội dung không phù hợp", "Thông tin không hợp lệ", "Vi phạm chính sách"] as const;
export type RejectPresetReason = (typeof REJECT_PRESET_REASONS)[number];

/**
 * Mã lỗi → lý do chọn sẵn khi sinh lý do từ chối. Mã không có ở đây (kém minh bạch nhẹ, lịch
 * sử của tin, cả tiêu chí 6) KHÔNG đưa vào lý do gửi NTD; Admin vẫn thấy trong bảng điểm.
 */
export const QUALITY_REJECT_REASON: Partial<Record<JobQualityIssueCode, RejectPresetReason>> = {
  NO_REQUIREMENTS: "Thiếu thông tin",
  NO_REQUIRED_SKILL: "Thiếu thông tin",
  NO_BENEFITS: "Thiếu thông tin",
  NO_MAJOR: "Thiếu thông tin",
  DESCRIPTION_TOO_SHORT: "Thiếu thông tin",
  REQUIREMENTS_TOO_SHORT: "Thiếu thông tin",
  ADDRESS_VAGUE: "Thiếu thông tin",
  SALARY_INVALID: "Thông tin không hợp lệ",
  SALARY_RANGE_WIDE: "Thông tin không hợp lệ",
  DEADLINE_TOO_SOON: "Thông tin không hợp lệ",
  INTERN_EXPERIENCE_HIGH: "Thông tin không hợp lệ",
  TOO_MANY_REQUIRED_SKILLS: "Thông tin không hợp lệ",
  TITLE_LENGTH: "Nội dung không phù hợp",
  TITLE_SHOUTING: "Nội dung không phù hợp",
  SPAMMY_FORMAT: "Nội dung không phù hợp",
  CONTACT_IN_CONTENT: "Nội dung không phù hợp",
  OFF_PLATFORM_CONTACT: "Nội dung không phù hợp",
  TOO_GOOD_TO_BE_TRUE: "Nội dung không phù hợp",
  INTERN_SALARY_OUTLIER: "Nội dung không phù hợp",
  ASKS_FOR_MONEY: "Vi phạm chính sách",
};
