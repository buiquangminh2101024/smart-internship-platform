"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface JoinCompanyFormProps {
  onDone: () => void;
}

export function JoinCompanyForm({ onDone }: JoinCompanyFormProps) {
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (inviteCode.length !== 6) {
      setError("Mã liên kết gồm 6 chữ số");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("employer", "/employers/company/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không liên kết được, vui lòng thử lại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <p className="text-sm text-text-muted">
        Nhập mã liên kết 6 số do quản trị viên công ty của bạn cung cấp (mã có hiệu lực trong 2 phút).
      </p>
      <Input
        label="Mã liên kết"
        inputMode="numeric"
        maxLength={6}
        value={inviteCode}
        onChange={(e) => setInviteCode(e.target.value.replace(/\D/g, ""))}
        error={error ?? undefined}
        autoFocus
      />
      <Button type="submit" loading={submitting} fullWidth>
        Liên kết với công ty
      </Button>
    </form>
  );
}
