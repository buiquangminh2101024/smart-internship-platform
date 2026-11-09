// Phần thuần của script ghi dữ liệu demo lớn (docs/06-backend/large-demo-data/PLAN.md, bước 3):
// id cho mục danh mục thêm, kiểm dữ liệu sinh ra trước khi ghi, chia lô, ước dung lượng;
// và phần thuần của bước embedding (bước 4): chọn target cần tính, ước thời gian còn lại.
// Không đọc DB, để unit test chạy không cần DB và --dry-run dùng đúng các hàm này.
import type { GeneratedLargeDemo } from "./generate";
import { LARGE_DEMO_EMAIL_DOMAIN, LARGE_DEMO_ID_PREFIX, idOf } from "./generate";
import type { GeneratedHistory } from "./history";

/** Số dòng mỗi lần `createMany` (PLAN "Phần 1": ~500 dòng / lần). */
export const WRITE_BATCH_SIZE = 500;
/** Dừng nếu dung lượng DB sau khi ghi dự kiến vượt mức này (PLAN bước 3). */
export const MAX_DATABASE_BYTES = 200 * 1024 * 1024;
/**
 * Hệ số đổi từ độ dài JSON của bản ghi sang dung lượng Postgres (đầu dòng, chỉ mục, TOAST).
 * Ước thô, cố ý nghiêng về phía lớn; số thật đo bằng pg_database_size sau khi ghi.
 */
export const STORAGE_FACTOR = 2.5;

export type CatalogKind = "skill" | "industry" | "city";
const CATALOG_ID_KIND: Record<CatalogKind, string> = { skill: "skill", industry: "ind", city: "city" };

/** FNV-1a 32 bit — id mục danh mục theo tên, không phụ thuộc thứ tự trong catalog-additions.json. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(value, "utf8")) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** id của một mục danh mục do seed thêm (Skill / Industry / City), cố định theo tên. */
export function catalogAdditionId(kind: CatalogKind, name: string): string {
  return idOf(CATALOG_ID_KIND[kind], fnv1a(name.normalize("NFC")).toString(36));
}

/** Gán id cho các tên; báo lỗi nếu hai tên khác nhau ra cùng id (để không ghi đè nhầm). */
export function catalogAdditionIds(kind: CatalogKind, names: readonly string[]): Map<string, string> {
  const byId = new Map<string, string>();
  const result = new Map<string, string>();
  for (const name of names) {
    const id = catalogAdditionId(kind, name);
    const other = byId.get(id);
    if (other !== undefined && other !== name) throw new Error(`Hai mục danh mục "${other}" và "${name}" ra cùng id ${id} — đổi tên một mục`);
    byId.set(id, name);
    result.set(name, id);
  }
  return result;
}

/** Bảng ghi theo đúng thứ tự khoá ngoại; nhãn dùng để in. */
export interface WriteTable {
  key: string;
  label: string;
  rows: readonly object[];
}
export interface WriteGroup {
  label: string;
  tables: WriteTable[];
}

/** Các nhóm ghi, mỗi nhóm một transaction ngắn (PLAN "Phần 1"). Thứ tự trong nhóm theo khoá ngoại. */
export function writeGroups(demo: GeneratedLargeDemo, history: GeneratedHistory): WriteGroup[] {
  return [
    {
      label: "Công ty, tài khoản, gói",
      tables: [
        { key: "user", label: "tài khoản", rows: demo.users },
        { key: "company", label: "công ty", rows: demo.companies },
        { key: "employer", label: "nhà tuyển dụng", rows: demo.employers },
        { key: "companySubscription", label: "gói", rows: demo.subscriptions },
      ],
    },
    {
      label: "Tin tuyển dụng",
      tables: [
        { key: "jobPost", label: "tin", rows: demo.jobPosts },
        { key: "jobPostSkill", label: "kỹ năng của tin", rows: demo.jobPostSkills },
        { key: "jobPostMajor", label: "ngành của tin", rows: demo.jobPostMajors },
        { key: "jobPostModerationAction", label: "dòng kiểm duyệt", rows: demo.moderationActions },
        { key: "jobPostDailyStat", label: "ngày lượt xem", rows: demo.dailyStats },
      ],
    },
    {
      label: "Ứng viên",
      tables: [
        { key: "candidate", label: "ứng viên", rows: demo.candidates },
        { key: "education", label: "học vấn", rows: demo.educations },
        { key: "workExperience", label: "kinh nghiệm", rows: demo.workExperiences },
        { key: "project", label: "dự án", rows: demo.projects },
        { key: "certificate", label: "chứng chỉ", rows: demo.certificates },
        { key: "candidateSkill", label: "kỹ năng ứng viên", rows: demo.candidateSkills },
        { key: "cv", label: "CV", rows: demo.cvs },
      ],
    },
    {
      label: "Lịch sử",
      tables: [
        { key: "application", label: "đơn ứng tuyển", rows: history.applications },
        { key: "applicationStatusHistory", label: "dòng lịch sử trạng thái", rows: history.statusHistory },
        { key: "interview", label: "lịch phỏng vấn", rows: history.interviews },
        { key: "candidateOutreachInvitation", label: "lời mời", rows: history.invitations },
        { key: "conversation", label: "hội thoại", rows: history.conversations },
        { key: "message", label: "tin nhắn", rows: history.messages },
        { key: "savedJob", label: "tin đã lưu", rows: history.savedJobs },
        { key: "notification", label: "thông báo", rows: [...history.notifications, ...history.reminderGuards] },
      ],
    },
  ];
}

export function chunk<T>(rows: readonly T[], size = WRITE_BATCH_SIZE): T[][] {
  if (size <= 0) throw new Error("size phải > 0");
  const batches: T[][] = [];
  for (let i = 0; i < rows.length; i += size) batches.push(rows.slice(i, i + size));
  return batches;
}

/** Ước số byte sẽ thêm vào DB (độ dài JSON × STORAGE_FACTOR). */
export function estimateBytes(groups: readonly WriteGroup[]): number {
  let bytes = 0;
  for (const group of groups) {
    for (const table of group.tables) {
      for (const row of table.rows) bytes += Buffer.byteLength(JSON.stringify(row));
    }
  }
  return Math.round(bytes * STORAGE_FACTOR);
}

export const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Kiểm dữ liệu sinh ra trước khi ghi: id có tiền tố, email đúng domain, tin hết hạn trước gói,
 * id không trùng. Trả về danh sách lỗi (rỗng = ghi được).
 */
export function preflightIssues(demo: GeneratedLargeDemo, history: GeneratedHistory): string[] {
  const issues: string[] = [];
  for (const group of writeGroups(demo, history)) {
    for (const table of group.tables) {
      const seen = new Set<string>();
      let badPrefix = 0;
      let duplicates = 0;
      for (const row of table.rows) {
        const id = (row as { id?: unknown }).id;
        if (id === undefined) continue; // bảng khoá ghép (kỹ năng / ngành của tin, kỹ năng ứng viên)
        if (typeof id !== "string" || !id.startsWith(LARGE_DEMO_ID_PREFIX)) badPrefix++;
        else if (seen.has(id)) duplicates++;
        else seen.add(id);
      }
      if (badPrefix > 0) issues.push(`${table.label}: ${badPrefix} dòng có id không bắt đầu bằng "${LARGE_DEMO_ID_PREFIX}"`);
      if (duplicates > 0) issues.push(`${table.label}: ${duplicates} id bị trùng`);
    }
  }
  const badEmails = demo.users.filter((u) => !u.email.endsWith(`@${LARGE_DEMO_EMAIL_DOMAIN}`)).length;
  if (badEmails > 0) issues.push(`${badEmails} tài khoản có email ngoài @${LARGE_DEMO_EMAIL_DOMAIN}`);
  const end = demo.subscriptionEnd.getTime();
  const lateJobs = demo.jobPosts.filter((job) => job.expiresAt && new Date(job.expiresAt).getTime() >= end).length;
  if (lateJobs > 0) issues.push(`${lateJobs} tin hết hạn sau ngày kết thúc gói — cron job-post-expiry sẽ đóng tin sớm`);
  return issues;
}

// ─── Embedding (bước 4) ─────────────────────────────────────────────────────

/** Số tin / hồ sơ mỗi lô: nạp profile, so hash, ghi vector một câu lệnh. */
export const EMBED_BATCH_SIZE = 50;

export interface EmbedTarget {
  id: string;
  text: string;
}

/**
 * Target cần tính (chưa có vector hoặc hash đã đổi), kèm hash mới. Văn bản rỗng bỏ qua
 * (service thật cũng không embed, cosine = null). Trùng id chỉ giữ lần đầu.
 */
export function staleTargets(
  targets: readonly EmbedTarget[],
  storedHashes: ReadonlyMap<string, string>,
  hashOf: (text: string) => string,
): { target: EmbedTarget; contentHash: string }[] {
  const seen = new Set<string>();
  const stale: { target: EmbedTarget; contentHash: string }[] = [];
  for (const target of targets) {
    if (target.text.trim() === "" || seen.has(target.id)) continue;
    seen.add(target.id);
    const contentHash = hashOf(target.text);
    if (storedHashes.get(target.id) !== contentHash) stale.push({ target, contentHash });
  }
  return stale;
}

/** "còn ~X" từ tốc độ đã chạy; null khi chưa có gì để ước. */
export function remainingSeconds(done: number, total: number, elapsedMs: number): number | null {
  if (done <= 0 || done >= total) return null;
  return Math.round(((elapsedMs / done) * (total - done)) / 1000);
}
