import type {
  AuditActionGroup,
  AuditActivityGroup,
  AuditActivityItem,
  AuditActorRoleFilter,
} from "@sip/shared-types";
import { formatVnDate, formatVnTime, vnTodayIso } from "./dashboard-format";

/*
 * Thư viện của trang Nhật ký hoạt động (docs/05-frontend/phases/admin-audit-log/PLAN.md):
 * nhãn và icon cho nhóm, hành động, vai trò; chuyển qua lại giữa URL và bộ lọc;
 * link tới đối tượng; gom thao tác thành phiên. Không gọi API.
 */

// ─── Nhóm, hành động, vai trò ────────────────────────────────────────────

export const AUDIT_GROUPS: readonly AuditActionGroup[] = [
  "JOB_POST",
  "COMPANY",
  "CATALOG",
  "PAYMENT",
  "ACCOUNT",
  "SECURITY",
];

export interface GroupMeta {
  label: string;
  icon: string;
  /** Class nền đầy đủ (Tailwind quét được), cho ô màu và thanh. */
  swatch: string;
  /** Màu cho SVG (`fill`). */
  color: string;
}

// QF1: 6 token `--color-audit-*`, đúng thứ tự đã qua validate_palette.js.
export const GROUP_META: Record<AuditActivityGroup, GroupMeta> = {
  JOB_POST: { label: "Tin tuyển dụng", icon: "clipboard-check", swatch: "bg-audit-job", color: "var(--color-audit-job)" },
  COMPANY: { label: "Công ty", icon: "building-2", swatch: "bg-audit-company", color: "var(--color-audit-company)" },
  CATALOG: { label: "Danh mục", icon: "library", swatch: "bg-audit-catalog", color: "var(--color-audit-catalog)" },
  PAYMENT: { label: "Thanh toán", icon: "credit-card", swatch: "bg-audit-payment", color: "var(--color-audit-payment)" },
  ACCOUNT: { label: "Tài khoản", icon: "user-round", swatch: "bg-audit-account", color: "var(--color-audit-account)" },
  SECURITY: { label: "Bảo mật", icon: "shield-alert", swatch: "bg-audit-security", color: "var(--color-audit-security)" },
  OTHER: { label: "Khác", icon: "history", swatch: "bg-text-subtle", color: "var(--color-text-subtle)" },
};

/** Khớp `AUDIT_ACTIONS` của server (`audit-log.actions.ts`). */
export const ACTION_META: Record<string, { label: string; group: AuditActionGroup }> = {
  JOB_POST_SUBMITTED: { label: "Gửi duyệt tin", group: "JOB_POST" },
  JOB_POST_AUTO_PUBLISHED: { label: "Tự đăng tin", group: "JOB_POST" },
  JOB_POST_APPROVED: { label: "Duyệt tin", group: "JOB_POST" },
  JOB_POST_REJECTED: { label: "Từ chối tin", group: "JOB_POST" },
  JOB_POST_RETRACTED: { label: "Hạ tin", group: "JOB_POST" },
  COMPANY_SUBMITTED: { label: "Gửi xác minh công ty", group: "COMPANY" },
  COMPANY_AUTO_VERIFIED: { label: "Tự xác minh công ty", group: "COMPANY" },
  COMPANY_VERIFIED: { label: "Xác minh công ty", group: "COMPANY" },
  COMPANY_REJECTED: { label: "Từ chối công ty", group: "COMPANY" },
  COMPANY_REQUIRES_APPROVAL_CHANGED: { label: "Đổi chế độ duyệt tin", group: "COMPANY" },
  CATALOG_ENTRY_APPROVED: { label: "Duyệt mục danh mục", group: "CATALOG" },
  CATALOG_ENTRY_RENAME_APPROVED: { label: "Duyệt đổi tên", group: "CATALOG" },
  CATALOG_ENTRY_REJECTED: { label: "Từ chối mục danh mục", group: "CATALOG" },
  CATALOG_ENTRY_MERGED: { label: "Gộp mục danh mục", group: "CATALOG" },
  PAYMENT_COMPLETED: { label: "Thanh toán gói", group: "PAYMENT" },
  USER_SUSPENDED: { label: "Khoá tài khoản", group: "ACCOUNT" },
  USER_REACTIVATED: { label: "Mở khoá tài khoản", group: "ACCOUNT" },
  USER_SESSIONS_REVOKED: { label: "Đăng xuất mọi thiết bị", group: "ACCOUNT" },
  USER_ACTIVATED: { label: "Kích hoạt tài khoản", group: "ACCOUNT" },
  USER_PASSWORD_RESET_GUIDE_SENT: { label: "Gửi hướng dẫn đặt lại mật khẩu", group: "ACCOUNT" },
  AUTH_LOGIN_SUCCEEDED: { label: "Đăng nhập quản trị", group: "SECURITY" },
  AUTH_LOGIN_FAILED_REPEATED: { label: "Đăng nhập sai nhiều lần", group: "SECURITY" },
  AUTH_PASSWORD_RESET: { label: "Đặt lại mật khẩu", group: "SECURITY" },
  AUTH_GOOGLE_LINKED: { label: "Liên kết Google", group: "SECURITY" },
};

export const FAILED_LOGIN_ACTION = "AUTH_LOGIN_FAILED_REPEATED";

/** Hai hành động có cờ "gửi lại sau từ chối" (L28). */
export const RESUBMIT_ACTIONS: readonly string[] = ["JOB_POST_SUBMITTED", "JOB_POST_AUTO_PUBLISHED"];

/** Nhãn hành động của một dòng; gửi duyệt có cờ gửi lại thì thành "Gửi lại tin". */
export function actionLabel(action: string, resubmit?: boolean | null): string {
  if (resubmit && action === "JOB_POST_SUBMITTED") return "Gửi lại tin";
  if (resubmit && action === "JOB_POST_AUTO_PUBLISHED") return "Tự đăng lại tin";
  return ACTION_META[action]?.label ?? action;
}

export const ROLE_FILTERS: readonly AuditActorRoleFilter[] = ["ADMIN", "EMPLOYER", "CANDIDATE", "SYSTEM"];

/** Cùng nhãn với trang Người dùng. */
export const ROLE_LABEL: Record<AuditActorRoleFilter, string> = {
  ADMIN: "Quản trị",
  EMPLOYER: "Doanh nghiệp",
  CANDIDATE: "Sinh viên",
  SYSTEM: "Hệ thống",
};

export const ENTITY_LABEL: Record<string, string> = {
  JobPost: "Tin tuyển dụng",
  Company: "Công ty",
  User: "Người dùng",
  Subscription: "Gói dịch vụ",
  Skill: "Kỹ năng",
  University: "Trường",
  Major: "Ngành",
};

/** Thứ Hai … Chủ Nhật, chỉ số `dow - 1` (1 = Thứ Hai, như API). */
export const DOW_LABEL = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"] as const;
export const DOW_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

/** `Thứ Ba, 9:00–10:00`. */
export function slotLabel(dow: number, hour: number): string {
  return `${DOW_LABEL[dow - 1]}, ${hour}:00–${hour + 1}:00`;
}

/** Link sang trang của đối tượng (bảng ở Phần 2 của plan FE). Không dựng được thì null. */
export function entityHref(
  item: Pick<AuditActivityItem, "entityType" | "entityId" | "companyId">,
): { href: string; label: string } | null {
  const id = encodeURIComponent(item.entityId);
  switch (item.entityType) {
    case "JobPost":
      return { href: `/admin/jobs/${id}`, label: "Mở tin" };
    case "Company":
      return { href: `/admin/companies/${id}`, label: "Mở công ty" };
    case "User":
      return { href: `/admin/users/${id}`, label: "Mở người dùng" };
    case "Subscription":
      return item.companyId
        ? { href: `/admin/companies/${encodeURIComponent(item.companyId)}`, label: "Mở công ty" }
        : null;
    case "Skill":
      return { href: "/admin/skills", label: "Mở kỹ năng" };
    case "University":
    case "Major":
      return { href: "/admin/education-catalog", label: "Mở danh mục" };
    default:
      return null;
  }
}

/** Link "Xem trong nhật ký" từ trang chi tiết của một đối tượng. */
export function activityHrefForEntity(entityType: string, entityId: string): string {
  return `/admin/activity?ent=${encodeURIComponent(`${entityType}:${entityId}`)}`;
}

// ─── Ngày ────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 366;
export const DEFAULT_RANGE_DAYS = 30;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` có thật trên lịch. */
export function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Cộng `days` ngày vào một ngày lịch (không phụ thuộc múi giờ máy). */
export function shiftDate(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Số ngày của khoảng, tính cả hai đầu. */
export function rangeDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** `2026-10-18` → `18/10/2026`. */
export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

/** `18/10/2026` (hoặc `8/9/2026`) → `2026-10-18`; sai định dạng hay ngày không có thật thì null. */
export function parseDateInput(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  return isCalendarDate(iso) ? iso : null;
}

/** Giờ đầy đủ theo giờ Việt Nam: `09:12 18/10/2026`. */
export function formatVnDateTime(value: string): string {
  return `${formatVnTime(value)} ${formatVnDate(value)}`;
}

// ─── Bộ lọc trên URL ─────────────────────────────────────────────────────

export interface ActivityFilters {
  groups: AuditActionGroup[];
  roles: AuditActorRoleFilter[];
  /** Chỉ có khi URL ghi rõ; vắng thì dùng mặc định (`effectiveRange`). */
  from: string | null;
  to: string | null;
  q: string | null;
  actions: string[];
  resubmit: boolean | null;
  slot: { dow: number; hour: number } | null;
  ent: { type: string; id: string } | null;
  actorId: string | null;
  since: string | null;
  until: string | null;
  archived: boolean;
}

export const EMPTY_FILTERS: ActivityFilters = {
  groups: [],
  roles: [],
  from: null,
  to: null,
  q: null,
  actions: [],
  resubmit: null,
  slot: null,
  ent: null,
  actorId: null,
  since: null,
  until: null,
  archived: false,
};

/** Chỗ báo lỗi của tham số sai: ô tương ứng ở thanh lọc, hoặc dòng nhắc dưới hàng chip. */
export type ActivityParamError = "group" | "actorRole" | "range" | "q" | "link";

export interface ParsedActivityParams {
  filters: ActivityFilters;
  /** Dòng đang mở trong ngăn kéo; không phải bộ lọc. */
  row: string | null;
  errors: Partial<Record<ActivityParamError, string>>;
}

const Q_MIN = 2;
const Q_MAX = 100;
const ID_MAX = 64;
const ACTION_MAX = 10;

function listParam(params: URLSearchParams, key: string): string[] {
  return [
    ...new Set(
      params
        .getAll(key)
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function intParam(value: string | null, min: number, max: number): number | null {
  if (value === null || !/^\d{1,2}$/.test(value)) return null;
  const number = Number(value);
  return number >= min && number <= max ? number : null;
}

function isIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Đọc bộ lọc từ URL — hàm duy nhất làm việc này. Giá trị sai thì bỏ qua (không
 * ném lỗi) và ghi một câu vào `errors` để hiện ngay tại ô. Ràng buộc giống
 * `audit-log.dto.ts` của server, nên bộ lọc đọc được luôn gửi lên được.
 */
export function parseActivityParams(params: URLSearchParams): ParsedActivityParams {
  const errors: ParsedActivityParams["errors"] = {};
  const badLink: string[] = [];
  const filters: ActivityFilters = { ...EMPTY_FILTERS };

  const groups = listParam(params, "group");
  filters.groups = groups.filter((value): value is AuditActionGroup => AUDIT_GROUPS.includes(value as AuditActionGroup));
  if (filters.groups.length < groups.length) errors.group = "Link có nhóm không tồn tại, đã bỏ qua.";

  const roles = listParam(params, "actorRole");
  filters.roles = roles.filter((value): value is AuditActorRoleFilter =>
    ROLE_FILTERS.includes(value as AuditActorRoleFilter),
  );
  if (filters.roles.length < roles.length) errors.actorRole = "Link có vai trò không tồn tại, đã bỏ qua.";

  const actions = listParam(params, "action");
  filters.actions = actions.filter((value) => value in ACTION_META).slice(0, ACTION_MAX);
  if (filters.actions.length < actions.length) badLink.push("hành động");

  const resubmit = params.get("resubmit");
  if (resubmit !== null) {
    const valid =
      (resubmit === "true" || resubmit === "false") &&
      filters.actions.length > 0 &&
      filters.actions.every((action) => RESUBMIT_ACTIONS.includes(action));
    if (valid) filters.resubmit = resubmit === "true";
    else badLink.push("gửi lại");
  }

  const dowRaw = params.get("dow");
  const hourRaw = params.get("hour");
  if (dowRaw !== null || hourRaw !== null) {
    const dow = intParam(dowRaw, 1, 7);
    const hour = intParam(hourRaw, 0, 23);
    if (dow !== null && hour !== null) filters.slot = { dow, hour };
    else badLink.push("ô thứ × giờ");
  }

  const ent = params.get("ent");
  if (ent !== null) {
    const split = ent.indexOf(":");
    const type = split > 0 ? ent.slice(0, split) : "";
    const id = split > 0 ? ent.slice(split + 1) : "";
    if (type in ENTITY_LABEL && id.length > 0 && id.length <= ID_MAX) filters.ent = { type, id };
    else badLink.push("đối tượng");
  }

  const actorId = params.get("actorId");
  if (actorId !== null) {
    if (actorId.length > 0 && actorId.length <= ID_MAX) filters.actorId = actorId;
    else badLink.push("người làm");
  }

  // Phiên làm việc (L33): since/until, không đi cùng from/to.
  const since = params.get("since");
  const until = params.get("until");
  if (since !== null || until !== null) {
    const sinceOk = since === null || isIsoDateTime(since);
    const untilOk = until === null || isIsoDateTime(until);
    const ordered = !since || !until || Date.parse(since) < Date.parse(until);
    const short = !since || !until || Date.parse(until) - Date.parse(since) <= MAX_RANGE_DAYS * DAY_MS;
    if (sinceOk && untilOk && ordered && short) {
      filters.since = since;
      filters.until = until;
    } else {
      badLink.push("phiên làm việc");
    }
  }

  const from = params.get("from");
  const to = params.get("to");
  if ((from !== null || to !== null) && (filters.since || filters.until)) {
    errors.range = "Đang lọc theo một phiên làm việc nên bỏ qua khoảng ngày trên link.";
  } else if (from !== null || to !== null) {
    if ((from !== null && !isCalendarDate(from)) || (to !== null && !isCalendarDate(to))) {
      errors.range = "Ngày trên link không đúng định dạng, đang dùng 30 ngày gần nhất.";
    } else if (from && to && from > to) {
      errors.range = "Ngày kết thúc phải từ ngày bắt đầu trở đi.";
    } else if (from && to && rangeDays(from, to) > MAX_RANGE_DAYS) {
      errors.range = `Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày.`;
    } else {
      filters.from = from;
      filters.to = to;
    }
  }

  const q = params.get("q")?.trim() ?? "";
  if (q.length >= Q_MIN && q.length <= Q_MAX) filters.q = q;
  else if (q.length > Q_MAX) errors.q = `Từ khoá tối đa ${Q_MAX} ký tự.`;
  else if (q.length > 0) errors.q = `Gõ ít nhất ${Q_MIN} ký tự.`;

  filters.archived = params.get("archived") === "1" || params.get("archived") === "true";

  if (badLink.length > 0) errors.link = `Link có tham số sai (${badLink.join(", ")}), đã bỏ qua.`;

  const row = params.get("row");
  return { filters, row: row && row.length <= ID_MAX ? row : null, errors };
}

/** Bộ lọc → query string của trang (ngược với `parseActivityParams`). */
export function toActivityParams(filters: ActivityFilters, row?: string | null): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.groups.length) params.set("group", filters.groups.join(","));
  if (filters.roles.length) params.set("actorRole", filters.roles.join(","));
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.q) params.set("q", filters.q);
  if (filters.actions.length) params.set("action", filters.actions.join(","));
  if (filters.resubmit !== null) params.set("resubmit", String(filters.resubmit));
  if (filters.slot) {
    params.set("dow", String(filters.slot.dow));
    params.set("hour", String(filters.slot.hour));
  }
  if (filters.ent) params.set("ent", `${filters.ent.type}:${filters.ent.id}`);
  if (filters.actorId) params.set("actorId", filters.actorId);
  if (filters.since) params.set("since", filters.since);
  if (filters.until) params.set("until", filters.until);
  if (filters.archived) params.set("archived", "1");
  if (row) params.set("row", row);
  return params;
}

/** Số bộ lọc đang bật (nút "Bộ lọc (n)" trên màn hình hẹp); không tính "xem lưu trữ". */
export function countActiveFilters(filters: ActivityFilters): number {
  return (
    filters.groups.length +
    filters.roles.length +
    (filters.from || filters.to ? 1 : 0) +
    (filters.q ? 1 : 0) +
    filters.actions.length +
    (filters.slot ? 1 : 0) +
    (filters.ent ? 1 : 0) +
    (filters.actorId || filters.since || filters.until ? 1 : 0)
  );
}

/** Bỏ mọi bộ lọc, giữ lựa chọn "xem nhật ký đã lưu trữ". */
export function clearedFilters(filters: ActivityFilters): ActivityFilters {
  return { ...EMPTY_FILTERS, archived: filters.archived };
}

export type ActivityRange =
  | { kind: "days"; from: string; to: string; isDefault: boolean }
  | { kind: "time"; since: string | null; until: string | null }
  | { kind: "all" };

/**
 * Khoảng thời gian thật sự dùng để gọi API. Mặc định 30 ngày gần nhất. Riêng khi
 * xem một đối tượng (`ent`, vd. link "Xem trong nhật ký") hoặc xem nhật ký đã lưu
 * trữ mà không chọn khoảng thì lấy toàn bộ thời gian: đối tượng thì để không giấu
 * các bước cũ hơn 30 ngày, lưu trữ thì vì mọi dòng ở đó đều cũ hơn 30 ngày.
 */
export function effectiveRange(filters: ActivityFilters, today: string = vnTodayIso()): ActivityRange {
  if (filters.since || filters.until) return { kind: "time", since: filters.since, until: filters.until };
  if (filters.from || filters.to) {
    let to = filters.to ?? (filters.from! > today ? filters.from! : today);
    const from = filters.from ?? shiftDate(to, -(DEFAULT_RANGE_DAYS - 1));
    if (rangeDays(from, to) > MAX_RANGE_DAYS) to = shiftDate(from, MAX_RANGE_DAYS - 1);
    return { kind: "days", from, to, isDefault: false };
  }
  // Lọc ô thứ × giờ cần đủ khoảng ngày (server), nên vẫn dùng mặc định.
  if ((filters.ent || filters.archived) && !filters.slot) return { kind: "all" };
  return { kind: "days", from: shiftDate(today, -(DEFAULT_RANGE_DAYS - 1)), to: today, isDefault: true };
}

/** Câu mô tả khoảng ở dòng phụ đầu trang. */
export function rangeLabel(range: ActivityRange): string {
  if (range.kind === "all") return "toàn bộ thời gian";
  if (range.kind === "days") return `${formatIsoDate(range.from)} – ${formatIsoDate(range.to)}`;
  const since = range.since ? formatVnDateTime(range.since) : "trước đó";
  const until = range.until ? formatVnDateTime(range.until) : "nay";
  return `${since} – ${until}`;
}

/** Phần bộ lọc chung của mọi API nhật ký (không có khoảng thời gian, đối tượng, lưu trữ). */
function setCommon(params: URLSearchParams, filters: ActivityFilters): void {
  if (filters.groups.length) params.set("group", filters.groups.join(","));
  if (filters.roles.length) params.set("actorRole", filters.roles.join(","));
  if (filters.actions.length) params.set("action", filters.actions.join(","));
  if (filters.resubmit !== null) params.set("resubmit", String(filters.resubmit));
  if (filters.slot) {
    params.set("dow", String(filters.slot.dow));
    params.set("hour", String(filters.slot.hour));
  }
  if (filters.q) params.set("q", filters.q);
}

/** Query của `GET /admin/activity` và `/export`: mọi bộ lọc, kể cả đối tượng, người làm, lưu trữ. */
export function toListSearch(filters: ActivityFilters, today?: string): URLSearchParams {
  const params = new URLSearchParams();
  setCommon(params, filters);
  const range = effectiveRange(filters, today);
  if (range.kind === "days") {
    params.set("from", range.from);
    params.set("to", range.to);
  } else if (range.kind === "time") {
    if (range.since) params.set("since", range.since);
    if (range.until) params.set("until", range.until);
  }
  if (filters.ent) {
    params.set("entityType", filters.ent.type);
    params.set("entityId", filters.ent.id);
  }
  if (filters.actorId) params.set("actorId", filters.actorId);
  if (filters.archived) params.set("archived", "true");
  return params;
}

/**
 * Query của `/stats` (L11): bỏ đối tượng, người làm, phiên, lưu trữ. Chỉ gửi
 * khoảng ngày khi đang lọc theo ngày; còn lại server dùng mặc định 30 ngày.
 */
export function toStatsSearch(filters: ActivityFilters, today?: string): URLSearchParams {
  const params = new URLSearchParams();
  setCommon(params, filters);
  const range = effectiveRange({ ...filters, ent: null, since: null, until: null, archived: false }, today);
  if (range.kind === "days") {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  return params;
}

// ─── Phiên làm việc ──────────────────────────────────────────────────────

export interface ActivitySession {
  start: string;
  end: string;
  items: AuditActivityItem[];
}

/** Gom thao tác (đã xếp cũ trước) thành phiên: hai dòng liền nhau cách ≤ `gapMinutes` thì cùng phiên (L33). */
export function groupSessions(items: AuditActivityItem[], gapMinutes = 30): ActivitySession[] {
  const gap = gapMinutes * 60_000;
  const sessions: ActivitySession[] = [];
  for (const item of items) {
    const last = sessions[sessions.length - 1];
    if (last && Date.parse(item.createdAt) - Date.parse(last.end) <= gap) {
      last.items.push(item);
      last.end = item.createdAt;
    } else {
      sessions.push({ start: item.createdAt, end: item.createdAt, items: [item] });
    }
  }
  return sessions;
}

/**
 * Khoảng `since`/`until` để lọc đúng một phiên: `until` lùi thêm 1 ms sau dòng
 * cuối vì server lọc `createdAt < until`.
 */
export function sessionRange(session: ActivitySession): { since: string; until: string } {
  return { since: session.start, until: new Date(Date.parse(session.end) + 1).toISOString() };
}

/** `09:12–09:47` (cùng ngày) hoặc `23:40 17/10 – 00:15 18/10`. */
export function sessionTimeLabel(since: string, until: string): string {
  const sameDay = formatVnDate(since) === formatVnDate(until);
  return sameDay
    ? `${formatVnTime(since)}–${formatVnTime(until)} ${formatVnDate(since)}`
    : `${formatVnDateTime(since)} – ${formatVnDateTime(until)}`;
}
