"use client";

import { useState } from "react";
import type { JobPostStatus } from "@sip/shared-types";
import { useAdminJobPostStats, useAdminJobPosts } from "@/hooks/useJobPosts";
import { JOB_STATUS_LABEL, formatDate } from "@/lib/job-post-display";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";

const FILTERS: { value: JobPostStatus | "ALL"; label: string }[] = [
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "PUBLISHED", label: "Đang hiển thị" },
  { value: "TAKEN_DOWN", label: "Đã hạ" },
  { value: "ALL", label: "Tất cả" },
];

/**
 * Hàng đợi kiểm duyệt tin tuyển dụng — khớp ảnh mẫu
 * `Screenshot 2026-09-12 134326.png` (panel 1): StatCard tổng quan + bảng tin
 * chờ duyệt. Thẻ "Báo cáo vi phạm" trong mockup là trang trí (chưa có entity
 * Report) nên không dựng ở Phase 6.
 */
export default function AdminJobPostsPage() {
  const [status, setStatus] = useState<JobPostStatus | "ALL">("PENDING");
  const { data, isLoading } = useAdminJobPosts(status);
  const { data: stats } = useAdminJobPostStats();

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-6 py-12">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold text-text-strong">Kiểm duyệt tin tuyển dụng</h1>
        <p className="text-sm text-text-muted">Xem và xử lý các tin tuyển dụng cần kiểm duyệt.</p>
      </div>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard icon="clock" label="Tin chờ duyệt" value={stats.pending} />
          <StatCard icon="briefcase" label="Tin đang hiển thị" value={stats.published} />
          <StatCard icon="archive" label="Tin đã kết thúc" value={stats.closed} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={status === f.value ? "primary" : "secondary"}
            size="sm"
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-text-muted">Đang tải...</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-sm text-text-muted">Không có tin tuyển dụng nào ở trạng thái này.</p>
      ) : (
        <div className="grid gap-3">
          {data.items.map((job) => {
            const statusInfo = JOB_STATUS_LABEL[job.status];
            return (
              <Card key={job.id} padding="md" className="flex flex-wrap items-center justify-between gap-4">
                <div className="grid min-w-60 flex-1 gap-1">
                  <span className="font-medium text-text-strong">{job.title}</span>
                  <span className="text-sm text-text-muted">
                    {job.company.name} · Ngày gửi {formatDate(job.createdAt)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                  <Button as="a" href={`/admin/jobs/${job.id}`} variant="secondary" size="sm">
                    {job.status === "PENDING" ? "Kiểm tra" : "Xem chi tiết"}
                  </Button>
                </div>
              </Card>
            );
          })}
          {data.hasMore ? (
            <p className="text-center text-sm text-text-muted">
              Hiển thị {data.items.length} tin mới nhất — xử lý bớt hàng đợi để xem các tin còn lại.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
