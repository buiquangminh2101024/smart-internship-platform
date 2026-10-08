import Link from "next/link";
import type { Metadata } from "next";
import type { RegistrableRole } from "@sip/shared-types";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Quên mật khẩu — InternHub" };

interface ForgotPasswordPageProps {
  searchParams: Promise<{ role?: string }>;
}

/**
 * Đặt lại mật khẩu bằng mã gửi qua email (AD-18, E1). Công khai; `role` chỉ để
 * quay về đúng trang đăng nhập (`/login?role=EMPLOYER`).
 */
export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  const role: RegistrableRole = params.role === "EMPLOYER" ? "EMPLOYER" : "CANDIDATE";

  return (
    <div className="grid gap-6">
      <div className="grid gap-1 text-center">
        <h1 className="text-2xl font-semibold text-text-strong">Quên mật khẩu</h1>
        <p className="text-sm text-text-muted">Nhập email đăng nhập để nhận mã đặt mật khẩu mới.</p>
      </div>
      <ForgotPasswordForm role={role} />
      <p className="text-center text-sm text-text-muted">
        Nhớ ra mật khẩu?{" "}
        <Link
          href={role === "EMPLOYER" ? "/login?role=EMPLOYER" : "/login"}
          className="font-medium text-brand-700 hover:underline"
        >
          Quay lại đăng nhập
        </Link>
      </p>
    </div>
  );
}
