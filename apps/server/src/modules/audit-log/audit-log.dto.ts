import { z } from "zod";

export const activityListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // D14 — mặc định "all" để các nơi gọi cũ không đổi hành vi; dashboard gửi "admin".
  actor: z.enum(["admin", "all"]).default("all"),
});

export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
