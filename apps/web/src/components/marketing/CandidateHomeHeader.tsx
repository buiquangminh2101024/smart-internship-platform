"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useCandidateAuthStore, useCurrentUser } from "@/stores/auth-store";
import { Button } from "@/components/ui/Button";

const NAV_LINKS = [
  { label: "Việc thực tập", href: "/" },
  { label: "Công ty", href: "/" },
  { label: "Cẩm nang", href: "/" },
  { label: "Dành cho doanh nghiệp", href: "/employer" },
];

// Phần duy nhất đổi theo trạng thái đăng nhập trên "/" (xem AD-3) — nội dung
// chính (hero, roles, lifecycle...) giữ nguyên cho cả guest lẫn Candidate.
export function CandidateHomeHeader() {
  const router = useRouter();
  const user = useCurrentUser("candidate");
  const hasHydrated = useCandidateAuthStore((s) => s.hasHydrated);

  async function handleLogout() {
    const refreshToken = useCandidateAuthStore.getState().refreshToken ?? undefined;
    try {
      await apiFetch("candidate", "/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
    } catch {
      // Ưu tiên clear phía client ngay cả khi API logout thất bại.
    } finally {
      useCandidateAuthStore.getState().clear();
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border-subtle bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center gap-8 px-6">
        <Link href="/" className="text-lg font-semibold text-pine-800">
          InternHub
        </Link>
        <nav className="flex flex-1 gap-6">
          {NAV_LINKS.map((link) => (
            <Link key={link.label} href={link.href} className="text-sm text-text-body hover:text-pine-700">
              {link.label}
            </Link>
          ))}
        </nav>
        {!hasHydrated ? (
          <div className="h-9 w-[220px]" aria-hidden />
        ) : user ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-text-muted">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Đăng xuất
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button as="a" href="/login" variant="ghost">
              Đăng nhập
            </Button>
            <Button as="a" href="/register">
              Tạo hồ sơ miễn phí
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
