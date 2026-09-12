"use client";

import { Suspense, use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { CreateJobPostRequest, JobPost, SubmitJobPostResponse } from "@sip/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useEmployerJobPost } from "@/hooks/useJobPosts";
import { JOB_STATUS_LABEL, JOB_TYPE_LABEL, daysLeft, formatDate, formatDeadline } from "@/lib/job-post-display";
import { JobPostContent, JobPostCompanyCard } from "@/components/jobs/JobPostContent";
import { JobPostForm, type JobPostFormAction } from "@/components/jobs/JobPostForm";
import { JobPostSubmitResult } from "@/components/jobs/JobPostSubmitResult";
import { ModerationBanner } from "@/components/jobs/ModerationBanner";
import { EmployerJobQuotaNotice } from "@/components/jobs/EmployerJobQuotaNotice";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { StatCard } from "@/components/ui/StatCard";

/** Card "Thao tác nhanh" ở cột phải — action đổi theo trạng thái hiện tại. */
function QuickActions({
  job,
  busy,
  onEdit,
  onSubmit,
  onClose,
}: {
  job: JobPost;
  busy: boolean;
  onEdit: () => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Card padding="md" className="grid gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-text-subtle uppercase">Thao tác nhanh</h2>
      {job.status === "DRAFT" ? (
        <>
          <Button type="button" variant="secondary" icon="pencil" fullWidth disabled={busy} onClick={onEdit}>
            Chỉnh sửa tin
          </Button>
          <Button type="button" icon="send" fullWidth loading={busy} onClick={onSubmit}>
            Gửi duyệt
          </Button>
        </>
      ) : null}
      {job.status === "PUBLISHED" ? (
        <>
          <Button as="a" href={`/jobs/${job.id}`} variant="secondary" icon="external-link" fullWidth>
            Xem tin public
          </Button>
          <Button type="button" variant="danger" icon="circle-slash" fullWidth loading={busy} onClick={onClose}>
            Đóng tin tuyển dụng
          </Button>
        </>
      ) : null}
      {job.status === "PENDING" ? (
        <p className="text-sm text-text-muted">Tin đang chờ Admin kiểm duyệt, không thể chỉnh sửa lúc này.</p>
      ) : null}
      {job.status === "TAKEN_DOWN" ? (
        <p className="text-sm text-text-muted">Tin đã bị thu hồi. Vui lòng liên hệ Admin nếu cần khiếu nại.</p>
      ) : null}
      {job.status === "EXPIRED" || job.status === "CLOSED" ? (
        <p className="text-sm text-text-muted">Tin đã kết thúc. Bạn có thể đăng một tin mới cho vị trí này.</p>
      ) : null}
      <Button as="a" href="/employer/jobs" variant="ghost" fullWidth>
        Về danh sách
      </Button>
    </Card>
  );
}

/**
 * Chi tiết quản lý một tin tuyển dụng — khớp ảnh mẫu
 * `Screenshot 2026-09-12 135146.png` (4 StatCard + 2 cột) và `135406.png`
 * (banner đỏ khi bị từ chối/thu hồi). `?edit=1` mở thẳng chế độ chỉnh sửa.
 */
export default function EmployerJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // useSearchParams() cần Suspense boundary khi Next prerender route này.
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-6 py-12 text-sm text-text-muted">Đang tải...</div>}>
      <EmployerJobDetail params={params} />
    </Suspense>
  );
}

function EmployerJobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { data: job, isLoading } = useEmployerJobPost(id);
  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitJobPostResponse | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["employerJobPost", id] });
    await queryClient.invalidateQueries({ queryKey: ["employerJobPosts"] });
    await queryClient.invalidateQueries({ queryKey: ["employerJobPostStats"] });
    await queryClient.invalidateQueries({ queryKey: ["companySubscription"] });
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  async function submitForApproval() {
    const submitted = await apiFetch<SubmitJobPostResponse>("employer", `/employer/job-posts/${id}/submit`, {
      method: "POST",
    });
    setResult(submitted);
    await refresh();
  }

  function handleFormAction(dto: CreateJobPostRequest, action: JobPostFormAction) {
    void run(async () => {
      await apiFetch<JobPost>("employer", `/employer/job-posts/${id}`, { method: "PATCH", body: JSON.stringify(dto) });
      await refresh();
      // "Xem trước" ở chế độ sửa = quay về chính trang chi tiết này (đã render
      // đầy đủ nội dung tin) — bản public chỉ tồn tại khi tin đã PUBLISHED.
      if (action === "submit") {
        await submitForApproval();
      } else {
        setEditing(false);
      }
    }, "Không lưu được thay đổi, vui lòng thử lại");
  }

  if (isLoading || !job) {
    return <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-text-muted">Đang tải...</div>;
  }

  if (result) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <JobPostSubmitResult result={result} />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-5 px-6 py-12">
        <div className="grid gap-1">
          <Button as="a" href="/employer/jobs" variant="link" className="w-fit" icon="arrow-left">
            Quản lý tin tuyển dụng
          </Button>
          <h1 className="text-2xl font-semibold text-text-strong">Chỉnh sửa tin tuyển dụng</h1>
        </div>
        <ModerationBanner job={job} />
        <JobPostForm
          initial={job}
          saving={busy}
          error={error}
          notice={<EmployerJobQuotaNotice />}
          onAction={handleFormAction}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const status = JOB_STATUS_LABEL[job.status];
  const left = daysLeft(job.expiresAt);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 px-6 py-12">
      <Button as="a" href="/employer/jobs" variant="link" className="w-fit" icon="arrow-left">
        Quản lý tin tuyển dụng
      </Button>

      <ModerationBanner job={job} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold text-text-strong">{job.title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="inline-flex items-center gap-1 text-sm text-text-muted">
              <Icon name="map-pin" size={14} />
              {job.cityName ?? job.address ?? "Chưa rõ địa điểm"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="eye" label="Lượt xem" value={job.viewCount} />
        {/* Module applications thuộc Phase 8 — hiện placeholder 0. */}
        <StatCard icon="users" label="Ứng viên" value={job.applicationCount} />
        <StatCard
          icon="calendar-clock"
          label={job.expiresAt ? `Hạn: ${formatDate(job.expiresAt)}` : "Thời hạn"}
          value={left !== null && left > 0 ? left : formatDeadline(job.expiresAt)}
          {...(left !== null && left > 0 ? { unit: "ngày" } : {})}
        />
        <StatCard icon="shield-check" label="Trạng thái duyệt" value={status.label} />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <JobPostContent
        job={job}
        aside={
          <>
            <QuickActions
              job={job}
              busy={busy}
              onEdit={() => setEditing(true)}
              onSubmit={() => void run(submitForApproval, "Không gửi duyệt được, vui lòng thử lại")}
              onClose={() =>
                void run(async () => {
                  await apiFetch<JobPost>("employer", `/employer/job-posts/${id}/close`, { method: "POST" });
                  await refresh();
                }, "Không đóng được tin, vui lòng thử lại")
              }
            />

            <Card padding="md" className="grid gap-3">
              <h2 className="text-xs font-semibold tracking-wide text-text-subtle uppercase">Tổng quan ứng viên</h2>
              <p className="text-sm text-text-muted">
                Danh sách ứng viên sẽ hiển thị tại đây khi tính năng ứng tuyển được bật (Phase 8).
              </p>
            </Card>

            <Card padding="md" className="grid gap-2">
              <h2 className="text-xs font-semibold tracking-wide text-text-subtle uppercase">Thông tin chung</h2>
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-text-muted">Ngành nghề</dt>
                  <dd className="text-right text-text-body">{job.industryName ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-text-muted">Hình thức</dt>
                  <dd className="text-right text-text-body">{JOB_TYPE_LABEL[job.jobType]}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-text-muted">Ngày tạo</dt>
                  <dd className="text-right text-text-body">{formatDate(job.createdAt)}</dd>
                </div>
                {job.publishedAt ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-text-muted">Ngày duyệt</dt>
                    <dd className="text-right text-text-body">{formatDate(job.publishedAt)}</dd>
                  </div>
                ) : null}
              </dl>
            </Card>

            <JobPostCompanyCard job={job} />
          </>
        }
      />
    </div>
  );
}
