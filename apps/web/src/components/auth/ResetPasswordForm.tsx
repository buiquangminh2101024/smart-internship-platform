"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api-client";
import { PASSWORD_MIN_LENGTH, RESEND_CODE_SECONDS, requestCodeErrorMessage } from "@/lib/password-reset";
import { useForgotPassword, useResetPassword } from "@/hooks/usePasswordReset";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface ResetPasswordFormProps {
  /** Email đã xin mã. */
  email: string;
  /** Đặt mật khẩu xong. Server đã đăng xuất mọi thiết bị của tài khoản. */
  onSuccess: () => void;
  /** Có thì hiện nút "Đổi email" (trang `/forgot-password`; trang Cài đặt không có). */
  onChangeEmail?: () => void;
}

interface FieldErrors {
  otp?: string | undefined;
  password?: string | undefined;
  confirm?: string | undefined;
}

/**
 * Bước 2 của đặt lại mật khẩu (AD-18, E1, E9): mã 6 chữ số + mật khẩu mới.
 * Dùng chung cho `/forgot-password` và thẻ "Mật khẩu" ở Cài đặt. Mã vừa được
 * gửi khi form hiện ra, nên "Gửi lại mã" bắt đầu đếm ngược ngay.
 */
export function ResetPasswordForm({ email, onSuccess, onChangeEmail }: ResetPasswordFormProps) {
  const reset = useResetPassword();
  const resend = useForgotPassword();
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [resentNote, setResentNote] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_CODE_SECONDS);
  const otpRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  // Không dùng thuộc tính `autoFocus`: ở trang Cài đặt form hiện ra đúng lúc hộp
  // thoại xác nhận đóng, focus lúc commit sẽ rơi vào trang còn đang bị `inert`.
  useEffect(() => {
    otpRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!/^\d{6}$/.test(otp)) next.otp = "Mã gồm 6 chữ số.";
    if (password.length < PASSWORD_MIN_LENGTH) next.password = `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`;
    if (!next.password && confirm !== password) next.confirm = "Mật khẩu nhập lại chưa khớp.";
    return next;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const next = validate();
    setErrors(next);
    const firstInvalid = next.otp ? otpRef : next.password ? passwordRef : next.confirm ? confirmRef : null;
    if (firstInvalid) {
      firstInvalid.current?.focus();
      return;
    }

    try {
      await reset.mutateAsync({ email, otp, newPassword: password });
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setErrors({ otp: "Mã không đúng hoặc đã hết hạn. Bạn kiểm tra lại hoặc bấm Gửi lại mã." });
        otpRef.current?.focus();
        return;
      }
      setFormError("Không đổi được mật khẩu. Kiểm tra kết nối rồi thử lại.");
    }
  }

  async function handleResend() {
    setFormError(null);
    setResentNote(null);
    try {
      await resend.mutateAsync(email);
      setCooldown(RESEND_CODE_SECONDS);
      setOtp("");
      setErrors((prev) => ({ ...prev, otp: undefined }));
      setResentNote(`Đã gửi mã mới tới ${email}. Mã cũ không dùng được nữa.`);
      otpRef.current?.focus();
    } catch (err) {
      setFormError(requestCodeErrorMessage(err));
    }
  }

  const busy = reset.isPending;

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      {/* Cho trình quản lý mật khẩu biết mật khẩu mới thuộc tài khoản nào. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <Input
        ref={otpRef}
        label="Mã xác thực"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
        error={errors.otp}
        hint={resentNote ?? undefined}
        className="font-num tracking-[0.2em] tabular-nums"
        required
      />
      <Input
        ref={passwordRef}
        label="Mật khẩu mới"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        hint={`Ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`}
        required
      />
      <Input
        ref={confirmRef}
        label="Nhập lại mật khẩu mới"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
        required
      />
      {formError ? (
        <p role="alert" className="text-sm text-red-600">
          {formError}
        </p>
      ) : null}
      <Button type="submit" loading={busy} fullWidth>
        {busy ? "Đang đổi mật khẩu" : "Đặt mật khẩu mới"}
      </Button>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={cooldown > 0 || resend.isPending || busy}
          loading={resend.isPending}
          onClick={() => void handleResend()}
        >
          {cooldown > 0 ? (
            // Một span: `Button` là flex có `gap-2`, tách chữ và số thành hai mục thì cách đôi.
            <span>
              Gửi lại mã <span className="tabular-nums">({cooldown} giây)</span>
            </span>
          ) : (
            "Gửi lại mã"
          )}
        </Button>
        {onChangeEmail ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onChangeEmail}>
            Đổi email
          </Button>
        ) : null}
      </div>
    </form>
  );
}
