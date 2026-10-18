import { z } from "zod";
import { AUDIT_ACTIONS } from "./audit-log.actions";

// docs/06-backend/admin-audit-log/PLAN.md L7, L11–L13, L27–L29, L33, L35.

const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;
const RESUBMIT_ACTIONS: readonly string[] = ["JOB_POST_SUBMITTED", "JOB_POST_AUTO_PUBLISHED"];

// `YYYY-MM-DD` và phải là ngày có thật (cùng cách kiểm với users.dto).
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "Invalid date");

const isoDateTime = z.string().datetime({ offset: true, message: "since/until must be ISO 8601 with a time zone" });

const flag = z
  .enum(["true", "false", "1", "0"], { message: "Expected true or false" })
  .transform((value) => value === "true" || value === "1");

/** `a,b` (hoặc lặp tham số) ⇒ mảng không trùng, tối đa `max` phần tử. */
function csvList<T extends string>(values: readonly [T, ...T[]], name: string, max: number) {
  return z.preprocess(
    (raw) => {
      const parts = (Array.isArray(raw) ? raw : [raw]).flatMap((item) =>
        typeof item === "string" ? item.split(",") : [item],
      );
      return [...new Set(parts.map((part) => (typeof part === "string" ? part.trim() : part)).filter((part) => part !== ""))];
    },
    z
      .array(z.enum(values, { message: `Unknown ${name}` }))
      .min(1, `${name} must not be empty`)
      .max(max, `At most ${max} values for ${name}`),
  );
}

const filterShape = {
  // Tham số cũ của dashboard (D14); không gửi thì là "all".
  actor: z.enum(["admin", "all"]).optional(),
  group: csvList(["JOB_POST", "COMPANY", "CATALOG", "PAYMENT", "ACCOUNT", "SECURITY"], "group", 6).optional(),
  action: csvList(AUDIT_ACTIONS, "action", 10).optional(),
  resubmit: flag.optional(),
  actorRole: csvList(["ADMIN", "EMPLOYER", "CANDIDATE", "SYSTEM"], "actorRole", 4).optional(),
  from: calendarDate.optional(),
  to: calendarDate.optional(),
  dow: z.coerce.number().int().min(1, "dow must be 1–7").max(7, "dow must be 1–7").optional(),
  hour: z.coerce.number().int().min(0, "hour must be 0–23").max(23, "hour must be 0–23").optional(),
  q: z
    .string()
    .trim()
    .min(2, "Search query must be at least 2 characters")
    .max(100, "Search query must be at most 100 characters")
    .optional(),
};

const listOnlyShape = {
  actorId: z.string().min(1).max(64).optional(),
  since: isoDateTime.optional(),
  until: isoDateTime.optional(),
  entityType: z.string().min(1).max(50).optional(),
  entityId: z.string().min(1).max(64).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  archived: flag.default(false),
};

interface RefinableQuery {
  actor?: "admin" | "all" | undefined;
  action?: string[] | undefined;
  resubmit?: boolean | undefined;
  actorRole?: string[] | undefined;
  from?: string | undefined;
  to?: string | undefined;
  dow?: number | undefined;
  hour?: number | undefined;
  since?: string | undefined;
  until?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  actorId?: string | undefined;
  order?: "asc" | "desc" | undefined;
  limit?: number | undefined;
}

/**
 * Ràng buộc giữa các tham số. `slotNeedsRange`: danh sách và CSV chỉ lọc ô
 * thứ × giờ khi có đủ hai đầu khoảng; `/stats` có sẵn mặc định 30 ngày.
 */
function refineFilter(query: RefinableQuery, ctx: z.RefinementCtx, options: { slotNeedsRange: boolean }): void {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });

  if (query.actor !== undefined && query.actorRole) fail("Send either actor or actorRole, not both");

  if (query.from && query.to) {
    if (query.from > query.to) fail("from must not be after to");
    else if ((Date.parse(query.to) - Date.parse(query.from)) / DAY_MS + 1 > MAX_RANGE_DAYS) {
      fail(`Date range must be at most ${MAX_RANGE_DAYS} days`);
    }
  }

  if ((query.since || query.until) && (query.from || query.to)) fail("since/until cannot be combined with from/to");
  if (query.since && query.until) {
    const since = Date.parse(query.since);
    const until = Date.parse(query.until);
    if (since >= until) fail("since must be before until");
    else if (until - since > MAX_RANGE_DAYS * DAY_MS) fail(`Time range must be at most ${MAX_RANGE_DAYS} days`);
  }

  if ((query.dow === undefined) !== (query.hour === undefined)) fail("dow and hour must be sent together");
  else if (query.dow !== undefined && options.slotNeedsRange) {
    const hasRange = (query.from && query.to) || (query.since && query.until);
    if (!hasRange) fail("dow/hour need a full range (from and to, or since and until)");
  }

  if (query.resubmit !== undefined) {
    const valid = query.action !== undefined && query.action.every((action) => RESUBMIT_ACTIONS.includes(action));
    if (!valid) fail("resubmit only works with action JOB_POST_SUBMITTED and/or JOB_POST_AUTO_PUBLISHED");
  }

  if ((query.entityType === undefined) !== (query.entityId === undefined)) {
    fail("entityType and entityId must be sent together");
  }

  if (query.order === "asc" && !query.entityId && !query.actorId) {
    fail("order=asc needs an entity filter or actorId");
  }
  if (query.limit !== undefined && query.limit > 50 && query.order !== "asc") {
    fail("limit must be at most 50");
  }
}

export const activityListQuerySchema = z
  .object({
    ...filterShape,
    ...listOnlyShape,
    cursor: z.string().optional(),
    // order=asc (hành trình, L12/L33) cho tới 200 dòng; còn lại tối đa 50 (refine).
    limit: z.coerce.number().int().min(1).max(200).default(20),
  })
  .superRefine((query, ctx) => refineFilter(query, ctx, { slotNeedsRange: true }));

export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;

export const activityExportQuerySchema = z
  .object({ ...filterShape, ...listOnlyShape })
  .superRefine((query, ctx) => refineFilter(query, ctx, { slotNeedsRange: true }));

export type ActivityExportQuery = z.infer<typeof activityExportQuerySchema>;

// L11: không có cursor/limit/archived/đối tượng/actorId/since/until.
export const activityStatsQuerySchema = z
  .object(filterShape)
  .superRefine((query, ctx) => refineFilter(query, ctx, { slotNeedsRange: false }));

export type ActivityStatsQuery = z.infer<typeof activityStatsQuerySchema>;

export const activityItemParamsSchema = z.object({ id: z.string().min(1).max(64) });

export const activityItemQuerySchema = z.object({ archived: flag.default(false) });

export type ActivityItemQuery = z.infer<typeof activityItemQuerySchema>;
