// AD-29 — bộ chấm điểm chất lượng tin (docs/06-backend/job-quality-moderation/PLAN.md, bước 2).
// Hàm THUẦN: không đọc DB, không đọc đồng hồ (nhận `now`). Mọi tín hiệu lịch sử được nạp sẵn
// vào `JobQualityInput.signals` (bước 4). Số liệu lấy từ `job-quality.config.ts`.
import { createHash } from "node:crypto";
import type { CatalogEntryStatus, JobPostType, JobQualityBand, MajorRelevance, SkillImportance } from "@prisma/client";
import {
  QUALITY_BANDS,
  QUALITY_BLOCKING_CODES,
  QUALITY_CRITERIA,
  QUALITY_HARD_FLOOR_EXEMPT,
  QUALITY_KEYWORDS,
  QUALITY_MONEY_NEGATION,
  QUALITY_PENALTIES,
  QUALITY_PENALTY_CAPS,
  QUALITY_REJECT_REASON,
  QUALITY_SCORE_VERSION,
  QUALITY_THRESHOLDS as T,
  REJECT_PRESET_REASONS,
  type JobQualityCriterionKey,
  type JobQualityIssueCode,
} from "./job-quality.config";

export interface JobQualitySignals {
  /**
   * Tin bị từ chối ở lần gửi trước và nội dung lần gửi này trùng mã băm lần gửi đó. Loader
   * (bước 4) tính lúc gửi duyệt; khi chấm lại một tin PENDING thì giữ kết quả của lúc gửi
   * (lần chấm lại không còn mã băm của lần gửi trước để so).
   */
  resubmittedUnchanged: boolean;
  /** Số lần tin này đã bị từ chối. */
  rejectionCount: number;
  /** Số tin của công ty bị thu hồi trong `companyHistoryDays` ngày. */
  companyRetractions: number;
  /** Số báo cáo vi phạm đã xử lý bằng gỡ tin trên tin của công ty, trong `companyHistoryDays` ngày. */
  companyConfirmedReports: number;
  /** Số báo cáo vi phạm đang chờ xử lý trên tin của công ty. */
  companyOpenReports: number;
  /** Số lần gửi duyệt / bị từ chối / được duyệt (kể cả tự đăng) của mọi tin của công ty. */
  companySubmitCount: number;
  companyRejectCount: number;
  companyApprovedCount: number;
}

export interface JobQualityInput {
  title: string;
  description: string;
  requirements: string | null;
  benefits: string | null;
  jobType: JobPostType;
  salaryMin: number | null;
  salaryMax: number | null;
  isNegotiable: boolean;
  cityId: string | null;
  address: string | null;
  industryId: string | null;
  expiresAt: Date | null;
  /** Lúc gửi duyệt gần nhất; mốc tính "hạn nộp còn bao lâu". null ⇒ dùng `now`. */
  submittedAt: Date | null;
  minExperienceYears: number | null;
  skills: ReadonlyArray<{ skillId: string; importance: SkillImportance; status: CatalogEntryStatus }>;
  majors: ReadonlyArray<{ majorId: string; relevance: MajorRelevance }>;
  signals: JobQualitySignals;
}

export interface JobQualityIssue {
  code: JobQualityIssueCode;
  penalty: number;
  /** Câu giải thích tiếng Việt; với mã có trong lý do từ chối, câu này gửi tới NTD. */
  message: string;
}

export interface JobQualityCriterionResult {
  key: JobQualityCriterionKey;
  label: string;
  weight: number;
  score: number;
  issues: JobQualityIssue[];
}

export interface JobQualityResult {
  score: number;
  band: JobQualityBand;
  version: number;
  criteria: JobQualityCriterionResult[];
  /** Mã lỗi gắn cờ chặn (ví dụ ASKS_FOR_MONEY). */
  flags: JobQualityIssueCode[];
  contentHash: string;
}

// ─── Văn bản ──────────────────────────────────────────────────────────────

/** Một ký tự (đã NFC) → bản không dấu, chữ thường. Luôn trả đúng 1 ký tự với chữ tiếng Việt. */
function foldChar(ch: string): string {
  const lower = ch.toLowerCase();
  if (lower === "đ") return "d";
  return lower.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Bỏ dấu tiếng Việt, chữ thường: "PHÍ Hồ Sơ" → "phi ho so". */
export function foldText(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) out += foldChar(ch);
  return out;
}

/** Bản không dấu kèm vị trí ký tự gốc của từng ký tự, để trích lại đoạn gốc đã khớp. */
function foldWithMap(text: string): { folded: string; source: string; origin: number[] } {
  const source = text.normalize("NFC");
  let folded = "";
  const origin: number[] = [];
  let i = 0;
  for (const ch of source) {
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k++) origin.push(i);
    folded += f;
    i += ch.length;
  }
  origin.push(source.length);
  return { folded, source, origin };
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Tìm từ khoá đầu tiên của nhóm (theo ranh giới từ, trên văn bản không dấu). Trả đoạn GỐC đã
 * khớp (giữ dấu) để câu giải thích chỉ rõ cụm từ. `negation` (nếu có) loại lần khớp đứng sau
 * từ phủ định ("miễn phí đào tạo").
 */
function findKeyword(text: string, keywords: readonly string[], negation?: RegExp): string | null {
  const { folded, source, origin } = foldWithMap(text);
  for (const keyword of keywords) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRegex(keyword).replace(/ /g, "\\s+")}(?![a-z0-9])`, "g");
    for (const m of folded.matchAll(re)) {
      const start = m.index ?? 0;
      if (negation && negation.test(folded.slice(Math.max(0, start - 40), start))) continue;
      return source.slice(origin[start], origin[start + m[0].length]);
    }
  }
  return null;
}

/** Gộp khoảng trắng, bỏ đầu cuối; độ dài tính theo ký tự đã NFC. */
function clean(text: string | null | undefined): string {
  return (text ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}
const charCount = (text: string) => [...text].length;

// Không bắt đầu ngay sau chữ số / dấu chấm / dấu phẩy, để "8.000.000-10.000.000" không bị coi là số điện thoại.
const PHONE_RE = /(?<![\d.,])(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)/;
const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u;
const LINK_RE = /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|vn|com\.vn|net\.vn|me|ly)\b/i;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const REPEAT_RE = new RegExp(`([^\\s\\d])\\1{${T.repeatedCharRun - 1},}`, "u");

function contactKind(text: string): string | null {
  if (PHONE_RE.test(text)) return "số điện thoại";
  if (EMAIL_RE.test(text)) return "email";
  if (LINK_RE.test(text)) return "đường link";
  return null;
}

// ─── Chấm từng tiêu chí ───────────────────────────────────────────────────

type IssueSink = (code: JobQualityIssueCode, message: string, times?: number) => void;

function sinkFor(issues: JobQualityIssue[]): IssueSink {
  return (code, message, times = 1) => {
    const cap = QUALITY_PENALTY_CAPS[code];
    const raw = QUALITY_PENALTIES[code] * times;
    issues.push({ code, penalty: cap === undefined ? raw : Math.min(raw, cap), message });
  };
}

function scoreCompleteness(input: JobQualityInput, add: IssueSink) {
  if (!clean(input.requirements)) add("NO_REQUIREMENTS", "Chưa có phần yêu cầu ứng viên.");
  if (input.skills.length > 0 && !input.skills.some((s) => s.importance === "REQUIRED"))
    add("NO_REQUIRED_SKILL", "Chưa đánh dấu kỹ năng nào là bắt buộc.");
  if (!clean(input.benefits)) add("NO_BENEFITS", "Chưa có phần quyền lợi.");
  if (input.majors.length === 0) add("NO_MAJOR", "Chưa chọn ngành học phù hợp.");
}

function scoreContent(input: JobQualityInput, add: IssueSink) {
  const description = clean(input.description);
  const descLen = charCount(description);
  if (descLen < T.descriptionMinChars)
    add("DESCRIPTION_TOO_SHORT", `Mô tả công việc quá ngắn (${descLen}/${T.descriptionMinChars} ký tự).`);
  else if (descLen < T.descriptionGoodChars)
    add("DESCRIPTION_SHORT", `Mô tả công việc còn sơ sài (${descLen} ký tự, nên từ ${T.descriptionGoodChars}).`);

  const requirements = clean(input.requirements);
  const reqLen = charCount(requirements);
  if (reqLen > 0 && reqLen < T.requirementsMinChars)
    add("REQUIREMENTS_TOO_SHORT", `Yêu cầu ứng viên quá ngắn (${reqLen}/${T.requirementsMinChars} ký tự).`);

  const title = clean(input.title);
  const titleLen = charCount(title);
  if (titleLen < T.titleMinChars || titleLen > T.titleMaxChars)
    add("TITLE_LENGTH", `Tiêu đề ${titleLen < T.titleMinChars ? "quá ngắn" : "quá dài"} (${titleLen} ký tự, nên ${T.titleMinChars}–${T.titleMaxChars}).`);

  const letters = [...title].filter((ch) => ch.toLowerCase() !== ch.toUpperCase());
  const upper = letters.filter((ch) => ch === ch.toUpperCase()).length;
  if (letters.length >= T.titleShoutingMinLetters && upper / letters.length >= T.titleShoutingRatio)
    add("TITLE_SHOUTING", "Tiêu đề viết hoa gần như toàn bộ.");

  const emoji = title.match(EMOJI_RE)?.length ?? 0;
  if (REPEAT_RE.test(title) || emoji > T.titleMaxEmoji)
    add("SPAMMY_FORMAT", emoji > T.titleMaxEmoji ? `Tiêu đề có quá nhiều biểu tượng cảm xúc (${emoji}).` : "Tiêu đề lặp ký tự liên tiếp (ví dụ \"!!!!\").");

  const kind = contactKind([input.description, input.requirements, input.benefits].map(clean).join("\n"));
  if (kind) add("CONTACT_IN_CONTENT", `Nội dung tin có ${kind} liên hệ riêng; ứng viên cần liên hệ qua nền tảng.`);
}

function scoreTransparency(input: JobQualityInput, now: Date, add: IssueSink) {
  const { salaryMin: min, salaryMax: max } = input;
  if (input.isNegotiable || (min === null && max === null)) {
    add("SALARY_NEGOTIABLE", input.isNegotiable ? "Lương ghi \"Thoả thuận\"." : "Chưa ghi mức lương.");
  } else if (min !== null && max !== null) {
    if (min > max) add("SALARY_INVALID", "Lương tối thiểu lớn hơn lương tối đa.");
    else if (min > 0 && max / min > T.salaryRangeMaxRatio)
      add("SALARY_RANGE_WIDE", `Khoảng lương quá rộng (tối đa gấp ${(max / min).toFixed(1).replace(".", ",")} lần tối thiểu).`);
  } else {
    add("SALARY_ONE_SIDED", min === null ? "Lương chỉ ghi mức tối đa." : "Lương chỉ ghi mức tối thiểu.");
  }

  if (charCount(clean(input.address)) < T.addressMinChars) add("ADDRESS_VAGUE", "Địa chỉ làm việc chưa cụ thể.");

  if (input.expiresAt) {
    const from = input.submittedAt ?? now;
    const days = (input.expiresAt.getTime() - from.getTime()) / 86_400_000;
    if (days < T.deadlineMinDays)
      add("DEADLINE_TOO_SOON", `Hạn nộp hồ sơ quá gần (còn ${Math.max(0, Math.floor(days))} ngày, nên từ ${T.deadlineMinDays} ngày).`);
  }
}

function scoreInternshipFit(input: JobQualityInput, add: IssueSink) {
  const years = input.minExperienceYears ?? 0;
  if (input.jobType === "INTERNSHIP") {
    if (years >= T.internMaxExperienceYears)
      add("INTERN_EXPERIENCE_HIGH", `Tin thực tập yêu cầu ${String(years).replace(".", ",")} năm kinh nghiệm.`);
    else if (years > 0) add("INTERN_EXPERIENCE_SOME", "Tin thực tập có yêu cầu kinh nghiệm.");
  }
  const required = input.skills.filter((s) => s.importance === "REQUIRED").length;
  if (required > T.maxRequiredSkills)
    add("TOO_MANY_REQUIRED_SKILLS", `Quá nhiều kỹ năng bắt buộc (${required}, nên tối đa ${T.maxRequiredSkills}).`);
  if (input.skills.some((s) => s.status === "PENDING")) add("PENDING_SKILLS", "Có kỹ năng mới đang chờ duyệt vào danh mục.");
}

function scoreRisk(input: JobQualityInput, add: IssueSink) {
  const text = [input.title, input.description, input.requirements ?? "", input.benefits ?? ""].join("\n");

  const money = findKeyword(text, QUALITY_KEYWORDS.ASKS_FOR_MONEY, QUALITY_MONEY_NEGATION);
  if (money) add("ASKS_FOR_MONEY", `Nội dung có dấu hiệu yêu cầu ứng viên nộp tiền ("${money}").`);
  const offPlatform = findKeyword(text, QUALITY_KEYWORDS.OFF_PLATFORM_CONTACT);
  if (offPlatform) add("OFF_PLATFORM_CONTACT", `Nội dung mời ứng viên liên hệ qua kênh ngoài nền tảng ("${offPlatform}").`);
  const tooGood = findKeyword(text, QUALITY_KEYWORDS.TOO_GOOD_TO_BE_TRUE);
  if (tooGood) add("TOO_GOOD_TO_BE_TRUE", `Nội dung có lời hứa hẹn quá mức ("${tooGood}").`);

  const topSalary = Math.max(input.salaryMin ?? 0, input.salaryMax ?? 0);
  if (input.jobType === "INTERNSHIP" && topSalary > T.internSalaryOutlierVnd)
    add("INTERN_SALARY_OUTLIER", `Lương thực tập cao bất thường (${(topSalary / 1_000_000).toLocaleString("vi-VN")} triệu/tháng).`);

  const { signals } = input;
  if (signals.resubmittedUnchanged) add("RESUBMITTED_UNCHANGED", "Tin gửi lại sau khi bị từ chối nhưng chưa sửa nội dung.");
  if (signals.rejectionCount >= T.rejectedManyTimes) add("REJECTED_MANY_TIMES", `Tin đã bị từ chối ${signals.rejectionCount} lần.`);
}

function scoreCompany(signals: JobQualitySignals, add: IssueSink) {
  const days = T.companyHistoryDays;
  if (signals.companyRetractions > 0)
    add("COMPANY_RETRACTIONS", `Công ty có ${signals.companyRetractions} tin bị thu hồi trong ${days} ngày.`, signals.companyRetractions);
  if (signals.companyConfirmedReports > 0)
    add(
      "COMPANY_CONFIRMED_REPORTS",
      `Công ty có ${signals.companyConfirmedReports} báo cáo vi phạm đã xác nhận trong ${days} ngày.`,
      signals.companyConfirmedReports,
    );
  if (signals.companyOpenReports > 0)
    add("COMPANY_OPEN_REPORTS", `Công ty có ${signals.companyOpenReports} báo cáo vi phạm đang chờ xử lý.`, signals.companyOpenReports);
  if (
    signals.companySubmitCount >= T.companyHighRejectionMinSubmits &&
    signals.companyRejectCount / signals.companySubmitCount >= T.companyHighRejectionRatio
  )
    add("COMPANY_HIGH_REJECTION", `Công ty bị từ chối ${signals.companyRejectCount}/${signals.companySubmitCount} lần gửi duyệt.`);
  if (signals.companyApprovedCount === 0) add("COMPANY_NO_HISTORY", "Công ty chưa có tin nào được duyệt.");
}

// ─── Kết quả ──────────────────────────────────────────────────────────────

export function scoreJobPost(input: JobQualityInput, now: Date): JobQualityResult {
  const criteria: JobQualityCriterionResult[] = QUALITY_CRITERIA.map(({ key, label, weight }) => {
    const issues: JobQualityIssue[] = [];
    const add = sinkFor(issues);
    switch (key) {
      case "COMPLETENESS":
        scoreCompleteness(input, add);
        break;
      case "CONTENT":
        scoreContent(input, add);
        break;
      case "TRANSPARENCY":
        scoreTransparency(input, now, add);
        break;
      case "INTERNSHIP_FIT":
        scoreInternshipFit(input, add);
        break;
      case "RISK":
        scoreRisk(input, add);
        break;
      case "COMPANY":
        scoreCompany(input.signals, add);
        break;
    }
    const score = Math.max(0, 100 - issues.reduce((sum, i) => sum + i.penalty, 0));
    return { key, label, weight, score, issues };
  });

  const score = Math.round(criteria.reduce((sum, c) => sum + c.score * c.weight, 0) / 100);
  const flags = criteria.flatMap((c) => c.issues.map((i) => i.code)).filter((code) => QUALITY_BLOCKING_CODES.has(code));
  const belowFloor = criteria.some((c) => c.score < QUALITY_BANDS.criterionFloor);
  const belowHardFloor = criteria.some((c) => !QUALITY_HARD_FLOOR_EXEMPT.has(c.key) && c.score < QUALITY_BANDS.criterionHardFloor);

  let band: JobQualityBand;
  if (score < QUALITY_BANDS.rejectBelow || flags.length > 0 || belowHardFloor) band = "SUGGEST_REJECT";
  else if (score >= QUALITY_BANDS.approveMin && !belowFloor) band = "SUGGEST_APPROVE";
  else band = "NEEDS_REVIEW";

  return { score, band, version: QUALITY_SCORE_VERSION, criteria, flags, contentHash: contentHash(input) };
}

/**
 * Lý do từ chối tự sinh, cùng dạng chuỗi `RejectJobModal` ghép: `"<lý do chọn sẵn>. <chi tiết>."`.
 * Chỉ lấy lỗi có trong `QUALITY_REJECT_REASON` (không bao giờ có tiêu chí 6). null = không có
 * lỗi nào được phép đưa vào lý do ⇒ Admin phải tự ghi.
 */
export function buildRejectReason(result: Pick<JobQualityResult, "criteria">): string | null {
  const presets = new Set<string>();
  const details: string[] = [];
  for (const criterion of result.criteria) {
    for (const issue of criterion.issues) {
      const preset = QUALITY_REJECT_REASON[issue.code];
      if (!preset) continue;
      presets.add(preset);
      details.push(issue.message.replace(/\.$/, ""));
    }
  }
  if (details.length === 0) return null;
  const ordered = REJECT_PRESET_REASONS.filter((p) => presets.has(p));
  const detail = details.map((d, i) => (i === 0 ? d : d.charAt(0).toLowerCase() + d.slice(1))).join("; ");
  return `${ordered.join(", ")}. ${detail}.`;
}

/**
 * SHA-256 của nội dung tin (thứ tự cố định, khoảng trắng đã gộp, kỹ năng / ngành đã sắp theo
 * id). Không gồm hạn nộp và các cài đặt (tự mời, tự xử lý hồ sơ): đổi những thứ đó không phải
 * "sửa theo góp ý".
 */
export function contentHash(input: Omit<JobQualityInput, "signals" | "submittedAt" | "expiresAt">): string {
  const payload = [
    clean(input.title),
    clean(input.description),
    clean(input.requirements),
    clean(input.benefits),
    input.salaryMin,
    input.salaryMax,
    input.isNegotiable,
    input.jobType,
    input.cityId,
    input.industryId,
    clean(input.address),
    input.minExperienceYears,
    [...input.skills].sort((a, b) => a.skillId.localeCompare(b.skillId)).map((s) => [s.skillId, s.importance]),
    [...input.majors].sort((a, b) => a.majorId.localeCompare(b.majorId)).map((m) => [m.majorId, m.relevance]),
  ];
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
