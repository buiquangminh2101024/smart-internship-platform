import Link from "next/link";
import type { Metadata } from "next";
import type { RegistrableRole } from "@sip/shared-types";
import { LoginForm } from "@/components/auth/LoginForm";
import { PasswordChangedNote } from "@/components/auth/PasswordChangedNote";

export const metadata: Metadata = { title: "Đăng nhập — InternHub" };

interface LoginPageProps {
  /** `reset=1`: vừa đổi mật khẩu ở `/forgot-password` hoặc Cài đặt (AD-18). */
  searchParams: Promise<{ role?: string; reset?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const role: RegistrableRole = params.role === "EMPLOYER" ? "EMPLOYER" : "CANDIDATE";

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border-subtle bg-surface-page p-1">
        <Link
          href="/login"
          className={`rounded-lg py-2 text-center text-sm font-semibold transition-all ${
            role === "CANDIDATE"
              ? "bg-white text-text-strong shadow-xs"
              : "text-text-muted hover:text-text-strong"
          }`}
        >
          Sinh viên
        </Link>
        <Link
          href="/login?role=EMPLOYER"
          className={`rounded-lg py-2 text-center text-sm font-semibold transition-all ${
            role === "EMPLOYER"
              ? "bg-white text-text-strong shadow-xs"
              : "text-text-muted hover:text-text-strong"
          }`}
        >
          Nhà tuyển dụng
        </Link>
      </div>

      <div className="grid gap-1.5 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-text-strong">Đăng nhập</h1>
        <p className="text-sm text-text-muted">
          {role === "EMPLOYER"
            ? "Truy cập cổng quản lý tuyển dụng doanh nghiệp"
            : "Tiếp tục hành trình tìm kiếm cơ hội thực tập"}
        </p>
      </div>
      {params.reset === "1" ? <PasswordChangedNote /> : null}
      <LoginForm role={role} />
      <p className="text-center text-sm text-text-muted">
        Chưa có tài khoản?{" "}
        <Link
          href={role === "EMPLOYER" ? "/register?role=EMPLOYER" : "/register"}
          className="font-semibold text-brand-600 hover:underline"
        >
          Đăng ký ngay
        </Link>
      </p>
    </div>
  );
}
