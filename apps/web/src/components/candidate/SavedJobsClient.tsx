"use client";

import { useCallback, useState } from "react";
import type { SavedJobEntry } from "@sip/shared-types";
import { useSavedJobs, useUnsaveJob } from "@/hooks/useSavedJobs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { JobCard } from "@/components/ui/JobCard";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { JOB_STATUS_LABEL, formatSalary, formatDeadline, isRecentlyPublished } from "@/lib/job-post-display";

// ─── Toast helper ──────────────────────────────────────────────────────────

let toastIdCounter = 0;

function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const push = useCallback((tone: ToastData["tone"], message: string) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, tone, message }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  return { toasts, push, dismiss };
}

// ─── Saved Date ────────────────────────────────────────────────────────────

function formatSavedDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ─── Inactive status check ─────────────────────────────────────────────────

const INACTIVE_STATUSES = new Set(["CLOSED", "EXPIRED", "TAKEN_DOWN"]);

function isInactive(status: string) {
  return INACTIVE_STATUSES.has(status);
}

// ─── Saved Job Item ────────────────────────────────────────────────────────

interface SavedJobItemProps {
  entry: SavedJobEntry;
  onUnsave: (jobPostId: string) => void;
  isUnsaving: boolean;
}

function SavedJobItem({ entry, onUnsave, isUnsaving }: SavedJobItemProps) {
  const { jobPost } = entry;
  const inactive = isInactive(jobPost.status);
  const statusInfo = JOB_STATUS_LABEL[jobPost.status];

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-text-muted">Đã lưu: {formatSavedDate(entry.createdAt)}</span>
      <div className="flex gap-2">
        {inactive ? (
          <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
        ) : null}
        <Button
          as="a"
          href={`/jobs/${jobPost.id}`}
          variant="secondary"
          size="sm"
          iconAfter="arrow-right"
        >
          Xem tin
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon="bookmark-x"
          loading={isUnsaving}
          onClick={() => onUnsave(jobPost.id)}
          className="text-text-muted"
        >
          Bỏ lưu
        </Button>
      </div>
    </div>
  );

  return (
    <div className={inactive ? "opacity-70" : undefined}>
      <JobCard
        title={jobPost.title}
        company={jobPost.company.name}
        location={jobPost.cityName ?? jobPost.address ?? undefined}
        salary={formatSalary(jobPost)}
        deadline={inactive ? undefined : formatDeadline(jobPost.expiresAt)}
        isNew={isRecentlyPublished(jobPost.publishedAt)}
        verified={jobPost.company.isVerified}
        footer={footer}
      />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SavedJobsClient() {
  const { data: entries, isLoading, isError } = useSavedJobs();
  const unsaveMutation = useUnsaveJob();
  const { toasts, push, dismiss } = useToast();
  const [unsavingId, setUnsavingId] = useState<string | null>(null);

  async function handleUnsave(jobPostId: string) {
    setUnsavingId(jobPostId);
    try {
      await unsaveMutation.mutateAsync(jobPostId);
      push("success", "Đã bỏ lưu tin tuyển dụng.");
    } catch (err) {
      push("danger", err instanceof Error ? err.message : "Không thể bỏ lưu. Vui lòng thử lại.");
    } finally {
      setUnsavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <ToastViewport toasts={toasts} onDismiss={dismiss} />

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-strong">Việc làm đã lưu</h1>
        <p className="mt-1 text-sm text-text-muted">
          Các tin tuyển dụng bạn đã đánh dấu quan tâm.
        </p>
      </div>

      {isLoading ? (
        <Card padding="lg" className="flex items-center justify-center gap-2 text-text-muted">
          <Icon name="loader-circle" size={18} className="animate-spin" />
          <span className="text-sm">Đang tải...</span>
        </Card>
      ) : isError ? (
        <Card padding="lg" className="grid justify-items-center gap-2 text-center">
          <Icon name="circle-alert" size={32} className="text-red-500" />
          <p className="text-sm text-text-body">Không thể tải danh sách. Vui lòng thử lại.</p>
        </Card>
      ) : !entries || entries.length === 0 ? (
        <Card padding="lg" tone="sunken" className="grid justify-items-center gap-4 text-center">
          <Icon name="bookmark" size={40} className="text-text-muted" />
          <div>
            <p className="font-medium text-text-strong">Chưa có tin nào được lưu</p>
            <p className="mt-1 text-sm text-text-muted">
              Khi bạn lưu một tin tuyển dụng, nó sẽ xuất hiện ở đây.
            </p>
          </div>
          <Button as="a" href="/jobs" variant="secondary" icon="search">
            Khám phá việc làm
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-text-muted">{entries.length} tin đã lưu</p>
          {entries.map((entry) => (
            <SavedJobItem
              key={entry.id}
              entry={entry}
              onUnsave={(id) => void handleUnsave(id)}
              isUnsaving={unsavingId === entry.jobPostId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
