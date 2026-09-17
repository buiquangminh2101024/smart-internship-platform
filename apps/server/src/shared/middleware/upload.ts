import multer from "multer";
import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

// Multipart chỉ mount trên route cụ thể cần nó (vd. POST /employers/company)
// — không dùng global, giữ nguyên convention express.json()-only ở mọi route
// khác (xem API_CONVENTIONS.md §7). Memory storage vì file được chuyển thẳng
// cho MediaStorage.upload(buffer), không cần ghi tạm ra đĩa.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = DEFAULT_ALLOWED_MIME_TYPES;
    if (!allowed.has(file.mimetype)) {
      cb(new AppError(400, "Unsupported file type"));
      return;
    }
    cb(null, true);
  },
});

export function singleFileUpload(
  fieldName: string,
  allowedMimeTypes: string[] = [...DEFAULT_ALLOWED_MIME_TYPES],
): RequestHandler {
  const uploadWithType = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        cb(new AppError(400, "Unsupported file type"));
        return;
      }
      cb(null, true);
    },
  });

  return uploadWithType.single(fieldName);
}

/** Nhiều field file trong cùng một request, mỗi field có danh sách MIME riêng, tối đa 1 file/field. */
export function multiFileUpload(allowedMimeTypesByField: Record<string, string[]>): RequestHandler {
  const uploadWithTypes = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      const allowed = allowedMimeTypesByField[file.fieldname];
      if (!allowed) {
        cb(new AppError(400, `Unexpected file field: ${file.fieldname}`));
        return;
      }
      if (!allowed.includes(file.mimetype)) {
        cb(new AppError(400, "Unsupported file type"));
        return;
      }
      cb(null, true);
    },
  });

  return uploadWithTypes.fields(Object.keys(allowedMimeTypesByField).map((name) => ({ name, maxCount: 1 })));
}
