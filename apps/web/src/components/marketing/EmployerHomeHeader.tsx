"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useEmployerAuthStore, useCurrentUser } from "@/stores/auth-store";
import { Button } from "@/components/ui/Button";

const NAV_LINKS = [
  { label: "Vì sao chọn InternHub", href: "/employer" },
  { label: "Cách hoạt động", href: "/employer" },
  { label: "Dành cho sinh viên", href: "/" },
];

// Đích redirect sau đăng nhập Employer tạm thời chính là "/employer" (chưa có
// portal thật tới Phase 4/5) nên header cũng cần đổi theo trạng thái đăng
// nhập, cùng nguyên tắc "chỉ đổi navbar" đã áp dụng ở CandidateHomeHeader.
export function EmployerHomeHeader() {
  const router = useRouter();
  const user = useCurrentUser("employer");
  const hasHydrated = useEmployerAuthStore((s) => s.hasHydrated);

  async function handleLogout() {
    const refreshToken = useEmployerAuthStore.getState().refreshToken ?? undefined;
    try {
      await apiFetch("employer", "/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
    } catch {
      // Ưu tiên clear phía client ngay cả khi API logout thất bại.
    } finally {
      useEmployerAuthStore.getState().clear();
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border-subtle bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center gap-8 px-6">
        <Link href="/employer" className="flex items-center gap-2 text-lg font-semibold text-indigo-700">
          InternHub
          <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">Doanh nghiệp</span>
        </Link>
        <nav className="flex flex-1 gap-6">
          {NAV_LINKS.map((link) => (
            <Link key={link.label} href={link.href} className="text-sm text-text-body hover:text-indigo-700">
              {link.label}
            </Link>
          ))}
        </nav>
        {!hasHydrated ? (
          <div className="h-9 w-[260px]" aria-hidden />
        ) : user ? (
          <div className="flex items-center gap-3">
            <Button as="a" href="/employer/profile" variant="ghost" size="sm">
              {user.email}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Đăng xuất
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button as="a" href="/login?role=EMPLOYER" variant="ghost">
              Đăng nhập nhà tuyển dụng
            </Button>
            <Button as="a" href="/register?role=EMPLOYER" className="!bg-indigo-600 hover:!bg-indigo-700">
              Đăng tin miễn phí
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
