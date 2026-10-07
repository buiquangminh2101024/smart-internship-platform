import { z } from "zod";

// AD-17 — quản lý người dùng của Admin.
export const adminListUsersQuerySchema = z.object({
  role: z.enum(["CANDIDATE", "EMPLOYER", "ADMIN"]).optional(),
  status: z.enum(["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED"]).optional(),
  q: z.string().trim().max(100, "Search query must be at most 100 characters").optional(),
  cursor: z.string().optional(),
});

export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;

export const suspendUserSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(500, "Reason must be at most 500 characters"),
});
