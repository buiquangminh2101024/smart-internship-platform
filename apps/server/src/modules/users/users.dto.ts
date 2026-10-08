import { z } from "zod";

// `YYYY-MM-DD` và phải là ngày có thật (chặn 2026-02-31 — `new Date` tự lăn sang tháng sau).
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "Invalid date");

// AD-17 — quản lý người dùng của Admin; Mở rộng 1 (E6) đổi cursor sang số trang
// và thêm bộ lọc / sắp xếp.
export const adminListUsersQuerySchema = z
  .object({
    role: z.enum(["CANDIDATE", "EMPLOYER", "ADMIN"]).optional(),
    status: z.enum(["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED"]).optional(),
    q: z
      .string()
      .trim()
      .max(100, "Search query must be at most 100 characters")
      .optional()
      .transform((value) => value || undefined),
    loginMethod: z.enum(["PASSWORD", "GOOGLE", "BOTH"]).optional(),
    emailVerified: z
      .enum(["true", "false"], { message: "emailVerified must be true or false" })
      .optional()
      .transform((value) => (value === undefined ? undefined : value === "true")),
    createdFrom: calendarDate.optional(),
    createdTo: calendarDate.optional(),
    sort: z.enum(["newest", "oldest", "email"]).default("newest"),
    // Chặn trên để `skip` không vượt kiểu Int của Prisma (vd. page=1e20 ⇒ 500).
    page: z.coerce
      .number()
      .int("page must be an integer")
      .min(1, "page must be at least 1")
      .max(10_000, "page must be at most 10000")
      .default(1),
  })
  .refine((query) => !query.createdFrom || !query.createdTo || query.createdFrom <= query.createdTo, {
    message: "createdFrom must not be after createdTo",
  });

export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;

const requiredReason = z.string().trim().min(1, "Reason is required").max(500, "Reason must be at most 500 characters");

export const suspendUserSchema = z.object({
  reason: requiredReason,
});

// ─── Mở rộng 1 (AD-18) ───────────────────────────────────────────────────

// Lý do không bắt buộc (E2): chuỗi rỗng sau trim coi như không nhập. Express 5
// để `req.body` là undefined khi request không có body ⇒ mặc định {}.
export const revokeSessionsSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(500, "Reason must be at most 500 characters")
      .optional()
      .transform((value) => value || undefined),
  })
  .default({ reason: undefined });

export const activateUserSchema = z.object({
  reason: requiredReason,
});

// E7 — tối đa 20 người mỗi lần, không trùng (trùng thì người đó bị xử lý hai lần,
// lần sau luôn 409).
const bulkUserIds = z
  .array(z.string().min(1, "User id is required"), { message: "userIds must be an array" })
  .min(1, "Select at least one user")
  .max(20, "At most 20 users per request")
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate user id");

export const bulkSuspendSchema = z.object({
  userIds: bulkUserIds,
  reason: requiredReason,
});

export const bulkReactivateSchema = z.object({
  userIds: bulkUserIds,
});
