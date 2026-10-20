import axios, { type Method } from "axios";
import type { ApiResponse, RefreshResponse } from "@sip/shared-types";
import type { AuthArea } from "./auth-area";
import { AREA_HOME, areaForPath } from "./auth-area";
import { authStoreForArea, latestRefreshToken } from "@/stores/auth-store";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

export class ApiError extends Error {
  readonly status: number;
  /** `data` của phản hồi lỗi, nếu server gửi kèm (vd. lỗi từng hồ sơ khi lên lịch hàng loạt trả 409). */
  readonly data: unknown;
  /** Mã lỗi máy đọc được (`AppError.code`, AD-17), vd. "ACCOUNT_SUSPENDED". So mã này thay vì so chuỗi message. */
  readonly code: string | undefined;

  constructor(status: number, message: string, data?: unknown, code?: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
    this.data = data;
    this.code = code;
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

// Instance riêng cho upload multipart (không có Content-Type mặc định) —
// dùng chung httpClient sẽ luôn gửi "application/json" đè lên header
// multipart mà axios/trình duyệt tự set khi thấy body là FormData, khiến
// express.json() phía server cố parse JSON và lỗi trước khi tới multer.
const uploadClient = axios.create({ baseURL: API_BASE_URL, validateStatus: () => true });

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
    // 413 thường do gateway (nginx) trả về trang HTML, không có body JSON để đọc message.
    const fallback =
      res.status === 413 ? "Tệp tải lên quá lớn, vui lòng chọn tệp nhỏ hơn" : "Đã có lỗi xảy ra, vui lòng thử lại";
    throw new ApiError(res.status, res.body?.error ?? res.body?.message ?? fallback, res.body?.data, res.body?.code);
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

async function requestAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await httpClient.post<ApiResponse<RefreshResponse>>("/auth/refresh", { refreshToken });
    if (res.status < 200 || res.status >= 300 || !res.data.success || !res.data.data) return null;
    return res.data.data.accessToken;
  } catch {
    return null;
  }
}

/**
 * Refresh bằng refresh token mới nhất trong localStorage (AD-22). Nếu trong lúc
 * chờ server mà tab khác đổi phiên (đăng nhập lại) thì bỏ kết quả và refresh
 * lại bằng phiên mới — không ghi access token của phiên cũ đè lên phiên mới,
 * và không trả null (khiến `endSession` xoá phiên mới dùng chung mọi tab).
 */
async function refreshAccessToken(area: AuthArea): Promise<string | null> {
  let refreshToken = latestRefreshToken(area);
  for (let attempt = 0; attempt < 2 && refreshToken; attempt++) {
    const accessToken = await requestAccessToken(refreshToken);
    const latest = latestRefreshToken(area);
    if (latest !== refreshToken) {
      refreshToken = latest;
      continue;
    }
    if (accessToken) authStoreForArea(area).getState().setAccessToken(accessToken);
    return accessToken;
  }
  return null;
}

/**
 * Refresh access token của `area`, gộp các lệnh gọi đồng thời (REST 401 và
 * socket bị từ chối token cùng lúc chỉ gọi /auth/refresh một lần).
 * Trả null nếu không refresh được.
 */
export function refreshAccessTokenShared(area: AuthArea): Promise<string | null> {
  let refreshPromise = refreshPromises.get(area);
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken(area).finally(() => {
      refreshPromises.delete(area);
    });
    refreshPromises.set(area, refreshPromise);
  }
  return refreshPromise;
}

/**
 * Phiên của `area` hết hạn hẳn (refresh thất bại): luôn xoá phiên đó, nhưng chỉ
 * điều hướng về trang chủ của area khi tab đang ở đúng khu vực ấy. Các store
 * dùng chung localStorage giữa các tab, nên tab Admin cũng chạy `SessionSync`
 * của Candidate; không có điều kiện này thì ứng viên bị khoá (AD-17) sẽ kéo cả
 * tab Admin cùng trình duyệt về `/`.
 */
function endSession(area: AuthArea): void {
  authStoreForArea(area).getState().clear();
  if (typeof window !== "undefined" && areaForPath(window.location.pathname) === area) {
    window.location.href = AREA_HOME[area];
  }
}

/**
 * Fetch wrapper cho endpoint cần access token, đọc/ghi đúng store của
 * `area` được truyền vào — tự đính access token nếu có, refresh một lần khi
 * gặp 401 rồi thử lại; nếu vẫn thất bại thì clear đúng session của area đó
 * và điều hướng về homepage area đó nếu tab đang ở khu vực ấy (`endSession`).
 */
export async function apiFetch<T = void>(area: AuthArea, path: string, init: RequestInit = {}): Promise<T> {
  const store = authStoreForArea(area);
  const initialToken = store.getState().accessToken;
  let res = await doFetch<T>(path, initialToken, init);

  if (res.status === 401 && initialToken) {
    const newToken = await refreshAccessTokenShared(area);

    if (newToken) {
      res = await doFetch<T>(path, newToken, init);
    } else {
      endSession(area);
    }
  }

  return parseBody<T>(res);
}

export interface DownloadedFile {
  blob: Blob;
  /** Tên file lấy từ `Content-Disposition`; server không gửi thì là null. */
  fileName: string | null;
}

/** `attachment; filename="nhat-ky-20261018.csv"` (hoặc `filename*=UTF-8''…`) → tên file. */
function fileNameOf(disposition: unknown): string | null {
  if (typeof disposition !== "string") return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]!.trim());
    } catch {
      // Chuỗi mã hoá hỏng ⇒ thử dạng `filename="…"`.
    }
  }
  return /filename="?([^";]+)"?/i.exec(disposition)?.[1]?.trim() ?? null;
}

/**
 * Biến thể của apiFetch cho endpoint trả file (vd. CSV nhật ký, AD-20 L13): đọc
 * body thành `Blob` thay vì JSON, cùng cách làm mới token khi 401. Lỗi thì body
 * vẫn là JSON `ApiResponse` ⇒ đọc lại để ném `ApiError` có `status` và `code`.
 */
export async function apiDownload(area: AuthArea, path: string): Promise<DownloadedFile> {
  const store = authStoreForArea(area);

  async function send(bearer: string | null) {
    try {
      const res = await httpClient.request<Blob>({
        url: path,
        method: "GET",
        responseType: "blob",
        headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      });
      return { status: res.status, data: res.data ?? null, disposition: res.headers["content-disposition"] };
    } catch {
      return { status: 0, data: null, disposition: undefined };
    }
  }

  const initialToken = store.getState().accessToken;
  let res = await send(initialToken);

  if (res.status === 401 && initialToken) {
    const newToken = await refreshAccessTokenShared(area);

    if (newToken) {
      res = await send(newToken);
    } else {
      endSession(area);
    }
  }

  if (res.status >= 200 && res.status < 300 && res.data) {
    return { blob: res.data, fileName: fileNameOf(res.disposition) };
  }

  let body: ApiResponse<unknown> | null = null;
  try {
    body = res.data ? (JSON.parse(await res.data.text()) as ApiResponse<unknown>) : null;
  } catch {
    body = null;
  }
  return parseBody<never>({ status: res.status >= 200 && res.status < 300 ? 500 : res.status, body: body as ApiResponse<never> | null });
}

/**
 * Biến thể multipart của apiFetch — chỉ dùng cho endpoint nhận file (vd.
 * POST /employers/company kèm businessLicense). Không tái dùng doFetch() vì
 * body là FormData, không phải JSON string; và bắt buộc bỏ header
 * Content-Type mặc định ("application/json" ở httpClient) để axios/trình
 * duyệt tự set đúng "multipart/form-data; boundary=..." — nếu không,
 * express.json() phía server sẽ cố parse JSON và lỗi trước khi tới multer.
 */
export async function apiUpload<T = void>(
  area: AuthArea,
  path: string,
  formData: FormData,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  const store = authStoreForArea(area);

  async function send(bearer: string | null): Promise<RawResponse<T>> {
    try {
      const res = await uploadClient.request<ApiResponse<T>>({
        url: path,
        method,
        data: formData,
        headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      });
      return { status: res.status, body: res.data ?? null };
    } catch {
      return { status: 0, body: null };
    }
  }

  const initialToken = store.getState().accessToken;
  let res = await send(initialToken);

  if (res.status === 401 && initialToken) {
    const newToken = await refreshAccessTokenShared(area);

    if (newToken) {
      res = await send(newToken);
    } else {
      endSession(area);
    }
  }

  return parseBody<T>(res);
}
