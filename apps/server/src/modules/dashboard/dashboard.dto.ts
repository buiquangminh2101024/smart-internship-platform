import { z } from "zod";

// Query string luôn là chuỗi ⇒ so khớp đúng ba giá trị rồi đổi sang số (D10).
export const dashboardAnalyticsQuerySchema = z.object({
  range: z
    .enum(["7", "30", "90"], { message: "range phải là 7, 30 hoặc 90" })
    .default("30")
    .transform((value) => Number(value) as 7 | 30 | 90),
});

export type DashboardAnalyticsQuery = z.infer<typeof dashboardAnalyticsQuerySchema>;
