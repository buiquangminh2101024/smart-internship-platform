import { AppError } from "../errors/AppError";

/** Offset lớn nhất nhận qua cursor — đủ xa so với số tin đang hiển thị (vài trăm). */
export const MAX_CURSOR_OFFSET = 10_000;

/**
 * Cursor dạng offset (chuỗi số) cho danh sách sắp theo điểm — thứ tự theo điểm không hợp
 * với cursor theo id (AD-26). Rỗng ⇒ 0; sai định dạng hoặc quá lớn ⇒ 400 INVALID_CURSOR.
 */
export function parseOffsetCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === "") return 0;
  if (!/^\d{1,5}$/.test(cursor) || Number(cursor) > MAX_CURSOR_OFFSET) {
    throw new AppError(400, "Invalid cursor", "INVALID_CURSOR");
  }
  return Number(cursor);
}
