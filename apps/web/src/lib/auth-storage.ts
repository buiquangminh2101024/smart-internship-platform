// Bọc localStorage cho token (AD-2, docs/02-architecture/ARCHITECTURE_DECISIONS.md).
// Chỉ dùng qua stores/auth-store.ts — không gọi localStorage trực tiếp ở nơi khác.
//
// `proxy.ts` chạy phía server nên không đọc được localStorage. Vì vậy khi
// đăng nhập/đăng ký thành công, ngoài lưu token vào localStorage, ta ghi thêm
// một cookie không nhạy cảm chỉ chứa `role` (không chứa token) để proxy có
// thể chặn route theo actor (bảng route/actor ở AD-1) mà không đổi chiến
// lược lưu JWT đã chốt ở AD-2.
const ROLE_COOKIE_NAME = "sip_role";
const ROLE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // khớp thời hạn refresh token mặc định (7d)

export function setRoleCookie(role: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ROLE_COOKIE_NAME}=${role}; path=/; max-age=${ROLE_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

export function clearRoleCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ROLE_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
}

export { ROLE_COOKIE_NAME };
