"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { InviteCodeResponse } from "@sip/shared-types";
import { useEmployerMe } from "@/hooks/useEmployerMe";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useCurrentUser } from "@/stores/auth-store";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CreateCompanyForm } from "@/components/employer/CreateCompanyForm";
import { SubscriptionStatusCard } from "@/components/employer/SubscriptionStatusCard";

const STATUS_LABEL: Record<string, { label: string; tone: "success" | "warning" | "danger" }> = {
  VERIFIED: { label: "Đã xác thực", tone: "success" },
  PENDING: { label: "Đang chờ xác thực", tone: "warning" },
  REJECTED: { label: "Bị từ chối", tone: "danger" },
};

// Trong lúc Company.verificationStatus !== "VERIFIED", đây là trang duy nhất
// (ngoài "/employer") mà tài khoản Employer được phép vào — xem proxy.ts.
export default function EmployerProfilePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useCurrentUser("employer");
  const { data, isLoading } = useEmployerMe();

  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [resubmitting, setResubmitting] = useState(false);

  const [inviteCode, setInviteCode] = useState<InviteCodeResponse | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [issuingCode, setIssuingCode] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (data && !data.hasEmployerProfile) router.replace("/employer/hoan-tat-thu-tuc");
  }, [data, router]);

  useEffect(() => {
    if (data?.employer) {
      setTitle(data.employer.title ?? "");
      setPhone(data.employer.phone ?? "");
    }
  }, [data]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setSavingProfile(true);
    try {
      await apiFetch("employer", "/employers/me", { method: "PATCH", body: JSON.stringify({ title, phone }) });
      await queryClient.invalidateQueries({ queryKey: ["employerMe"] });
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Không lưu được, vui lòng thử lại");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleIssueInviteCode() {
    setInviteError(null);
    setIssuingCode(true);
    try {
      const result = await apiFetch<InviteCodeResponse>("employer", "/employers/invite-code", { method: "POST" });
      setInviteCode(result);
      setSecondsLeft(result.expiresInSeconds);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Không tạo được mã, vui lòng thử lại");
    } finally {
      setIssuingCode(false);
    }
  }

  if (isLoading || !data || !data.hasEmployerProfile) {
    return <div className="mx-auto max-w-2xl px-6 py-12 text-sm text-text-muted">Đang tải...</div>;
  }

  const { company, employer } = data;
  const status = company ? STATUS_LABEL[company.verificationStatus] : undefined;

  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6 px-6 py-12">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold text-text-strong">Thông tin tài khoản</h1>
        <p className="text-sm text-text-muted">{user?.email}</p>
      </div>

      {company ? (
        <Card padding="lg" className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-strong">{company.name}</h2>
            {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
          </div>

          {company.verificationStatus === "PENDING" ? (
            <p className="text-sm text-text-muted">
              Hồ sơ của bạn đang chờ xác thực. Trong lúc chờ, bạn chỉ có thể xem trang này và trang chủ /employer.
            </p>
          ) : null}

          {company.verificationStatus === "REJECTED" ? (
            <div className="grid gap-3">
              <p className="text-sm text-red-600">
                Hồ sơ bị từ chối{company.verificationNote ? `: ${company.verificationNote}` : "."} Vui lòng sửa lại thông tin và nộp
                lại.
              </p>
              {!resubmitting ? (
                <Button type="button" variant="secondary" onClick={() => setResubmitting(true)}>
                  Nộp lại hồ sơ
                </Button>
              ) : (
                <CreateCompanyForm
                  mode="resubmit"
                  company={company}
                  employer={employer}
                  onDone={() => {
                    setResubmitting(false);
                    void queryClient.invalidateQueries({ queryKey: ["employerMe"] });
                  }}
                />
              )}
            </div>
          ) : null}
        </Card>
      ) : null}

      {company?.verificationStatus === "VERIFIED" ? (
        <div className="grid gap-3">
          <SubscriptionStatusCard variant="compact" />
          <Button as="a" href="/employer/subscription" variant="link" className="w-fit">
            Xem gói dịch vụ
          </Button>
        </div>
      ) : null}

      <Card padding="lg" as="form" onSubmit={handleSaveProfile} className="grid gap-4">
        <h2 className="text-base font-semibold text-text-strong">Thông tin cá nhân</h2>
        <Input label="Chức danh" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} />
        {profileError ? <p className="text-sm text-red-600">{profileError}</p> : null}
        <Button type="submit" loading={savingProfile}>
          Lưu thay đổi
        </Button>
      </Card>

      {employer?.isCompanyAdmin ? (
        <Card padding="lg" className="grid gap-3">
          <h2 className="text-base font-semibold text-text-strong">Mời đồng nghiệp</h2>
          <p className="text-sm text-text-muted">
            Tạo mã liên kết 6 số (hiệu lực 2 phút) để đồng nghiệp nhập vào bước &ldquo;Liên kết công ty đã có&rdquo; khi hoàn tất thủ
            tục.
          </p>
          {inviteCode ? (
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-surface-page px-4 py-2 text-2xl font-semibold tracking-widest text-text-strong">
                {inviteCode.code}
              </span>
              <span className="text-sm text-text-muted">{secondsLeft > 0 ? `Còn ${secondsLeft}s` : "Đã hết hạn"}</span>
            </div>
          ) : null}
          {inviteError ? <p className="text-sm text-red-600">{inviteError}</p> : null}
          <Button type="button" variant="secondary" loading={issuingCode} onClick={handleIssueInviteCode}>
            {inviteCode ? "Tạo mã mới" : "Tạo mã liên kết"}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
