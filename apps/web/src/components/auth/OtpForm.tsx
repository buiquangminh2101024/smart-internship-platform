"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AuthTokensResponse, UserProfile } from "@sip/shared-types";
import { publicFetch, ApiError } from "@/lib/api-client";
import { completeAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const RESEND_COOLDOWN_SECONDS = 60;

export interface OtpFormProps {
  email: string;
  onVerified: (user: UserProfile) => void;
}

export function OtpForm({ email, onVerified }: OtpFormProps) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

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
      setError(err instanceof ApiError ? err.message : "Không xác thực được, vui lòng thử lại");
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không gửi lại được mã, vui lòng thử lại");
    } finally {
      setResending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <p className="text-sm text-text-muted">
        Nhập mã 6 số đã gửi tới <span className="font-medium text-text-strong">{email}</span>
      </p>
      <Input
        label="Mã OTP"
        inputMode="numeric"
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
    </form>
  );
}
