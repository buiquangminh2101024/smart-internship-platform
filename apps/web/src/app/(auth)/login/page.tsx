import Link from "next/link";
import type { Metadata } from "next";
import type { RegistrableRole } from "@sip/shared-types";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = { title: "Đăng nhập — InternHub" };

interface LoginPageProps {
  searchParams: Promise<{ role?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const role: RegistrableRole = params.role === "EMPLOYER" ? "EMPLOYER" : "CANDIDATE";

  return (
    <div className="grid gap-6">
      <div className="grid gap-1 text-center">
        <h1 className="text-2xl font-semibold text-text-strong">Đăng nhập</h1>
        <p className="text-sm text-text-muted">
          {role === "EMPLOYER" ? "Dành cho nhà tuyển dụng" : "Dành cho sinh viên"}
        </p>
      </div>
      <LoginForm role={role} />
      <p className="text-center text-sm text-text-muted">
        Chưa có tài khoản?{" "}
        <Link
          href={role === "EMPLOYER" ? "/register?role=EMPLOYER" : "/register"}
          className="font-medium text-pine-700 hover:underline"
        >
          Đăng ký
        </Link>
      </p>
    </div>
  );
}
