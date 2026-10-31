"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useSupportChat } from "@/hooks/useSupportChat";
import { useSupportChatSuggestions } from "@/hooks/useSupportChatSuggestions";
import { areaForPath, type AuthArea } from "@/lib/auth-area";
import { isSupportChatHiddenAt } from "@/lib/support-chat-routes";
import { removeSupportChatHistory, supportChatStorageKey, sweepSupportChatHistory } from "@/lib/support-chat-storage";
import { authStoreForArea, useAdminAuthStore, useCandidateAuthStore, useEmployerAuthStore } from "@/stores/auth-store";
import { SupportChatLauncher } from "./SupportChatLauncher";
import { SupportChatPanel } from "./SupportChatPanel";

const AREAS: readonly AuthArea[] = ["candidate", "employer", "admin"];
const PANEL_ID = "support-chat-panel";
/** Dưới `sm` (640px) panel mở toàn màn hình. */
const MOBILE_QUERY = "(max-width: 639.98px)";

function subscribeToMobile(onChange: () => void): () => void {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Xoá lịch sử trợ lý khi đăng xuất mà không sửa auth store (quyết định 5): lắng nghe store của
 * cả 3 khu vực, user đổi từ có sang không (hoặc sang người khác) ⇒ xoá lịch sử của user cũ;
 * khi khởi động thì quét các key của user không còn đăng nhập.
 */
function useSupportChatHistoryCleanup(): void {
  const candidateHydrated = useCandidateAuthStore((state) => state.hasHydrated);
  const employerHydrated = useEmployerAuthStore((state) => state.hasHydrated);
  const adminHydrated = useAdminAuthStore((state) => state.hasHydrated);
  const allHydrated = candidateHydrated && employerHydrated && adminHydrated;

  useEffect(() => {
    if (!allHydrated) return;
    sweepSupportChatHistory({
      candidate: useCandidateAuthStore.getState().user?.id ?? null,
      employer: useEmployerAuthStore.getState().user?.id ?? null,
      admin: useAdminAuthStore.getState().user?.id ?? null,
    });
  }, [allHydrated]);

  useEffect(() => {
    const unsubscribes = AREAS.map((area) =>
      authStoreForArea(area).subscribe((state, previous) => {
        if (previous.user && previous.user.id !== state.user?.id) {
          removeSupportChatHistory(supportChatStorageKey(area, previous.user.id));
        }
      }),
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, []);
}

/**
 * Widget trợ lý hỗ trợ (docs/05-frontend/phases/support-chatbot/PLAN.md). Luôn được gắn ở
 * `app/provider.tsx`, kể cả ở trang ẩn widget — **không** chuyển vào chỗ render có điều kiện,
 * nếu không việc lắng nghe đăng xuất sẽ ngừng. Hội thoại cũng sống ở đây nên đóng panel hay
 * sang trang ẩn widget khi đang stream vẫn nhận nốt câu trả lời.
 */
export function SupportChatRoot() {
  const pathname = usePathname();
  const area = areaForPath(pathname);
  const store = authStoreForArea(area);
  const hydrated = store((state) => state.hasHydrated);
  const userId = store((state) => state.user?.id ?? null);
  const hidden = area === "admin" || isSupportChatHiddenAt(pathname);

  useSupportChatHistoryCleanup();
  const chat = useSupportChat(area, userId, hydrated);
  const suggestions = useSupportChatSuggestions(area, userId, hydrated && !hidden);
  const mobile = useSyncExternalStore(subscribeToMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);

  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setOpen(false);
    // Đợi panel đóng (mobile: nút mở hiện lại) rồi trả focus về nút mở.
    requestAnimationFrame(() => launcherRef.current?.focus());
  };

  // Chưa biết chatbot có bật không (đang tải câu gợi ý) hoặc đã tắt (503) ⇒ không hiện gì.
  // Lỗi khác (mạng…) vẫn hiện, chỉ không có câu gợi ý.
  const disabled = suggestions.isPending || suggestions.data === null;

  return (
    <>
      <div className="sr-only" aria-live="polite">
        {chat.announcement}
      </div>
      {hidden || disabled ? null : (
        <div data-role={area === "employer" ? "employer" : undefined}>
          <SupportChatPanel
            id={PANEL_ID}
            open={open}
            modal={mobile}
            chat={chat}
            suggestions={suggestions.data ?? []}
            onClose={close}
          />
          <SupportChatLauncher
            ref={launcherRef}
            open={open}
            panelId={PANEL_ID}
            onToggle={() => (open ? close() : setOpen(true))}
          />
        </div>
      )}
    </>
  );
}
