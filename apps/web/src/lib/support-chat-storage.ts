import type { SupportChatSource, SupportChatSourceRef } from "@sip/shared-types";
import type { AuthArea } from "./auth-area";

// Lịch sử trợ lý nằm ở sessionStorage (D2 backend): đóng tab là mất, mỗi tab một hội thoại.
// Mọi lệnh đọc/ghi bọc try/catch — storage bị chặn thì chat vẫn chạy, chỉ không nhớ khi reload.

const KEY_PREFIX = "sip-support-chat:";
const AREAS: readonly AuthArea[] = ["candidate", "employer", "admin"];
/** Giữ tối đa chừng này tin khi lưu — đủ để đọc lại, không phình storage. */
const MAX_STORED_MESSAGES = 50;

export type StoredSupportChatStatus = "done" | "stopped" | "interrupted";

/** Chỉ tin người dùng/trợ lý đã xong lượt. Tin hệ thống (lỗi, 429…) không lưu. */
export interface StoredSupportChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Tin người dùng bấm từ câu gợi ý — để "Thử lại" gửi lại đúng mục. */
  faqId?: string | undefined;
  source?: SupportChatSource | undefined;
  sources?: SupportChatSourceRef[] | undefined;
  suggestSupport?: boolean | undefined;
  status?: StoredSupportChatStatus | undefined;
}

export function supportChatStorageKey(area: AuthArea, userId: string | null): string {
  return `${KEY_PREFIX}${area}:${userId ?? "guest"}`;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isStoredMessage(value: unknown): value is StoredSupportChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.text === "string"
  );
}

export function loadSupportChatHistory(key: string): StoredSupportChatMessage[] {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isStoredMessage) : [];
  } catch {
    return [];
  }
}

export function saveSupportChatHistory(key: string, messages: StoredSupportChatMessage[]): void {
  try {
    if (messages.length === 0) storage()?.removeItem(key);
    else storage()?.setItem(key, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
  } catch {
    // Hết quota hoặc bị chặn — bỏ qua.
  }
}

export function removeSupportChatHistory(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Bị chặn — bỏ qua.
  }
}

/**
 * Quét khi khởi động (quyết định 5): xoá lịch sử của user không còn đăng nhập ở khu vực
 * tương ứng — bắt cả những lần đăng xuất lúc không có gì lắng nghe. Lịch sử khách giữ nguyên.
 */
export function sweepSupportChatHistory(signedInUserIds: Record<AuthArea, string | null>): void {
  const store = storage();
  if (!store) return;
  try {
    const stale: string[] = [];
    for (let index = 0; index < store.length; index++) {
      const key = store.key(index);
      if (!key?.startsWith(KEY_PREFIX)) continue;
      const [area, owner] = key.slice(KEY_PREFIX.length).split(":");
      const known = AREAS.find((item) => item === area);
      if (!known || !owner) stale.push(key);
      else if (owner !== "guest" && owner !== signedInUserIds[known]) stale.push(key);
    }
    stale.forEach((key) => store.removeItem(key));
  } catch {
    // Bị chặn — bỏ qua.
  }
}
