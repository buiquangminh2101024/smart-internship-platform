"use client";

import { useQuery } from "@tanstack/react-query";
import type { AuthArea } from "@/lib/auth-area";
import { fetchSupportChatSuggestions } from "@/lib/support-chat-stream";

/**
 * Câu gợi ý theo vai trò người đang xem (GET /support/chat/suggestions). Gọi ngay lúc mở trang
 * vì còn dùng để biết chatbot có đang bật không: `data === null` (503) ⇒ ẩn nút mở.
 */
export function useSupportChatSuggestions(area: AuthArea, userId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["support-chat-suggestions", area, userId],
    queryFn: () => fetchSupportChatSuggestions(area),
    enabled,
    staleTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
