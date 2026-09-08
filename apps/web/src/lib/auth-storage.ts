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
