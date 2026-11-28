"use client";

import { useRef, useState } from "react";
import type { ReportReason } from "@sip/shared-types";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api-client";
import { useCreateJobReport, useUploadJobReportEvidence } from "@/hooks/useJobReports";

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
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const createReportMutation = useCreateJobReport(jobId);
  const uploadEvidenceMutation = useUploadJobReportEvidence();
  const isSubmitting = createReportMutation.isPending;

  function resetForm() {
    setReason("SCAM");
    setDescription("");
    setEvidenceUrls([]);
    setIsUploadingEvidence(false);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    if (isSubmitting || isUploadingEvidence) return;
    resetForm();
    onClose();
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = 5 - evidenceUrls.length;
    if (remainingSlots <= 0) {
      setErrorMsg("Bạn chỉ có thể tải lên tối đa 5 ảnh minh chứng");
      e.target.value = "";
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setIsUploadingEvidence(true);
    setErrorMsg(null);

    try {
      const uploadPromises = filesToUpload.map(async (file) => {
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`File "${file.name}" vượt quá kích thước 5MB`);
        }
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          throw new Error(`File "${file.name}" không đúng định dạng JPG, PNG hoặc WEBP`);
        }
        return await uploadEvidenceMutation.mutateAsync(file);
      });

      const uploadedUrls = await Promise.all(uploadPromises);
      setEvidenceUrls((prev) => [...prev, ...uploadedUrls]);
    } catch (err) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Tải ảnh minh chứng thất bại. Vui lòng thử lại.");
      }
    } finally {
      setIsUploadingEvidence(false);
      e.target.value = "";
    }
  }

  function handleRemoveEvidence(indexToRemove: number) {
    setEvidenceUrls((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isUploadingEvidence) return;
    setErrorMsg(null);

    if (reason === "OTHER" && (!description.trim() || description.trim().length < 10)) {
      setErrorMsg("Vui lòng nhập mô tả chi tiết tối thiểu 10 ký tự khi chọn lý do 'Khác'");
      return;
    }

    try {
      await createReportMutation.mutateAsync({
        reason,
        description: description.trim() ? description.trim() : undefined,
        evidenceUrls: evidenceUrls.length > 0 ? evidenceUrls : undefined,
      });

      handleClose();
      onSuccessToast?.(
        "Báo cáo tin tuyển dụng vi phạm đã được gửi tới Ban quản trị. Kết quả xử lý sẽ được gửi tới bạn qua Thông báo.",
      );
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
      busy={isSubmitting || isUploadingEvidence}
      size="md"
      labelledBy="report-job-title"
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[calc(100dvh-4rem)] flex-col overflow-hidden"
      >
        <div className="shrink-0">
          <DialogHeader
            titleId="report-job-title"
            title="Báo cáo tin tuyển dụng vi phạm"
            subtitle={`Tin tuyển dụng: ${jobTitle}`}
            onClose={handleClose}
            closeDisabled={isSubmitting || isUploadingEvidence}
          />
        </div>

        <DialogBody className="min-h-0 flex-1 overflow-y-auto">
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

          {/* Phần tải lên minh chứng vi phạm */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-text-strong">
                Minh chứng kèm theo (ảnh chụp màn hình, email, phiếu thu...)
              </label>
              <span className="text-xs text-text-muted">{evidenceUrls.length}/5 ảnh</span>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              Tải lên ảnh chụp tin nhắn trao đổi, email thu phí hoặc các tài liệu liên quan giúp Ban quản trị xử lý chính xác và nhanh chóng hơn (tối đa 5 ảnh, định dạng JPG, PNG, WEBP, dung lượng ≤ 5MB/ảnh).
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {evidenceUrls.map((url, idx) => (
                <div
                  key={url}
                  className="relative group h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border-default bg-surface-page shadow-2xs"
                >
                  <img
                    src={url}
                    alt={`Minh chứng ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveEvidence(idx)}
                    disabled={isSubmitting || isUploadingEvidence}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white shadow-xs opacity-90 hover:opacity-100 transition-opacity"
                    title="Xóa ảnh này"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}

              {/* Input file ẩn, không chiếm layout để không làm nhảy scroll */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                disabled={isSubmitting || isUploadingEvidence}
                onChange={handleFileSelect}
              />

              {evidenceUrls.length < 5 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmitting || isUploadingEvidence}
                  className={[
                    "flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border-default bg-surface-page hover:bg-surface-hover hover:border-brand-500 transition-colors",
                    isSubmitting || isUploadingEvidence ? "pointer-events-none opacity-50" : "",
                  ].join(" ")}
                  title="Thêm ảnh minh chứng"
                >
                  {isUploadingEvidence ? (
                    <Icon name="loader-2" size={20} className="animate-spin text-brand-600" />
                  ) : (
                    <>
                      <Icon name="upload-cloud" size={20} className="text-text-muted" />
                      <span className="mt-1 text-[11px] font-medium text-text-muted">Thêm ảnh</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Hộp ghi chú bảo mật & thông báo phản hồi */}
          <div className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface-page p-3 text-xs text-text-muted">
            <Icon name="shield-check" size={16} className="shrink-0 text-emerald-600 mt-0.5" />
            <span>
              Thông tin người báo cáo được bảo mật hoàn toàn với Nhà tuyển dụng. Sau khi Ban quản trị hoàn tất xử lý (gỡ tin hoặc bác bỏ), kết quả sẽ được gửi tới bạn qua <strong>Trung tâm thông báo</strong>.
            </span>
          </div>
        </DialogBody>

        <div className="shrink-0">
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={isSubmitting || isUploadingEvidence}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting || isUploadingEvidence}
              icon="flag"
            >
              Gửi báo cáo
            </Button>
          </DialogFooter>
        </div>
      </form>
    </Dialog>
  );
}
