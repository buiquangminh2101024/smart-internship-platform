import { z } from "zod";

export const notificationListQuerySchema = z.object({
  cursor: z.string().optional(),
  // Cố tình KHÔNG dùng z.coerce.boolean(): Boolean("false") === true (chuỗi
  // không rỗng luôn truthy) nên "unreadOnly=false" sẽ bị hiểu ngược — cùng lý do
  // đã ghi cho các cờ boolean trong shared/config/env.ts.
  unreadOnly: z
    .preprocess((value) => (typeof value === "string" ? value === "true" : value), z.boolean())
    .optional(),
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
