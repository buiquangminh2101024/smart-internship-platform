"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CompanyDetail, CompanyVerificationStatus } from "@sip/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

const STATUS_LABEL: Record<CompanyVerificationStatus, { label: string; tone: "success" | "warning" | "danger" }> = {
  VERIFIED: { label: "Đã xác thực", tone: "success" },
  PENDING: { label: "Chờ xác thực", tone: "warning" },
  REJECTED: { label: "Bị từ chối", tone: "danger" },
};

export default function AdminCompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: company, isLoading } = useQuery({
    queryKey: ["admin-company", id],
    queryFn: () => apiFetch<CompanyDetail>("admin", `/companies/${id}`),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["admin-company", id] });
    await queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
  }

  async function handleVerify() {
    setActionError(null);
    setSubmitting(true);
    try {
      await apiFetch("admin", `/companies/${id}/verify`, { method: "POST" });
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Không thực hiện được, vui lòng thử lại");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!rejectReason.trim()) {
      setActionError("Vui lòng nhập lý do từ chối");
      return;
    }
    setActionError(null);
    setSubmitting(true);
    try {
      await apiFetch("admin", `/companies/${id}/reject`, { method: "POST", body: JSON.stringify({ reason: rejectReason }) });
      setShowRejectForm(false);
      setRejectReason("");
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Không thực hiện được, vui lòng thử lại");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleRequiresApproval() {
    if (!company) return;
    setActionError(null);
    setSubmitting(true);
    try {
      await apiFetch("admin", `/companies/${id}/requires-approval`, {
        method: "PATCH",
        body: JSON.stringify({ requiresApproval: !company.requiresApproval }),
      });
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Không thực hiện được, vui lòng thử lại");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || !company) {
    return <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-text-muted">Đang tải...</div>;
  }

  const status = STATUS_LABEL[company.verificationStatus];

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-6 py-12">
      <button
        type="button"
        onClick={() => router.push("/admin/companies")}
        className="text-left text-sm text-text-muted hover:text-text-strong"
      >
        ← Quay lại danh sách
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-strong">{company.name}</h1>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <Card padding="lg" className="grid gap-2 text-sm">
        <p>
          <span className="text-text-muted">Mã số thuế:</span> {company.taxCode ?? "—"}
        </p>
        <p>
          <span className="text-text-muted">Địa chỉ:</span> {company.address ?? "—"}
        </p>
        <p>
          <span className="text-text-muted">Phương thức xác thực:</span> {company.verificationMethod ?? "—"}
        </p>
        <p>
          <span className="text-text-muted">Ghi chú:</span> {company.verificationNote ?? "—"}
        </p>
        <p>
          <span className="text-text-muted">Số lần bị thu hồi tin:</span> {company.retractionCount}
        </p>
        {company.businessLicenseUrl ? (
          <a
            href={company.businessLicenseUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-700 hover:underline"
          >
            Xem giấy phép kinh doanh
          </a>
        ) : null}
      </Card>

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

      {company.verificationStatus === "PENDING" ? (
        <div className="grid gap-3">
          <div className="flex gap-3">
            <Button loading={submitting} onClick={handleVerify}>
              Xác thực công ty
            </Button>
            <Button variant="danger" disabled={submitting} onClick={() => setShowRejectForm((v) => !v)}>
              Từ chối
            </Button>
          </div>
          {showRejectForm ? (
            <Card padding="sm" tone="sunken" className="grid gap-3">
              <Textarea label="Lý do từ chối" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              <Button variant="danger" loading={submitting} onClick={handleReject}>
                Xác nhận từ chối
              </Button>
            </Card>
          ) : null}
        </div>
      ) : null}

      {company.verificationStatus === "VERIFIED" ? (
        <Card padding="md" className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-text-strong">Yêu cầu duyệt tin tuyển dụng</p>
            <p className="text-sm text-text-muted">Bật để mọi tin đăng của công ty này cần Admin duyệt trước khi công khai.</p>
          </div>
          <Button variant="secondary" size="sm" loading={submitting} onClick={handleToggleRequiresApproval}>
            {company.requiresApproval ? "Tắt" : "Bật"}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
