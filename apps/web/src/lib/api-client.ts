import axios, { type Method } from "axios";
import type { ApiResponse, RefreshResponse } from "@sip/shared-types";
import type { AuthArea } from "./auth-area";
import { AREA_HOME } from "./auth-area";
import { authStoreForArea } from "@/stores/auth-store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// Axios instance dùng chung cho mọi lời gọi API. `validateStatus: () => true`
// giữ đúng hành vi cũ của `fetch` (không throw khi status ngoài 2xx) để logic
// đọc `res.status` rồi tự quyết định refresh-retry (xem apiFetch bên dưới)
// không phải viết lại thành try/catch quanh mỗi request.
export const httpClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  validateStatus: () => true,
});

interface RawResponse<T> {
  status: number;
  body: ApiResponse<T> | null;
}

async function doFetch<T>(path: string, token: string | null, init: RequestInit): Promise<RawResponse<T>> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  Object.assign(headers, (init.headers as Record<string, string> | undefined) ?? {});

  try {
    const res = await httpClient.request<ApiResponse<T>>({
      url: path,
      method: (init.method as Method | undefined) ?? "GET",
      data: init.body,
      headers,
    });
    return { status: res.status, body: res.data ?? null };
  } catch {
    // Lỗi mạng (không có response, vd. mất kết nối) — coi như status 0 để
    // parseBody ném ApiError chung thay vì để lỗi axios rò rỉ ra ngoài.
    return { status: 0, body: null };
  }
}

function parseBody<T>(res: RawResponse<T>): T {
  if (res.status < 200 || res.status >= 300 || !res.body || !res.body.success) {
    throw new ApiError(res.status, res.body?.error ?? res.body?.message ?? "Đã có lỗi xảy ra, vui lòng thử lại");
  }

  return res.body.data as T;
}

/**
 * Fetch wrapper cho endpoint anonymous (chưa có/chưa cần access token):
 * `/auth/login`, `/auth/register`, `/auth/verify-otp`, `/auth/resend-otp`,
 * `/auth/google`. Không đụng tới store area nào.
 */
export async function publicFetch<T = void>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await doFetch<T>(path, null, init);
  return parseBody<T>(res);
}

// Gộp các lệnh gọi refresh đồng thời của CÙNG một area thành một promise duy
// nhất, tránh gọi /auth/refresh nhiều lần cùng lúc khi nhiều request 401 song
// song. Theo map để refresh của area này không chặn/lẫn với area khác (xem
// AD-4, docs/02-architecture/ARCHITECTURE_DECISIONS.md).
const refreshPromises = new Map<AuthArea, Promise<string | null>>();

async function refreshAccessToken(area: AuthArea): Promise<string | null> {
  const store = authStoreForArea(area);
  const refreshToken = store.getState().refreshToken;
  if (!refreshToken) return null;

  try {
    const res = await httpClient.post<ApiResponse<RefreshResponse>>("/auth/refresh", { refreshToken });
    if (res.status < 200 || res.status >= 300 || !res.data.success || !res.data.data) return null;

    store.getState().setAccessToken(res.data.data.accessToken);
    return res.data.data.accessToken;
  } catch {
    return null;
  }
}

/**
 * Fetch wrapper cho endpoint cần access token, đọc/ghi đúng store của
 * `area` được truyền vào — tự đính access token nếu có, refresh một lần khi
 * gặp 401 rồi thử lại; nếu vẫn thất bại thì clear đúng session của area đó
 * và điều hướng về homepage area đó (không đụng tới area khác).
 */
export async function apiFetch<T = void>(area: AuthArea, path: string, init: RequestInit = {}): Promise<T> {
  const store = authStoreForArea(area);
  const initialToken = store.getState().accessToken;
  let res = await doFetch<T>(path, initialToken, init);

  if (res.status === 401 && initialToken) {
    let refreshPromise = refreshPromises.get(area);
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken(area).finally(() => {
        refreshPromises.delete(area);
      });
      refreshPromises.set(area, refreshPromise);
    }
    const newToken = await refreshPromise;

    if (newToken) {
      res = await doFetch<T>(path, newToken, init);
    } else {
      store.getState().clear();
      if (typeof window !== "undefined") {
        window.location.href = AREA_HOME[area];
      }
    }
  }

  return parseBody<T>(res);
}
