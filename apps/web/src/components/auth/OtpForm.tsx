"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AuthTokensResponse, UserProfile } from "@sip/shared-types";
import { publicFetch, ApiError } from "@/lib/api-client";
import { completeAuth } from "@/lib/auth";
import {
  authErrorMessage,
  hasAuthCode,
  isHourlyCodeLimit,
  OTP_SUPPORT_HINT_AFTER,
  otpSupportHref,
} from "@/lib/auth-errors";
import { requestCodeErrorMessage } from "@/lib/password-reset";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Icon } from "@/components/ui/Icon";
import { OtpSupportHint } from "./OtpSupportHint";

const RESEND_COOLDOWN_SECONDS = 60;

export interface OtpFormProps {
  email: string;
  onVerified: (user: UserProfile) => void;
  /** Ghi chú phía trên ô mã, vd. khi đăng ký lại email đang chờ xác thực (AD-31 D5). */
  notice?: string | undefined;
}

export function OtpForm({ email, onVerified, notice }: OtpFormProps) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  // Gợi ý gửi yêu cầu hỗ trợ (AD-31 D7): sai mã ≥ 3 lần, mã bị huỷ, hoặc hết lượt gửi lại trong giờ.
  const [wrongCount, setWrongCount] = useState(0);
  const [needsSupport, setNeedsSupport] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (otp.length !== 6) {
      setError("Mã OTP gồm 6 chữ số");
      return;
    }

    setSubmitting(true);
    try {
      const tokens = await publicFetch<AuthTokensResponse>("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email, otp }),
      });
      const user = await completeAuth(tokens);
      onVerified(user);
    } catch (err) {
      if (hasAuthCode(err, "OTP_INVALID") || hasAuthCode(err, "OTP_ATTEMPTS_EXCEEDED")) {
        setWrongCount((count) => count + 1);
        if (hasAuthCode(err, "OTP_ATTEMPTS_EXCEEDED")) setNeedsSupport(true);
      }
      setError(authErrorMessage(err, "Không xác thực được, vui lòng thử lại"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResending(true);
    try {
      await publicFetch("/auth/resend-otp", { method: "POST", body: JSON.stringify({ email }) });
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setOtp("");
    } catch (err) {
      if (isHourlyCodeLimit(err)) setNeedsSupport(true);
      setError(err instanceof ApiError && err.status === 429 ? requestCodeErrorMessage(err) : authErrorMessage(err, "Không gửi lại được mã, vui lòng thử lại"));
    } finally {
      setResending(false);
    }
  }

  const showSupport = needsSupport || wrongCount >= OTP_SUPPORT_HINT_AFTER;

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      {notice ? (
        <div role="status" className="flex items-start gap-2.5 rounded-lg bg-brand-50 px-3.5 py-3 text-sm text-text-body">
          <Icon name="info" size={18} className="mt-px shrink-0 text-brand-700" />
          <p>{notice}</p>
        </div>
      ) : null}
      <p className="text-sm text-text-muted">
        Nhập mã 6 số đã gửi tới <span className="font-medium text-text-strong [overflow-wrap:anywhere]">{email}</span>
      </p>
      <Input
        label="Mã OTP"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
        error={error ?? undefined}
        autoFocus
      />
      <Button type="submit" loading={submitting} fullWidth>
        Xác nhận
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={cooldown > 0 || resending}
        loading={resending}
        onClick={handleResend}
      >
        {cooldown > 0 ? `Gửi lại mã (${cooldown}s)` : "Gửi lại mã"}
      </Button>
      {showSupport ? <OtpSupportHint href={otpSupportHref(email, "register")} purpose="register" /> : null}
    </form>
  );
}
