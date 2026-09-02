"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AuthTokensResponse, RegistrableRole } from "@sip/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { completeAuth, redirectPathForRole } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OtpForm } from "./OtpForm";
import { GoogleAuthButton } from "./GoogleAuthButton";

export interface LoginFormProps {
  role: RegistrableRole;
}

export function LoginForm({ role }: LoginFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "otp">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  async function handleGoogle(idToken: string) {
    setFormError(null);
    setGoogleSubmitting(true);
    try {
      const tokens = await apiFetch<AuthTokensResponse>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ idToken, role }),
      });
      const user = await completeAuth(tokens);
      router.push(redirectPathForRole(user.role));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Không đăng nhập được bằng Google, vui lòng thử lại");
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const tokens = await apiFetch<AuthTokensResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const user = await completeAuth(tokens);
      router.push(redirectPathForRole(user.role));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.message.toLowerCase().includes("not verified")) {
        // Tài khoản chưa xác thực OTP lúc đăng ký — gửi lại mã rồi chuyển sang bước OTP.
        try {
          await apiFetch("/auth/resend-otp", { method: "POST", body: JSON.stringify({ email }) });
        } catch {
          // Bỏ qua — OtpForm vẫn cho người dùng bấm "Gửi lại mã" thủ công.
        }
        setStep("otp");
      } else {
        setFormError(err instanceof ApiError ? err.message : "Không đăng nhập được, vui lòng thử lại");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "otp") {
    return <OtpForm email={email} onVerified={(user) => router.push(redirectPathForRole(user.role))} />;
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <Input
        label="Mật khẩu"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
      {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
      <Button type="submit" loading={submitting} fullWidth>
        Đăng nhập
      </Button>
      <GoogleAuthButton onIdToken={handleGoogle} disabled={googleSubmitting} />
    </form>
  );
}
