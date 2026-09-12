import type { ReactNode } from "react";
import { AdminConsoleShell } from "@/components/layout/AdminConsoleShell";

/**
 * Sidebar + topbar cho console Admin. Trang đăng nhập bí mật `app/admin/page.tsx`
 * nằm ngoài route group này nên không nhận layout (xem AD-1: không được để lộ
 * bất kỳ entry point nào của khu quản trị).
 */
export default function AdminConsoleLayout({ children }: { children: ReactNode }) {
  return <AdminConsoleShell>{children}</AdminConsoleShell>;
}
