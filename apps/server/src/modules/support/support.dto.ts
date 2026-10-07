import { z } from "zod";
import { SUPPORT_CATEGORIES } from "./support.constants";

// AD-17 (H3) — form hỗ trợ công khai, không cần đăng nhập.
export const supportContactSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  category: z.enum(SUPPORT_CATEGORIES),
  message: z
    .string()
    .trim()
    .min(20, "Message must be at least 20 characters")
    .max(2000, "Message must be at most 2000 characters"),
});

export type SupportContactInput = z.infer<typeof supportContactSchema>;
