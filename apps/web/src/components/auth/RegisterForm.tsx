"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { RegistrableRole } from "@sip/shared-types";
import type { AuthTokensResponse } from "@sip/shared-types";
import { publicFetch, ApiError } from "@/lib/api-client";
import { completeAuth, redirectPathForRole } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OtpForm } from "./OtpForm";
import { GoogleAuthButton } from "./GoogleAuthButton";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisterFormProps {
  role: RegistrableRole;
}

export function RegisterForm({ role }: RegisterFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "otp">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  async function handleGoogle(idToken: string) {
    setFormError(null);
    setGoogleSubmitting(true);
    try {
      const tokens = await publicFetch<AuthTokensResponse>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ idToken, role }),
      });
      const user = await completeAuth(tokens);
      router.push(redirectPathForRole(user.role));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Không đăng ký được bằng Google, vui lòng thử lại");
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const errors: typeof fieldErrors = {};
    if (!EMAIL_RE.test(email)) errors.email = "Email không hợp lệ";
    if (password.length < 8) errors.password = "Mật khẩu tối thiểu 8 ký tự";
    if (confirmPassword !== password) errors.confirmPassword = "Mật khẩu nhập lại không khớp";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await publicFetch("/auth/register", { method: "POST", body: JSON.stringify({ email, password, role }) });
      setStep("otp");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Không đăng ký được, vui lòng thử lại");
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
        error={fieldErrors.email}
        autoComplete="email"
        required
      />
      <Input
        label="Mật khẩu"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
        hint={fieldErrors.password ? undefined : "Tối thiểu 8 ký tự"}
        autoComplete="new-password"
        required
      />
      <Input
        label="Nhập lại mật khẩu"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={fieldErrors.confirmPassword}
        autoComplete="new-password"
        required
      />
      {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
      <Button type="submit" loading={submitting} fullWidth>
        Tạo tài khoản
      </Button>
      <GoogleAuthButton onIdToken={handleGoogle} disabled={googleSubmitting} />
    </form>
  );
}
