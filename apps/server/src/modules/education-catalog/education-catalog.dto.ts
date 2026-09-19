import { z } from "zod";

// Tên trường thật có thể khá dài ("Phân hiệu Trường Đại học ... tại tỉnh ...").
// Để dư, nhưng vẫn chặn đoạn văn dán nhầm vào ô tên.
export const MAX_EDUCATION_CATALOG_NAME_LENGTH = 200;

const HAS_LETTER = /\p{L}/u;

// Không áp quy tắc "không có từ 1 ký tự" như Skill: tên trường thật có dạng
// "Đại học Sư phạm Hà Nội 2".
export const catalogEntryNameSchema = z
  .string()
  .trim()
  .max(MAX_EDUCATION_CATALOG_NAME_LENGTH, `Tên không được dài quá ${MAX_EDUCATION_CATALOG_NAME_LENGTH} ký tự`)
  .superRefine((value, ctx) => {
    if (!value) {
      ctx.addIssue({ code: "custom", message: "Tên không được để trống" });
      return;
    }
    if (!HAS_LETTER.test(value)) {
      ctx.addIssue({ code: "custom", message: "Tên phải có ít nhất một chữ cái" });
    }
  });

export const suggestCatalogEntrySchema = z.object({
  name: catalogEntryNameSchema,
});

export const adminCatalogListQuerySchema = z.object({
  status: z.enum(["APPROVED", "PENDING"]).optional(),
  cursor: z.string().optional(),
});

export const mergeCatalogEntrySchema = z.object({
  targetId: z.string().trim().min(1, "Vui lòng chọn mục đích để gộp"),
});

export const renameApproveCatalogEntrySchema = z.object({
  correctedName: catalogEntryNameSchema,
});
