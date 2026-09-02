import Link from "next/link";
import type { Metadata } from "next";
import type { RegistrableRole } from "@sip/shared-types";
import { RegisterForm } from "@/components/auth/RegisterForm";

export const metadata: Metadata = { title: "Đăng ký — InternHub" };

interface RegisterPageProps {
  searchParams: Promise<{ role?: string }>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const role: RegistrableRole = params.role === "EMPLOYER" ? "EMPLOYER" : "CANDIDATE";

  return (
    <div className="grid gap-6">
      <div className="grid gap-1 text-center">
        <h1 className="text-2xl font-semibold text-text-strong">
          {role === "EMPLOYER" ? "Tạo tài khoản nhà tuyển dụng" : "Tạo hồ sơ miễn phí"}
        </h1>
        <p className="text-sm text-text-muted">
          {role === "EMPLOYER" ? "Đăng tin tuyển dụng thực tập sinh" : "Ứng tuyển thực tập chỉ với một hồ sơ"}
        </p>
      </div>
      <RegisterForm role={role} />
      <p className="text-center text-sm text-text-muted">
        Đã có tài khoản?{" "}
        <Link
          href={role === "EMPLOYER" ? "/login?role=EMPLOYER" : "/login"}
          className="font-medium text-pine-700 hover:underline"
        >
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
