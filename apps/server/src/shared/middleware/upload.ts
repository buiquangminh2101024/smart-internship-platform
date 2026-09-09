import multer from "multer";
import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

// Multipart chỉ mount trên route cụ thể cần nó (vd. POST /employers/company)
// — không dùng global, giữ nguyên convention express.json()-only ở mọi route
// khác (xem API_CONVENTIONS.md §7). Memory storage vì file được chuyển thẳng
// cho MediaStorage.upload(buffer), không cần ghi tạm ra đĩa.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new AppError(400, "File must be a JPEG/PNG image or PDF"));
      return;
    }
    cb(null, true);
  },
});

export function singleFileUpload(fieldName: string): RequestHandler {
  return upload.single(fieldName);
}
