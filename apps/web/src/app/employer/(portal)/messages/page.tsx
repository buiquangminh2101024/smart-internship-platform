import { Suspense } from "react";
import { ChatLayout } from "@/components/messaging/ChatLayout";

export const metadata = {
  title: "Tin nhắn | Employer Portal",
};

export default function EmployerMessagesPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<div className="p-8 text-center text-text-muted">Đang tải...</div>}>
          <ChatLayout area="employer" />
        </Suspense>
      </div>
    </div>
  );
}
