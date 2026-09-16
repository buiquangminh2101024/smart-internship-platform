import { Suspense } from "react";
import { ChatLayout } from "@/components/messaging/ChatLayout";

export const metadata = {
  title: "Tin nhắn | Smart Internship Platform",
};

export default function CandidateMessagesPage() {
  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<div className="p-8 text-center text-text-muted">Đang tải...</div>}>
          <ChatLayout area="candidate" />
        </Suspense>
      </div>
    </div>
  );
}
