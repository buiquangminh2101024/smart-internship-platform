"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { JobPost, JobPostStatus } from "@sip/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useEmployerJobPostStats, useEmployerJobPosts } from "@/hooks/useJobPosts";
import { JOB_STATUS_LABEL, JOB_TYPE_LABEL, formatDate, formatDeadline, formatSalary } from "@/lib/job-post-display";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StatCard } from "@/components/ui/StatCard";

/** Giá trị ô lọc: một trạng thái, tất cả, hoặc "tin cần chú ý" (`?attention=1`, không đi cùng `status`). */
type JobFilter = JobPostStatus | "ALL" | "ATTENTION";

const JOB_STATUSES = Object.keys(JOB_STATUS_LABEL) as JobPostStatus[];

const STATUS_OPTIONS: { value: JobFilter; label: string }[] = [
  { value: "ALL", label: "Tất cả trạng thái" },
  { value: "ATTENTION", label: "Tin cần chú ý" },
  ...JOB_STATUSES.map((value) => ({ value, label: JOB_STATUS_LABEL[value].label })),
];

/**
 * Bộ lọc của trang nằm trên URL để dashboard trỏ thẳng vào được
 * (`/employer/jobs?attention=1`, docs/05-frontend/phases/employer-dashboard-v2/PLAN.md F1).
 * Giá trị lạ bị bỏ qua; có `attention=1` thì bỏ qua `status`.
 */
function useJobFilterParam() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawStatus = searchParams.get("status");
  const filter: JobFilter =
    searchParams.get("attention") === "1" ? "ATTENTION" : (JOB_STATUSES.find((value) => value === rawStatus) ?? "ALL");

  function setFilter(next: JobFilter) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("status");
    params.delete("attention");
    if (next === "ATTENTION") params.set("attention", "1");
    else if (next !== "ALL") params.set("status", next);
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }

  return { filter, setFilter };
}

/** Dòng tóm tắt dưới tiêu đề tin — lượt xem, ứng viên, hạn nộp. */
function JobMeta({ job }: { job: JobPost }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
      <span className="inline-flex items-center gap-1">
        <Icon name="eye" size={14} />
        {job.viewCount} lượt xem
      </span>
      <span className="inline-flex items-center gap-1">
        <Icon name="users" size={14} />
        {job.applicationCount} ứng viên
      </span>
      {job.status === "PUBLISHED" ? (
        <span className="inline-flex items-center gap-1">
          <Icon name="calendar-clock" size={14} />
          {formatDeadline(job.expiresAt)}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1">
        <Icon name="briefcase" size={14} />
        {JOB_TYPE_LABEL[job.jobType]}
      </span>
      <span className="inline-flex items-center gap-1">
        <Icon name="wallet" size={14} />
        {formatSalary(job)}
      </span>
    </div>
  );
}

/** Dòng trạng thái phụ ở cuối card, tùy theo tin đang ở bước nào của vòng đời. */
function JobStatusNote({ job }: { job: JobPost }) {
  if (job.status === "PUBLISHED" && job.publishedAt) {
    return <p className="text-sm text-text-muted">Đã duyệt ngày {formatDate(job.publishedAt)}</p>;
  }
  if (job.status === "PENDING") {
    return <p className="text-sm text-text-muted">Đang đợi Admin phê duyệt</p>;
  }
  if (job.status === "CLOSED" && job.closedAt) {
    return <p className="text-sm text-text-muted">Đóng ngày {formatDate(job.closedAt)}</p>;
  }
  const action = job.latestModerationAction;
  if (job.status === "DRAFT" && action?.action === "REJECTED") {
    return <p className="text-sm text-red-600">Lý do: {action.reason ?? "Không có lý do cụ thể"}. Vui lòng chỉnh sửa và gửi lại.</p>;
  }
  if (job.status === "TAKEN_DOWN") {
    return <p className="text-sm text-red-600">Bị thu hồi. Lý do: {action?.reason ?? "Không có lý do cụ thể"}</p>;
  }
  if (job.status === "EXPIRED") {
    return <p className="text-sm text-text-muted">Tin đã quá hạn nộp hồ sơ</p>;
  }
  return null;
}

type ConfirmAction = "close" | "delete";

const CONFIRM_COPY: Record<ConfirmAction, { message: string; confirmLabel: string; fallbackError: string }> = {
  close: {
    message: "Đóng tin sẽ gỡ tin khỏi trang tìm kiếm công khai và không thể mở lại. Tiếp tục?",
    confirmLabel: "Xác nhận đóng tin",
    fallbackError: "Không đóng được tin, vui lòng thử lại",
  },
  delete: {
    message: "Xóa nháp sẽ mất toàn bộ nội dung đã soạn và không thể khôi phục. Tiếp tục?",
    confirmLabel: "Xác nhận xóa nháp",
    fallbackError: "Không xóa được tin nháp, vui lòng thử lại",
  },
};

/**
 * Danh sách quản lý tin tuyển dụng của Employer — khớp ảnh mẫu
 * `Screenshot 2026-09-12 135023.png`: ô tìm kiếm + lọc trạng thái, danh sách
 * card dọc kèm action bên phải.
 */
export default function EmployerJobsPage() {
  // useSearchParams() cần Suspense boundary khi Next prerender route này.
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-4xl px-6 py-12">
          <p className="text-sm text-text-muted">Đang tải...</p>
        </div>
      }
    >
      <EmployerJobsContent />
    </Suspense>
  );
}

function EmployerJobsContent() {
  const queryClient = useQueryClient();
  const { filter, setFilter } = useJobFilterParam();
  /** Tin đang chờ xác nhận đóng/xóa — hiện inline thay vì dùng window.confirm. */
  const [confirming, setConfirming] = useState<{ id: string; action: ConfirmAction } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  // API phân trang theo cursor — giữ ngăn xếp cursor của các trang đã qua để
  // quay lui được mà không phải tải lại từ đầu.
  // Ngăn xếp gắn với bộ lọc lúc tạo: bộ lọc trên URL đổi (kể cả bằng nút Back)
  // thì coi như về trang 1.
  const [paging, setPaging] = useState<{ filter: JobFilter; stack: string[] }>({ filter, stack: [] });
  const cursorStack = paging.filter === filter ? paging.stack : [];
  const setCursorStack = (update: (stack: string[]) => string[]) => setPaging({ filter, stack: update(cursorStack) });
  const cursor = cursorStack[cursorStack.length - 1];

  const { data, isLoading } = useEmployerJobPosts({
    ...(filter === "ATTENTION" ? { attention: "1" as const } : filter === "ALL" ? {} : { status: filter }),
    ...(appliedSearch ? { q: appliedSearch } : {}),
    ...(cursor ? { cursor } : {}),
  });
  const { data: stats } = useEmployerJobPostStats();

  function resetPaging() {
    setCursorStack(() => []);
  }

  function askConfirm(id: string, action: ConfirmAction) {
    setActionError(null);
    setConfirming({ id, action });
  }

  async function runConfirmed(id: string, action: ConfirmAction) {
    setActionError(null);
    setActing(true);
    try {
      if (action === "close") {
        await apiFetch<JobPost>("employer", `/employer/job-posts/${id}/close`, { method: "POST" });
      } else {
        await apiFetch("employer", `/employer/job-posts/${id}`, { method: "DELETE" });
      }
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: ["employerJobPosts"] });
      await queryClient.invalidateQueries({ queryKey: ["employerJobPostStats"] });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : CONFIRM_COPY[action].fallbackError);
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold text-text-strong">Quản lý tin tuyển dụng</h1>
          <p className="text-sm text-text-muted">Theo dõi và cập nhật trạng thái các vị trí đang mở của bạn.</p>
        </div>
        <Button as="a" href="/employer/jobs/new" icon="plus">
          Đăng tin mới
        </Button>
      </div>

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon="briefcase" label="Đang hiển thị" value={stats.published} />
          <StatCard icon="clock" label="Chờ duyệt" value={stats.pending} />
          <StatCard icon="file-pen" label="Nháp" value={stats.draft} />
          <StatCard icon="archive" label="Đã đóng / hết hạn" value={stats.closed} />
        </div>
      ) : null}

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedSearch(search.trim());
          resetPaging();
        }}
      >
        <Input
          icon="search"
          placeholder="Tìm kiếm theo chức danh..."
          className="min-w-60 flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="w-52"
          aria-label="Lọc theo trạng thái"
          value={filter}
          onChange={(e) => setFilter(e.target.value as JobFilter)}
          options={STATUS_OPTIONS}
        />
        <Button type="submit" variant="secondary">
          Tìm kiếm
        </Button>
      </form>

      {filter === "ATTENTION" ? (
        <p className="-mt-3 text-sm text-text-muted">
          Tin bị từ chối cần sửa và gửi lại, cùng tin đang hiển thị sẽ hết hạn trong 7 ngày.
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-text-muted">Đang tải...</p>
      ) : (!data || data.items.length === 0) && filter === "ATTENTION" ? (
        <Card padding="lg" className="grid justify-items-center gap-3 text-center">
          <Icon name="circle-check" size={28} className="text-text-subtle" />
          <p className="text-sm text-text-muted">Không có tin nào cần chú ý.</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => setFilter("ALL")}>
            Xem tất cả tin
          </Button>
        </Card>
      ) : !data || data.items.length === 0 ? (
        <Card padding="lg" className="grid justify-items-center gap-3 text-center">
          <Icon name="briefcase" size={28} className="text-text-subtle" />
          <p className="text-sm text-text-muted">Chưa có tin tuyển dụng nào khớp bộ lọc.</p>
          <Button as="a" href="/employer/jobs/new" variant="secondary" size="sm">
            Đăng tin đầu tiên
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {data.items.map((job) => {
            const statusInfo = JOB_STATUS_LABEL[job.status];
            return (
              <Card key={job.id} padding="md" className="flex flex-wrap items-start justify-between gap-4">
                <div className="grid min-w-60 flex-1 gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-text-strong">{job.title}</span>
                    <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                  </div>
                  <JobMeta job={job} />
                  <JobStatusNote job={job} />
                  {confirming?.id === job.id ? (
                    <div className="grid gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-sm text-red-700">{CONFIRM_COPY[confirming.action].message}</p>
                      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          loading={acting}
                          onClick={() => void runConfirmed(job.id, confirming.action)}
                        >
                          {CONFIRM_COPY[confirming.action].confirmLabel}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" disabled={acting} onClick={() => setConfirming(null)}>
                          Hủy
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-1 text-sm">
                  <Button as="a" href={`/employer/jobs/${job.id}`} variant="link">
                    Xem tin
                  </Button>
                  {job.status === "PUBLISHED" ? (
                    <Button as="a" href={`/jobs/${job.id}`} variant="link">
                      Xem bản công khai
                    </Button>
                  ) : null}
                  {job.status === "DRAFT" ? (
                    <>
                      <Button as="a" href={`/employer/jobs/${job.id}?edit=1`} variant="link">
                        Chỉnh sửa
                      </Button>
                      <Button type="button" variant="link" className="text-red-600" onClick={() => askConfirm(job.id, "delete")}>
                        Xóa nháp
                      </Button>
                    </>
                  ) : null}
                  {job.status === "PUBLISHED" ? (
                    <Button type="button" variant="link" className="text-red-600" onClick={() => askConfirm(job.id, "close")}>
                      Đóng tin
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
          {cursorStack.length > 0 || data.hasMore ? (
            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-sm text-text-muted">Trang {cursorStack.length + 1}</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={cursorStack.length === 0}
                  onClick={() => setCursorStack((stack) => stack.slice(0, -1))}
                >
                  Trang trước
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!data.hasMore || !data.nextCursor}
                  onClick={() => data.nextCursor && setCursorStack((stack) => [...stack, data.nextCursor!])}
                >
                  Trang sau
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
