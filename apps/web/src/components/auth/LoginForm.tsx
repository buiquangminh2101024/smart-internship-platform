"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AuthTokensResponse, RegistrableRole } from "@sip/shared-types";
import { publicFetch, ApiError } from "@/lib/api-client";
import { completeAuth, navigateAfterAuth } from "@/lib/auth";
import { authErrorMessage, hasAuthCode } from "@/lib/auth-errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OtpForm } from "./OtpForm";
import { GoogleAuthButton, googleAuthErrorMessage } from "./GoogleAuthButton";

export interface LoginFormProps {
  role: RegistrableRole;
}

/** Link tới trang hỗ trợ, điền sẵn loại vấn đề và email (nhánh Google không có email). */
function suspendedSupportHref(email?: string): string {
  const params = new URLSearchParams({ category: "ACCOUNT_SUSPENDED" });
  const trimmed = email?.trim();
  if (trimmed) params.set("email", trimmed);
  return `/support?${params.toString()}`;
}

function isSuspendedError(err: unknown): boolean {
  return err instanceof ApiError && err.code === "ACCOUNT_SUSPENDED";
}

/** Đúng mật khẩu nhưng chưa nhập mã xác thực lúc đăng ký (403). Giữ so chuỗi cũ làm dự phòng. */
function isNotVerifiedError(err: unknown): boolean {
  return (
    hasAuthCode(err, "EMAIL_NOT_VERIFIED") ||
    (err instanceof ApiError && err.status === 403 && err.message.toLowerCase().includes("not verified"))
  );
}

export function LoginForm({ role }: LoginFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "otp">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  // 429 LOGIN_LOCKED (AD-31 D4): câu báo kèm link Quên mật khẩu nổi rõ.
  const [locked, setLocked] = useState(false);
  // Có giá trị khi server trả ACCOUNT_SUSPENDED: hiện thông báo khoá kèm link hỗ trợ thay cho formError.
  const [suspendedHref, setSuspendedHref] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const forgotHref = role === "EMPLOYER" ? "/forgot-password?role=EMPLOYER" : "/forgot-password";

  async function handleGoogle(idToken: string) {
    setFormError(null);
    setLocked(false);
    setSuspendedHref(null);
    setGoogleSubmitting(true);
    try {
      const tokens = await publicFetch<AuthTokensResponse>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ idToken, role }),
      });
      const user = await completeAuth(tokens);
      await navigateAfterAuth(router, user);
    } catch (err) {
      if (isSuspendedError(err)) {
        setSuspendedHref(suspendedSupportHref());
        return;
      }
      setFormError(googleAuthErrorMessage(err, "Không đăng nhập được bằng Google, vui lòng thử lại"));
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setLocked(false);
    setSuspendedHref(null);
    setSubmitting(true);

    try {
      const tokens = await publicFetch<AuthTokensResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const user = await completeAuth(tokens);
      await navigateAfterAuth(router, user);
    } catch (err) {
      if (isSuspendedError(err)) {
        setSuspendedHref(suspendedSupportHref(email));
      } else if (isNotVerifiedError(err)) {
        // Tài khoản chưa xác thực OTP lúc đăng ký — gửi lại mã rồi chuyển sang bước OTP.
        try {
          await publicFetch("/auth/resend-otp", { method: "POST", body: JSON.stringify({ email }) });
        } catch {
          // Bỏ qua — OtpForm vẫn cho người dùng bấm "Gửi lại mã" thủ công.
        }
        setStep("otp");
      } else {
        setLocked(hasAuthCode(err, "LOGIN_LOCKED"));
        setFormError(authErrorMessage(err, "Không đăng nhập được, vui lòng thử lại"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "otp") {
    return (
      <OtpForm
        email={email}
        notice="Email này chưa được xác thực. Mã mới đã được gửi tới hộp thư, bạn nhập mã để hoàn tất đăng ký."
        onVerified={(user) => void navigateAfterAuth(router, user)}
      />
    );
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
      <Link
        href={forgotHref}
        className="-mt-2 justify-self-end text-sm font-medium text-brand-700 hover:underline"
      >
        Quên mật khẩu?
      </Link>
      {formError ? (
        <p role="alert" className="text-sm text-red-600">
          {formError}
          {locked ? (
            <>
              {" "}
              <Link href={forgotHref} className="font-semibold text-brand-700 hover:underline">
                Đặt lại mật khẩu
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {suspendedHref ? (
        <p role="alert" className="text-sm text-red-600">
          Tài khoản của bạn đã bị khoá.{" "}
          <Link href={suspendedHref} className="font-semibold text-brand-700 hover:underline">
            Liên hệ hỗ trợ
          </Link>
        </p>
      ) : null}
      <Button type="submit" loading={submitting} fullWidth>
        Đăng nhập
      </Button>
      <GoogleAuthButton onIdToken={handleGoogle} disabled={googleSubmitting} />
    </form>
  );
}
