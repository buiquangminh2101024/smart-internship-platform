import type { AuthErrorCode } from "@sip/shared-types";
import { ApiError, AUTH_STORE_UNAVAILABLE, AUTH_UNAVAILABLE_MESSAGE } from "./api-client";

// Câu tiếng Việt cho lỗi đăng nhập / đăng ký / OTP (AD-31, F2 của
// docs/05-frontend/phases/auth-hardening/PLAN.md). Đọc `ApiError.code` và `data`, không so
// chuỗi message tiếng Anh của server.

/** Số nguyên dương trong `data` của lỗi (`attemptsLeft`, `retryAfterSeconds`), không có ⇒ null. */
function dataNumber(err: ApiError, key: "attemptsLeft" | "retryAfterSeconds"): number | null {
  const value = (err.data as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function hasAuthCode(err: unknown, code: AuthErrorCode): err is ApiError {
  return err instanceof ApiError && err.code === code;
}

/** Mất mạng, server 5xx hoặc server tạm không kiểm được phiên: lỗi tạm thời, không phải lỗi của người dùng. */
export function isServerUnavailable(err: unknown): boolean {
  return err instanceof ApiError && (err.code === AUTH_STORE_UNAVAILABLE || err.status === 0 || err.status >= 500);
}

/** `LOGIN_LOCKED`: số phút còn bị chặn, làm tròn lên, ít nhất 1. */
export function loginLockedMinutes(err: ApiError): number {
  const seconds = dataNumber(err, "retryAfterSeconds") ?? 15 * 60;
  return Math.max(1, Math.ceil(seconds / 60));
}

/**
 * Câu báo lỗi cho form auth. Mã không thuộc AD-31 (vd. `ACCOUNT_SUSPENDED`, lỗi Google)
 * do form tự xử lý trước khi gọi hàm này; lỗi khác không nhận ra ⇒ `fallback`.
 */
export function authErrorMessage(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback;
  if (isServerUnavailable(err)) return AUTH_UNAVAILABLE_MESSAGE;

  switch (err.code as AuthErrorCode | undefined) {
    case "LOGIN_LOCKED":
      return `Bạn đã nhập sai quá nhiều lần. Thử lại sau ${loginLockedMinutes(err)} phút, hoặc dùng Quên mật khẩu.`;
    case "OTP_INVALID": {
      const left = dataNumber(err, "attemptsLeft");
      return left ? `Mã không đúng hoặc đã hết hạn. Còn ${left} lần nhập.` : "Mã không đúng hoặc đã hết hạn.";
    }
    case "OTP_ATTEMPTS_EXCEEDED":
      return "Bạn đã nhập sai 5 lần, mã này đã bị huỷ. Bấm Gửi lại mã để nhận mã mới.";
    case "EMAIL_TAKEN":
      return "Email này đã có tài khoản.";
    case "EMAIL_PENDING_VERIFICATION":
      return "Email này đã đăng ký nhưng chưa xác thực.";
    case "EMAIL_NOT_VERIFIED":
      return "Email chưa được xác thực.";
  }

  // Sai email / mật khẩu (`/auth/login` là route công khai duy nhất trả 401).
  if (err.status === 401) {
    const left = dataNumber(err, "attemptsLeft");
    return left
      ? `Email hoặc mật khẩu không đúng. Còn ${left} lần thử trước khi bị tạm khoá 15 phút.`
      : "Email hoặc mật khẩu không đúng.";
  }
  return fallback;
}

/**
 * Link trang hỗ trợ cho người nhập OTP mãi không được (AD-31 D7): loại "Vấn đề khác",
 * điền sẵn email và nội dung. Admin xử lý bằng "Kích hoạt thủ công" (AD-18, E3).
 */
export function otpSupportHref(email: string, purpose: "register" | "reset"): string {
  const action = purpose === "register" ? "đăng ký tài khoản" : "đặt lại mật khẩu";
  const params = new URLSearchParams({
    category: "OTHER",
    message: `Mình không xác thực được email khi ${action} (không nhận được mã OTP hoặc nhập mã không được). Nhờ quản trị viên kiểm tra giúp.`,
  });
  const trimmed = email.trim();
  if (trimmed) params.set("email", trimmed);
  return `/support?${params.toString()}`;
}

/**
 * 429 khi xin / gửi lại mã vì hết hạn mức theo giờ (theo email hoặc theo mạng), không phải vì
 * vừa xin mã trong 60 giây (`assertOtpRateLimit` ở server, câu "Please wait…").
 */
export function isHourlyCodeLimit(err: unknown): boolean {
  return err instanceof ApiError && err.status === 429 && !err.message.toLowerCase().includes("please wait");
}

/** Sai mã từ lần này trở lên (đếm trong form) thì hiện gợi ý gửi yêu cầu hỗ trợ. */
export const OTP_SUPPORT_HINT_AFTER = 3;
