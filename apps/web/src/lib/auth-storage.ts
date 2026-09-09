// Bọc localStorage cho token (AD-2) + cookie theo area (AD-4,
// docs/02-architecture/ARCHITECTURE_DECISIONS.md). Chỉ dùng qua
// stores/auth-store.ts — không gọi localStorage/document.cookie trực tiếp ở
// nơi khác.
//
// `proxy.ts` chạy phía server nên không đọc được localStorage. Vì vậy khi
// đăng nhập/đăng xuất, ngoài lưu token vào localStorage (qua zustand persist
// trong auth-store.ts), ta ghi thêm một cookie không nhạy cảm riêng cho từng
// area để proxy có thể chặn route theo actor (bảng route/actor ở AD-1) mà
// không đổi chiến lược lưu JWT đã chốt ở AD-2. Cookie chỉ đánh dấu "area này
// đang có phiên" (giá trị "1"), không chứa role — vì một area đã ngụ ý đúng
// một role (mô hình "một tài khoản một role", xem AD-4).
import type { AuthArea } from "./auth-area";

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // khớp thời hạn refresh token mặc định (7d)

export function sessionCookieName(area: AuthArea): string {
  return `sip_session_${area}`;
}

export function setAreaCookie(area: AuthArea): void {
  if (typeof document === "undefined") return;
  document.cookie = `${sessionCookieName(area)}=1; path=/; max-age=${SESSION_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

export function clearAreaCookie(area: AuthArea): void {
  if (typeof document === "undefined") return;
  document.cookie = `${sessionCookieName(area)}=; path=/; max-age=0; samesite=lax`;
}

import type { EmployerStage } from "@sip/shared-types";

// Cờ onboarding riêng cho area "employer" (Phase 4) — proxy.ts đọc cookie này
// để phân biệt 3 trạng thái /employer/(portal)/* mà cookie phiên (ở trên)
// không diễn tả được: "onboarding" (chưa có Employer/Company, phải vào
// hoan-tat-thu-tuc), "pending" (đã nộp, chờ Admin/tự động xác thực — chỉ vào
// được /employer/profile), "active" (Company đã VERIFIED). Không cần xoá chủ
// động lúc logout — proxy.ts luôn kiểm tra cookie phiên (sip_session_employer)
// trước, cookie này chỉ được đọc khi phiên còn hợp lệ nên giá trị cũ (nếu có)
// vô hại và sẽ bị ghi đè ngay ở lần đăng nhập kế tiếp (xem EmployerStageSync).
export type EmployerStageCookieValue = "onboarding" | "pending" | "active";

const EMPLOYER_STAGE_COOKIE = "sip_employer_stage";

export function getEmployerStageCookieName(): string {
  return EMPLOYER_STAGE_COOKIE;
}

export function setEmployerStageCookie(value: EmployerStageCookieValue): void {
  if (typeof document === "undefined") return;
  document.cookie = `${EMPLOYER_STAGE_COOKIE}=${value}; path=/; max-age=${SESSION_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

export function employerStageToCookieValue(stage: EmployerStage): EmployerStageCookieValue {
  if (stage === "ACTIVE") return "active";
  if (stage === "PENDING_VERIFICATION") return "pending";
  return "onboarding";
}
