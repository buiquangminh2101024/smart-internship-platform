import type { RegistrableRole } from "@sip/shared-types";
import { ApiError } from "./api-client";
import type { AuthArea } from "./auth-area";
import { authStoreForArea } from "@/stores/auth-store";

/** Khớp `OTP_RESEND_COOLDOWN_SECONDS` ở `auth.service.ts`. */
export const RESEND_CODE_SECONDS = 60;
/** Khớp `resetPasswordSchema` ở server. */
export const PASSWORD_MIN_LENGTH = 8;

/** Câu tiếng Việt cho lỗi khi xin mã (429 có ba loại hạn mức ở `assertOtpRateLimit`). */
export function requestCodeErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) {
    const message = err.message.toLowerCase();
    if (message.includes("please wait")) return `Bạn vừa xin mã. Đợi ${RESEND_CODE_SECONDS} giây rồi thử lại.`;
    if (message.includes("this email")) return "Email này đã xin mã quá nhiều lần trong giờ qua. Bạn thử lại sau.";
    if (message.includes("this network")) {
      return "Mạng bạn đang dùng đã xin mã quá nhiều lần trong giờ qua. Bạn thử lại sau.";
    }
    return "Bạn thao tác quá nhanh. Đợi một lát rồi thử lại.";
  }
  if (err instanceof ApiError && err.status === 400) return "Email không hợp lệ. Bạn kiểm tra lại.";
  return "Không gửi được mã. Kiểm tra kết nối rồi thử lại.";
}

/** Trang đăng nhập kèm khung "Đã đổi mật khẩu" (`?reset=1`). */
export function loginAfterResetHref(area: AuthArea | RegistrableRole): string {
  if (area === "admin") return "/admin?reset=1";
  if (area === "employer" || area === "EMPLOYER") return "/login?reset=1&role=EMPLOYER";
  return "/login?reset=1";
}

const AREAS: AuthArea[] = ["candidate", "employer", "admin"];

/**
 * Đổi mật khẩu xong thì server đã thu hồi mọi phiên của tài khoản, nên xoá
 * luôn phiên đang lưu ở trình duyệt này (khu vực nào đang đăng nhập đúng email
 * đó). Không gọi `/auth/logout` vì token đã bị thu hồi.
 */
export function clearSessionsOfEmail(email: string): void {
  const target = email.trim().toLowerCase();
  for (const area of AREAS) {
    const state = authStoreForArea(area).getState();
    if (state.user?.email.toLowerCase() === target) state.clear();
  }
}
