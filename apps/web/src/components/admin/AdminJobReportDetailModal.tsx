"use client";

import { useState } from "react";
import type {
  AdminJobReportListItem,
  JobReportActionRequest,
  ReportReason,
  ReportResolution,
  ReportStatus,
} from "@sip/shared-types";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api-client";
import { JOB_STATUS_LABEL, formatDate } from "@/lib/job-post-display";
import { useExecuteAdminJobReportAction } from "@/hooks/useAdminJobReports";

export const REPORT_REASON_META: Record<
  ReportReason,
  { label: string; tone: "danger" | "warning" | "brand" | "neutral" }
> = {
  SCAM: { label: "Lừa đảo / Đa cấp", tone: "danger" },
  CHARGING_FEE: { label: "Thu phí trái phép", tone: "danger" },
  INAPPROPRIATE: { label: "Nội dung phản cảm", tone: "warning" },
  MISLEADING: { label: "Thông tin sai lệch", tone: "warning" },
  OTHER: { label: "Lý do khác", tone: "neutral" },
};

export const REPORT_STATUS_META: Record<
  ReportStatus,
  { label: string; tone: "warning" | "success" }
> = {
  PENDING: { label: "Chờ xử lý", tone: "warning" },
  RESOLVED: { label: "Đã xử lý", tone: "success" },
};

export const REPORT_RESOLUTION_META: Record<
  ReportResolution,
  { label: string; tone: "danger" | "neutral" }
> = {
  TAKE_DOWN: { label: "Đã gỡ tin", tone: "danger" },
  DISMISS: { label: "Đã bỏ qua / Giữ tin", tone: "neutral" },
};

export interface AdminJobReportDetailModalProps {
  report: AdminJobReportListItem | null;
  onClose: () => void;
  onDone: (outcome: { tone: "success" | "danger"; message: string }) => void;
}

export function AdminJobReportDetailModal({
  report,
  onClose,
  onDone,
}: AdminJobReportDetailModalProps) {
  const [selectedAction, setSelectedAction] = useState<ReportResolution>("TAKE_DOWN");
  const [adminNote, setAdminNote] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const executeActionMutation = useExecuteAdminJobReportAction();
  const isPending = executeActionMutation.isPending;

  if (!report) return null;

  const isProcessed = report.status !== "PENDING";
  const reasonInfo = REPORT_REASON_META[report.reason];
  const statusInfo = REPORT_STATUS_META[report.status];
  const resolutionInfo = report.resolution ? REPORT_RESOLUTION_META[report.resolution] : null;
  const jobStatusInfo = JOB_STATUS_LABEL[report.jobStatus];

  async function handleSubmitAction(e: React.FormEvent) {
    e.preventDefault();
    if (!report || isProcessed) return;

    setActionError(null);
    try {
      const body: JobReportActionRequest = {
        resolution: selectedAction,
        ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}),
        ...(reasonText.trim() ? { reason: reasonText.trim() } : {}),
      };

      await executeActionMutation.mutateAsync({
        id: report.id,
        body,
      });

      const actionLabels: Record<ReportResolution, string> = {
        TAKE_DOWN: "Đã gỡ tin tuyển dụng và hoàn tất xử lý báo cáo",
        DISMISS: "Đã bỏ qua báo cáo và giữ nguyên bài đăng",
      };

      onDone({ tone: "success", message: actionLabels[selectedAction] });
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message);
      } else {
        setActionError("Xử lý thất bại. Vui lòng thử lại sau.");
      }
    }
  }

  return (
    <>
      <Dialog
        open={Boolean(report)}
        onClose={onClose}
        busy={isPending}
        size="lg"
        labelledBy="report-detail-title"
      >
        <form onSubmit={handleSubmitAction} className="flex max-h-[90vh] flex-col">
          <DialogHeader
            titleId="report-detail-title"
            title="Chi tiết báo cáo vi phạm"
            subtitle={`Mã báo cáo: #${report.id.slice(-8)} · Ngày tạo: ${formatDate(report.createdAt)}`}
            onClose={onClose}
            closeDisabled={isPending}
          />

          <DialogBody className="grid gap-5 overflow-y-auto">
            {/* Thông tin tin tuyển dụng bị báo cáo */}
            <div className="rounded-xl border border-border-default bg-surface-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Tin tuyển dụng
                    </span>
                    <Badge tone={jobStatusInfo.tone}>{jobStatusInfo.label}</Badge>
                  </div>
                  <h3 className="text-base font-semibold text-text-strong">{report.jobTitle}</h3>
                  <p className="text-sm text-text-muted">
                    Công ty: <span className="font-medium text-text-body">{report.companyName}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    as="a"
                    href={`/admin/jobs/${report.jobId}`}
                    variant="secondary"
                    size="sm"
                    icon="external-link"
                  >
                    Xem tin duyệt
                  </Button>
                  <Button
                    as="a"
                    href={`/jobs/${report.jobId}`}
                    variant="ghost"
                    size="sm"
                    icon="eye"
                  >
                    Xem công khai
                  </Button>
                </div>
              </div>
            </div>

            {/* Thông tin người báo cáo và lý do */}
            <div className="grid gap-3 rounded-xl border border-border-default bg-surface-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Người báo cáo:
                  </span>
                  <span className="font-medium text-text-strong">{report.reporterEmail}</span>
                  {report.reporterName ? (
                    <span className="text-sm text-text-muted">({report.reporterName})</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Trạng thái:</span>
                  <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                  {resolutionInfo ? (
                    <Badge tone={resolutionInfo.tone}>{resolutionInfo.label}</Badge>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-1">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Lý do vi phạm:
                </span>
                <div>
                  <Badge tone={reasonInfo.tone} className="text-sm py-1 px-2.5">
                    {reasonInfo.label}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-1">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Mô tả chi tiết từ ứng viên:
                </span>
                <p className="rounded-lg bg-surface-page p-3 text-sm text-text-body whitespace-pre-wrap">
                  {report.description || "(Ứng viên không cung cấp mô tả chi tiết)"}
                </p>
              </div>
            </div>

            {/* Nếu báo cáo đã xử lý (RESOLVED): Hiển thị kết quả chỉ đọc */}
            {isProcessed ? (
              <div className="rounded-xl border border-border-default bg-surface-card p-4">
                <div className="flex items-center justify-between gap-3 border-b border-border-subtle pb-3">
                  <div className="flex items-center gap-2">
                    <Icon
                      name="check-circle"
                      size={18}
                      className="text-emerald-600"
                    />
                    <h4 className="text-sm font-semibold text-text-strong">
                      Báo cáo này đã được xử lý
                    </h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                    {resolutionInfo ? (
                      <Badge tone={resolutionInfo.tone}>{resolutionInfo.label}</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-2.5">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-text-muted">
                    {report.resolvedAt ? (
                      <span>
                        Thời gian xử lý:{" "}
                        <strong className="text-text-body font-medium">
                          {formatDate(report.resolvedAt)}
                        </strong>
                      </span>
                    ) : null}
                    {report.resolvedByName ? (
                      <span>
                        Quản trị viên:{" "}
                        <strong className="text-text-body font-medium">
                          {report.resolvedByName}
                        </strong>
                      </span>
                    ) : null}
                  </div>

                  <p className="text-xs text-text-muted">
                    Báo cáo đã hoàn tất quy trình kiểm duyệt với kết quả:{" "}
                    <span className="font-semibold text-text-strong">
                      {resolutionInfo?.label || "Đã xử lý"}
                    </span>
                    . Quản trị viên không thể thay đổi hành động đối với báo cáo này.
                  </p>

                  {report.adminNote ? (
                    <div className="mt-1 rounded-lg bg-surface-page p-3 border border-border-subtle">
                      <span className="text-xs font-semibold text-text-muted uppercase tracking-wider block mb-1">
                        Ghi chú của Quản trị viên:
                      </span>
                      <p className="text-sm text-text-strong whitespace-pre-wrap">{report.adminNote}</p>
                    </div>
                  ) : (
                    <p className="text-xs italic text-text-muted">Không có ghi chú thêm từ Quản trị viên.</p>
                  )}
                </div>
              </div>
            ) : (
              /* Form Hành động xử lý (chỉ hiển thị khi đang PENDING) */
              <div className="grid gap-3.5 rounded-xl border border-border-default bg-surface-card p-4">
                <div>
                  <h4 className="text-sm font-semibold text-text-strong">
                    Hành động xử lý của Quản trị viên
                  </h4>
                  <p className="text-xs text-text-muted mt-0.5">
                    Chọn 1 trong 2 quyết định xử lý báo cáo vi phạm bên dưới.
                  </p>
                </div>

                {actionError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                    {actionError}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      value: "TAKE_DOWN",
                      label: "Gỡ tin tuyển dụng",
                      desc: "Xác nhận tin vi phạm, gỡ bài đăng khỏi hệ thống và gửi thông báo tới Nhà tuyển dụng.",
                      icon: "file-x",
                      activeClasses: "border-red-500 bg-red-50/40 ring-1 ring-red-500",
                      badgeColor: "text-red-700 bg-red-100",
                      radioColor: "text-red-600 focus:ring-red-500",
                    },
                    {
                      value: "DISMISS",
                      label: "Giữ lại tin tuyển dụng",
                      desc: "Xác nhận tin không vi phạm, bỏ qua báo cáo và giữ nguyên bài đăng.",
                      icon: "shield-check",
                      activeClasses: "border-brand-500 bg-brand-50/40 ring-1 ring-brand-500",
                      badgeColor: "text-brand-700 bg-brand-100",
                      radioColor: "text-brand-600 focus:ring-brand-500",
                    },
                  ].map((act) => {
                    const isChecked = selectedAction === act.value;
                    return (
                      <label
                        key={act.value}
                        className={[
                          "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all",
                          isChecked
                            ? act.activeClasses
                            : "border-border-default bg-white hover:bg-surface-hover hover:border-border-strong",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="adminAction"
                          value={act.value}
                          checked={isChecked}
                          onChange={() => setSelectedAction(act.value as ReportResolution)}
                          className={`mt-0.5 h-4 w-4 ${act.radioColor}`}
                        />
                        <div className="grid gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`flex h-5 w-5 items-center justify-center rounded-md ${act.badgeColor}`}>
                              <Icon name={act.icon} size={13} />
                            </span>
                            <span className="text-sm font-semibold text-text-strong">{act.label}</span>
                          </div>
                          <span className="text-xs text-text-muted leading-relaxed">{act.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {selectedAction === "TAKE_DOWN" && (
                  <div className="grid gap-1 pt-1">
                    <label className="text-xs font-medium text-text-strong">
                      Lý do gửi tới Nhà tuyển dụng (kèm trong thông báo/email)
                    </label>
                    <input
                      type="text"
                      value={reasonText}
                      onChange={(e) => setReasonText(e.target.value)}
                      placeholder="VD: Tin tuyển dụng vi phạm chính sách về thu phí ứng viên..."
                      className="w-full rounded-lg border border-border-default bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    />
                  </div>
                )}

                <div className="grid gap-1">
                  <Textarea
                    label="Ghi chú của Quản trị viên (Admin Note)"
                    placeholder="Nhập ghi chú lưu lại quá trình xác minh hoặc lý do xử lý báo cáo..."
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
              Đóng
            </Button>
            {!isProcessed ? (
              <Button
                type="submit"
                variant={selectedAction === "TAKE_DOWN" ? "danger" : "primary"}
                loading={isPending}
                icon={selectedAction === "TAKE_DOWN" ? "file-x" : "shield-check"}
              >
                {selectedAction === "TAKE_DOWN" ? "Xác nhận gỡ tin" : "Bỏ qua & Giữ tin"}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
