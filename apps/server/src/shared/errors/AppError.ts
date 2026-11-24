export class AppError extends Error {
  readonly statusCode: number;
  /** Mã lỗi máy đọc được (tuỳ chọn) — ví dụ "CONVERSATION_UNAVAILABLE". */
  readonly code: string | undefined;
  /** Dữ liệu kèm lỗi cho web (tuỳ chọn), trả ở `data` — ví dụ `{ attemptsLeft: 3 }` (AD-31). */
  readonly data: Record<string, unknown> | undefined;

  constructor(statusCode: number, message: string, code?: string, data?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.data = data;
    this.name = "AppError";
  }
}

/**
 * AD-31 D1: kho trạng thái phiên (Redis) hoặc DB lỗi khi kiểm token. Trả 503 để
 * web hiểu là lỗi tạm thời và giữ phiên, thay vì 401 (hết phiên).
 */
export const AUTH_STORE_UNAVAILABLE = "AUTH_STORE_UNAVAILABLE";

export function authStoreUnavailable(): AppError {
  return new AppError(503, "Authentication service temporarily unavailable", AUTH_STORE_UNAVAILABLE);
}
