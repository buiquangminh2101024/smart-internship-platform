import { z } from "zod";

export const activityListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
