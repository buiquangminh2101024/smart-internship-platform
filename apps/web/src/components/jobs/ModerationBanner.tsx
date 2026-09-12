import type { JobPost } from "@sip/shared-types";
import { Icon } from "@/components/ui/Icon";
import { formatDate } from "@/lib/job-post-display";

/**
 * Banner cảnh báo đỏ ở đầu trang chi tiết/sửa tin khi Admin từ chối hoặc thu
 * hồi — khớp ảnh mẫu `Screenshot 2026-09-12 135406.png`. Dữ liệu đọc thẳng từ
 * `latestModerationAction` trong response chi tiết tin, KHÔNG gọi API
 * notification (hệ thống thông báo thuộc Phase 10).
 */
export function ModerationBanner({ job }: { job: JobPost }) {
  const action = job.latestModerationAction;
  if (!action) return null;

  const isRejected = action.action === "REJECTED" && job.status === "DRAFT";
  const isRetracted = action.action === "RETRACTED" || job.status === "TAKEN_DOWN";
  if (!isRejected && !isRetracted) return null;

  const heading = isRetracted
    ? `Tin này đã bị Admin thu hồi vào ngày ${formatDate(action.createdAt)}`
    : `Tin này đã bị Admin từ chối vào ngày ${formatDate(action.createdAt)}`;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3" role="alert">
      <Icon name="circle-alert" size={18} className="mt-0.5 shrink-0 text-red-600" />
      <div className="grid gap-1">
        <p className="font-semibold text-red-700">{heading}</p>
        {action.reason ? <p className="text-sm text-red-600">Lý do: {action.reason}</p> : null}
        {isRejected ? (
          <p className="text-sm text-red-600">Vui lòng chỉnh sửa nội dung rồi gửi duyệt lại.</p>
        ) : null}
      </div>
    </div>
  );
}
