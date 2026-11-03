"use client";

import { useState } from "react";
import type { ReportReason } from "@sip/shared-types";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api-client";
import { useCreateJobReport } from "@/hooks/useJobReports";

export interface ReportJobModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
  onSuccessToast?: (msg: string) => void;
}

const REPORT_REASONS: { value: ReportReason; label: string; desc: string }[] = [
  {
    value: "SCAM",
    label: "Thông tin lừa đảo / Đa cấp",
    desc: "Dấu hiệu giả mạo doanh nghiệp, đa cấp, chiếm đoạt tài sản hoặc thông tin cá nhân",
  },
  {
    value: "CHARGING_FEE",
    label: "Yêu cầu đóng phí",
    desc: "Bắt ứng viên nộp tiền cọc, phí hồ sơ, đồng phục, thiết bị hoặc phí phỏng vấn",
  },
  {
    value: "INAPPROPRIATE",
    label: "Nội dung không phù hợp",
    desc: "Chứa từ ngữ xúc phạm, phân biệt đối xử, nội dung đồi trụy hoặc vi phạm pháp luật",
  },
  {
    value: "MISLEADING",
    label: "Thông tin mập mờ / Sai thực tế",
    desc: "Mô tả công việc, mức lương, địa điểm làm việc sai lệch nghiêm trọng so với thực tế",
  },
  {
    value: "OTHER",
    label: "Lý do khác",
    desc: "Các hành vi vi phạm khác (vui lòng nêu rõ trong phần mô tả chi tiết)",
  },
];

export function ReportJobModal({
  open,
  onClose,
  jobId,
  jobTitle,
  onSuccessToast,
}: ReportJobModalProps) {
  const [reason, setReason] = useState<ReportReason>("SCAM");
  const [description, setDescription] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createReportMutation = useCreateJobReport(jobId);
  const isSubmitting = createReportMutation.isPending;

  function resetForm() {
    setReason("SCAM");
    setDescription("");
    setErrorMsg(null);
  }

  function handleClose() {
    if (isSubmitting) return;
    resetForm();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (reason === "OTHER" && (!description.trim() || description.trim().length < 10)) {
      setErrorMsg("Vui lòng nhập mô tả chi tiết tối thiểu 10 ký tự khi chọn lý do 'Khác'");
      return;
    }

    try {
      await createReportMutation.mutateAsync({
        reason,
        description: description.trim() ? description.trim() : undefined,
      });

      handleClose();
      onSuccessToast?.("Báo cáo tin tuyển dụng vi phạm đã được gửi tới Ban quản trị kiểm duyệt.");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Có lỗi xảy ra khi gửi báo cáo. Vui lòng thử lại sau.");
      }
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      busy={isSubmitting}
      size="md"
      labelledBy="report-job-title"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[85vh] flex-col">
        <DialogHeader
          titleId="report-job-title"
          title="Báo cáo tin tuyển dụng vi phạm"
          subtitle={`Tin tuyển dụng: ${jobTitle}`}
          onClose={handleClose}
          closeDisabled={isSubmitting}
        />

        <DialogBody className="grid gap-4 overflow-y-auto">
          {errorMsg ? (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <Icon name="alert-circle" size={18} className="shrink-0 text-red-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          ) : null}

          <div className="grid gap-2">
            <label className="text-sm font-semibold text-text-strong">
              Lý do báo cáo <span className="text-red-500">*</span>
            </label>
            <div className="grid gap-2">
              {REPORT_REASONS.map((opt) => {
                const selected = reason === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={[
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                      selected
                        ? "border-brand-500 bg-brand-50/50"
                        : "border-border-default hover:bg-surface-hover",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={opt.value}
                      checked={selected}
                      onChange={() => setReason(opt.value)}
                      className="mt-1 h-4 w-4 text-brand-600 focus:ring-brand-500"
                    />
                    <div className="grid gap-0.5">
                      <span className="text-sm font-medium text-text-strong">{opt.label}</span>
                      <span className="text-xs text-text-muted">{opt.desc}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid gap-1">
            <Textarea
              label="Mô tả chi tiết vi phạm"
              required={reason === "OTHER"}
              hint={
                reason === "OTHER"
                  ? "Bắt buộc nhập tối thiểu 10 ký tự khi chọn lý do Khác"
                  : "Mô tả cụ thể hành vi vi phạm (không bắt buộc)"
              }
              placeholder="Nhập nội dung phản ánh cụ thể..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Hủy
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            icon="flag"
          >
            Gửi báo cáo
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
