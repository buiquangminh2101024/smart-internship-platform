import type { ApiResponse, AuthTokensResponse, Role, UserProfile } from "@sip/shared-types";
import { apiFetch } from "./api-client";
import { useAuthStore } from "@/stores/auth-store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

/**
 * Gọi GET /users/me với một access token cụ thể, không đụng tới store —
 * dùng để kiểm tra role (vd. /admin) trước khi quyết định có commit session
 * hay không.
 */
export async function fetchProfileWithToken(accessToken: string): Promise<UserProfile> {
  const res = await fetch(`${API_BASE_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => null)) as ApiResponse<UserProfile> | null;
  if (!res.ok || !body || !body.success || !body.data) {
    throw new Error(body?.error ?? body?.message ?? "Không lấy được hồ sơ người dùng");
  }
  return body.data;
}

/**
 * Sau khi có accessToken/refreshToken (verify-otp, login, google), gọi
 * GET /users/me để lấy hồ sơ rồi lưu session đầy đủ (kèm cookie role cho
 * proxy — xem stores/auth-store.ts). Nếu /users/me lỗi, không để lại
 * accessToken lỡ dở trong store (tránh useIsAuthenticated() báo true trong
 * khi không có user).
 */
export async function completeAuth(tokens: AuthTokensResponse): Promise<UserProfile> {
  useAuthStore.setState({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  try {
    const user = await apiFetch<UserProfile>("/users/me");
    useAuthStore.getState().setSession(tokens, user);
    return user;
  } catch (err) {
    useAuthStore.getState().clear();
    throw err;
  }
}

export function redirectPathForRole(role: Role): string {
  if (role === "EMPLOYER") return "/employer";
  if (role === "ADMIN") return "/admin";
  return "/";
}
