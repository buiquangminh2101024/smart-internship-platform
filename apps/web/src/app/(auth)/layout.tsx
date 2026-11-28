import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-surface-page lg:grid-cols-12">
      {/* Left Brand Panel (Desktop) */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0d1117] p-10 text-white lg:col-span-5 lg:flex xl:p-14">
        <div className="dot-pattern pointer-events-none absolute inset-0 opacity-15" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />

        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm">
              <Icon name="layers" size={20} />
            </span>
            <span className="text-xl font-extrabold tracking-tight text-white">
              Intern<span className="text-brand-400">Hub</span>
            </span>
          </Link>
        </div>

        <div className="relative grid gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-brand-300">
            Nền tảng thực tập minh bạch
          </span>
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-white xl:text-4xl">
            Kết nối thực tập, mở đầu sự nghiệp vững chắc.
          </h2>
          <p className="max-w-md text-[15px] leading-relaxed text-slate-300">
            Hàng nghìn vị trí thực tập từ doanh nghiệp đã xác thực mã số thuế, cập nhật trạng thái hồ sơ trực tiếp từ lúc
            nộp CV đến khi nhận kết quả.
          </p>

          <ul className="grid gap-3 pt-2 text-sm text-slate-300">
            <li className="flex items-center gap-2.5">
              <Icon name="shield-check" size={18} className="shrink-0 text-emerald-400" />
              100% doanh nghiệp được xác thực trước khi đăng tin
            </li>
            <li className="flex items-center gap-2.5">
              <Icon name="file-text" size={18} className="shrink-0 text-brand-400" />
              Tạo và quản lý nhiều phiên bản CV chuẩn ATS
            </li>
            <li className="flex items-center gap-2.5">
              <Icon name="calendar-check" size={18} className="shrink-0 text-amber-400" />
              Nhận lịch phỏng vấn và trao đổi trực tiếp với HR
            </li>
          </ul>
        </div>

        <div className="relative flex items-center justify-between border-t border-white/10 pt-6 text-xs text-slate-400">
          <span>© 2026 InternHub</span>
          <Link href="/" className="font-medium text-slate-300 transition-colors hover:text-white">
            ← Quay lại trang chủ
          </Link>
        </div>
      </aside>

      {/* Right Form Area */}
      <div className="flex flex-col lg:col-span-7">
        <header className="flex h-16 items-center justify-between border-b border-border-subtle bg-white px-6 lg:hidden">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white">
              <Icon name="layers" size={16} />
            </span>
            <span className="text-lg font-extrabold text-text-strong">
              Intern<span className="text-brand-500">Hub</span>
            </span>
          </Link>
          <Link href="/" className="text-sm font-medium text-text-muted hover:text-text-strong">
            Trang chủ
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="animate-fade-up w-full max-w-[440px] rounded-2xl border border-border-subtle bg-white p-7 shadow-[0_12px_32px_-6px_rgba(13,17,23,0.08)] sm:p-9">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
