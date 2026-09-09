"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEmployerMe } from "@/hooks/useEmployerMe";
import { CreateCompanyForm } from "@/components/employer/CreateCompanyForm";
import { JoinCompanyForm } from "@/components/employer/JoinCompanyForm";
import { OnboardingExitGuard } from "@/components/employer/OnboardingExitGuard";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

type Choice = "new" | "join" | null;

// Đích đến khi Employer đăng ký/đăng nhập xong nhưng chưa liên kết công ty
// (xem lib/auth.ts resolveEmployerDestination + proxy.ts §Phase 4). Không có
// route nào khác trỏ tới đây — luôn tới từ luồng auth hoặc bị proxy chặn về.
export default function EmployerOnboardingPage() {
  const router = useRouter();
  const { data } = useEmployerMe();
  const [choice, setChoice] = useState<Choice>(null);
  const [done, setDone] = useState(false);

  // proxy.ts (server-side) đã chặn stage khác "onboarding" ở request kế tiếp,
  // nhưng dữ liệu client có thể tải xong SAU khi trang render (race hiếm khi
  // cookie stage bị thiếu lúc điều hướng) — tự sửa lại hướng đi cho đúng.
  useEffect(() => {
    if (!data) return;
    if (data.stage === "ACTIVE") router.replace("/employer");
    else if (data.stage === "PENDING_VERIFICATION") router.replace("/employer/profile");
  }, [data, router]);

  function handleDone() {
    setDone(true);
    router.replace("/employer/profile");
  }

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6 px-6 py-12">
      <OnboardingExitGuard completed={done} />
      <div className="grid gap-1 text-center">
        <h1 className="text-2xl font-semibold text-text-strong">Hoàn tất thủ tục doanh nghiệp</h1>
        <p className="text-sm text-text-muted">Liên kết tài khoản của bạn với một công ty trước khi sử dụng InternHub.</p>
      </div>

      {choice === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            interactive
            padding="lg"
            role="button"
            tabIndex={0}
            onClick={() => setChoice("new")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setChoice("new");
            }}
            className="grid gap-3 text-center"
          >
            <Icon name="building-2" size={28} className="mx-auto text-indigo-600" />
            <h2 className="text-base font-semibold text-text-strong">Đăng ký công ty mới</h2>
            <p className="text-sm text-text-muted">Công ty của bạn chưa có trên InternHub.</p>
          </Card>
          <Card
            interactive
            padding="lg"
            role="button"
            tabIndex={0}
            onClick={() => setChoice("join")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setChoice("join");
            }}
            className="grid gap-3 text-center"
          >
            <Icon name="users" size={28} className="mx-auto text-indigo-600" />
            <h2 className="text-base font-semibold text-text-strong">Liên kết công ty đã có</h2>
            <p className="text-sm text-text-muted">Dùng mã liên kết do đồng nghiệp cung cấp.</p>
          </Card>
        </div>
      ) : (
        <Card padding="lg">
          <button type="button" onClick={() => setChoice(null)} className="mb-4 text-sm text-text-muted hover:text-text-strong">
            ← Quay lại
          </button>
          {choice === "new" ? <CreateCompanyForm mode="create" onDone={handleDone} /> : <JoinCompanyForm onDone={handleDone} />}
        </Card>
      )}
    </div>
  );
}
