import type { ApiResponse, AuthTokensResponse, EmployerMeResponse, Role, UserProfile } from "@sip/shared-types";
import { AREA_HOME, areaForRole } from "./auth-area";
import { authStoreForArea } from "@/stores/auth-store";
import { httpClient, apiFetch } from "./api-client";
import { employerStageToCookieValue, setEmployerStageCookie, type EmployerStageCookieValue } from "./auth-storage";

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

const EMPLOYER_STAGE_PATH: Record<EmployerStageCookieValue, string> = {
  onboarding: "/employer/hoan-tat-thu-tuc",
  pending: "/employer/profile",
  active: "/employer",
};

/**
 * Employer (khác Candidate/Admin) không luôn về thẳng AREA_HOME["employer"] —
 * còn tuỳ đã liên kết công ty chưa (xem GET /employers/me, proxy.ts §Phase 4).
 * Đồng thời ghi luôn cookie stage để proxy.ts (chạy server-side) chặn đúng
 * route ngay từ request điều hướng kế tiếp, không cần đợi client re-fetch.
 */
export async function resolveEmployerDestination(): Promise<string> {
  try {
    const me = await apiFetch<EmployerMeResponse>("employer", "/employers/me");
    const stageValue = employerStageToCookieValue(me.stage);
    setEmployerStageCookie(stageValue);
    return EMPLOYER_STAGE_PATH[stageValue];
  } catch {
    // Không lấy được profile employer -> fail open về onboarding (an toàn
    // nhất, trang đó không lộ dữ liệu nhạy cảm — xem proxy.ts).
    setEmployerStageCookie("onboarding");
    return EMPLOYER_STAGE_PATH.onboarding;
  }
}

export async function redirectDestinationForUser(user: UserProfile): Promise<string> {
  if (user.role === "EMPLOYER") {
    return resolveEmployerDestination();
  }
  return AREA_HOME[areaForRole(user.role)];
}

/** Dùng ở mọi nơi trước đây gọi `router.push(redirectPathForRole(user.role))` sau register/login/Google. */
export async function navigateAfterAuth(router: { push: (href: string) => void }, user: UserProfile): Promise<void> {
  const destination = await redirectDestinationForUser(user);
  router.push(destination);
}
