import { z } from "zod";

export const MAX_SKILL_NAME_LENGTH = 50;

// Ít nhất một chữ cái hoặc chữ số (unicode-aware nên "Tiếng Nhật" hợp lệ,
// "!!!---" thì không).
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Validate đầu vào — KHÁC với chuẩn hoá ở skill-normalize.util.ts: chuẩn hoá chỉ
 * biến đổi chuỗi để so khớp, còn ở đây là từ chối thẳng input rác trước khi
 * chạm tới rate-limit và pipeline (PLAN quyết định 8).
 *
 * Lưu ý: rule "không có từ 1 ký tự" chỉ áp dụng cho tên người dùng TỰ GÕ qua
 * endpoint này. Skill seed sẵn tên một ký tự ("C", "R") ghi thẳng vào DB bằng
 * scripts/seed.ts nên không bị ảnh hưởng.
 */
export const suggestSkillSchema = z.object({
  // superRefine + return sớm thay vì chuỗi .refine(): các quy tắc chồng lên nhau
  // (chuỗi rỗng vi phạm cả ba) nên nếu để zod chạy hết, người dùng nhận một
  // thông báo gộp ba lỗi cho cùng một sai sót.
  name: z
    .string()
    .trim()
    .max(MAX_SKILL_NAME_LENGTH, `Tên kỹ năng không được dài quá ${MAX_SKILL_NAME_LENGTH} ký tự`)
    .superRefine((value, ctx) => {
      if (!value) {
        ctx.addIssue({ code: "custom", message: "Tên kỹ năng không được để trống" });
        return;
      }
      if (!HAS_LETTER_OR_DIGIT.test(value)) {
        ctx.addIssue({ code: "custom", message: "Tên kỹ năng phải có ít nhất một chữ cái hoặc chữ số" });
        return;
      }
      if (value.split(/\s+/).some((word) => word.length === 1)) {
        ctx.addIssue({ code: "custom", message: "Tên kỹ năng không được chứa từ chỉ có một ký tự" });
      }
    }),
});

export const adminSkillListQuerySchema = z.object({
  status: z.enum(["APPROVED", "PENDING"]).optional(),
  cursor: z.string().optional(),
});

export const mergeSkillSchema = z.object({
  targetSkillId: z.string().trim().min(1, "Vui lòng chọn kỹ năng đích để gộp"),
});
