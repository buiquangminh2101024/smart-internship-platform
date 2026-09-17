export class AppError extends Error {
  readonly statusCode: number;
  /** Mã lỗi máy đọc được (tuỳ chọn) — ví dụ "CONVERSATION_UNAVAILABLE". */
  readonly code: string | undefined;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = "AppError";
  }
}
