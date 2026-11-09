// Bộ sinh dữ liệu demo lớn — phần 2b: lịch sử (đơn ứng tuyển + lịch sử trạng thái, lịch phỏng
// vấn, lời mời, hội thoại + tin nhắn, tin đã lưu, vài thông báo cho tài khoản demo).
// Đặc tả: docs/06-backend/large-demo-data/PLAN.md ("Lịch sử").
//
// Hàm thuần như phần 2a: nhận kết quả của generateLargeDemo + seed + giờ chạy, trả về các mảng
// đúng khuôn `createMany`. Dùng seed riêng (dẫn từ seed chung) nên đổi phần này không làm xê
// dịch dữ liệu phần 2a. Chọn tin để nộp / người để mời bằng chính bộ chấm của Job Matcher.
import type { ApplicationStatus, InterviewMode, NotificationType, OutreachInvitationStatus, Prisma } from "@prisma/client";
import { DEFAULT_OUTREACH_DAILY_QUOTA, INVITATION_EXPIRY_DAYS } from "../../../src/modules/candidate-outreach/candidate-outreach.config";
import { computeTotalExperienceYears } from "../../../src/modules/job-matching/candidate-experience.util";
import { HYBRID_WEIGHTS_V2, RULE_WEIGHTS_V1 } from "../../../src/modules/job-matching/job-matching.config";
import { ScoringJobMatcher } from "../../../src/modules/job-matching/scoring-job-matcher";
import type { NotificationPayloadMap } from "../../../src/modules/notifications/notification.types";
import { renderNotification } from "../../../src/modules/notifications/templates/notification-templates";
import type { CandidateMatchProfile, JobMatchProfile } from "../../../src/shared/ports/JobMatcher";
import { createRng, idOf, type CandidateFacts, type GeneratedLargeDemo, type JobFacts, type Rng } from "./generate";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const VN_OFFSET = 7 * HOUR;

export interface HistoryOptions {
  /** Seed chung của lần chạy (cùng seed với generateLargeDemo). */
  seed: number;
  now: Date;
}

export interface GeneratedHistory {
  applications: Prisma.ApplicationCreateManyInput[];
  statusHistory: Prisma.ApplicationStatusHistoryCreateManyInput[];
  interviews: Prisma.InterviewCreateManyInput[];
  invitations: Prisma.CandidateOutreachInvitationCreateManyInput[];
  conversations: Prisma.ConversationCreateManyInput[];
  messages: Prisma.MessageCreateManyInput[];
  savedJobs: Prisma.SavedJobCreateManyInput[];
  notifications: Prisma.NotificationCreateManyInput[];
  /**
   * Thông báo INTERVIEW_REMINDER đặt sẵn (đã đọc) cho ứng viên của mọi lịch sắp tới, đúng
   * `dedupeKey` của cron interview-reminder, để cron bỏ qua và không gửi email tới địa chỉ
   * demo (cách của seed-dashboard-demo.ts). Tách khỏi `notifications` vì không phải "chuông".
   */
  reminderGuards: Prisma.NotificationCreateManyInput[];
}

// ─── Tỉ lệ ──────────────────────────────────────────────────────────────────

/** Số tin mỗi ứng viên có CV nộp: 0–6, trung bình ~3 (PLAN: ~4.000–5.000 đơn). */
const APPLICATION_COUNT_WEIGHTS = { "0": 6, "1": 11, "2": 17, "3": 20, "4": 18, "5": 15, "6": 13 } as const;
/** Số tin mỗi ứng viên lưu: 0–5 (PLAN: ~3.000). */
const SAVED_COUNT_WEIGHTS = { "0": 20, "1": 15, "2": 20, "3": 20, "4": 15, "5": 10 } as const;
/** Số lời mời mỗi tin từng hiển thị (PLAN: ~300); tin chính luôn 3. */
const INVITATION_COUNT_WEIGHTS = { "0": 50, "1": 25, "2": 13, "3": 8, "4": 4 } as const;
/** Tỉ lệ nộp thêm một tin lệch hẳn hồ sơ (không chung kỹ năng nào). */
const OFF_TARGET_RATE = 0.1;

/**
 * Kết cục của đơn: P/R/S/I = đang ở Chờ duyệt / Đang xem xét / Rút gọn / Phỏng vấn, A = được nhận,
 * X* = bị từ chối ở bước đó, C = ứng viên huỷ. Đơn càng cũ càng đi xa trong quy trình.
 */
type Outcome = "P" | "R" | "S" | "I" | "A" | "XP" | "XR" | "XS" | "XI" | "C";
const OUTCOME_BY_AGE: { maxDays: number; weights: Record<Outcome, number> }[] = [
  { maxDays: 3, weights: { P: 75, R: 15, S: 2, I: 0, A: 0, XP: 6, XR: 0, XS: 0, XI: 0, C: 2 } },
  { maxDays: 10, weights: { P: 30, R: 28, S: 12, I: 2, A: 0, XP: 10, XR: 6, XS: 0, XI: 0, C: 4 } },
  { maxDays: 30, weights: { P: 10, R: 15, S: 12, I: 5, A: 1, XP: 16, XR: 12, XS: 6, XI: 2, C: 5 } },
  { maxDays: Infinity, weights: { P: 5, R: 6, S: 6, I: 3, A: 4, XP: 22, XR: 17, XS: 9, XI: 3, C: 6 } },
];
const OUTCOME_STEPS: Record<Outcome, ApplicationStatus[]> = {
  P: [],
  R: ["REVIEWING"],
  S: ["REVIEWING", "SHORTLISTED"],
  I: ["REVIEWING", "SHORTLISTED", "INTERVIEWING"],
  A: ["REVIEWING", "SHORTLISTED", "INTERVIEWING", "ACCEPTED"],
  XP: ["REJECTED"],
  XR: ["REVIEWING", "REJECTED"],
  XS: ["REVIEWING", "SHORTLISTED", "REJECTED"],
  XI: ["REVIEWING", "SHORTLISTED", "INTERVIEWING", "REJECTED"],
  C: ["CANCELLED"],
};
const ADVANCED: Outcome[] = ["S", "I", "A"];
const REJECTED: Outcome[] = ["XP", "XR", "XS", "XI"];

// ─── Văn bản ────────────────────────────────────────────────────────────────

const COVER_LETTERS = [
  "Em xin ứng tuyển vị trí {title} tại {company}. Em đã đọc kỹ mô tả công việc và thấy phù hợp với những gì em đã học và đã làm. Mong anh/chị xem xét hồ sơ của em.",
  "Kính gửi anh/chị phụ trách tuyển dụng, em rất quan tâm tới vị trí {title}. Em có thể sắp xếp thời gian làm việc theo yêu cầu của công ty và sẵn sàng tham gia phỏng vấn.",
  "Em mong có cơ hội làm việc cùng đội ngũ {company}. Em đã đính kèm CV, nếu cần thêm sản phẩm hay bài làm mẫu em xin gửi bổ sung ạ.",
  "Em ứng tuyển vị trí {title} vì muốn được làm việc trong môi trường thực tế và học hỏi từ những người có kinh nghiệm. Em cảm ơn anh/chị đã đọc hồ sơ.",
];
const POSITIVE_NOTES = [
  "Kỹ năng khớp phần lớn yêu cầu, nên hẹn phỏng vấn.",
  "Dự án cá nhân làm khá kỹ, giao tiếp tốt.",
  "Phản hồi nhanh, thái độ cầu tiến.",
  "Cần hỏi thêm về thời gian làm việc mỗi tuần.",
  "Kinh nghiệm thực tế còn ít nhưng nền tảng chắc.",
];
const NEGATIVE_NOTES = [
  "Chưa đáp ứng kỹ năng chính của vị trí.",
  "Đã đủ chỉ tiêu cho đợt tuyển này.",
  "Thời gian làm việc không khớp với yêu cầu.",
  "Hồ sơ còn sơ sài, chưa thấy kinh nghiệm liên quan.",
];
const INTERVIEW_NOTES = [
  "Bạn vui lòng vào phòng họp trước 5 phút.",
  "Buổi phỏng vấn gồm phần trao đổi kinh nghiệm và một bài tập nhỏ.",
  "Bạn mang theo CV bản in và laptop nếu có.",
  "Bạn chuẩn bị phần giới thiệu ngắn về một dự án bạn tâm đắc nhất.",
];
const INTERVIEW_CANCEL_REASONS = [
  "Người phỏng vấn có việc đột xuất, bên mình sẽ hẹn lại lịch khác.",
  "Ứng viên xin đổi lịch do trùng lịch thi.",
  "Phòng họp không còn trống, bên mình đã đặt lại lịch mới.",
];

type Side = "E" | "C";
type ConversationKind = "invitation" | "interview" | "question";
/** Kịch bản hội thoại; mỗi hội thoại lấy 2–6 câu đầu. {ten} = tên gọi, {title} = tiêu đề tin. */
const MESSAGE_SCRIPTS: Record<ConversationKind, [Side, string][][]> = {
  invitation: [
    [
      ["E", "Chào {ten}, cảm ơn bạn đã nhận lời mời cho vị trí {title}. Bạn có thể cho mình biết thời gian rảnh trong tuần này để trao đổi thêm không?"],
      ["C", "Dạ em chào anh/chị. Em cảm ơn anh/chị đã quan tâm tới hồ sơ của em. Em rảnh các buổi chiều từ thứ Ba đến thứ Năm ạ."],
      ["E", "Vậy chiều thứ Tư được không bạn? Mình sẽ gửi đường dẫn cuộc gọi trước một ngày."],
      ["C", "Dạ được ạ. Em có cần chuẩn bị gì trước không ạ?"],
      ["E", "Bạn xem lại các dự án đã ghi trong hồ sơ, bên mình sẽ hỏi chủ yếu về phần đó."],
      ["C", "Dạ vâng, em cảm ơn anh/chị ạ."],
    ],
    [
      ["C", "Dạ em chào anh/chị, em đã nhận lời mời vị trí {title}. Em muốn hỏi thêm về thời gian làm việc ạ."],
      ["E", "Chào {ten}, thời gian làm việc bên mình khá linh hoạt, mình sẽ trao đổi cụ thể khi gặp bạn."],
      ["C", "Dạ em hiểu rồi ạ. Khi nào có lịch trao đổi thì anh/chị báo giúp em nhé."],
      ["E", "Mình sẽ nhắn bạn trong tuần này. Bạn ứng tuyển trên tin giúp mình để bên mình xem đủ hồ sơ nhé."],
      ["C", "Dạ vâng, em cảm ơn anh/chị."],
    ],
  ],
  interview: [
    [
      ["E", "Chào {ten}, bên mình đã xem hồ sơ ứng tuyển vị trí {title} và đã gửi lịch phỏng vấn cho bạn qua hệ thống."],
      ["C", "Dạ em đã nhận được lịch ạ. Em cảm ơn anh/chị."],
      ["E", "Buổi phỏng vấn khoảng 45 phút, gồm phần giới thiệu và trao đổi về kinh nghiệm của bạn."],
      ["C", "Dạ vâng. Nếu em cần đổi giờ thì em báo trước bao lâu là được ạ?"],
      ["E", "Bạn báo trước ít nhất một ngày giúp mình nhé."],
      ["C", "Dạ em nhớ rồi ạ."],
    ],
    [
      ["C", "Dạ em chào anh/chị, em là {ten}, ứng viên vị trí {title}. Em muốn xác nhận lại lịch phỏng vấn ạ."],
      ["E", "Chào {ten}, bạn xem giờ và hình thức trong mục lịch phỏng vấn nhé, nếu có thay đổi mình sẽ cập nhật ở đó."],
      ["C", "Dạ em cảm ơn ạ. Em có cần chuẩn bị gì thêm không ạ?"],
      ["E", "Bạn chuẩn bị phần giới thiệu ngắn về bản thân và một dự án bạn tâm đắc nhất."],
      ["C", "Dạ vâng ạ."],
    ],
  ],
  question: [
    [
      ["C", "Dạ em chào anh/chị, em vừa ứng tuyển vị trí {title}. Cho em hỏi khi nào bên mình phản hồi kết quả sơ loại ạ?"],
      ["E", "Chào {ten}, bên mình thường phản hồi trong khoảng một đến hai tuần sau khi nhận hồ sơ."],
      ["C", "Dạ em cảm ơn anh/chị ạ."],
      ["E", "Không có gì, chúc bạn may mắn."],
    ],
    [
      ["C", "Dạ em chào anh/chị, em đã gửi hồ sơ vị trí {title}. Em muốn hỏi vị trí này có làm việc tại văn phòng không ạ?"],
      ["E", "Chào {ten}, bạn làm tại văn phòng là chính, có thể làm từ xa một số buổi khi đã quen việc."],
      ["C", "Dạ em hiểu rồi ạ, em cảm ơn."],
    ],
  ],
};

// ─── Tiện ích ───────────────────────────────────────────────────────────────

const asDate = (value: Date | string | null | undefined): Date => {
  if (value === null || value === undefined) throw new Error("Thiếu mốc thời gian");
  return value instanceof Date ? value : new Date(value);
};
const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
const pairKey = (candidateId: string, jobId: string) => `${candidateId}|${jobId}`;
const vnDayKey = (ms: number) => Math.floor((ms + VN_OFFSET) / DAY);

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Bốc `count` phần tử không lặp, xác suất theo trọng số. */
function weightedSample<T>(rng: Rng, items: readonly T[], count: number, weight: (item: T) => number): T[] {
  const pool = items.map((item) => ({ item, w: Math.max(0, weight(item)) }));
  const chosen: T[] = [];
  while (chosen.length < count && pool.length > 0) {
    const total = pool.reduce((sum, entry) => sum + entry.w, 0);
    let index = pool.length - 1;
    if (total > 0) {
      let roll = rng.next() * total;
      for (let i = 0; i < pool.length; i++) {
        roll -= pool[i]!.w;
        if (roll < 0) {
          index = i;
          break;
        }
      }
    } else {
      index = Math.floor(rng.next() * pool.length);
    }
    chosen.push(pool[index]!.item);
    pool.splice(index, 1);
  }
  return chosen;
}

/** Khung giờ phỏng vấn đầu tiên ≥ `fromMs`: ngày thường, 8:30–16:30 giờ Việt Nam, bước 30 phút. */
function interviewSlot(rng: Rng, fromMs: number): number {
  let dayStart = vnDayKey(fromMs) * DAY - VN_OFFSET;
  for (let i = 0; i < 10; i++, dayStart += DAY) {
    const weekday = new Date(dayStart + VN_OFFSET).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const slots: number[] = [];
    for (let minutes = 8 * 60 + 30; minutes <= 16 * 60 + 30; minutes += 30) {
      const slot = dayStart + minutes * MINUTE;
      if (slot >= fromMs) slots.push(slot);
    }
    if (slots.length > 0) return rng.pick(slots);
  }
  throw new Error("Không tìm được khung giờ phỏng vấn");
}

const roundTo30Min = (ms: number) => Math.ceil(ms / (30 * MINUTE)) * 30 * MINUTE;
const givenName = (fullName: string) => fullName.split(" ").pop() ?? fullName;

// ─── Hồ sơ cho bộ chấm ──────────────────────────────────────────────────────

function buildCandidateProfiles(demo: GeneratedLargeDemo, now: Date): Map<string, CandidateMatchProfile> {
  const skills = groupBy(demo.candidateSkills, (s) => s.candidateId);
  const experiences = groupBy(demo.workExperiences, (e) => e.candidateId);
  const educations = groupBy(demo.educations, (e) => e.candidateId);
  const profiles = new Map<string, CandidateMatchProfile>();
  for (const candidate of demo.candidates) {
    const id = candidate.id!;
    const exp = experiences.get(id) ?? [];
    const edu = educations.get(id) ?? [];
    const ownSkills = (skills.get(id) ?? []).map((s) => ({ skillId: s.skillId, name: s.skillId, yearsOfExperience: s.yearsOfExperience ?? 0 }));
    profiles.set(id, {
      candidateId: id,
      skills: ownSkills,
      totalExperienceYears: computeTotalExperienceYears(
        exp.map((e) => ({ startDate: e.startDate ? asDate(e.startDate) : null, endDate: e.endDate ? asDate(e.endDate) : null, isCurrent: e.isCurrent ?? false })),
        now,
      ),
      educations: edu.map((e) => ({ majorId: e.majorId ?? null, majorName: null, degree: e.degree ?? null })),
      completeness: {
        hasSkills: ownSkills.length > 0,
        hasWorkExperience: exp.length > 0,
        hasEducation: edu.length > 0,
        hasHeadlineOrBio: Boolean(candidate.headline || candidate.bio),
      },
      matchText: "",
    });
  }
  return profiles;
}

function buildJobProfiles(demo: GeneratedLargeDemo): Map<string, JobMatchProfile> {
  const skills = groupBy(demo.jobPostSkills, (s) => s.jobPostId);
  const majors = groupBy(demo.jobPostMajors, (m) => m.jobPostId);
  const profiles = new Map<string, JobMatchProfile>();
  for (const job of demo.jobPosts) {
    const id = job.id!;
    profiles.set(id, {
      jobPostId: id,
      skills: (skills.get(id) ?? []).map((s) => ({
        skillId: s.skillId, name: s.skillId, importance: s.importance ?? "REQUIRED", minYears: s.minYears ?? null,
      })),
      minExperienceYears: job.minExperienceYears ?? null,
      majors: (majors.get(id) ?? []).map((m) => ({ majorId: m.majorId, name: m.majorId, relevance: m.relevance ?? "PRIMARY" })),
      matchText: "",
    });
  }
  return profiles;
}

// ─── Bộ sinh ────────────────────────────────────────────────────────────────

interface ApplicationRecord {
  id: string;
  candidate: CandidateFacts;
  job: JobFacts;
  appliedAt: number;
  status: ApplicationStatus;
  /** Các lần chuyển trạng thái sau dòng khởi tạo PENDING. */
  transitions: { status: ApplicationStatus; at: number }[];
  /** Mốc chuyển sang INTERVIEWING (nếu có). */
  interviewingAt: number | null;
  upcomingInterview: { id: string; at: number; createdAt: number; durationMinutes: number; mode: InterviewMode; location: string; note: string | null } | null;
}

export function generateLargeDemoHistory(demo: GeneratedLargeDemo, options: HistoryOptions): GeneratedHistory {
  const rng = createRng((options.seed ^ 0x5bd1e995) >>> 0);
  const nowMs = options.now.getTime();
  const out: GeneratedHistory = {
    applications: [], statusHistory: [], interviews: [], invitations: [], conversations: [], messages: [], savedJobs: [], notifications: [], reminderGuards: [],
  };
  const counters = { app: 0, ash: 0, itv: 0, inv: 0, conv: 0, msg: 0, save: 0, noti: 0, remi: 0 };
  const nextId = (kind: keyof typeof counters) => idOf(kind, ++counters[kind]);

  const candidateProfiles = buildCandidateProfiles(demo, options.now);
  const jobProfiles = buildJobProfiles(demo);
  const selectionMatcher = new ScoringJobMatcher(HYBRID_WEIGHTS_V2); // không có cosine ⇒ chia lại cho kỹ năng / kinh nghiệm / ngành
  const ruleMatcher = new ScoringJobMatcher(RULE_WEIGHTS_V1); // điểm lời mời lúc seed: đúng cấu hình service dùng khi chưa có embedding

  const postById = new Map(demo.jobPosts.map((p) => [p.id!, p]));
  const companyNameById = new Map(demo.companies.map((c) => [c.id!, c.name]));
  const cvUploadedAt = new Map(demo.cvs.map((cv) => [cv.id!, asDate(cv.uploadedAt).getTime()]));
  const titleOf = (job: JobFacts) => postById.get(job.id)!.title;
  const companyOf = (job: JobFacts) => companyNameById.get(job.companyId) ?? "";

  // Tin từng hiển thị (đang hiển thị, đã đóng, đã hết hạn): khoảng thời gian nhận đơn / lời mời.
  const listedJobs = demo.facts.jobs.filter((job) => job.publishedAt !== null);
  const windowEnd = (job: JobFacts) =>
    Math.min(job.closedAt?.getTime() ?? Infinity, job.expiresAt?.getTime() ?? Infinity, nowMs);
  const isOpenNow = (job: JobFacts) => job.status === "PUBLISHED" && (job.expiresAt?.getTime() ?? Infinity) > nowMs;
  const jobsBySkill = new Map<string, JobFacts[]>();
  for (const job of listedJobs) {
    for (const skill of jobProfiles.get(job.id)!.skills) {
      const list = jobsBySkill.get(skill.skillId) ?? [];
      list.push(job);
      jobsBySkill.set(skill.skillId, list);
    }
  }
  const jobsSharingSkill = (candidate: CandidateFacts): JobFacts[] => {
    const seen = new Set<string>();
    const result: JobFacts[] = [];
    for (const skill of candidateProfiles.get(candidate.id)!.skills) {
      for (const job of jobsBySkill.get(skill.skillId) ?? []) {
        if (seen.has(job.id)) continue;
        seen.add(job.id);
        result.push(job);
      }
    }
    // Thứ tự theo danh sách tin (không theo thứ tự kỹ năng) cho dễ đoán.
    const order = new Map(listedJobs.map((job, index) => [job.id, index]));
    return result.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  };
  const selectionCache = new Map<string, number>();
  const selectionScore = (candidate: CandidateFacts, job: JobFacts): number => {
    const key = pairKey(candidate.id, job.id);
    let score = selectionCache.get(key);
    if (score === undefined) {
      const result = selectionMatcher.match({
        candidate: candidateProfiles.get(candidate.id)!, job: jobProfiles.get(job.id)!, semanticSimilarity: null,
      });
      score = result.score ?? 0;
      selectionCache.set(key, score);
    }
    return score;
  };
  const pickWeight = (score: number) => (score / 100) ** 2 + 0.02;

  // ── Đơn ứng tuyển: chọn tin ──
  interface Plan { candidate: CandidateFacts; job: JobFacts; appliedAt: number; score: number }
  const plans: Plan[] = [];
  const appliedPairs = new Set<string>();
  for (const candidate of demo.facts.candidates) {
    if (!candidate.cvId) continue;
    const earliest = cvUploadedAt.get(candidate.cvId)! + HOUR;
    const openWindow = (job: JobFacts): [number, number] | null => {
      const lo = Math.max(job.publishedAt!.getTime() + HOUR, earliest);
      const hi = windowEnd(job) - HOUR;
      return hi - lo > HOUR ? [lo, hi] : null;
    };
    const allowed = (job: JobFacts) => job.id !== candidate.showcaseJobId && openWindow(job) !== null;
    let count = Number(rng.weighted(APPLICATION_COUNT_WEIGHTS));
    if (candidate.tier === "so-sai") count = Math.min(count, 2);
    if (candidate.demoLogin) count = Math.max(count, 3);
    const options = jobsSharingSkill(candidate).filter(allowed);
    const chosen = weightedSample(rng, options, count, (job) => pickWeight(selectionScore(candidate, job)));
    if (count > 0 && rng.chance(OFF_TARGET_RATE)) {
      const shared = new Set(options.map((job) => job.id));
      const offTarget = listedJobs.filter((job) => !shared.has(job.id) && allowed(job));
      if (offTarget.length > 0) chosen.push(rng.pick(offTarget));
    }
    for (const job of chosen) {
      const [lo, hi] = openWindow(job)!;
      // Đơn dồn về những ngày đầu sau khi tin đăng.
      const appliedAt = Math.round(lo + (hi - lo) * rng.next() ** 1.6);
      plans.push({ candidate, job, appliedAt, score: selectionScore(candidate, job) });
      appliedPairs.add(pairKey(candidate.id, job.id));
    }
  }

  // Mỗi công ty vài đơn Chờ duyệt đã 20–60 ngày ở tin còn hiển thị (PLAN, cho 0.4).
  const forced = new Map<Plan, "P" | "I-upcoming">();
  const plansByCompany = groupBy(plans, (plan) => plan.job.companyId);
  for (const company of demo.companies) {
    const stale = (plansByCompany.get(company.id!) ?? []).filter((plan) => {
      const ageDays = (nowMs - plan.appliedAt) / DAY;
      return plan.job.status === "PUBLISHED" && ageDays >= 20 && ageDays <= 60;
    });
    for (const plan of rng.sample(stale, rng.int(2, 4))) forced.set(plan, "P");
  }
  // Ứng viên đăng nhập demo: một đơn đang phỏng vấn có lịch sắp tới (nếu có đơn đủ cũ).
  for (const candidate of demo.facts.candidates.filter((c) => c.demoLogin)) {
    const best = plans
      .filter((plan) => plan.candidate === candidate && !forced.has(plan) && plan.job.status === "PUBLISHED" && nowMs - plan.appliedAt >= 4 * DAY)
      .sort((a, b) => b.score - a.score)[0];
    if (best) forced.set(best, "I-upcoming");
  }

  // ── Đơn ứng tuyển: trạng thái, lịch sử, lịch phỏng vấn ──
  const records: ApplicationRecord[] = [];
  const endLimit = nowMs - 20 * MINUTE;
  for (const plan of plans) {
    const { candidate, job, appliedAt, score } = plan;
    const ageDays = (nowMs - appliedAt) / DAY;
    const force = forced.get(plan);
    let outcome: Outcome;
    if (force === "P") outcome = "P";
    else if (force === "I-upcoming") outcome = "I";
    else {
      const weights = { ...OUTCOME_BY_AGE.find((bucket) => ageDays <= bucket.maxDays)!.weights };
      const fit = score / 100; // hồ sơ càng hợp càng hay đi tiếp, càng lệch càng hay bị từ chối
      for (const key of ADVANCED) weights[key] *= 0.2 + 2 * fit ** 2;
      for (const key of REJECTED) weights[key] *= 2.2 - 1.8 * fit;
      outcome = rng.weighted(weights);
    }
    let steps = OUTCOME_STEPS[outcome];
    if (endLimit - appliedAt < (steps.length + 1) * HOUR) {
      outcome = "P";
      steps = [];
    }
    const upcoming = outcome === "I" && (force === "I-upcoming" || rng.chance(0.55));
    const pastInterview = steps.includes("INTERVIEWING") && !upcoming;
    const employerUserId = job.employerUserId;
    const id = nextId("app");
    const post = postById.get(job.id)!;

    // Mốc thời gian: đi tới từng bước, mỗi bước lấy một phần khoảng còn lại.
    const transitions: { status: ApplicationStatus; at: number }[] = [];
    let interviewingAt: number | null = null;
    let pastInterviewAt: number | null = null;
    let t = appliedAt;
    const eventsLeft = (k: number) => steps.length - k + (pastInterview && interviewingAt === null ? 1 : 0);
    for (let k = 0; k < steps.length; k++) {
      const status = steps[k]!;
      const left = eventsLeft(k);
      t += Math.max(10 * MINUTE, ((endLimit - t) / (left + 1)) * (0.25 + 0.75 * rng.next()));
      if (status === "INTERVIEWING" && upcoming) {
        // Chuyển sang phỏng vấn vài ngày gần đây rồi hẹn lịch trong 14 ngày tới.
        t = Math.min(endLimit, Math.max(t, nowMs - (12 + 108 * rng.next()) * HOUR));
      }
      t = Math.min(t, endLimit - (steps.length - k - 1) * 30 * MINUTE);
      transitions.push({ status, at: t });
      if (status === "INTERVIEWING") {
        interviewingAt = t;
        if (pastInterview) {
          const remainingAfter = steps.length - k - 1;
          const latest = endLimit - remainingAfter * 30 * MINUTE - 60 * MINUTE;
          const raw = t + Math.max(2 * HOUR, ((latest - t) / (remainingAfter + 1)) * (0.4 + 0.6 * rng.next()));
          let slot = raw < latest ? interviewSlot(rng, raw) : latest;
          if (slot > latest) slot = Math.min(latest, Math.max(t + HOUR, roundTo30Min(raw)));
          pastInterviewAt = Math.max(t + 30 * MINUTE, Math.min(slot, latest));
          t = pastInterviewAt + 60 * MINUTE;
        }
      }
    }
    const status: ApplicationStatus = steps.length > 0 ? steps[steps.length - 1]! : "PENDING";

    // Lịch phỏng vấn.
    let upcomingInterview: ApplicationRecord["upcomingInterview"] = null;
    if (interviewingAt !== null) {
      const durationMinutes = rng.pick([30, 45, 45, 60]);
      const mode: InterviewMode = rng.chance(0.6) ? "ONLINE" : "ONSITE";
      const code = () => Array.from({ length: 3 }, () => String.fromCharCode(97 + rng.int(0, 25))).join("");
      const location = mode === "ONLINE" ? `https://meet.google.com/${code()}-${code()}${code().slice(0, 1)}-${code()}` : post.address ?? "";
      const note = rng.chance(0.5) ? rng.pick(INTERVIEW_NOTES) : null;
      const scheduledAt = upcoming ? interviewSlot(rng, nowMs + (12 + rng.next() * 10 * 24) * HOUR) : pastInterviewAt!;
      let createdAt = interviewingAt;
      // ~8% từng có một lịch bị huỷ rồi hẹn lại.
      if (rng.chance(0.08)) {
        const cancelAt = interviewingAt + rng.int(2, 20) * HOUR;
        if (cancelAt + HOUR < Math.min(nowMs, scheduledAt - HOUR)) {
          out.interviews.push({
            id: nextId("itv"), applicationId: id, scheduledAt: new Date(interviewSlot(rng, interviewingAt + DAY)), durationMinutes,
            mode, location, note, status: "CANCELLED", cancelReason: rng.pick(INTERVIEW_CANCEL_REASONS), createdById: employerUserId,
            createdAt: new Date(interviewingAt), updatedAt: new Date(cancelAt),
          });
          createdAt = cancelAt + rng.int(10, 50) * MINUTE;
        }
      }
      const interviewId = nextId("itv");
      out.interviews.push({
        id: interviewId, applicationId: id, scheduledAt: new Date(scheduledAt), durationMinutes, mode, location, note,
        status: "SCHEDULED", cancelReason: null, createdById: employerUserId, createdAt: new Date(createdAt), updatedAt: new Date(createdAt),
      });
      if (upcoming) upcomingInterview = { id: interviewId, at: scheduledAt, createdAt, durationMinutes, mode, location, note };
    }

    // Lịch sử trạng thái: dòng khởi tạo do ứng viên, các bước sau do nhà tuyển dụng (huỷ do ứng viên).
    out.statusHistory.push({ id: nextId("ash"), applicationId: id, fromStatus: null, toStatus: "PENDING", actorId: candidate.userId, createdAt: new Date(appliedAt) });
    let previous: ApplicationStatus = "PENDING";
    for (const step of transitions) {
      out.statusHistory.push({
        id: nextId("ash"), applicationId: id, fromStatus: previous, toStatus: step.status,
        actorId: step.status === "CANCELLED" ? candidate.userId : employerUserId, createdAt: new Date(step.at),
      });
      previous = step.status;
    }

    const reviewed = transitions.some((step) => step.status !== "CANCELLED");
    const rating = reviewed && rng.chance(0.4)
      ? Math.min(5, Math.max(1, Math.round(score / 20) + rng.int(-1, 1)))
      : null;
    const employerNotes = !reviewed || !rng.chance(0.25) ? null
      : status === "REJECTED" ? rng.pick(NEGATIVE_NOTES)
      : ["SHORTLISTED", "INTERVIEWING", "ACCEPTED"].includes(status) ? rng.pick(POSITIVE_NOTES) : null;
    const lastAt = transitions.length > 0 ? transitions[transitions.length - 1]!.at : appliedAt;
    out.applications.push({
      id, jobPostId: job.id, candidateId: candidate.id, cvId: candidate.cvId!, status,
      coverLetter: rng.chance(0.4) ? fill(rng.pick(COVER_LETTERS), { title: titleOf(job), company: companyOf(job) }) : null,
      employerNotes, rating, createdAt: new Date(appliedAt), updatedAt: new Date(lastAt),
    });
    records.push({ id, candidate, job, appliedAt, status, transitions, interviewingAt, upcomingInterview });
  }

  // ── Lời mời ──
  const quotaUsed = new Map<string, number>();
  const takeQuota = (companyId: string, at: number) => {
    const key = `${companyId}|${vnDayKey(at)}`;
    const used = quotaUsed.get(key) ?? 0;
    if (used >= DEFAULT_OUTREACH_DAILY_QUOTA) return false;
    quotaUsed.set(key, used + 1);
    return true;
  };
  const openCandidates = demo.facts.candidates.filter((c) => c.isOpenToOutreach);
  const candidatesBySkill = new Map<string, CandidateFacts[]>();
  for (const candidate of openCandidates) {
    for (const skill of candidateProfiles.get(candidate.id)!.skills) {
      const list = candidatesBySkill.get(skill.skillId) ?? [];
      list.push(candidate);
      candidatesBySkill.set(skill.skillId, list);
    }
  }
  const invitedPairs = new Set<string>();
  interface InvitationRecord { id: string; candidate: CandidateFacts; job: JobFacts; status: OutreachInvitationStatus; createdAt: number; respondedAt: number | null; score: number | null }
  const invitations: InvitationRecord[] = [];
  const pushInvitation = (candidate: CandidateFacts, job: JobFacts, createdAt: number, status: OutreachInvitationStatus, respondedAt: number | null) => {
    const result = ruleMatcher.match({ candidate: candidateProfiles.get(candidate.id)!, job: jobProfiles.get(job.id)!, semanticSimilarity: null });
    const id = nextId("inv");
    const score = result.status === "SCORED" ? result.score : null;
    out.invitations.push({
      id, companyId: job.companyId, employerId: job.employerId, jobPostId: job.id, candidateId: candidate.id, status,
      createdAt: new Date(createdAt), expiresAt: new Date(createdAt + INVITATION_EXPIRY_DAYS * DAY),
      respondedAt: respondedAt === null ? null : new Date(respondedAt),
      matchScore: score, matchWeightsVersion: score === null ? null : result.weightsVersion,
    });
    invitedPairs.add(pairKey(candidate.id, job.id));
    invitations.push({ id, candidate, job, status, createdAt, respondedAt, score });
  };
  const eligibleForInvite = (candidate: CandidateFacts, job: JobFacts) =>
    candidate.isOpenToOutreach && candidate.showcaseJobId !== job.id &&
    !appliedPairs.has(pairKey(candidate.id, job.id)) && !invitedPairs.has(pairKey(candidate.id, job.id));

  for (const job of listedJobs) {
    const count = job.showcaseKey ? 3 : Number(rng.weighted(INVITATION_COUNT_WEIGHTS));
    if (count === 0) continue;
    const end = windowEnd(job) - HOUR;
    const seen = new Set<string>();
    const pool: { candidate: CandidateFacts; score: number }[] = [];
    for (const skill of jobProfiles.get(job.id)!.skills) {
      for (const candidate of candidatesBySkill.get(skill.skillId) ?? []) {
        if (seen.has(candidate.id)) continue;
        seen.add(candidate.id);
        if (!eligibleForInvite(candidate, job) || candidate.createdAt.getTime() > end - DAY) continue;
        const result = ruleMatcher.match({ candidate: candidateProfiles.get(candidate.id)!, job: jobProfiles.get(job.id)!, semanticSimilarity: null });
        if (result.score !== null) pool.push({ candidate, score: result.score });
      }
    }
    // Nhà tuyển dụng mời người điểm cao: bốc trong 30 người đầu, nghiêng về điểm cao.
    pool.sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));
    for (const { candidate } of weightedSample(rng, pool.slice(0, 30), count, (entry) => pickWeight(entry.score))) {
      const lo = Math.max(job.publishedAt!.getTime(), candidate.createdAt.getTime()) + HOUR;
      if (end - lo < HOUR) continue;
      let createdAt: number | null = null;
      for (let attempt = 0; attempt < 6 && createdAt === null; attempt++) {
        const at = Math.round(lo + (end - lo) * rng.next());
        if (takeQuota(job.companyId, at)) createdAt = at;
      }
      if (createdAt === null) continue;
      const fresh = nowMs - createdAt < INVITATION_EXPIRY_DAYS * DAY && isOpenNow(job);
      let status: OutreachInvitationStatus = fresh
        ? rng.weighted({ PENDING: 45, ACCEPTED: 35, DECLINED: 20 })
        : rng.weighted({ ACCEPTED: 40, DECLINED: 25, EXPIRED: 35 });
      let respondedAt: number | null = null;
      if (status === "ACCEPTED" || status === "DECLINED") {
        // Trả lời được khi lời mời còn hạn và tin còn hiển thị; cách giờ chạy ≥ 6 giờ để hội thoại kịp có tin nhắn.
        const deadline = Math.min(createdAt + INVITATION_EXPIRY_DAYS * DAY, nowMs - 6 * HOUR, windowEnd(job));
        const span = Math.min(deadline - createdAt, 5 * DAY);
        if (span < 2 * HOUR) status = fresh ? "PENDING" : "EXPIRED";
        else respondedAt = Math.round(createdAt + 2 * HOUR + (span - 2 * HOUR) * rng.next());
      }
      pushInvitation(candidate, job, createdAt, status, respondedAt);
    }
  }
  // Ứng viên đăng nhập demo: luôn có một lời mời đang chờ để trang Lời mời không trống.
  for (const candidate of demo.facts.candidates.filter((c) => c.demoLogin)) {
    if (invitations.some((inv) => inv.candidate === candidate && inv.status === "PENDING")) continue;
    const options = jobsSharingSkill(candidate)
      .filter((job) => isOpenNow(job) && eligibleForInvite(candidate, job) && job.publishedAt!.getTime() < nowMs - 2 * DAY)
      .map((job) => ({ job, score: selectionScore(candidate, job) }))
      .sort((a, b) => b.score - a.score || a.job.id.localeCompare(b.job.id));
    for (const { job } of options) {
      const createdAt = nowMs - rng.int(6, 72) * HOUR;
      if (!takeQuota(job.companyId, createdAt)) continue;
      pushInvitation(candidate, job, createdAt, "PENDING", null);
      break;
    }
  }

  // ── Hội thoại ──
  const pushConversation = (candidate: CandidateFacts, job: JobFacts, startAt: number, kind: ConversationKind) => {
    const latest = nowMs - 5 * MINUTE;
    if (latest - startAt < 30 * MINUTE) return;
    const script = rng.pick(MESSAGE_SCRIPTS[kind]);
    const count = rng.int(2, script.length);
    const span = Math.min(latest - startAt, count * 20 * HOUR);
    const times = Array.from({ length: count }, () => startAt + 5 * MINUTE + Math.round((span - 5 * MINUTE) * rng.next())).sort((a, b) => a - b);
    const id = nextId("conv");
    const values = { ten: givenName(candidate.fullName), title: titleOf(job) };
    const sender = (side: Side) => (side === "E" ? job.employerUserId : candidate.userId);
    const lines = script.slice(0, count);
    lines.forEach(([side, text], index) => {
      out.messages.push({ id: nextId("msg"), conversationId: id, senderId: sender(side), content: fill(text, values), createdAt: new Date(times[index]!) });
    });
    // Người gửi câu cuối đã đọc hết; phía kia ~65% đã đọc, còn lại có tin chưa đọc.
    const lastAt = times[times.length - 1]!;
    const lastSide = lines[lines.length - 1]![0];
    const readAt: Record<Side, number | null> = { E: null, C: null };
    readAt[lastSide] = lastAt;
    const other: Side = lastSide === "E" ? "C" : "E";
    if (rng.chance(0.65)) {
      readAt[other] = Math.min(nowMs, lastAt + rng.int(5, 300) * MINUTE);
    } else {
      const ownLast = lines.map(([side], index) => (side === other ? times[index]! : null)).filter((at): at is number => at !== null).pop();
      readAt[other] = ownLast ?? null;
    }
    out.conversations.push({
      id, jobPostId: job.id, candidateId: candidate.id, employerId: job.employerId,
      candidateLastReadAt: readAt.C === null ? null : new Date(readAt.C), employerLastReadAt: readAt.E === null ? null : new Date(readAt.E),
      createdAt: new Date(startAt), updatedAt: new Date(Math.max(lastAt, readAt.C ?? 0, readAt.E ?? 0)),
    });
  };
  for (const inv of invitations) {
    if (inv.status === "ACCEPTED") pushConversation(inv.candidate, inv.job, inv.respondedAt!, "invitation");
  }
  for (const record of records) {
    if (record.interviewingAt !== null && ["INTERVIEWING", "ACCEPTED"].includes(record.status) && rng.chance(0.6)) {
      pushConversation(record.candidate, record.job, record.interviewingAt + 10 * MINUTE, "interview");
    } else if (record.status === "SHORTLISTED" && rng.chance(0.25)) {
      pushConversation(record.candidate, record.job, record.transitions[record.transitions.length - 1]!.at + rng.int(1, 24) * HOUR, "question");
    } else if ((record.status === "PENDING" || record.status === "REVIEWING") && rng.chance(0.04)) {
      pushConversation(record.candidate, record.job, record.appliedAt + rng.int(1, 48) * HOUR, "question");
    }
  }

  // ── Tin đã lưu: tin hợp với mình, lưu trong lúc tin còn hiển thị ──
  for (const candidate of demo.facts.candidates) {
    const count = Number(rng.weighted(SAVED_COUNT_WEIGHTS));
    if (count === 0) continue;
    const createdAt = candidate.createdAt.getTime();
    const options = jobsSharingSkill(candidate).filter((job) => windowEnd(job) - Math.max(job.publishedAt!.getTime(), createdAt) > 2 * HOUR);
    for (const job of weightedSample(rng, options, count, (j) => pickWeight(selectionScore(candidate, j)))) {
      const lo = Math.max(job.publishedAt!.getTime(), createdAt) + HOUR;
      out.savedJobs.push({
        id: nextId("save"), candidateId: candidate.id, jobPostId: job.id,
        createdAt: new Date(Math.round(lo + (windowEnd(job) - lo) * rng.next())),
      });
    }
  }

  // ── Thông báo chưa đọc cho tài khoản demo (PLAN: "chỉ vài", để chuông không trống) ──
  const notify = <T extends NotificationType>(type: T, userId: string, data: NotificationPayloadMap[T], at: number) => {
    const rendered = renderNotification(type, data, { webBaseUrl: "" });
    out.notifications.push({
      id: nextId("noti"), userId, type, title: rendered.title, body: rendered.body ?? null, link: rendered.link ?? null,
      isRead: false, createdAt: new Date(at),
    });
  };
  const demoEmployerJobs = demo.facts.jobs.filter((job) => job.showcaseKey);
  const demoEmployers = [...new Map(demoEmployerJobs.map((job) => [job.employerUserId, job])).values()];
  for (const sample of demoEmployers) {
    const latest = records
      .filter((record) => record.job.companyId === sample.companyId)
      .sort((a, b) => b.appliedAt - a.appliedAt)
      .slice(0, 3);
    for (const record of latest) {
      notify("APPLICATION_RECEIVED", sample.employerUserId, {
        applicationId: record.id, jobPostId: record.job.id, jobPostTitle: titleOf(record.job), candidateName: record.candidate.fullName,
      }, record.appliedAt);
    }
    const responded = invitations
      .filter((inv) => inv.job.employerId === sample.employerId && inv.respondedAt !== null && nowMs - inv.respondedAt <= 7 * DAY)
      .sort((a, b) => b.respondedAt! - a.respondedAt!)[0];
    if (responded) {
      notify("CANDIDATE_OUTREACH_INVITATION_RESPONDED", sample.employerUserId, {
        invitationId: responded.id, jobPostId: responded.job.id, jobPostTitle: titleOf(responded.job),
        candidateName: responded.candidate.fullName, accepted: responded.status === "ACCEPTED",
      }, responded.respondedAt!);
    }
  }
  for (const candidate of demo.facts.candidates.filter((c) => c.demoLogin)) {
    for (const inv of invitations.filter((i) => i.candidate === candidate && i.status === "PENDING")) {
      notify("CANDIDATE_OUTREACH_INVITATION_RECEIVED", candidate.userId, {
        invitationId: inv.id, jobPostId: inv.job.id, jobPostTitle: titleOf(inv.job), companyName: companyOf(inv.job),
        expiresAt: new Date(inv.createdAt + INVITATION_EXPIRY_DAYS * DAY),
      }, inv.createdAt);
    }
    const own = records.filter((record) => record.candidate === candidate);
    for (const record of own) {
      const interview = record.upcomingInterview;
      if (!interview) continue;
      notify("INTERVIEW_SCHEDULED", candidate.userId, {
        interviewId: interview.id, applicationId: record.id, jobPostTitle: titleOf(record.job), companyName: companyOf(record.job),
        scheduledAt: new Date(interview.at), durationMinutes: interview.durationMinutes, mode: interview.mode,
        location: interview.location, note: interview.note,
      }, interview.createdAt);
    }
    const lastChange = own
      .flatMap((record) => record.transitions.map((step, index) => ({ record, step, from: index === 0 ? "PENDING" : record.transitions[index - 1]!.status })))
      .filter(({ step }) => step.status !== "CANCELLED" && step.status !== "INTERVIEWING" && nowMs - step.at <= 14 * DAY)
      .sort((a, b) => b.step.at - a.step.at)[0];
    if (lastChange) {
      notify("APPLICATION_STATUS_CHANGED", candidate.userId, {
        applicationId: lastChange.record.id, jobPostId: lastChange.record.job.id, jobPostTitle: titleOf(lastChange.record.job),
        companyName: companyOf(lastChange.record.job), oldStatus: lastChange.from, newStatus: lastChange.step.status,
      }, lastChange.step.at);
    }
  }

  // ── Chặn email nhắc lịch: cron interview-reminder bỏ qua lịch đã có thông báo cùng dedupeKey ──
  for (const record of records) {
    const interview = record.upcomingInterview;
    if (!interview) continue;
    const rendered = renderNotification("INTERVIEW_REMINDER", {
      interviewId: interview.id, applicationId: record.id, jobPostTitle: titleOf(record.job), companyName: companyOf(record.job),
      scheduledAt: new Date(interview.at), durationMinutes: interview.durationMinutes, mode: interview.mode,
      location: interview.location, note: interview.note, recipientRole: "CANDIDATE", candidateName: record.candidate.fullName,
    }, { webBaseUrl: "" });
    out.reminderGuards.push({
      id: nextId("remi"), userId: record.candidate.userId, type: "INTERVIEW_REMINDER", title: rendered.title,
      body: rendered.body ?? null, link: rendered.link ?? null, isRead: true, readAt: options.now, createdAt: options.now,
      dedupeKey: `INTERVIEW_REMINDER:${interview.id}:${record.candidate.userId}:${interview.at}`,
    });
  }

  return out;
}
