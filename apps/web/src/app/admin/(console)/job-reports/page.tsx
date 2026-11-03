"use client";

import { Suspense, useCallback, useState } from "react";
import type {
  AdminJobReportListItem,
  ReportReason,
  ReportResolution,
  ReportStatus,
} from "@sip/shared-types";
import { useAdminJobReports, useAdminJobReportStats } from "@/hooks/useAdminJobReports";
import { formatDate } from "@/lib/job-post-display";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StatCard } from "@/components/ui/StatCard";
import { Icon } from "@/components/ui/Icon";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import {
  AdminJobReportDetailModal,
  REPORT_REASON_META,
  REPORT_RESOLUTION_META,
  REPORT_STATUS_META,
} from "@/components/admin/AdminJobReportDetailModal";

const STATUS_FILTERS: { value: ReportStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "Tất cả" },
  { value: "PENDING", label: "Chờ xử lý" },
  { value: "RESOLVED", label: "Đã xử lý" },
];

const RESOLUTION_OPTIONS: { value: ReportResolution | "ALL"; label: string }[] = [
  { value: "ALL", label: "Tất cả kết quả" },
  { value: "TAKE_DOWN", label: "Đã gỡ tin" },
  { value: "DISMISS", label: "Đã bỏ qua / Giữ tin" },
];

const REASON_OPTIONS: { value: ReportReason | "ALL"; label: string }[] = [
  { value: "ALL", label: "Tất cả lý do" },
  { value: "SCAM", label: "Lừa đảo / Đa cấp" },
  { value: "CHARGING_FEE", label: "Thu phí trái phép" },
  { value: "INAPPROPRIATE", label: "Nội dung phản cảm" },
  { value: "MISLEADING", label: "Thông tin sai lệch" },
  { value: "OTHER", label: "Lý do khác" },
];

let toastIdCounter = 0;

export default function AdminJobReportsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-6 py-12 text-sm text-text-muted">Đang tải...</div>}>
      <AdminJobReportsView />
    </Suspense>
  );
}

function AdminJobReportsView() {
  const [status, setStatus] = useState<ReportStatus | "ALL">("PENDING");
  const [resolution, setResolution] = useState<ReportResolution | "ALL">("ALL");
  const [reason, setReason] = useState<ReportReason | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedReport, setSelectedReport] = useState<AdminJobReportListItem | null>(null);

  const [toasts, setToasts] = useState<ToastData[]>([]);

  const pushToast = useCallback((tone: ToastData["tone"], message: string) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, tone, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const { data: stats } = useAdminJobReportStats();

  const { data, isLoading } = useAdminJobReports({
    page,
    limit: 15,
    status,
    resolution: status === "RESOLVED" || status === "ALL" ? resolution : undefined,
    reason,
    q: debouncedQuery.trim() || undefined,
  });

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setDebouncedQuery(searchQuery);
  }

  function handleStatusChange(val: ReportStatus | "ALL") {
    setStatus(val);
    setResolution("ALL");
    setPage(1);
  }

  function handleResolutionChange(val: ReportResolution | "ALL") {
    setResolution(val);
    setPage(1);
  }

  function handleReasonChange(val: ReportReason | "ALL") {
    setReason(val);
    setPage(1);
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-10">
      {/* Header */}
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold text-text-strong">Báo cáo tin tuyển dụng vi phạm</h1>
        <p className="text-sm text-text-muted">
          Tiếp nhận và xử lý các phản ánh, khiếu nại về tin tuyển dụng có dấu hiệu lừa đảo hoặc vi phạm quy định.
        </p>
      </div>

      {/* Overview StatCards */}
      {stats ? (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          <StatCard icon="clock" label="Chờ xử lý" value={stats.pending} />
          <StatCard icon="circle-check" label="Đã xử lý" value={stats.resolved} />
          <StatCard icon="file-x" label="Đã gỡ tin" value={stats.takeDownCount} />
          <StatCard icon="flag" label="Tổng số báo cáo" value={stats.total} />
        </div>
      ) : null}

      {/* Filter bar */}
      <Card padding="md" className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                variant={status === f.value ? "primary" : "secondary"}
                size="sm"
                onClick={() => handleStatusChange(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>

          {/* Secondary Filters */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Resolution filter (chỉ hiện khi xem Tất cả hoặc tab Đã xử lý) */}
            {(status === "ALL" || status === "RESOLVED") && (
              <div className="w-44">
                <Select
                  options={RESOLUTION_OPTIONS}
                  value={resolution}
                  onChange={(e) => handleResolutionChange(e.target.value as ReportResolution | "ALL")}
                />
              </div>
            )}

            {/* Reason select */}
            <div className="w-48">
              <Select
                options={REASON_OPTIONS}
                value={reason}
                onChange={(e) => handleReasonChange(e.target.value as ReportReason | "ALL")}
              />
            </div>
          </div>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="flex-1">
            <Input
              icon="search"
              placeholder="Tìm kiếm theo tên tin tuyển dụng hoặc email người báo cáo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">
            Tìm kiếm
          </Button>
          {debouncedQuery ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearchQuery("");
                setDebouncedQuery("");
                setPage(1);
              }}
            >
              Xóa tìm
            </Button>
          ) : null}
        </form>
      </Card>

      {/* Reports Table / List */}
      {isLoading ? (
        <p className="text-sm text-text-muted py-6 text-center">Đang tải danh sách báo cáo...</p>
      ) : !data || data.items.length === 0 ? (
        <Card padding="lg" className="text-center py-12 grid justify-items-center gap-2">
          <Icon name="flag" size={32} className="text-text-muted" />
          <p className="text-base font-medium text-text-strong">Không có báo cáo nào</p>
          <p className="text-sm text-text-muted max-w-md">
            Không tìm thấy báo cáo vi phạm nào phù hợp với bộ lọc hiện tại.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          <div className="overflow-x-auto rounded-xl border border-border-default bg-surface-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border-subtle bg-surface-page text-xs font-semibold uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-4 py-3">Tin tuyển dụng / Công ty</th>
                  <th className="px-4 py-3">Người báo cáo</th>
                  <th className="px-4 py-3">Lý do vi phạm</th>
                  <th className="px-4 py-3">Ngày gửi</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Kết quả</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {data.items.map((rep) => {
                  const reasonInfo = REPORT_REASON_META[rep.reason];
                  const statusInfo = REPORT_STATUS_META[rep.status];
                  const resolutionInfo = rep.resolution ? REPORT_RESOLUTION_META[rep.resolution] : null;

                  return (
                    <tr key={rep.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="px-4 py-3.5 max-w-xs">
                        <div className="grid gap-0.5">
                          <span className="font-medium text-text-strong line-clamp-1">
                            {rep.jobTitle}
                          </span>
                          <span className="text-xs text-text-muted line-clamp-1">
                            {rep.companyName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="grid gap-0.5">
                          <span className="text-text-strong font-medium">{rep.reporterEmail}</span>
                          {rep.reporterName ? (
                            <span className="text-xs text-text-muted">{rep.reporterName}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge tone={reasonInfo.tone} className="text-[11px]">
                          {reasonInfo.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-text-muted whitespace-nowrap">
                        {formatDate(rep.createdAt)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {resolutionInfo ? (
                          <Badge tone={resolutionInfo.tone}>{resolutionInfo.label}</Badge>
                        ) : (
                          <span className="text-text-muted text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <Button
                          variant={rep.status === "PENDING" ? "primary" : "secondary"}
                          size="sm"
                          icon="eye"
                          onClick={() => setSelectedReport(rep)}
                        >
                          {rep.status === "PENDING" ? "Xử lý" : "Xem chi tiết"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.totalPages > 1 ? (
            <div className="flex items-center justify-between px-2 pt-2 text-sm text-text-muted">
              <span>
                Hiển thị trang {data.page} / {data.totalPages} ({data.total} báo cáo)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Trang trước
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                >
                  Trang sau
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Detail & Action Modal */}
      <AdminJobReportDetailModal
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onDone={(outcome) => pushToast(outcome.tone, outcome.message)}
      />

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
