import type { ApiResponse, SupportChatEvent, SupportChatRequest, SupportChatSuggestion } from "@sip/shared-types";
import { authStoreForArea } from "@/stores/auth-store";
import { httpClient, refreshAccessTokenShared } from "./api-client";
import type { AuthArea } from "./auth-area";

// Gọi API trợ lý (docs/05-frontend/phases/support-chatbot/PLAN.md, quyết định 6 và mục
// "Xác thực khi stream"). Dùng `fetch` chứ không qua axios: trình duyệt không stream được qua
// axios, còn EventSource không gửi được POST lẫn header Authorization.

const API_BASE_URL = httpClient.defaults.baseURL ?? "";

/** Server trả lỗi JSON trước khi mở stream (400, 429, 503…). */
export class SupportChatHttpError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "SupportChatHttpError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Gửi kèm access token của `area` nếu có. 401 ⇒ refresh một lần rồi gửi lại; vẫn không được
 * ⇒ gọi `onExpired` rồi gửi như khách. Không dùng `endSession` của api-client vì hàm đó
 * chuyển trang, làm mất câu hỏi đang gõ.
 */
async function sendWithSession(
  area: AuthArea,
  send: (token: string | null) => Promise<Response>,
  onExpired?: () => void,
): Promise<Response> {
  const token = authStoreForArea(area).getState().accessToken;
  const first = await send(token);
  if (first.status !== 401 || !token) return first;

  const freshToken = await refreshAccessTokenShared(area);
  if (freshToken) {
    const retried = await send(freshToken);
    if (retried.status !== 401) return retried;
  }
  onExpired?.();
  return send(null);
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function httpErrorOf(response: Response): Promise<SupportChatHttpError> {
  let body: Partial<ApiResponse<unknown>> | null = null;
  try {
    body = (await response.json()) as Partial<ApiResponse<unknown>>;
  } catch {
    body = null;
  }
  return new SupportChatHttpError(
    response.status,
    body?.error ?? body?.message ?? `Request failed with ${response.status}`,
    body?.code,
  );
}

const EVENT_TYPES = new Set<SupportChatEvent["type"]>(["meta", "delta", "done", "error"]);

/** Một khối SSE (`event: …` + `data: …`) → sự kiện. Khối lạ hoặc JSON hỏng ⇒ null. */
export function parseSupportChatEventBlock(block: string): SupportChatEvent | null {
  let type = "message";
  const data: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (!EVENT_TYPES.has(type as SupportChatEvent["type"]) || data.length === 0) return null;
  try {
    const payload: unknown = JSON.parse(data.join("\n"));
    if (!payload || typeof payload !== "object") return null;
    return { ...(payload as object), type } as SupportChatEvent;
  } catch {
    return null;
  }
}

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SupportChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const event = parseSupportChatEventBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (event) yield event;
      }
    }
  } finally {
    // Người đọc dừng giữa chừng ⇒ đóng kết nối, backend tự huỷ request LLM.
    void reader.cancel().catch(() => undefined);
  }
}

export interface SupportChatStreamOptions {
  /** Phiên của `area` hết hạn hẳn — gọi ngay trước khi xoá phiên và gửi lại như khách. */
  onSessionExpired?: () => void;
}

/**
 * POST /support/chat. Trả chuỗi sự kiện SSE; lỗi trước khi mở stream ném
 * `SupportChatHttpError`, lỗi mạng ném lỗi của `fetch`, bị huỷ ném AbortError.
 */
export async function openSupportChatStream(
  area: AuthArea,
  request: SupportChatRequest,
  signal: AbortSignal,
  options: SupportChatStreamOptions = {},
): Promise<AsyncGenerator<SupportChatEvent>> {
  const response = await sendWithSession(
    area,
    (token) =>
      fetch(`${API_BASE_URL}/support/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeaders(token) },
        body: JSON.stringify(request),
        signal,
      }),
    () => {
      options.onSessionExpired?.();
      authStoreForArea(area).getState().clear();
    },
  );
  if (!response.ok) throw await httpErrorOf(response);
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    throw new SupportChatHttpError(response.status, "Unexpected support chat response");
  }
  return readEvents(response.body);
}

/**
 * GET /support/chat/suggestions. `null` khi chatbot đang tắt (503) ⇒ ẩn nút mở. Token hết hạn
 * thì lấy câu gợi ý của khách, không xoá phiên — việc đó để SessionSync lo.
 */
export async function fetchSupportChatSuggestions(area: AuthArea): Promise<SupportChatSuggestion[] | null> {
  const response = await sendWithSession(area, (token) =>
    fetch(`${API_BASE_URL}/support/chat/suggestions`, { headers: authHeaders(token) }),
  );
  if (response.status === 503) return null;
  if (!response.ok) throw await httpErrorOf(response);
  const body = (await response.json()) as ApiResponse<SupportChatSuggestion[]>;
  return body.data ?? [];
}
