"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { RegistrableRole } from "@sip/shared-types";
import { clearSessionsOfEmail, loginAfterResetHref, requestCodeErrorMessage } from "@/lib/password-reset";
import { useForgotPassword } from "@/hooks/usePasswordReset";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ResetPasswordForm } from "./ResetPasswordForm";

/**
 * Trang `/forgot-password` (AD-18, E1). Bước 1 xin mã; server không cho biết
 * email có tài khoản hay không, nên luôn sang bước 2 với câu "Nếu … có tài khoản".
 */
export function ForgotPasswordForm({ role }: { role: RegistrableRole }) {
  const router = useRouter();
  const requestCode = useForgotPassword();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleRequest(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Nhập email bạn dùng để đăng nhập.");
      return;
    }
    try {
      await requestCode.mutateAsync(trimmed);
      setEmail(trimmed);
      setStep("code");
    } catch (err) {
      setError(requestCodeErrorMessage(err));
    }
  }

  if (step === "code") {
    return (
      <div className="grid gap-4">
        <div className="grid gap-2 text-sm">
          <p className="text-text-body">
            Nếu <span className="font-medium [overflow-wrap:anywhere] text-text-strong">{email}</span> có tài khoản đăng
            nhập bằng mật khẩu, mã gồm 6 chữ số đã được gửi tới hộp thư. Mã có hiệu lực 5 phút.
          </p>
          <p className="text-text-muted">
            Tài khoản đăng nhập bằng Google thì không cần mật khẩu — hãy dùng nút Google ở trang đăng nhập.
          </p>
        </div>
        <ResetPasswordForm
          email={email}
          onChangeEmail={() => setStep("email")}
          onSuccess={() => {
            clearSessionsOfEmail(email);
            router.replace(loginAfterResetHref(role));
          }}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleRequest} noValidate className="grid gap-4">
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        // Trang chỉ có một ô; quay lại từ "Đổi email" cũng cần focus ở đây.
        autoFocus
        error={error ?? undefined}
        required
      />
      <Button type="submit" loading={requestCode.isPending} fullWidth>
        {requestCode.isPending ? "Đang gửi mã" : "Gửi mã"}
      </Button>
    </form>
  );
}
