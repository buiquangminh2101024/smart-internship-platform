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
      <div className="mx-auto flex h-[72px] max-w-6xl items-center gap-4 px-6 sm:gap-8">
        <Link href="/employer" className="flex shrink-0 items-center gap-2 text-lg font-semibold text-indigo-700">
          InternHub
          <span className="hidden rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 md:inline">Doanh nghiệp</span>
        </Link>
        {/* Màn hình hẹp không đủ chỗ cho menu (trang từng rộng ~800px ở 375px) — ẩn như CandidateHomeHeader.
            Hiện từ xl: ở 1024px các link bị xuống dòng. */}
        <nav className="hidden flex-1 gap-6 xl:flex" aria-label="Điều hướng doanh nghiệp">
          {NAV_LINKS.map((link) => (
            <Link key={link.label} href={link.href} className="text-sm text-text-body hover:text-indigo-700">
              {link.label}
            </Link>
          ))}
        </nav>
        {!hasHydrated ? (
          <div className="ml-auto h-9 w-10 sm:w-[260px]" aria-hidden />
        ) : user ? (
          <div className="ml-auto flex items-center gap-3">
            {/* Màn hình hẹp chỉ hiện icon; nhãn vẫn còn cho trình đọc màn hình (sr-only).
                Email chỉ hiện khi menu đang ẩn (lg): từ xl, email dài đẩy menu xuống nhiều dòng. */}
            <Button as="a" href="/employer/jobs" variant="ghost" size="sm" icon="briefcase">
              <span className="sr-only sm:not-sr-only">Tin tuyển dụng</span>
            </Button>
            <Button as="a" href="/employer/profile" variant="ghost" size="sm" icon="user-round">
              <span className="sr-only lg:not-sr-only lg:max-w-60 lg:truncate xl:sr-only">{user.email}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Đăng xuất
            </Button>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <Button as="a" href="/login?role=EMPLOYER" variant="ghost">
              Đăng nhập<span className="hidden md:inline"> nhà tuyển dụng</span>
            </Button>
            <Button as="a" href="/register?role=EMPLOYER" className="!bg-indigo-600 hover:!bg-indigo-700">
              Đăng tin<span className="hidden md:inline"> miễn phí</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
