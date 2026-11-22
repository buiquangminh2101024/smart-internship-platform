"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RegistrableRole } from "@sip/shared-types";
import type { AuthTokensResponse } from "@sip/shared-types";
import { publicFetch } from "@/lib/api-client";
import { authErrorMessage, hasAuthCode } from "@/lib/auth-errors";
import { completeAuth, navigateAfterAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { OtpForm } from "./OtpForm";
import { GoogleAuthButton, googleAuthErrorMessage } from "./GoogleAuthButton";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PENDING_PASSWORD_NOTE =
  "Mật khẩu là mật khẩu bạn đặt lần đăng ký trước; nếu quên, sau khi xác thực hãy dùng Quên mật khẩu.";
const PENDING_NOTICE = `Email này đã đăng ký nhưng chưa xác thực. Mã mới đã được gửi tới email. ${PENDING_PASSWORD_NOTE}`;
// Gửi lại mã bị từ chối (vừa xin mã trong 60 giây, hoặc hết lượt trong giờ): không có mã mới.
const PENDING_NO_NEW_CODE_NOTICE = `Email này đã đăng ký nhưng chưa xác thực. Bạn nhập mã đã gửi trước đó, hoặc bấm Gửi lại mã khi hết thời gian chờ. ${PENDING_PASSWORD_NOTE}`;

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
  // 409 EMAIL_TAKEN (AD-31 D5): câu báo kèm link Đăng nhập và Quên mật khẩu.
  const [taken, setTaken] = useState(false);
  // Đăng ký lại email đang chờ xác thực ⇒ sang bước nhập mã kèm ghi chú này.
  const [otpNotice, setOtpNotice] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const roleQuery = role === "EMPLOYER" ? "?role=EMPLOYER" : "";

  async function handleGoogle(idToken: string) {
    setFormError(null);
    setTaken(false);
    setGoogleSubmitting(true);
    try {
      const tokens = await publicFetch<AuthTokensResponse>("/auth/google", {
        method: "POST",
        body: JSON.stringify({ idToken, role }),
      });
      const user = await completeAuth(tokens);
      await navigateAfterAuth(router, user);
    } catch (err) {
      setFormError(googleAuthErrorMessage(err, "Không đăng ký được bằng Google, vui lòng thử lại"));
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setTaken(false);

    const errors: typeof fieldErrors = {};
    if (!EMAIL_RE.test(email)) errors.email = "Email không hợp lệ";
    if (password.length < 8) errors.password = "Mật khẩu tối thiểu 8 ký tự";
    if (confirmPassword !== password) errors.confirmPassword = "Mật khẩu nhập lại không khớp";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      await publicFetch("/auth/register", { method: "POST", body: JSON.stringify({ email, password, role }) });
      setOtpNotice(undefined);
      setStep("otp");
    } catch (err) {
      if (hasAuthCode(err, "EMAIL_PENDING_VERIFICATION")) {
        // Server không ghi đè mật khẩu cũ (AD-31 D5): gửi lại mã rồi cho nhập mã. Gửi lại lỗi
        // (vd. 429 vì vừa xin mã) thì vẫn sang bước nhập mã — mã cũ có thể còn hạn, OtpForm có
        // nút "Gửi lại mã" — nhưng ghi chú không được nói là đã gửi mã mới.
        let resent = true;
        try {
          await publicFetch("/auth/resend-otp", { method: "POST", body: JSON.stringify({ email }) });
        } catch {
          resent = false;
        }
        setOtpNotice(resent ? PENDING_NOTICE : PENDING_NO_NEW_CODE_NOTICE);
        setStep("otp");
        return;
      }
      setTaken(hasAuthCode(err, "EMAIL_TAKEN"));
      setFormError(authErrorMessage(err, "Không đăng ký được, vui lòng thử lại"));
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "otp") {
    return <OtpForm email={email} notice={otpNotice} onVerified={(user) => void navigateAfterAuth(router, user)} />;
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
      {formError ? (
        <p role="alert" className="text-sm text-red-600">
          {formError}
          {taken ? (
            <>
              {" "}
              <Link href={`/login${roleQuery}`} className="font-semibold text-brand-700 hover:underline">
                Đăng nhập
              </Link>
              {" hoặc "}
              <Link href={`/forgot-password${roleQuery}`} className="font-semibold text-brand-700 hover:underline">
                Quên mật khẩu
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <Button type="submit" loading={submitting} fullWidth>
        Tạo tài khoản
      </Button>
      <GoogleAuthButton onIdToken={handleGoogle} disabled={googleSubmitting} />
    </form>
  );
}
