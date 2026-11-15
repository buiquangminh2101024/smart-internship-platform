"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { COMPANY_APPLICATIONS_KEY } from "@/hooks/useApplications";
import { jobAutoKey } from "@/hooks/useAutoOutreach";
import { OUTREACH_KEY, searchKey } from "@/hooks/useCandidateOutreach";
import { HIRING_PROGRESS_KEY } from "@/hooks/useEmployerDashboard";
import { JOB_RECOMMENDATIONS_KEY } from "@/hooks/useJobRecommendations";
import { useSocketConnection, isMessagingArea, type SocketStatus } from "@/hooks/useSocket";
import { showBrowserNotification } from "@/lib/browser-notification";
import { markNotificationRead } from "@/lib/notifications";
import { MESSAGES_HREF, unreadSummaryQueryKey } from "@/lib/messaging";
import type { AuthArea } from "@/lib/auth-area";

interface SocketContextValue {
  area: AuthArea;
  status: SocketStatus;
  /** false = chưa gửi được vì mất kết nối. */
  sendMessage: (conversationId: string, content: string) => boolean;
}

const SocketContext = createContext<SocketContextValue | null>(null);

/**
 * Kết nối realtime dùng chung (NotificationBell + trang chat), mỗi area 1
 * socket/tab. Candidate mount ở app/provider.tsx để nhận thông báo cả trên
 * trang công khai; employer mount ở EmployerPortalShell (provider gần nhất
 * được ưu tiên). `enabled=false` giữ nguyên cây component, chỉ ngắt kết nối.
 *
 * Không hiện banner toàn trang khi mất kết nối: NotificationBell đã tự quay về
 * polling, chỉ trang chat (ChatLayout) mới báo lỗi qua `status`.
 */
export function SocketProvider({
  area,
  enabled = true,
  children,
}: {
  area: AuthArea;
  enabled?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { status, sendMessage } = useSocketConnection(
    area,
    {
      onNotification: (event) => {
        const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications", area] });
        void invalidate();
        // Thông báo nghiệp vụ mới (hồ sơ mới, tin được duyệt...) → số trên dashboard
        // đã cũ (AD-16). Candidate không có dashboard nên key này không khớp gì.
        void queryClient.invalidateQueries({ queryKey: [area, "dashboard"] });
        // Lịch phỏng vấn được đặt / đổi / huỷ (FE-5): khối lịch và trạng thái hồ sơ ở /applications đã cũ.
        if (area === "candidate" && event.type.startsWith("INTERVIEW_")) {
          void queryClient.invalidateQueries({ queryKey: ["candidate", "interviews"] });
          void queryClient.invalidateQueries({ queryKey: ["candidate", "applications"] });
        }
        // Báo tin việc làm (AD-26): có tin mới vừa được chấm ≥ ngưỡng nên "Việc làm phù hợp" đã cũ.
        // Thông báo gộp trong ngày được sửa tại chỗ (cùng id) — làm mới danh sách ở trên là đủ,
        // không chèn thêm vào cache nên không nhân đôi.
        if (area === "candidate" && event.type === "JOB_ALERT") {
          void queryClient.invalidateQueries({ queryKey: JOB_RECOMMENDATIONS_KEY });
        }
        // Ứng viên trả lời lời mời, hoặc hệ thống vừa tự gửi lời mời (AD-23):
        // trạng thái dòng và số đếm ở trang "Lời mời" đã cũ.
        if (
          area === "employer" &&
          (event.type === "CANDIDATE_OUTREACH_INVITATION_RESPONDED" || event.type === "AUTO_OUTREACH_SENT")
        ) {
          void queryClient.invalidateQueries({ queryKey: OUTREACH_KEY });
        }
        // Nhắc tuần hồ sơ tồn (AD-25): số trên dải gợi ý và tab của trang "Ứng viên" có thể đã cũ.
        if (area === "employer" && event.type === "APPLICATIONS_NEED_ATTENTION") {
          void queryClient.invalidateQueries({ queryKey: COMPANY_APPLICATIONS_KEY });
        }
        showBrowserNotification(area, "system", {
          title: event.title,
          body: event.body ?? "",
          tag: `sip-notification-${event.id}`,
          // Giống bấm trong NotificationBell: đánh dấu đã đọc rồi mở link backend đã render.
          onClick: () => {
            void markNotificationRead(area, event.id).then(invalidate, () => undefined);
            if (event.link) router.push(event.link);
          },
        });
      },
      onMessageNotification: (event) => {
        if (!isMessagingArea(area)) return; // admin không có tin nhắn — phòng hờ, server không emit event này cho admin
        void queryClient.invalidateQueries({ queryKey: unreadSummaryQueryKey(area) });
        // KPI "Tin nhắn chưa đọc" của dashboard Employer.
        void queryClient.invalidateQueries({ queryKey: [area, "dashboard", "overview"] });
        showBrowserNotification(area, "message", {
          title: `Tin nhắn mới từ ${event.senderName}`,
          body: event.preview,
          // Nhiều tab cùng chạy nền đều nhận event — cùng tag thì trình duyệt gộp làm 1.
          tag: `sip-message-${area}-${event.conversationId}`,
          onClick: () =>
            router.push(`${MESSAGES_HREF[area]}?conversationId=${encodeURIComponent(event.conversationId)}`),
        });
      },
      // 0.6 (AD-27 mục 6): lượt chấm lại vừa đổi số "Phù hợp" của các tin này. Chỉ làm mới dữ liệu,
      // không hiện thông báo trình duyệt. Mất socket thì refetchOnWindowFocus mặc định làm dự phòng.
      onMatchScoresUpdated: ({ jobPostIds }) => {
        if (area !== "employer") return;
        void queryClient.invalidateQueries({ queryKey: HIRING_PROGRESS_KEY }); // tiến độ tuyển ở tổng quan
        void queryClient.invalidateQueries({ queryKey: ["employerJobPosts"] }); // "Phù hợp N" ở /employer/jobs
        for (const jobId of jobPostIds) {
          void queryClient.invalidateQueries({ queryKey: jobAutoKey(jobId) }); // thẻ tự mời trên trang tin
          // "Gợi ý" của trang tìm ứng viên chỉ tìm lại khi Employer bấm "Tìm lại" hoặc mở lại trang
          // (useCandidateSearch): đánh dấu cũ nhưng không tìm ngay, để danh sách không đổi khi đang chọn.
          void queryClient.invalidateQueries({ queryKey: searchKey(jobId), refetchType: "none" });
        }
      },
    },
    enabled,
  );

  const value = useMemo(() => ({ area, status, sendMessage }), [area, status, sendMessage]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

/** Provider gần nhất; null khi không có provider nào (nơi dùng tự fallback). */
export function useSocket(): SocketContextValue | null {
  return useContext(SocketContext);
}
