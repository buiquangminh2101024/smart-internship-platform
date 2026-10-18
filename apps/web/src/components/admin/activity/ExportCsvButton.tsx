"use client";

import { useState } from "react";
import { apiDownload, ApiError } from "@/lib/api-client";
import { toListSearch, type ActivityFilters } from "@/lib/audit-activity";
import { vnTodayIso } from "@/lib/dashboard-format";
import { DashButton } from "@/components/dashboard/DashButton";

/** Khớp giới hạn của `/admin/activity/export` (plan BE, L36). */
export const EXPORT_MAX_ROWS = 5000;

function messageOf(error: unknown): string {
  if (error instanceof ApiError && error.code === "AUDIT_EXPORT_TOO_LARGE") {
    return "Quá 5.000 dòng nên không xuất được. Bạn thu hẹp khoảng ngày hoặc thêm bộ lọc rồi xuất lại.";
  }
  if (error instanceof ApiError && error.code === "AUDIT_EXPORT_RATE_LIMITED") {
    return "Bạn đã xuất 10 lần trong một giờ. Bạn đợi một lúc rồi xuất lại.";
  }
  return "Không xuất được CSV. Bạn kiểm tra kết nối rồi thử lại.";
}

/** Lưu Blob thành file qua một link tạm. */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Đợi trình duyệt bắt đầu tải rồi mới thu hồi URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * "Xuất CSV" với đúng bộ lọc đang xem (kể cả đối tượng, phiên, lưu trữ). Lỗi
 * 422 (quá 5.000 dòng) và 429 (quá 10 lần mỗi giờ) báo bằng toast kèm câu
 * hướng dẫn. Khi `total` đã quá 5.000 thì nút vẫn bấm được, có thêm ghi chú.
 */
export function ExportCsvButton({
  filters,
  total,
  onResult,
}: {
  filters: ActivityFilters;
  total: number | undefined;
  onResult: (tone: "success" | "danger", message: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const tooLarge = total !== undefined && total > EXPORT_MAX_ROWS;

  async function handleExport() {
    setLoading(true);
    try {
      const { blob, fileName } = await apiDownload(
        "admin",
        `/admin/activity/export?${toListSearch(filters).toString()}`,
      );
      saveBlob(blob, fileName ?? `nhat-ky-${vnTodayIso().replaceAll("-", "")}.csv`);
      onResult("success", "Đã xuất CSV.");
    } catch (error) {
      onResult("danger", messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-1 sm:justify-items-end">
      <DashButton
        variant="secondary"
        icon="download"
        loading={loading}
        onClick={handleExport}
      >
        Xuất CSV
      </DashButton>
      {tooLarge ? (
        <p className="max-w-[260px] text-[13px] text-text-muted sm:text-right">
          Quá 5.000 dòng, bạn thu hẹp khoảng ngày để xuất.
        </p>
      ) : null}
    </div>
  );
}
