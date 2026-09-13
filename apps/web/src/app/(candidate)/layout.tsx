import type { ReactNode } from "react";
import { CandidatePortalShell } from "@/components/layout/CandidatePortalShell";

/**
 * Sidebar + topbar cho khu vực ứng viên đã đăng nhập.
 * Bọc mọi trang trong `(candidate)/` (profile/cv/saved-jobs/...).
 * Guard xác thực thực hiện ở middleware hoặc tại component con.
 */
export default function CandidateLayout({ children }: { children: ReactNode }) {
  return <CandidatePortalShell>{children}</CandidatePortalShell>;
}
