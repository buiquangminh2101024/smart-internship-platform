// Dữ liệu demo cho dashboard Employer (E11) — đặc tả:
// docs/06-backend/employer-dashboard-demo-data/PLAN.md
//
//   npm run seed-dashboard-demo -- --dry-run   chỉ ĐỌC DB, in ra sẽ xoá / tạo / cập nhật gì
//   npm run seed-dashboard-demo                xoá phần demo cũ rồi tạo lại (chạy lại bao nhiêu lần cũng được)
//   npm run seed-dashboard-demo -- --reset     chỉ xoá phần demo
//
// Chạy SAU `npm run seed-match-demo` (script đó đặt lại 10 tin của fixture).
//
// Phạm vi: chỉ công ty "Công ty Demo Job Matcher" và ứng viên @match-demo.local.
// Mọi dòng script tạo có id bắt đầu bằng ID_PREFIX; chạy lại / --reset chỉ xoá các
// dòng đó, nên dữ liệu thử tay của chủ dự án được giữ nguyên. Tiền tố là chữ
// thường + số, bắt đầu bằng "c" để vẫn qua `z.string().cuid()` (API nộp hồ sơ
// kiểm `cvId` như vậy) — nên không dùng "demo-dash-" như bản plan đầu.
//
// Không gửi email: ghi thẳng bằng Prisma (không qua NotificationsService), đếm
// outbox_events trước/sau và rollback nếu tăng. Thông báo nhắc lịch của ứng viên
// được tạo sẵn với đúng dedupeKey của cron interview-reminder để cron bỏ qua.
import { PrismaClient, type ApplicationStatus, type InterviewMode, type JobPostStatus, type Prisma } from "@prisma/client";
import { renderNotification } from "../src/modules/notifications/templates/notification-templates";
import type { NotificationPayloadMap } from "../src/modules/notifications/notification.types";
import { DEMO_COMPANY_NAME, DEMO_EMAIL_DOMAIN, DEMO_EMPLOYER_EMAIL } from "./lib/match-demo-fixture";

const ID_PREFIX = "cdemodash";
const CV_FILE_NAME = "cv-mau-demo.pdf";
const DEMO_PASSWORD_HINT = "123456789"; // do seed-match-demo đặt
const NOTIFICATION_CTX = { webBaseUrl: "http://localhost:3000" }; // chỉ dùng cho HTML email, không lưu

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const VN_OFFSET = 7 * HOUR;
const SUBSCRIPTION_PLAN_NAME = "Doanh nghiệp";
/** Mốc sớm nhất cho hạn tin (chủ dự án yêu cầu: không hết hạn trước tháng 12/2026). */
const EARLIEST_EXPIRY_BASE = "2026-12-01";
const INVITATION_EXPIRY_DAYS = 14;

const prisma = new PrismaClient();
type Tx = Prisma.TransactionClient;

function fail(message: string): never {
  throw new Error(message);
}

/** Phần tử thứ `i` (âm = tính từ cuối); thiếu thì dừng. */
function itemAt<T>(items: readonly T[], i: number): T {
  const item = items[i < 0 ? items.length + i : i];
  if (item === undefined) fail(`Thiếu phần tử ${i}`);
  return item;
}

/** id tự đặt cho dòng demo: chỉ chữ thường + số. */
function demoId(kind: string, key: string | number): string {
  const id = `${ID_PREFIX}${kind}${key}`.toLowerCase();
  if (!/^[0-9a-z]+$/.test(id)) fail(`id demo không hợp lệ: ${id}`);
  return id;
}
const isDemoId = { startsWith: ID_PREFIX };

// ─── Thời gian (giờ Việt Nam) ───────────────────────────────────────────────

const NOW = new Date();

/** Đầu ngày Việt Nam của `date`, cộng `days` ngày. */
function vnDayStart(date: Date, days = 0): Date {
  const vnMidnight = Math.floor((date.getTime() + VN_OFFSET) / DAY) * DAY;
  return new Date(vnMidnight - VN_OFFSET + days * DAY);
}
/** Ngày `dayOffset` so với hôm nay, lúc hh:mm giờ Việt Nam. */
function vnAt(dayOffset: number, hour: number, minute = 0): Date {
  return new Date(vnDayStart(NOW, dayOffset).getTime() + hour * HOUR + minute * 60 * 1000);
}
/** "YYYY-MM-DD" (ngày Việt Nam) lúc hh:mm giờ Việt Nam. */
function vnDateAt(isoDate: string, hour: number, minute = 0): Date {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) - VN_OFFSET + hour * HOUR + minute * 60 * 1000);
}
function ago(days: number, hours = 0): Date {
  return new Date(NOW.getTime() - days * DAY - hours * HOUR);
}
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY);
}
/** Số thứ tự ngày Việt Nam (để so sánh ngày). */
function vnDayNumber(date: Date): number {
  return Math.floor((date.getTime() + VN_OFFSET) / DAY);
}
/** Cột @db.Date lưu ngày Việt Nam dưới dạng nửa đêm UTC. */
function dbDateOfVnDay(dayNumber: number): Date {
  return new Date(dayNumber * DAY);
}
function fmt(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short", hour12: false });
}
function fmtDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

/** PRNG cố định (mulberry32) để chạy lại ra cùng số lượt xem. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Dữ liệu cố định ────────────────────────────────────────────────────────

/** Tên giả cho ứng viên chưa có tên (ứng viên đã có tên giữ nguyên). */
const CANDIDATE_NAMES: Record<string, string> = {
  "fe-react-03": "Nguyễn Minh Khang",
  "fe-typescript-04": "Trần Thu Hà",
  "backend-node-02": "Lê Hoàng Phúc",
  "backend-java-01": "Phạm Quốc Bảo",
  "data-ai-02": "Võ Ngọc Anh",
  "qa-03": "Đặng Thanh Tùng",
  "marketing-content-01": "Bùi Khánh Linh",
  "marketing-digital-02": "Hoàng Gia Huy",
  "accounting-01": "Ngô Thị Mai",
  "finance-02": "Đỗ Phương Thảo",
  "designer-01": "Huỳnh Bảo Ngọc",
  "mobile-02": "Phan Đức Thịnh",
  "irrelevant-experience-01": "Vũ Tiến Dũng",
  "sparse-profile-01": "Trịnh Hải Nam",
  "keyword-stuffing-01": "Lý Quang Vinh",
  "career-switch-01": "Mai Thùy Dương",
  "language-01": "Châu Mỹ Duyên",
  "logistics-01": "Tạ Văn Lộc",
  "it-adjacent-01": "Dương Minh Trí",
  "backend-sql-03": "Lâm Nhật Quang",
  "communication-02": "Cao Yến Nhi",
};

type FixtureJobKey = "fe" | "fep" | "node" | "java" | "data" | "qa" | "content" | "acc" | "ui" | "digital";
type NewJobKey = "rej" | "pend";
type JobKey = FixtureJobKey | NewJobKey;

interface FixtureJobPlan {
  title: string;
  status: Extract<JobPostStatus, "PUBLISHED" | "CLOSED" | "DRAFT">;
  /** Ngày đăng (giờ VN 09:00); null với tin nháp. */
  publishedOn: string | null;
  /** Hạn = mốc + số ngày. */
  expiryOffset: number;
  /** Lượt xem trung bình một ngày thường. */
  baseViews: number;
}

/** 10 tin của fixture `scripts/data/match-demo.json` (nhận theo tiêu đề). */
const FIXTURE_JOBS: Record<FixtureJobKey, FixtureJobPlan> = {
  acc: { title: "Thực tập sinh Kế toán", status: "PUBLISHED", publishedOn: "2026-09-21", expiryOffset: 2, baseViews: 6 },
  java: { title: "Thực tập sinh Java Backend", status: "PUBLISHED", publishedOn: "2026-09-21", expiryOffset: 9, baseViews: 12 },
  digital: { title: "Thực tập sinh Digital Marketing", status: "PUBLISHED", publishedOn: "2026-09-29", expiryOffset: 17, baseViews: 8 },
  fe: { title: "Thực tập sinh Frontend Web", status: "PUBLISHED", publishedOn: "2026-09-25", expiryOffset: 24, baseViews: 19 },
  node: { title: "Thực tập sinh Backend Node TypeScript", status: "PUBLISHED", publishedOn: "2026-09-23", expiryOffset: 31, baseViews: 17 },
  data: { title: "Thực tập sinh Data & AI", status: "PUBLISHED", publishedOn: "2026-10-06", expiryOffset: 38, baseViews: 10 },
  fep: { title: "Thực tập sinh Frontend Product", status: "PUBLISHED", publishedOn: "2026-10-14", expiryOffset: 45, baseViews: 9 },
  qa: { title: "Thực tập sinh QA Automation", status: "PUBLISHED", publishedOn: "2026-10-20", expiryOffset: 55, baseViews: 7 },
  content: { title: "Thực tập sinh Content Marketing", status: "CLOSED", publishedOn: "2026-09-24", expiryOffset: 20, baseViews: 7 },
  ui: { title: "Thực tập sinh Thiết kế UI", status: "DRAFT", publishedOn: null, expiryOffset: 50, baseViews: 0 },
};
const CLOSED_DAYS_AGO = 10;

interface NewJobPlan {
  title: string;
  status: Extract<JobPostStatus, "DRAFT" | "PENDING">;
  description: string;
  requirements: string;
  benefits: string | null;
  salaryMin: number;
  salaryMax: number;
  skills: string[];
  createdAt: Date;
  /** Thao tác kiểm duyệt theo thứ tự thời gian. */
  actions: Array<{ action: "SUBMITTED" | "REJECTED"; at: Date; reason?: string }>;
}

const REJECT_REASON = "Thiếu mô tả quyền lợi và mức phụ cấp";
const NEW_JOBS: Record<NewJobKey, NewJobPlan> = {
  rej: {
    title: "Thực tập sinh Chăm sóc khách hàng",
    status: "DRAFT",
    description: "Hỗ trợ trả lời câu hỏi của khách hàng qua điện thoại, email và kênh chat; ghi nhận phản hồi để chuyển cho bộ phận liên quan.",
    requirements: "Sinh viên năm 3–4 các ngành kinh tế, ngôn ngữ hoặc truyền thông; giao tiếp rõ ràng; sử dụng thành thạo Excel cơ bản.",
    benefits: null,
    salaryMin: 3_000_000,
    salaryMax: 4_000_000,
    skills: ["Giao tiếp", "Excel"],
    createdAt: ago(4, 3),
    actions: [
      { action: "SUBMITTED", at: ago(3, 6) },
      { action: "REJECTED", at: ago(2, 4), reason: REJECT_REASON },
    ],
  },
  pend: {
    title: "Thực tập sinh Business Analyst",
    status: "PENDING",
    description: "Cùng nhóm sản phẩm thu thập yêu cầu, viết tài liệu mô tả chức năng và phân tích số liệu sử dụng để đề xuất cải tiến.",
    requirements: "Sinh viên năm cuối Hệ thống thông tin, Kinh tế hoặc ngành gần; biết SQL cơ bản; trình bày ý tưởng mạch lạc.",
    benefits: "Phụ cấp 4–5 triệu đồng/tháng, hỗ trợ gửi xe, được hướng dẫn bởi BA chính thức, cơ hội nhận việc sau thực tập.",
    salaryMin: 4_000_000,
    salaryMax: 5_000_000,
    skills: ["SQL", "Excel", "Power BI", "Giao tiếp"],
    createdAt: ago(1, 5),
    actions: [{ action: "SUBMITTED", at: ago(1, 2) }],
  },
};

interface InterviewPlan {
  at: Date;
  mode: InterviewMode;
  /** Thời điểm tạo lịch (mặc định = lúc hồ sơ chuyển INTERVIEWING). */
  cancelled?: { reason: string; at: Date };
}
interface ApplicationPlan {
  key: string;
  job: FixtureJobKey;
  candidate: string; // ref
  createdAt: Date;
  /** Các lần đổi trạng thái sau khi nộp, theo thứ tự. */
  path: Array<[ApplicationStatus, Date]>;
  interview?: InterviewPlan;
}

const ONLINE_LINK = "https://meet.example.com/phong-van-demo";
const OFFICE_ADDRESS = "Tầng 5, 123 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh (địa chỉ demo)";

const APPLICATIONS: ApplicationPlan[] = [
  // Chờ duyệt: 4 trong 7 ngày qua, 2 từ 8–14 ngày trước.
  { key: "p1", job: "fe", candidate: "fe-react-03", createdAt: ago(0, 3), path: [] },
  { key: "p2", job: "node", candidate: "backend-sql-03", createdAt: ago(1, 2), path: [] },
  { key: "p3", job: "data", candidate: "career-switch-01", createdAt: ago(3, 5), path: [] },
  { key: "p4", job: "digital", candidate: "marketing-digital-02", createdAt: ago(5, 1), path: [] },
  { key: "p5", job: "fe", candidate: "sparse-profile-01", createdAt: ago(9, 4), path: [] },
  { key: "p6", job: "node", candidate: "keyword-stuffing-01", createdAt: ago(12, 6), path: [] },
  // Đang xem xét.
  { key: "r1", job: "fe", candidate: "keyword-stuffing-01", createdAt: ago(11, 3), path: [["REVIEWING", ago(10)]] },
  { key: "r2", job: "fep", candidate: "designer-01", createdAt: ago(15, 2), path: [["REVIEWING", ago(13)]] },
  { key: "r3", job: "acc", candidate: "logistics-01", createdAt: ago(20, 5), path: [["REVIEWING", ago(18)]] },
  // Danh sách rút gọn, chưa có lịch.
  { key: "s1", job: "node", candidate: "it-adjacent-01", createdAt: ago(16, 1), path: [["REVIEWING", ago(15)], ["SHORTLISTED", ago(13)]] },
  { key: "s2", job: "data", candidate: "finance-02", createdAt: ago(18, 3), path: [["REVIEWING", ago(17)], ["SHORTLISTED", ago(14)]] },
  { key: "s3", job: "fe", candidate: "fe-typescript-04", createdAt: ago(14, 2), path: [["REVIEWING", ago(13)], ["SHORTLISTED", ago(11)]] },
  // Mời phỏng vấn: 2 buổi trong 7 ngày qua, 3 buổi trong 7 ngày tới, 1 buổi ngày thứ 10.
  {
    key: "i1", job: "node", candidate: "backend-node-02", createdAt: ago(22, 2),
    path: [["REVIEWING", ago(21)], ["SHORTLISTED", ago(19)], ["INTERVIEWING", ago(17)]],
    interview: { at: vnAt(-3, 10), mode: "ONSITE" },
  },
  {
    key: "i2", job: "fe", candidate: "it-adjacent-01", createdAt: ago(19, 4),
    path: [["REVIEWING", ago(18)], ["SHORTLISTED", ago(16)], ["INTERVIEWING", ago(14)]],
    interview: { at: vnAt(-5, 14), mode: "ONLINE" },
  },
  {
    key: "i3", job: "java", candidate: "mobile-02", createdAt: ago(24, 1),
    path: [["REVIEWING", ago(23)], ["SHORTLISTED", ago(21)], ["INTERVIEWING", ago(6)]],
    interview: { at: vnAt(1, 9), mode: "ONLINE" },
  },
  {
    key: "i4", job: "data", candidate: "data-ai-02", createdAt: ago(17, 3),
    path: [["REVIEWING", ago(16)], ["SHORTLISTED", ago(14)], ["INTERVIEWING", ago(5)]],
    interview: { at: vnAt(2, 14), mode: "ONSITE" },
  },
  {
    key: "i5", job: "fep", candidate: "fe-typescript-04", createdAt: ago(13, 5),
    path: [["REVIEWING", ago(12)], ["SHORTLISTED", ago(10)], ["INTERVIEWING", ago(4)]],
    interview: { at: vnAt(4, 15, 30), mode: "ONLINE" },
  },
  {
    key: "i6", job: "node", candidate: "irrelevant-experience-01", createdAt: ago(21, 2),
    path: [["REVIEWING", ago(20)], ["SHORTLISTED", ago(18)], ["INTERVIEWING", ago(3)]],
    interview: { at: vnAt(10, 9, 30), mode: "ONSITE" },
  },
  // Được nhận (đã phỏng vấn từ lâu).
  {
    key: "a1", job: "content", candidate: "marketing-content-01", createdAt: ago(38, 3),
    path: [["REVIEWING", ago(37)], ["SHORTLISTED", ago(35)], ["INTERVIEWING", ago(34)], ["ACCEPTED", ago(28)]],
    interview: { at: vnAt(-31, 10), mode: "ONSITE" },
  },
  {
    key: "a2", job: "acc", candidate: "accounting-01", createdAt: ago(30, 2),
    path: [["REVIEWING", ago(29)], ["SHORTLISTED", ago(27)], ["INTERVIEWING", ago(26)], ["ACCEPTED", ago(20)]],
    interview: { at: vnAt(-23, 9, 30), mode: "ONSITE" },
  },
  // Bị từ chối (x3 có một lịch đã huỷ).
  { key: "x1", job: "content", candidate: "language-01", createdAt: ago(33, 4), path: [["REJECTED", ago(31)]] },
  { key: "x2", job: "node", candidate: "sparse-profile-01", createdAt: ago(26, 1), path: [["REVIEWING", ago(25)], ["REJECTED", ago(22)]] },
  {
    key: "x3", job: "java", candidate: "it-adjacent-01", createdAt: ago(23, 2),
    path: [["REVIEWING", ago(22)], ["SHORTLISTED", ago(20)], ["INTERVIEWING", ago(18)], ["REJECTED", ago(13)]],
    interview: { at: vnAt(-15, 10), mode: "ONLINE", cancelled: { reason: "Ứng viên báo bận đột xuất, chưa sắp xếp được lịch khác", at: ago(16) } },
  },
  { key: "x4", job: "digital", candidate: "communication-02", createdAt: ago(9, 3), path: [["REJECTED", ago(7)]] },
  // Đã huỷ (ứng viên tự huỷ).
  { key: "c1", job: "content", candidate: "communication-02", createdAt: ago(30, 6), path: [["CANCELLED", ago(28)]] },
  { key: "c2", job: "digital", candidate: "language-01", createdAt: ago(6, 2), path: [["CANCELLED", ago(5)]] },
];

interface ConversationPlan {
  key: string;
  application: string; // key hồ sơ
  /** [người gửi, số giờ trước, nội dung] theo thứ tự thời gian. */
  messages: Array<["E" | "C", number, string]>;
  employerReadHoursAgo: number;
  candidateReadHoursAgo: number;
}

const CONVERSATIONS: ConversationPlan[] = [
  {
    key: "1", application: "i3", employerReadHoursAgo: 129, candidateReadHoursAgo: 2,
    messages: [
      ["E", 140, "Chào bạn, bên mình đã đặt lịch phỏng vấn trực tuyến vị trí Java Backend. Bạn xem chi tiết trong mục Lịch phỏng vấn nhé."],
      ["C", 130, "Dạ em đã nhận được lịch, em cảm ơn anh chị."],
      ["C", 2, "Anh chị cho em hỏi buổi phỏng vấn có phần làm bài tập code trực tiếp không ạ?"],
    ],
  },
  {
    key: "2", application: "s2", employerReadHoursAgo: 300, candidateReadHoursAgo: 5,
    messages: [
      ["E", 320, "Chào bạn, hồ sơ của bạn đã vào danh sách rút gọn. Bạn có thể thực tập toàn thời gian từ tháng 12 không?"],
      ["C", 310, "Dạ em có thể đi toàn thời gian từ đầu tháng 12 ạ."],
      ["E", 300, "Cảm ơn bạn, bên mình sẽ báo lịch phỏng vấn sớm."],
      ["C", 5, "Em muốn hỏi thêm về mức phụ cấp thực tập của vị trí này ạ."],
    ],
  },
  {
    key: "3", application: "a2", employerReadHoursAgo: 449, candidateReadHoursAgo: 450,
    messages: [
      ["E", 470, "Chúc mừng bạn đã trúng tuyển vị trí Thực tập sinh Kế toán. Bạn có thể bắt đầu từ thứ Hai tuần sau không?"],
      ["C", 460, "Dạ được ạ. Em cần chuẩn bị giấy tờ gì không ạ?"],
      ["E", 455, "Bạn mang theo CCCD và giấy giới thiệu của trường nhé."],
      ["C", 450, "Dạ em cảm ơn anh chị."],
    ],
  },
  {
    key: "4", application: "i1", employerReadHoursAgo: 55, candidateReadHoursAgo: 50,
    messages: [
      ["E", 400, "Chào bạn, bên mình đã gửi lịch phỏng vấn tại văn phòng. Nếu cần đổi giờ bạn nhắn mình nhé."],
      ["C", 390, "Dạ em sẽ có mặt đúng giờ ạ."],
      ["C", 60, "Em cảm ơn anh chị đã dành thời gian phỏng vấn. Khi nào em có thể nhận kết quả ạ?"],
      ["E", 55, "Bên mình sẽ phản hồi trong tuần này nhé."],
    ],
  },
];

interface InvitationPlan {
  key: string;
  job: FixtureJobKey;
  candidate: string;
  status: "ACCEPTED" | "DECLINED";
  createdAt: Date;
  respondedAt: Date;
}
const INVITATIONS: InvitationPlan[] = [
  { key: "1", job: "qa", candidate: "qa-03", status: "ACCEPTED", createdAt: ago(12, 3), respondedAt: ago(11, 1) },
  { key: "2", job: "fep", candidate: "sparse-profile-01", status: "DECLINED", createdAt: ago(9, 2), respondedAt: ago(8, 5) },
  { key: "3", job: "java", candidate: "backend-sql-03", status: "DECLINED", createdAt: ago(20, 4), respondedAt: ago(18, 2) },
];

// ─── Đọc trạng thái hiện tại ────────────────────────────────────────────────

interface Context {
  employerUserId: string;
  employerId: string;
  companyId: string;
  companyName: string;
  companyVerifiedAt: Date | null;
  adminUserId: string | null;
  planId: string;
  planDurationDays: number;
  fixtureJobs: Record<FixtureJobKey, { id: string; title: string }>;
  candidates: Map<string, { candidateId: string; userId: string; fullName: string | null; usableCvId: string | null }>;
  sampleCv: { fileUrl: string; owner: string } | null;
}

async function loadContext(db: Tx | PrismaClient): Promise<Context> {
  const employerUser = await db.user.findUnique({
    where: { email: DEMO_EMPLOYER_EMAIL },
    select: { id: true, employer: { select: { id: true, company: { select: { id: true, name: true, verifiedAt: true } } } } },
  });
  const company = employerUser?.employer?.company;
  if (!employerUser?.employer || !company || company.name !== DEMO_COMPANY_NAME) {
    fail(`Không thấy ${DEMO_EMPLOYER_EMAIL} thuộc "${DEMO_COMPANY_NAME}". Chạy \`npm run seed-match-demo\` trước.`);
  }

  const plan = await db.subscriptionPlan.findUnique({ where: { name: SUBSCRIPTION_PLAN_NAME }, select: { id: true, durationDays: true } });
  if (!plan) fail(`Không thấy gói "${SUBSCRIPTION_PLAN_NAME}".`);
  const admin = await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true } });

  const jobs = await db.jobPost.findMany({
    where: { companyId: company.id, title: { in: Object.values(FIXTURE_JOBS).map((j) => j.title) }, NOT: { id: isDemoId } },
    select: { id: true, title: true },
  });
  const fixtureJobs = {} as Context["fixtureJobs"];
  for (const [key, plan] of Object.entries(FIXTURE_JOBS) as Array<[FixtureJobKey, FixtureJobPlan]>) {
    const matches = jobs.filter((j) => j.title === plan.title);
    if (matches.length !== 1) fail(`Cần đúng 1 tin "${plan.title}" của công ty demo, thấy ${matches.length}. Chạy \`npm run seed-match-demo\` trước.`);
    fixtureJobs[key] = itemAt(matches, 0);
  }

  const candidateRows = await db.candidate.findMany({
    where: { user: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` }, role: "CANDIDATE" } },
    select: {
      id: true,
      fullName: true,
      user: { select: { id: true, email: true } },
      cvs: {
        where: { isHidden: false, isBuilder: false, NOT: { id: isDemoId } },
        orderBy: [{ isDefault: "desc" }, { uploadedAt: "desc" }],
        select: { id: true, fileName: true, fileUrl: true },
      },
    },
  });
  const candidates: Context["candidates"] = new Map();
  let sampleCv: Context["sampleCv"] = null;
  for (const row of candidateRows) {
    const ref = row.user.email.slice(0, -`@${DEMO_EMAIL_DOMAIN}`.length);
    candidates.set(ref, { candidateId: row.id, userId: row.user.id, fullName: row.fullName, usableCvId: row.cvs[0]?.id ?? null });
    const sample = row.cvs.find((cv) => cv.fileName === CV_FILE_NAME);
    if (sample && !sampleCv) sampleCv = { fileUrl: sample.fileUrl, owner: row.user.email };
  }
  const neededRefs = new Set([...APPLICATIONS.map((a) => a.candidate), ...INVITATIONS.map((i) => i.candidate)]);
  for (const ref of neededRefs) {
    if (!candidates.has(ref)) fail(`Thiếu ứng viên ${ref}@${DEMO_EMAIL_DOMAIN}. Chạy \`npm run seed-match-demo\` trước.`);
  }

  return {
    employerUserId: employerUser.id,
    employerId: employerUser.employer.id,
    companyId: company.id,
    companyName: company.name,
    companyVerifiedAt: company.verifiedAt,
    adminUserId: admin?.id ?? null,
    planId: plan.id,
    planDurationDays: plan.durationDays,
    fixtureJobs,
    candidates,
    sampleCv,
  };
}

/** Số dòng demo (có tiền tố) hiện có trong từng bảng. */
async function countDemoRows(db: Tx | PrismaClient): Promise<Record<string, number>> {
  const where = { id: isDemoId };
  const [subscription, job, moderation, dailyStat, cv, application, history, interview, conversation, message, invitation, notification, reminder] =
    await Promise.all([
      db.companySubscription.count({ where }),
      db.jobPost.count({ where }),
      db.jobPostModerationAction.count({ where }),
      db.jobPostDailyStat.count({ where }),
      db.cv.count({ where }),
      db.application.count({ where }),
      db.applicationStatusHistory.count({ where }),
      db.interview.count({ where }),
      db.conversation.count({ where }),
      db.message.count({ where }),
      db.candidateOutreachInvitation.count({ where }),
      db.notification.count({ where }),
      db.notification.count({ where: { dedupeKey: { startsWith: `INTERVIEW_REMINDER:${ID_PREFIX}` }, NOT: { id: isDemoId } } }),
    ]);
  return {
    "Gói dịch vụ": subscription,
    "Tin mới": job,
    "Thao tác kiểm duyệt": moderation,
    "Lượt xem theo ngày": dailyStat,
    CV: cv,
    "Hồ sơ": application,
    "Lịch sử trạng thái": history,
    "Lịch phỏng vấn": interview,
    "Hội thoại": conversation,
    "Tin nhắn": message,
    "Lời mời": invitation,
    "Thông báo": notification,
    "Nhắc lịch do cron tạo cho lịch demo": reminder,
  };
}

// ─── Dựng dữ liệu (thuần, không đụng DB) ───────────────────────────────────

interface Built {
  expiryBase: Date;
  subscription: Prisma.CompanySubscriptionCreateManyInput;
  fixtureUpdates: Array<{ key: FixtureJobKey; id: string; title: string; data: { status: JobPostStatus; publishedAt: Date | null; expiresAt: Date; closedAt: Date | null } }>;
  newJobs: Array<{ key: NewJobKey; data: Prisma.JobPostCreateManyInput; skills: string[] }>;
  moderation: Prisma.JobPostModerationActionCreateManyInput[];
  cvs: Prisma.CvCreateManyInput[];
  applications: Prisma.ApplicationCreateManyInput[];
  history: Prisma.ApplicationStatusHistoryCreateManyInput[];
  interviews: Prisma.InterviewCreateManyInput[];
  conversations: Prisma.ConversationCreateManyInput[];
  messages: Prisma.MessageCreateManyInput[];
  invitations: Prisma.CandidateOutreachInvitationCreateManyInput[];
  notifications: Prisma.NotificationCreateManyInput[];
  names: Array<{ candidateId: string; ref: string; fullName: string }>;
  /** Tên hiển thị sau khi chạy (đã có tên thì giữ). */
  nameOf: (ref: string) => string;
}

interface Existing {
  /** Cặp tin–ứng viên đã có hồ sơ (không tính dòng demo). */
  pairs: Set<string>;
  /** Mốc sớm nhất của hồ sơ / lượt xem thật trên từng tin (tin không được đăng sau mốc này). */
  earliestActivity: Map<string, Date>;
  /** CV demo còn bị hồ sơ thật dùng nên không xoá được → dùng lại. */
  keptDemoCvs: Map<string, string>; // candidateId → cvId
}

function buildData(ctx: Context, existing: Existing): Built {
  const todayStart = vnDayStart(NOW);
  const fixedBase = vnDateAt(EARLIEST_EXPIRY_BASE, 0);
  const expiryBase = fixedBase > todayStart ? fixedBase : todayStart;
  const expiryAt = (offset: number) => new Date(expiryBase.getTime() + offset * DAY + 23 * HOUR + 59 * 60 * 1000);

  const subscriptionEnd = addDays(NOW, ctx.planDurationDays);
  const subscription: Prisma.CompanySubscriptionCreateManyInput = {
    id: demoId("sub", 1),
    companyId: ctx.companyId,
    planId: ctx.planId,
    startDate: NOW,
    endDate: subscriptionEnd,
    status: "ACTIVE",
    createdAt: NOW,
    updatedAt: NOW,
  };

  // Tin của fixture.
  const fixtureUpdates: Built["fixtureUpdates"] = [];
  const publishedAtOf = new Map<FixtureJobKey, Date | null>();
  for (const [key, plan] of Object.entries(FIXTURE_JOBS) as Array<[FixtureJobKey, FixtureJobPlan]>) {
    const job = ctx.fixtureJobs[key];
    let publishedAt: Date | null = null;
    if (plan.publishedOn) {
      publishedAt = vnDateAt(plan.publishedOn, 9);
      // Không đăng trước khi công ty được xác minh, và phải trước hồ sơ / lượt xem thật đầu tiên.
      if (ctx.companyVerifiedAt && publishedAt <= ctx.companyVerifiedAt) publishedAt = new Date(ctx.companyVerifiedAt.getTime() + 5 * 60 * 1000);
      const earliest = existing.earliestActivity.get(job.id);
      if (earliest && publishedAt >= earliest) publishedAt = new Date(earliest.getTime() - HOUR);
    }
    publishedAtOf.set(key, publishedAt);
    fixtureUpdates.push({
      key,
      id: job.id,
      title: job.title,
      data: {
        status: plan.status,
        publishedAt,
        expiresAt: expiryAt(plan.expiryOffset),
        closedAt: plan.status === "CLOSED" ? ago(CLOSED_DAYS_AGO) : null,
      },
    });
  }

  // Tin mới + thao tác kiểm duyệt.
  const newJobs: Built["newJobs"] = [];
  const moderation: Built["moderation"] = [];
  let actionNo = 0;
  for (const [key, plan] of Object.entries(NEW_JOBS) as Array<[NewJobKey, NewJobPlan]>) {
    const id = demoId("job", key);
    const lastAt = plan.actions.length > 0 ? itemAt(plan.actions, -1).at : plan.createdAt;
    newJobs.push({
      key,
      skills: plan.skills,
      data: {
        id,
        companyId: ctx.companyId,
        employerId: ctx.employerId,
        title: plan.title,
        description: plan.description,
        requirements: plan.requirements,
        benefits: plan.benefits,
        jobType: "INTERNSHIP",
        status: plan.status,
        salaryMin: plan.salaryMin,
        salaryMax: plan.salaryMax,
        expiresAt: expiryAt(50),
        createdAt: plan.createdAt,
        updatedAt: lastAt,
      },
    });
    for (const action of plan.actions) {
      actionNo += 1;
      moderation.push({
        id: demoId("mod", actionNo),
        jobPostId: id,
        action: action.action,
        actorId: action.action === "SUBMITTED" ? ctx.employerUserId : ctx.adminUserId,
        reason: action.reason ?? null,
        createdAt: action.at,
      });
    }
  }
  // Tin QA được duyệt (khớp thông báo "đã được duyệt" bên dưới).
  const qaPublishedAt = publishedAtOf.get("qa") ?? fail("Tin QA chưa có ngày đăng");
  moderation.push(
    { id: demoId("mod", "qa1"), jobPostId: ctx.fixtureJobs.qa.id, action: "SUBMITTED", actorId: ctx.employerUserId, createdAt: new Date(qaPublishedAt.getTime() - 20 * HOUR) },
    { id: demoId("mod", "qa2"), jobPostId: ctx.fixtureJobs.qa.id, action: "APPROVED", actorId: ctx.adminUserId, createdAt: qaPublishedAt },
  );

  // Tên ứng viên.
  const names: Built["names"] = [];
  const nameOf = (ref: string) => {
    const candidate = ctx.candidates.get(ref) ?? fail(`Thiếu ứng viên ${ref}`);
    return candidate.fullName?.trim() || CANDIDATE_NAMES[ref] || ref;
  };
  for (const [ref, candidate] of ctx.candidates) {
    if (!candidate.fullName?.trim() && CANDIDATE_NAMES[ref]) names.push({ candidateId: candidate.candidateId, ref, fullName: CANDIDATE_NAMES[ref] });
  }

  // CV: dùng CV thật của ứng viên nếu có, không thì tạo một dòng trỏ tới CV mẫu.
  const cvs: Built["cvs"] = [];
  const cvOf = new Map<string, string>();
  const firstAppliedAt = new Map<string, Date>();
  for (const app of APPLICATIONS) {
    const prev = firstAppliedAt.get(app.candidate);
    if (!prev || app.createdAt < prev) firstAppliedAt.set(app.candidate, app.createdAt);
  }
  for (const [ref, appliedAt] of firstAppliedAt) {
    const candidate = ctx.candidates.get(ref)!;
    const kept = existing.keptDemoCvs.get(candidate.candidateId);
    if (candidate.usableCvId) {
      cvOf.set(ref, candidate.usableCvId);
    } else if (kept) {
      cvOf.set(ref, kept);
    } else {
      // id theo ứng viên: CV demo giữ lại ở lần trước (xem keptDemoCvs) không bao giờ trùng id mới.
      const id = demoId("cv", candidate.candidateId);
      cvOf.set(ref, id);
      cvs.push({
        id,
        candidateId: candidate.candidateId,
        fileUrl: ctx.sampleCv?.fileUrl ?? "(chưa có CV mẫu)",
        fileName: CV_FILE_NAME,
        isDefault: true,
        uploadedAt: addDays(appliedAt, -2),
        extractionStatus: "NOT_STARTED",
      });
    }
  }

  // Hồ sơ + lịch sử + lịch phỏng vấn.
  const applications: Built["applications"] = [];
  const history: Built["history"] = [];
  const interviews: Built["interviews"] = [];
  const appIdOf = new Map<string, string>();
  for (const app of APPLICATIONS) {
    const candidate = ctx.candidates.get(app.candidate)!;
    const job = ctx.fixtureJobs[app.job];
    const pair = `${job.id}:${candidate.candidateId}`;
    if (existing.pairs.has(pair)) fail(`Ứng viên ${app.candidate} đã có hồ sơ thật ở tin "${job.title}" — đổi cặp trong APPLICATIONS.`);
    const publishedAt = publishedAtOf.get(app.job);
    if (!publishedAt || app.createdAt <= publishedAt) fail(`Hồ sơ ${app.key} nộp trước khi tin "${job.title}" được đăng.`);
    const closed = FIXTURE_JOBS[app.job].status === "CLOSED" ? ago(CLOSED_DAYS_AGO) : null;
    if (closed && app.createdAt >= closed) fail(`Hồ sơ ${app.key} nộp sau khi tin đã đóng.`);

    const id = demoId("app", app.key);
    appIdOf.set(app.key, id);
    const steps: Array<[ApplicationStatus, Date]> = [["PENDING", app.createdAt], ...app.path];
    for (let i = 1; i < steps.length; i += 1) {
      if (itemAt(steps, i)[1] <= itemAt(steps, i - 1)[1] || itemAt(steps, i)[1] > NOW) fail(`Mốc trạng thái của hồ sơ ${app.key} không tăng dần.`);
    }
    const [status, updatedAt] = itemAt(steps, -1);
    applications.push({
      id,
      jobPostId: job.id,
      candidateId: candidate.candidateId,
      cvId: cvOf.get(app.candidate)!,
      status,
      createdAt: app.createdAt,
      updatedAt,
    });
    steps.forEach(([toStatus, at], i) => {
      const actorId = toStatus === "PENDING" || toStatus === "CANCELLED" ? candidate.userId : ctx.employerUserId;
      history.push({ id: demoId("hist", `${app.key}${i}`), applicationId: id, fromStatus: i === 0 ? null : itemAt(steps, i - 1)[0], toStatus, actorId, createdAt: at });
    });

    if (app.interview) {
      const interviewingAt = steps.find(([s]) => s === "INTERVIEWING")?.[1] ?? fail(`Hồ sơ ${app.key} có lịch nhưng chưa qua INTERVIEWING.`);
      const iv = app.interview;
      interviews.push({
        id: demoId("iv", app.key),
        applicationId: id,
        scheduledAt: iv.at,
        durationMinutes: 45,
        mode: iv.mode,
        location: iv.mode === "ONLINE" ? ONLINE_LINK : OFFICE_ADDRESS,
        note: iv.mode === "ONLINE" ? "Bạn vào phòng họp trước 5 phút để kiểm tra micro và camera." : "Bạn báo lễ tân tên và vị trí ứng tuyển khi tới nơi.",
        status: iv.cancelled ? "CANCELLED" : "SCHEDULED",
        cancelReason: iv.cancelled?.reason ?? null,
        createdById: ctx.employerUserId,
        createdAt: interviewingAt,
        updatedAt: iv.cancelled?.at ?? interviewingAt,
      });
    }
  }

  // Hội thoại + tin nhắn.
  const conversations: Built["conversations"] = [];
  const messages: Built["messages"] = [];
  for (const conv of CONVERSATIONS) {
    const app = APPLICATIONS.find((a) => a.key === conv.application) ?? fail(`Không thấy hồ sơ ${conv.application}`);
    const candidate = ctx.candidates.get(app.candidate)!;
    const id = demoId("conv", conv.key);
    const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * HOUR);
    const first = at(itemAt(conv.messages, 0)[1]);
    const last = at(itemAt(conv.messages, -1)[1]);
    if (first <= app.createdAt) fail(`Hội thoại ${conv.key} bắt đầu trước khi ứng viên nộp hồ sơ.`);
    conversations.push({
      id,
      jobPostId: ctx.fixtureJobs[app.job].id,
      candidateId: candidate.candidateId,
      employerId: ctx.employerId,
      employerLastReadAt: at(conv.employerReadHoursAgo),
      candidateLastReadAt: at(conv.candidateReadHoursAgo),
      createdAt: first,
      updatedAt: last,
    });
    conv.messages.forEach(([sender, hoursAgo, content], i) => {
      messages.push({
        id: demoId("msg", `${conv.key}x${i}`),
        conversationId: id,
        senderId: sender === "E" ? ctx.employerUserId : candidate.userId,
        content,
        createdAt: at(hoursAgo),
      });
    });
  }

  // Lời mời (không có lời mời đang chờ, không tạo hôm nay).
  const invitations: Built["invitations"] = [];
  for (const inv of INVITATIONS) {
    if (vnDayNumber(inv.createdAt) === vnDayNumber(NOW)) fail(`Lời mời ${inv.key} rơi vào hôm nay — sẽ ăn hạn mức lời mời trong ngày.`);
    invitations.push({
      id: demoId("inv", inv.key),
      companyId: ctx.companyId,
      employerId: ctx.employerId,
      jobPostId: ctx.fixtureJobs[inv.job].id,
      candidateId: ctx.candidates.get(inv.candidate)!.candidateId,
      status: inv.status,
      createdAt: inv.createdAt,
      expiresAt: addDays(inv.createdAt, INVITATION_EXPIRY_DAYS),
      respondedAt: inv.respondedAt,
    });
  }

  // Thông báo cho employer (render bằng template thật) + nhắc lịch cho ứng viên.
  const notifications: Built["notifications"] = [];
  const notify = <T extends keyof NotificationPayloadMap>(
    key: string,
    userId: string,
    type: T,
    data: NotificationPayloadMap[T],
    createdAt: Date,
    read: boolean,
    dedupeKey: string | null = null,
  ) => {
    const rendered = renderNotification(type, data, NOTIFICATION_CTX);
    const readAt = read ? new Date(Math.min(createdAt.getTime() + 2 * HOUR, NOW.getTime())) : null;
    notifications.push({ id: demoId("ntf", key), userId, type, title: rendered.title, body: rendered.body, link: rendered.link, isRead: read, readAt, dedupeKey, createdAt });
  };
  const applicationReceived = (key: string, appKey: string, read: boolean) => {
    const app = APPLICATIONS.find((a) => a.key === appKey)!;
    const job = ctx.fixtureJobs[app.job];
    notify(key, ctx.employerUserId, "APPLICATION_RECEIVED", { applicationId: appIdOf.get(appKey)!, jobPostId: job.id, jobPostTitle: job.title, candidateName: nameOf(app.candidate) }, app.createdAt, read);
  };
  applicationReceived("e1", "p1", false);
  applicationReceived("e2", "p2", false);
  applicationReceived("e3", "p3", false);
  const rejected = NEW_JOBS.rej.actions.find((a) => a.action === "REJECTED")!;
  notify("e4", ctx.employerUserId, "JOB_POST_REJECTED", { jobPostId: demoId("job", "rej"), jobPostTitle: NEW_JOBS.rej.title, reason: REJECT_REASON }, rejected.at, false);
  notify("e5", ctx.employerUserId, "JOB_POST_APPROVED", { jobPostId: ctx.fixtureJobs.qa.id, jobPostTitle: ctx.fixtureJobs.qa.title }, qaPublishedAt, true);
  const accepted = INVITATIONS.find((i) => i.status === "ACCEPTED")!;
  notify(
    "e6",
    ctx.employerUserId,
    "CANDIDATE_OUTREACH_INVITATION_RESPONDED",
    { invitationId: demoId("inv", accepted.key), jobPostId: ctx.fixtureJobs[accepted.job].id, jobPostTitle: ctx.fixtureJobs[accepted.job].title, candidateName: nameOf(accepted.candidate), accepted: true },
    accepted.respondedAt,
    true,
  );
  applicationReceived("e7", "p4", true);
  applicationReceived("e8", "r1", true);

  for (const iv of interviews) {
    if (iv.status !== "SCHEDULED" || new Date(iv.scheduledAt) <= NOW) continue;
    const app = APPLICATIONS.find((a) => appIdOf.get(a.key) === iv.applicationId)!;
    const candidate = ctx.candidates.get(app.candidate)!;
    const scheduledAt = new Date(iv.scheduledAt);
    notify(
      `rem${app.key}`,
      candidate.userId,
      "INTERVIEW_REMINDER",
      {
        interviewId: iv.id!,
        applicationId: iv.applicationId,
        jobPostTitle: ctx.fixtureJobs[app.job].title,
        companyName: ctx.companyName,
        scheduledAt,
        durationMinutes: iv.durationMinutes ?? 45,
        mode: iv.mode,
        location: iv.location ?? null,
        note: iv.note ?? null,
        recipientRole: "CANDIDATE",
        candidateName: nameOf(app.candidate),
      },
      NOW,
      true,
      `INTERVIEW_REMINDER:${iv.id}:${candidate.userId}:${scheduledAt.getTime()}`,
    );
  }

  // Hạn tin phải trước khi gói hết, nếu không cron sẽ đóng tin sớm.
  const latestExpiry = Math.max(...fixtureUpdates.map((u) => u.data.expiresAt.getTime()), ...newJobs.map((j) => new Date(j.data.expiresAt as Date).getTime()));
  if (latestExpiry >= subscriptionEnd.getTime()) fail("Có tin hết hạn sau khi gói demo hết — kiểm lại expiryOffset.");

  return { expiryBase, subscription, fixtureUpdates, newJobs, moderation, cvs, applications, history, interviews, conversations, messages, invitations, notifications, names, nameOf };
}

/** Lượt xem theo ngày từ ngày đăng tới hôm qua (tin đã đóng: tới ngày đóng); bỏ ngày đã có dòng thật. */
function buildDailyStats(built: Built, realStatDays: Map<string, Set<number>>): Prisma.JobPostDailyStatCreateManyInput[] {
  const rows: Prisma.JobPostDailyStatCreateManyInput[] = [];
  const yesterday = vnDayNumber(NOW) - 1;
  built.fixtureUpdates.forEach((update, jobIndex) => {
    const plan = FIXTURE_JOBS[update.key];
    if (!update.data.publishedAt || plan.baseViews === 0) return;
    const random = seededRandom(1000 + jobIndex * 7919);
    const first = vnDayNumber(update.data.publishedAt);
    const last = update.data.closedAt ? vnDayNumber(update.data.closedAt) : yesterday;
    const taken = realStatDays.get(update.id) ?? new Set<number>();
    for (let day = first; day <= last; day += 1) {
      const noise = 0.7 + random() * 0.6; // luôn rút số để chạy lại ra cùng dãy
      if (taken.has(day)) continue;
      const weekday = new Date(day * DAY).getUTCDay();
      const weekend = weekday === 0 || weekday === 6 ? 0.55 : 1;
      const fresh = day - first < 7 ? 1.25 : 1;
      const views = Math.max(3, Math.min(30, Math.round(plan.baseViews * weekend * fresh * noise)));
      rows.push({ id: demoId("st", `${update.key}${day}`), jobPostId: update.id, date: dbDateOfVnDay(day), views });
    }
  });
  return rows;
}

// ─── Số dashboard sẽ hiện ───────────────────────────────────────────────────

interface SummaryInput {
  applications: Array<{ status: ApplicationStatus; createdAt: Date; reappliedAt: Date | null }>;
  interviews: Array<{ status: string; scheduledAt: Date; applicationStatus: ApplicationStatus }>;
  jobs: Array<{ status: JobPostStatus; expiresAt: Date | null; lastAction: string | null }>;
  unreadConversations: number;
  unreadCandidates: number;
}

function printSummary(title: string, input: SummaryInput) {
  const today = vnDayNumber(NOW);
  const inLast = (date: Date, days: number) => vnDayNumber(date) > today - days;
  const pending = input.applications.filter((a) => a.status === "PENDING");
  const oldest = pending.map((a) => a.reappliedAt ?? a.createdAt).sort((a, b) => a.getTime() - b.getTime())[0];
  const newCurrent = input.applications.filter((a) => inLast(a.createdAt, 7)).length;
  const newPrevious = input.applications.filter((a) => inLast(a.createdAt, 14) && !inLast(a.createdAt, 7)).length;
  const weekEnd = vnDayStart(NOW, 7);
  const upcoming = input.interviews.filter((i) => i.status === "SCHEDULED" && i.applicationStatus === "INTERVIEWING" && i.scheduledAt > NOW && i.scheduledAt < weekEnd).length;
  const pastWeekStart = vnDayStart(NOW, -6);
  const pastWeek = input.interviews.filter((i) => i.status === "SCHEDULED" && i.scheduledAt >= pastWeekStart && i.scheduledAt <= NOW).length;
  const rejected = input.jobs.filter((j) => j.status === "DRAFT" && j.lastAction === "REJECTED").length;
  const expiring = input.jobs.filter((j) => j.status === "PUBLISHED" && j.expiresAt && j.expiresAt > NOW && j.expiresAt.getTime() <= NOW.getTime() + 7 * DAY).length;
  const published = input.jobs.filter((j) => j.status === "PUBLISHED").length;

  console.log(`\n${title}`);
  console.log(`  Hồ sơ chờ xử lý: ${pending.length} (cũ nhất nộp ${fmt(oldest)}); hồ sơ mới 7 ngày qua: ${newCurrent}, 7 ngày trước đó: ${newPrevious}`);
  console.log(`  Phỏng vấn 7 ngày tới: ${upcoming}; đã diễn ra 7 ngày qua: ${pastWeek}`);
  console.log(`  Tin đang hiển thị: ${published}; tin cần chú ý: ${rejected + expiring} (${rejected} bị từ chối, ${expiring} hết hạn trong 7 ngày)`);
  console.log(`  Tin nhắn chưa đọc: ${input.unreadConversations} hội thoại, ${input.unreadCandidates} ứng viên`);
}

async function unreadFor(db: Tx | PrismaClient, ctx: Context, excludeDemo: boolean) {
  const rows = await db.conversation.findMany({
    where: { employerId: ctx.employerId, employerDeletedAt: null, ...(excludeDemo ? { NOT: { id: isDemoId } } : {}) },
    select: { candidateId: true, employerLastReadAt: true, messages: { where: { senderId: { not: ctx.employerUserId } }, select: { createdAt: true } } },
  });
  const unread = rows.filter((c) => c.messages.some((m) => !c.employerLastReadAt || m.createdAt > c.employerLastReadAt));
  return { conversations: unread.length, candidates: new Set(unread.map((c) => c.candidateId)).size };
}

/** Đọc số liệu thật của công ty; `excludeDemo` = bỏ các dòng demo (dùng cho dự kiến ở --dry-run). */
async function loadSummaryInput(db: Tx | PrismaClient, ctx: Context, excludeDemo: boolean): Promise<SummaryInput> {
  const notDemo = excludeDemo ? { NOT: { id: isDemoId } } : {};
  const [applications, interviews, jobs, unread] = await Promise.all([
    db.application.findMany({ where: { jobPost: { companyId: ctx.companyId }, ...notDemo }, select: { status: true, createdAt: true, reappliedAt: true } }),
    db.interview.findMany({
      where: { application: { jobPost: { companyId: ctx.companyId } }, ...notDemo },
      select: { status: true, scheduledAt: true, application: { select: { status: true } } },
    }),
    db.jobPost.findMany({
      where: { companyId: ctx.companyId, ...notDemo },
      select: { status: true, expiresAt: true, moderationActions: { where: notDemo, orderBy: { createdAt: "desc" }, take: 1, select: { action: true } } },
    }),
    unreadFor(db, ctx, excludeDemo),
  ]);
  return {
    applications,
    interviews: interviews.map((i) => ({ status: i.status, scheduledAt: i.scheduledAt, applicationStatus: i.application.status })),
    jobs: jobs.map((j) => ({ status: j.status, expiresAt: j.expiresAt, lastAction: j.moderationActions[0]?.action ?? null })),
    unreadConversations: unread.conversations,
    unreadCandidates: unread.candidates,
  };
}

// ─── Ghi ────────────────────────────────────────────────────────────────────

async function loadExisting(db: Tx | PrismaClient, ctx: Context): Promise<Existing> {
  const jobIds = Object.values(ctx.fixtureJobs).map((j) => j.id);
  const [apps, stats, keptCvs] = await Promise.all([
    db.application.findMany({ where: { jobPostId: { in: jobIds }, NOT: { id: isDemoId } }, select: { jobPostId: true, candidateId: true, createdAt: true } }),
    db.jobPostDailyStat.findMany({ where: { jobPostId: { in: jobIds }, NOT: { id: isDemoId } }, select: { jobPostId: true, date: true } }),
    // CV demo mà hồ sơ thật (không phải demo) đang dùng thì không xoá được.
    db.cv.findMany({ where: { id: isDemoId, applications: { some: { NOT: { id: isDemoId } } } }, select: { id: true, candidateId: true } }),
  ]);
  const earliestActivity = new Map<string, Date>();
  const touch = (jobId: string, at: Date) => {
    const prev = earliestActivity.get(jobId);
    if (!prev || at < prev) earliestActivity.set(jobId, at);
  };
  for (const a of apps) touch(a.jobPostId, a.createdAt);
  // Lượt xem lưu theo ngày VN; coi như xảy ra từ đầu ngày đó.
  for (const s of stats) touch(s.jobPostId, new Date(s.date.getTime() - VN_OFFSET));
  return {
    pairs: new Set(apps.map((a) => `${a.jobPostId}:${a.candidateId}`)),
    earliestActivity,
    keptDemoCvs: new Map(keptCvs.map((cv) => [cv.candidateId, cv.id])),
  };
}

async function realStatDaysOf(db: Tx | PrismaClient, ctx: Context): Promise<Map<string, Set<number>>> {
  const rows = await db.jobPostDailyStat.findMany({
    where: { jobPostId: { in: Object.values(ctx.fixtureJobs).map((j) => j.id) }, NOT: { id: isDemoId } },
    select: { jobPostId: true, date: true },
  });
  const map = new Map<string, Set<number>>();
  for (const row of rows) {
    const set = map.get(row.jobPostId) ?? new Set<number>();
    set.add(Math.floor(row.date.getTime() / DAY));
    map.set(row.jobPostId, set);
  }
  return map;
}

/** Xoá mọi dòng demo, con trước cha. CV demo còn bị hồ sơ thật dùng thì giữ lại. */
async function deleteDemo(tx: Tx) {
  const where = { id: isDemoId };
  await tx.notification.deleteMany({ where: { OR: [where, { dedupeKey: { startsWith: `INTERVIEW_REMINDER:${ID_PREFIX}` } }] } });
  await tx.message.deleteMany({ where });
  await tx.conversation.deleteMany({ where });
  await tx.interview.deleteMany({ where });
  await tx.applicationStatusHistory.deleteMany({ where });
  await tx.application.deleteMany({ where });
  await tx.candidateOutreachInvitation.deleteMany({ where });
  await tx.cv.deleteMany({ where: { ...where, applications: { none: {} } } });
  await tx.jobPostDailyStat.deleteMany({ where });
  await tx.jobPostModerationAction.deleteMany({ where });
  await tx.jobPost.deleteMany({ where }); // job_post_skills xoá theo cascade
  await tx.companySubscription.deleteMany({ where });
}

/** Tin của fixture về lại trạng thái trước khi chạy (EXPIRED), viewCount = tổng lượt xem còn lại. */
async function restoreFixtureJobs(tx: Tx, ctx: Context) {
  for (const job of Object.values(ctx.fixtureJobs)) {
    const current = await tx.jobPost.findUniqueOrThrow({ where: { id: job.id }, select: { publishedAt: true, createdAt: true } });
    const views = await tx.jobPostDailyStat.aggregate({ where: { jobPostId: job.id }, _sum: { views: true } });
    await tx.jobPost.update({
      where: { id: job.id },
      data: { status: "EXPIRED", closedAt: null, publishedAt: current.publishedAt ?? current.createdAt, viewCount: views._sum.views ?? 0 },
    });
  }
}

async function write(ctx: Context) {
  if (!ctx.sampleCv) {
    fail(`Chưa có CV mẫu: đăng nhập một ứng viên @${DEMO_EMAIL_DOMAIN}, tải lên file PDF tên "${CV_FILE_NAME}" rồi chạy lại.`);
  }
  const outboxBefore = await prisma.outboxEvent.count();

  await prisma.$transaction(
    async (tx) => {
      await deleteDemo(tx);
      const existing = await loadExisting(tx, ctx);
      const built = buildData(ctx, existing);
      const stats = buildDailyStats(built, await realStatDaysOf(tx, ctx));

      for (const n of built.names) await tx.candidate.update({ where: { id: n.candidateId }, data: { fullName: n.fullName } });
      await tx.companySubscription.createMany({ data: [built.subscription] });
      for (const u of built.fixtureUpdates) await tx.jobPost.update({ where: { id: u.id }, data: u.data });
      await tx.jobPost.createMany({ data: built.newJobs.map((j) => j.data) });

      const skillNames = [...new Set(built.newJobs.flatMap((j) => j.skills))];
      const skills = await tx.skill.findMany({ where: { name: { in: skillNames }, status: "APPROVED" }, select: { id: true, name: true } });
      const skillId = new Map(skills.map((s) => [s.name, s.id]));
      await tx.jobPostSkill.createMany({
        data: built.newJobs.flatMap((j) => j.skills.filter((name) => skillId.has(name)).map((name) => ({ jobPostId: j.data.id!, skillId: skillId.get(name)! }))),
      });

      await tx.jobPostModerationAction.createMany({ data: built.moderation });
      await tx.jobPostDailyStat.createMany({ data: stats });
      for (const u of built.fixtureUpdates) {
        const views = await tx.jobPostDailyStat.aggregate({ where: { jobPostId: u.id }, _sum: { views: true } });
        await tx.jobPost.update({ where: { id: u.id }, data: { viewCount: views._sum.views ?? 0 } });
      }
      await tx.cv.createMany({ data: built.cvs });
      await tx.application.createMany({ data: built.applications });
      await tx.applicationStatusHistory.createMany({ data: built.history });
      await tx.interview.createMany({ data: built.interviews });
      await tx.conversation.createMany({ data: built.conversations });
      await tx.message.createMany({ data: built.messages });
      await tx.candidateOutreachInvitation.createMany({ data: built.invitations });
      await tx.notification.createMany({ data: built.notifications });

      const outboxAfter = await tx.outboxEvent.count();
      if (outboxAfter !== outboxBefore) fail(`outbox_events đổi từ ${outboxBefore} thành ${outboxAfter} — huỷ toàn bộ để không gửi email.`);

      console.log("✓ Đã tạo:");
      console.log(
        `  gói ${SUBSCRIPTION_PLAN_NAME} tới ${fmtDate(built.subscription.endDate as Date)}, ${built.fixtureUpdates.length} tin fixture cập nhật, ${built.newJobs.length} tin mới, ` +
          `${built.moderation.length} thao tác kiểm duyệt, ${stats.length} ngày lượt xem, ${built.cvs.length} CV, ${built.applications.length} hồ sơ, ` +
          `${built.history.length} dòng lịch sử, ${built.interviews.length} lịch phỏng vấn, ${built.conversations.length} hội thoại / ${built.messages.length} tin nhắn, ` +
          `${built.invitations.length} lời mời, ${built.notifications.length} thông báo, ${built.names.length} ứng viên được đặt tên.`,
      );
    },
    { timeout: 180_000, maxWait: 30_000 },
  );

  printSummary("Số dashboard sẽ hiện (tính cả dữ liệu thử của bạn):", await loadSummaryInput(prisma, ctx, false));
  console.log(`\nĐăng nhập ${DEMO_EMPLOYER_EMAIL} / ${DEMO_PASSWORD_HINT} để xem /employer/dashboard.`);
  console.log("Lưu ý: khoảng 7 ngày trước khi gói demo hết hạn, cron sẽ gửi email nhắc gói. Chạy lại script trước ngày đó (gói được gia hạn từ ngày chạy) hoặc đặt DEV_SKIP_EMAIL_SENDING=true.");
}

async function reset(ctx: Context) {
  const before = await countDemoRows(prisma);
  await prisma.$transaction(
    async (tx) => {
      await deleteDemo(tx);
      await restoreFixtureJobs(tx, ctx);
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
  const after = await countDemoRows(prisma);
  console.log("✓ Đã xoá phần demo:");
  for (const [table, count] of Object.entries(before)) console.log(`  ${table}: ${count} → ${after[table]}`);
  console.log(`  10 tin của fixture về EXPIRED (như trước khi chạy). Tên ứng viên không đổi lại.`);
  const keptCvs = after["CV"] ?? 0;
  if (keptCvs > 0) console.log(`  ⚠ Còn ${keptCvs} CV demo vì có hồ sơ thật đang dùng — giữ lại để không làm hỏng hồ sơ đó.`);
}

async function dryRun(ctx: Context) {
  const demoRows = await countDemoRows(prisma);
  const existing = await loadExisting(prisma, ctx);
  const built = buildData(ctx, existing);
  const stats = buildDailyStats(built, await realStatDaysOf(prisma, ctx));
  const outbox = await prisma.outboxEvent.count();

  console.log("DRY RUN — không ghi gì vào DB.\n");
  console.log(`Công ty: ${ctx.companyName}; employer ${DEMO_EMPLOYER_EMAIL}; admin dùng làm người duyệt: ${ctx.adminUserId ? "có" : "KHÔNG CÓ (actorId = null)"}`);
  console.log(
    ctx.sampleCv
      ? `CV mẫu: thấy "${CV_FILE_NAME}" của ${ctx.sampleCv.owner}.`
      : `✗ CHƯA CÓ CV MẪU: đăng nhập một ứng viên @${DEMO_EMAIL_DOMAIN} và tải lên "${CV_FILE_NAME}". Bản ghi sẽ dừng trước khi ghi nếu thiếu.`,
  );

  console.log("\nSẽ xoá (dòng demo của lần chạy trước):");
  for (const [table, count] of Object.entries(demoRows)) if (count > 0) console.log(`  ${table}: ${count}`);
  if (Object.values(demoRows).every((c) => c === 0)) console.log("  (chưa có)");
  if (existing.keptDemoCvs.size > 0) console.log(`  ⚠ ${existing.keptDemoCvs.size} CV demo đang được hồ sơ thật dùng — giữ lại và dùng tiếp.`);

  console.log(`\nGói: ${SUBSCRIPTION_PLAN_NAME} ACTIVE ${fmtDate(built.subscription.startDate as Date)} → ${fmtDate(built.subscription.endDate as Date)} (không tạo Payment).`);
  console.log(`Mốc hạn tin: ${fmtDate(built.expiryBase)}.`);
  console.log("\nTin của fixture (chỉ đổi trạng thái, ngày đăng, hạn, ngày đóng, viewCount):");
  for (const u of built.fixtureUpdates) {
    const views = stats.filter((s) => s.jobPostId === u.id).reduce((sum, s) => sum + s.views!, 0);
    const apps = built.applications.filter((a) => a.jobPostId === u.id).length;
    console.log(
      `  ${u.title.padEnd(38)} ${u.data.status.padEnd(9)} đăng ${fmtDate(u.data.publishedAt).padEnd(10)} hạn ${fmtDate(u.data.expiresAt).padEnd(10)}` +
        `${u.data.closedAt ? ` đóng ${fmtDate(u.data.closedAt)}` : ""}  +${views} lượt xem, ${apps} hồ sơ demo`,
    );
  }
  for (const j of built.newJobs) console.log(`  [mới] ${j.data.title} — ${j.data.status}${j.key === "rej" ? ` (bị từ chối: ${REJECT_REASON})` : ""}, hạn ${fmtDate(j.data.expiresAt as Date)}`);

  const byStatus = new Map<string, number>();
  for (const a of built.applications) byStatus.set(a.status as string, (byStatus.get(a.status as string) ?? 0) + 1);
  console.log(`\nHồ sơ demo: ${built.applications.length} (${[...byStatus].map(([s, n]) => `${s} ${n}`).join(", ")}); ${built.history.length} dòng lịch sử.`);
  console.log(`CV: ${built.cvs.length} dòng mới trỏ tới CV mẫu; ứng viên đã có CV thì dùng CV của họ.`);
  console.log(`Tên: đặt tên cho ${built.names.length} ứng viên chưa có tên.`);
  console.log("Lịch phỏng vấn:");
  for (const iv of built.interviews) {
    const app = built.applications.find((a) => a.id === iv.applicationId)!;
    const plan = APPLICATIONS.find((p) => demoId("app", p.key) === app.id)!;
    console.log(`  ${fmt(iv.scheduledAt as Date).padEnd(18)} ${String(iv.mode).padEnd(6)} ${String(iv.status).padEnd(9)} ${built.nameOf(plan.candidate)} — ${FIXTURE_JOBS[plan.job].title}`);
  }
  console.log(`Hội thoại: ${built.conversations.length} (${built.messages.length} tin nhắn). Lời mời: ${built.invitations.length} (${built.invitations.map((i) => i.status).join(", ")}).`);
  console.log(`Thông báo: ${built.notifications.filter((n) => n.userId === ctx.employerUserId).length} cho employer (${built.notifications.filter((n) => n.userId === ctx.employerUserId && !n.isRead).length} chưa đọc), ${built.notifications.filter((n) => n.type === "INTERVIEW_REMINDER").length} nhắc lịch đặt sẵn cho ứng viên (đã đọc, chặn email của cron).`);
  console.log(`Lượt xem theo ngày: ${stats.length} dòng mới (ngày đã có lượt xem thật được giữ).`);
  console.log(`outbox_events hiện có: ${outbox} (bản ghi sẽ huỷ nếu số này đổi).`);

  // Dự kiến = dữ liệu thật hiện có (bỏ dòng demo) + phần sẽ tạo, với trạng thái tin fixture sau khi cập nhật.
  const current = await loadSummaryInput(prisma, ctx, true);
  const fixtureIds = new Set(built.fixtureUpdates.map((u) => u.id));
  const nonFixtureJobs = await prisma.jobPost.findMany({
    where: { companyId: ctx.companyId, id: { notIn: [...fixtureIds] }, NOT: { id: isDemoId } },
    select: { status: true, expiresAt: true, moderationActions: { where: { NOT: { id: isDemoId } }, orderBy: { createdAt: "desc" }, take: 1, select: { action: true } } },
  });
  const statusOfApp = new Map(built.applications.map((a) => [a.id, a.status as ApplicationStatus]));
  const unreadPlanned = CONVERSATIONS.filter((c) => c.messages.some(([s, h]) => s === "C" && h < c.employerReadHoursAgo));
  const unreadCandidatesPlanned = new Set(unreadPlanned.map((c) => APPLICATIONS.find((a) => a.key === c.application)!.candidate));
  printSummary("Số dashboard dự kiến (tính cả dữ liệu thử của bạn):", {
    applications: [...current.applications, ...built.applications.map((a) => ({ status: a.status as ApplicationStatus, createdAt: a.createdAt as Date, reappliedAt: null }))],
    interviews: [
      ...current.interviews,
      ...built.interviews.map((i) => ({ status: i.status as string, scheduledAt: i.scheduledAt as Date, applicationStatus: statusOfApp.get(i.applicationId)! })),
    ],
    jobs: [
      ...built.fixtureUpdates.map((u) => ({ status: u.data.status, expiresAt: u.data.expiresAt, lastAction: u.key === "qa" ? "APPROVED" : null })),
      ...nonFixtureJobs.map((j) => ({ status: j.status, expiresAt: j.expiresAt, lastAction: j.moderationActions[0]?.action ?? null })),
      ...built.newJobs.map((j) => ({ status: j.data.status as JobPostStatus, expiresAt: j.data.expiresAt as Date, lastAction: itemAt(NEW_JOBS[j.key].actions, -1).action })),
    ],
    // Ứng viên của hội thoại thử khác ứng viên demo chưa đọc, nên cộng thẳng.
    unreadConversations: current.unreadConversations + unreadPlanned.length,
    unreadCandidates: current.unreadCandidates + unreadCandidatesPlanned.size,
  });
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const ctx = await loadContext(prisma);
  if (args.has("--dry-run")) return dryRun(ctx);
  if (args.has("--reset")) return reset(ctx);
  return write(ctx);
}

main()
  .catch((error) => {
    console.error(`✗ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
