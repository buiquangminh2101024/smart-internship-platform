import type { AuditHighlightAccount, AuditHighlightRule } from "@sip/shared-types";
import { DAY_MS, HOUR_MS } from "./audit-log.where";

// Khối "Điểm chính" của trang nhật ký (docs/05-frontend/phases/admin-activity-v2/PLAN.md
// N4–N6). File này chỉ có logic thuần: gộp theo tài khoản và tìm IP mới, không đọc DB.

/** Mỗi quy tắc "Cần xem" trả tối đa chừng này tài khoản (N4). */
export const HIGHLIGHT_ACCOUNT_LIMIT = 10;
/** (b) IP được coi là quen nếu đã dùng ở một lần đăng nhập trong chừng này ngày trước. */
export const NEW_IP_LOOKBACK_DAYS = 30;
/** (b) Số IP quen trả kèm để so. */
export const KNOWN_IP_LIMIT = 3;
/** (c) Một Employer gửi từ chừng này tin trong cùng một giờ thì bị báo. */
export const SUBMIT_BURST_PER_HOUR = 10;
/** (c) Hai hành động tính là "gửi duyệt": gửi chờ duyệt và tự đăng (công ty không cần duyệt). */
export const SUBMIT_BURST_ACTIONS = ["JOB_POST_SUBMITTED", "JOB_POST_AUTO_PUBLISHED"] as const;
/** (d) Một Admin có từ chừng này thao tác nguy hiểm trong cùng một giờ thì bị báo (bản 2.1, M3). */
export const DANGEROUS_ACTIONS_PER_HOUR = 5;
/**
 * (d) Thao tác nguy hiểm của Admin. `COMPANY_REQUIRES_APPROVAL_CHANGED` chỉ tính khi
 * **tắt** kiểm duyệt (`metadata.requiresApproval = false`, xem `APPROVAL_OFF_ACTION`).
 * `JOB_POST_RETRACTED` gồm cả gỡ tin theo báo cáo; không đếm `JOB_REPORT_ACTION_EXECUTED`
 * vì một lần gỡ tin đang hiển thị ghi cả hai dòng (M4). Duyệt, từ chối tin, duyệt danh
 * mục, xác minh công ty không tính: Admin làm nhiều là bình thường.
 */
export const DANGEROUS_ADMIN_ACTIONS = [
  "USER_SUSPENDED",
  "USER_SESSIONS_REVOKED",
  "COMPANY_REQUIRES_APPROVAL_CHANGED",
  "COMPANY_REJECTED",
  "JOB_POST_RETRACTED",
] as const;
/** (d) Action chỉ tính là nguy hiểm khi `metadata.requiresApproval = false`. */
export const APPROVAL_OFF_ACTION = "COMPANY_REQUIRES_APPROVAL_CHANGED";
/** (e) Một tin có chừng này báo cáo đang chờ của chừng này người khác nhau ... */
export const REPORTED_JOB_MIN_REPORTS = 3;
/** (e) ... trong vòng chừng này giờ thì bị báo (M5). */
export const REPORTED_JOB_WINDOW_HOURS = 24;

/** Số đếm của một tài khoản trong một quy tắc, trước khi gắn email. */
export type AccountTally<Extra extends object = object> = {
  userId: string;
  count: number;
  latestAt: Date;
  latestLogId: string;
} & Extra;

/** Một lần Admin đăng nhập thành công (`AUTH_LOGIN_SUCCEEDED`); `ip` null khi dòng không lưu IP. */
export interface AdminLoginRow {
  id: string;
  actorId: string;
  createdAt: Date;
  ip: string | null;
}

/** Một giờ (giờ tròn, UTC trùng ranh giới giờ Việt Nam) một Employer gửi từ ngưỡng tin trở lên. */
export interface SubmitBurstHourRow {
  userId: string;
  hourStart: Date;
  count: number;
  latestAt: Date;
  latestLogId: string;
}

export type NewIpTally = AccountTally<{ ip: string; knownIps: string[] }>;
export type BurstTally = AccountTally<{ maxPerHour: number; latestHour: { since: Date; until: Date; count: number } }>;

/** Lần gần nhất mới hơn đứng trước; bằng nhau thì theo userId để thứ tự luôn cố định. */
function byLatest(a: AccountTally, b: AccountTally): number {
  return b.latestAt.getTime() - a.latestAt.getTime() || a.userId.localeCompare(b.userId);
}

/** Tổng số lần, số tài khoản và `limit` tài khoản có lần gần nhất mới nhất. */
export function summarizeRule<T extends AccountTally>(
  tallies: readonly T[],
  limit: number = HIGHLIGHT_ACCOUNT_LIMIT,
): { count: number; accountCount: number; top: T[] } {
  return {
    count: tallies.reduce((sum, tally) => sum + tally.count, 0),
    accountCount: tallies.length,
    top: [...tallies].sort(byLatest).slice(0, limit),
  };
}

function compareLogin(a: AdminLoginRow, b: AdminLoginRow): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

/**
 * (b) Lần đăng nhập trong `window` có IP chưa xuất hiện ở lần đăng nhập nào của
 * chính Admin đó trong `lookbackDays` ngày trước nó. Không có lần nào trước đó
 * cũng là IP mới. `logins` phải gồm cả phần lùi `lookbackDays` ngày trước `window.gte`.
 * Lần không có IP thì không xét, và không làm IP quen cho lần khác.
 */
export function findNewIpLogins(
  logins: readonly AdminLoginRow[],
  window: { gte: Date; lt: Date },
  lookbackDays: number = NEW_IP_LOOKBACK_DAYS,
): NewIpTally[] {
  const lookbackMs = lookbackDays * DAY_MS;
  const byAdmin = new Map<string, AdminLoginRow[]>();
  for (const login of logins) {
    const list = byAdmin.get(login.actorId) ?? [];
    list.push(login);
    byAdmin.set(login.actorId, list);
  }

  const tallies: NewIpTally[] = [];
  for (const [actorId, list] of byAdmin) {
    list.sort(compareLogin);
    let tally: NewIpTally | undefined;
    for (let i = 0; i < list.length; i += 1) {
      const login = list[i]!;
      if (!login.ip || login.createdAt < window.gte || login.createdAt >= window.lt) continue;
      // IP của các lần trước trong khoảng lùi, mới trước, không trùng.
      const known: string[] = [];
      for (let j = i - 1; j >= 0; j -= 1) {
        const previous = list[j]!;
        if (previous.createdAt.getTime() < login.createdAt.getTime() - lookbackMs) break;
        if (previous.ip && !known.includes(previous.ip)) known.push(previous.ip);
      }
      if (known.includes(login.ip)) continue;
      // Duyệt từ cũ tới mới ⇒ lần sau cùng ghi đè là lần gần nhất.
      tally = {
        userId: actorId,
        count: (tally?.count ?? 0) + 1,
        latestAt: login.createdAt,
        latestLogId: login.id,
        ip: login.ip,
        knownIps: known.slice(0, KNOWN_IP_LIMIT),
      };
    }
    if (tally) tallies.push(tally);
  }
  return tallies;
}

/**
 * (c) Gộp các giờ vượt ngưỡng theo tài khoản: số giờ, số tin nhiều nhất trong
 * một giờ, và giờ gần nhất (dùng thẳng làm `since`/`until`; `until` là ms cuối giờ
 * vì danh sách tính cả mốc `until`).
 */
export function groupBurstHours(rows: readonly SubmitBurstHourRow[]): BurstTally[] {
  const byAccount = new Map<string, BurstTally>();
  for (const row of rows) {
    const current = byAccount.get(row.userId);
    const isLatest = !current || row.hourStart > current.latestHour.since;
    const latestHour = isLatest
      ? { since: row.hourStart, until: new Date(row.hourStart.getTime() + HOUR_MS - 1), count: row.count }
      : current.latestHour;
    byAccount.set(row.userId, {
      userId: row.userId,
      count: (current?.count ?? 0) + 1,
      latestAt: isLatest ? row.latestAt : current.latestAt,
      latestLogId: isLatest ? row.latestLogId : current.latestLogId,
      maxPerHour: Math.max(current?.maxPerHour ?? 0, row.count),
      latestHour,
    });
  }
  return [...byAccount.values()];
}

/** (e) Một báo cáo đang chờ (`job_reports.status = PENDING`). */
export interface PendingReportRow {
  id: string;
  jobId: string;
  reporterId: string;
  createdAt: Date;
}

/** (e) Một tin vượt ngưỡng báo cáo, trước khi gắn tên tin và công ty. */
export interface ReportedJobTally {
  jobId: string;
  pendingReports: number;
  crossedAt: Date;
  oldestPendingAt: Date;
  oldestPendingReportId: string;
}

function compareReport(a: PendingReportRow, b: PendingReportRow): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
}

/**
 * (e) Tin có `minReports` báo cáo đang chờ của `minReports` người khác nhau trong vòng
 * `windowHours` giờ (báo cáo thứ k và thứ k + minReports − 1, xếp theo giờ gửi, cách nhau
 * không quá `windowHours` giờ). Mỗi người chỉ lấy báo cáo sớm nhất trên một tin.
 * **Thời điểm vượt ngưỡng** là giờ gửi của báo cáo đủ ngưỡng trong lần đầu đạt ngưỡng; chỉ
 * trả tin có thời điểm này nằm trong `window`. Tin vượt ngưỡng gần nhất đứng trước.
 * `reports` phải là mọi báo cáo đang chờ (không cắt theo khoảng), để biết lần đầu đạt ngưỡng.
 */
export function findReportedJobs(
  reports: readonly PendingReportRow[],
  window: { gte: Date; lt: Date },
  minReports: number = REPORTED_JOB_MIN_REPORTS,
  windowHours: number = REPORTED_JOB_WINDOW_HOURS,
): ReportedJobTally[] {
  const windowMs = windowHours * HOUR_MS;
  const byJob = new Map<string, PendingReportRow[]>();
  for (const report of reports) {
    const list = byJob.get(report.jobId) ?? [];
    list.push(report);
    byJob.set(report.jobId, list);
  }

  const tallies: ReportedJobTally[] = [];
  for (const [jobId, list] of byJob) {
    list.sort(compareReport);
    const seen = new Set<string>();
    const firstPerReporter = list.filter((report) => {
      if (seen.has(report.reporterId)) return false;
      seen.add(report.reporterId);
      return true;
    });
    let crossedAt: Date | undefined;
    for (let i = minReports - 1; i < firstPerReporter.length; i += 1) {
      const last = firstPerReporter[i]!;
      const first = firstPerReporter[i - minReports + 1]!;
      if (last.createdAt.getTime() - first.createdAt.getTime() <= windowMs) {
        crossedAt = last.createdAt;
        break;
      }
    }
    if (!crossedAt || crossedAt < window.gte || crossedAt >= window.lt) continue;
    const oldest = list[0]!;
    tallies.push({
      jobId,
      pendingReports: list.length,
      crossedAt,
      oldestPendingAt: oldest.createdAt,
      oldestPendingReportId: oldest.id,
    });
  }
  return tallies.sort((a, b) => b.crossedAt.getTime() - a.crossedAt.getTime() || a.jobId.localeCompare(b.jobId));
}

/** Gắn email và đổi thời điểm sang ISO cho phần tài khoản chung của mọi quy tắc. */
export function toAccountBase(tally: AccountTally, emails: ReadonlyMap<string, string>): AuditHighlightAccount {
  return {
    userId: tally.userId,
    email: emails.get(tally.userId) ?? null,
    count: tally.count,
    latestAt: tally.latestAt.toISOString(),
    latestLogId: tally.latestLogId,
  };
}

/** Một quy tắc đã gộp ⇒ dạng trả về của API. */
export function toRule<T extends AccountTally, A extends AuditHighlightAccount>(
  summary: { count: number; accountCount: number; top: T[] },
  toAccount: (tally: T) => A,
): AuditHighlightRule<A> {
  return { count: summary.count, accountCount: summary.accountCount, accounts: summary.top.map(toAccount) };
}
