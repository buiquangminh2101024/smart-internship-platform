import type { ApiResponse, RefreshResponse } from "@sip/shared-types";
import { useAuthStore } from "@/stores/auth-store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

function redirectTargetForRole(role: string | undefined): string {
  if (role === "EMPLOYER") return "/employer";
  if (role === "ADMIN") return "/admin";
  return "/";
}

// Gộp các lệnh gọi refresh đồng thời thành một promise duy nhất, tránh gọi
// /auth/refresh nhiều lần cùng lúc khi nhiều request 401 song song.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;

    const body = (await res.json()) as ApiResponse<RefreshResponse>;
    if (!body.success || !body.data) return null;

    useAuthStore.getState().setAccessToken(body.data.accessToken);
    return body.data.accessToken;
  } catch {
    return null;
  }
}

async function doFetch(path: string, token: string | null, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
}

/**
 * Fetch wrapper dùng chung cho toàn bộ apps/web. Tự đính access token nếu có,
 * refresh một lần khi gặp 401 rồi thử lại; nếu vẫn thất bại thì clear session
 * và điều hướng về homepage đúng actor.
 */
export async function apiFetch<T = void>(path: string, init: RequestInit = {}): Promise<T> {
  const initialToken = useAuthStore.getState().accessToken;
  let res = await doFetch(path, initialToken, init);

  if (res.status === 401 && initialToken) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    const newToken = await refreshPromise;

    if (newToken) {
      res = await doFetch(path, newToken, init);
    } else {
      const role = useAuthStore.getState().user?.role;
      useAuthStore.getState().clear();
      if (typeof window !== "undefined") {
        window.location.href = redirectTargetForRole(role);
      }
    }
  }

  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok || !body || !body.success) {
    throw new ApiError(res.status, body?.error ?? body?.message ?? "Đã có lỗi xảy ra, vui lòng thử lại");
  }

  return body.data as T;
}
