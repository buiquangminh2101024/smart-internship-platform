import type { ApiResponse, AuthTokensResponse, Role, UserProfile } from "@sip/shared-types";
import { AREA_HOME, areaForRole } from "./auth-area";
import { authStoreForArea } from "@/stores/auth-store";
import { httpClient } from "./api-client";

/**
 * Gọi GET /users/me với một access token cụ thể, không đụng tới store nào —
 * dùng để kiểm tra role (vd. /admin) trước khi quyết định có commit session
 * hay không, và để completeAuth() biết area thật trước khi ghi vào store.
 */
export async function fetchProfileWithToken(accessToken: string): Promise<UserProfile> {
  const res = await httpClient.get<ApiResponse<UserProfile>>("/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status < 200 || res.status >= 300 || !res.data.success || !res.data.data) {
    throw new Error(res.data?.error ?? res.data?.message ?? "Không lấy được hồ sơ người dùng");
  }
  return res.data.data;
}

/**
 * Sau khi có accessToken/refreshToken (verify-otp, login, google), lấy hồ sơ
 * rồi lưu session vào ĐÚNG store theo role thật trả về — không theo trang
 * đăng nhập đang đứng (xem AD-4, docs/02-architecture/ARCHITECTURE_DECISIONS.md).
 * Nhờ vậy nếu ai đó lỡ đăng nhập tài khoản Candidate trên `/login?role=EMPLOYER`,
 * session vẫn vào đúng store Candidate.
 */
export async function completeAuth(tokens: AuthTokensResponse): Promise<UserProfile> {
  const user = await fetchProfileWithToken(tokens.accessToken);
  authStoreForArea(areaForRole(user.role)).getState().setSession(tokens, user);
  return user;
}

export function redirectPathForRole(role: Role): string {
  return AREA_HOME[areaForRole(role)];
}
