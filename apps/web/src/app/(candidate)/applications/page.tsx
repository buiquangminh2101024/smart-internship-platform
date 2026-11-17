"use client";

import { useCandidateApplications, useCancelApplication } from "@/hooks/useApplications";
import { useCandidateInterviews } from "@/hooks/useInterviews";
import { CandidateInterviewBlock } from "@/components/interviews/CandidateInterviewBlock";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useState } from "react";

import { useRouter } from "next/navigation";
import type { CandidateInterview, JobPostStatus } from "@sip/shared-types";
import { JOB_STATUS_LABEL } from "@/lib/job-post-display";
import { APPLICATION_STATUS_LABEL } from "@/lib/application-status";
import { formatVnDate } from "@/lib/dashboard-format";

const INACTIVE_JOB_STATUSES: ReadonlySet<JobPostStatus> = new Set(["CLOSED", "EXPIRED", "TAKEN_DOWN"]);

export default function ApplicationsPage() {
  const { data: applications, isLoading, isError } = useCandidateApplications();
  const cancelMutation = useCancelApplication();
  const router = useRouter();
  // Lịch phỏng vấn (FE-5), gom theo hồ sơ. Lỗi tải lịch không chặn danh sách hồ sơ.
  const { data: interviews } = useCandidateInterviews();
  const interviewsByApplication = new Map<string, CandidateInterview[]>();
  for (const interview of interviews ?? []) {
    const list = interviewsByApplication.get(interview.applicationId) ?? [];
    list.push(interview);
    interviewsByApplication.set(interview.applicationId, list);
  }
  
  const [dialog, setDialog] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" | "info"; onConfirm?: () => void; isDestructive?: boolean; hideCancel?: boolean }>({ isOpen: false, title: "", message: "", type: "info" });
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const handleCancel = (id: string) => {
    setDialog({
      isOpen: true,
      title: "Hủy đơn ứng tuyển",
      message: "Bạn có chắc chắn muốn hủy đơn ứng tuyển này?",
      type: "error",
      isDestructive: true,
      hideCancel: false,
      onConfirm: async () => {
        try {
          await cancelMutation.mutateAsync(id);
        } finally {
          setDialog(prev => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleMessage = async (jobPostId: string) => {
    try {
      const { apiFetch } = await import("@/lib/api-client");
      const res = await apiFetch<{ id: string }>("candidate", "/conversations", {
        method: "POST",
        body: JSON.stringify({ jobPostId }),
      });
      router.push(`/messages?conversationId=${res.id}`);
    } catch (err: unknown) {
      setDialog({
        isOpen: true,
        title: "Lỗi",
        message: err instanceof Error ? err.message : "Không thể tạo hội thoại",
        type: "error",
        isDestructive: true,
        hideCancel: true
      });
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Lịch sử ứng tuyển</h1>
        <p className="mt-1 text-sm text-text-muted">Theo dõi trạng thái các đơn ứng tuyển của bạn.</p>
      </div>

      {isLoading ? (
        <Card padding="lg" className="flex items-center justify-center gap-2 text-text-muted">
          <Icon name="loader-circle" size={18} className="animate-spin" />
          <span className="text-sm">Đang tải...</span>
        </Card>
      ) : isError ? (
        <Card padding="lg" className="grid justify-items-center gap-2 text-center">
          <Icon name="circle-alert" size={32} className="text-red-500" />
          <p className="text-sm text-text-body">Có lỗi xảy ra khi tải danh sách.</p>
        </Card>
      ) : !applications || applications.length === 0 ? (
        <Card padding="lg" tone="sunken" className="grid justify-items-center gap-4 text-center">
          <Icon name="briefcase-business" size={40} className="text-text-muted" />
          <div>
            <p className="font-medium text-text-strong">Chưa có ứng tuyển nào</p>
            <p className="mt-1 text-sm text-text-muted">Khi bạn nộp đơn ứng tuyển, thông tin sẽ hiển thị tại đây.</p>
          </div>
          <Button as="a" href="/jobs" variant="secondary" icon="search">
            Tìm việc ngay
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {/* Bộ lọc tab trạng thái */}
          <div className="flex flex-wrap gap-1.5 border-b border-border-subtle pb-3">
            {[
              { id: "ALL", label: "Tất cả", count: applications.length },
              {
                id: "IN_REVIEW",
                label: "Đang xem xét",
                count: applications.filter(a => a.status === "PENDING" || a.status === "REVIEWING").length,
              },
              {
                id: "INTERVIEW",
                label: "Phỏng vấn & Rút gọn",
                count: applications.filter(a => a.status === "SHORTLISTED" || a.status === "INTERVIEWING").length,
              },
              {
                id: "ACCEPTED",
                label: "Được nhận",
                count: applications.filter(a => a.status === "ACCEPTED").length,
              },
              {
                id: "CLOSED",
                label: "Đã đóng / Từ chối",
                count: applications.filter(a => a.status === "REJECTED" || a.status === "CANCELLED" || a.status === "JOB_CLOSED").length,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === tab.id
                    ? "bg-pine-600 text-white"
                    : "bg-surface-page text-text-muted hover:bg-surface-hover hover:text-text-strong"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] tabular-nums ${
                  statusFilter === tab.id ? "bg-white/20 text-white" : "bg-neutral-200 text-text-muted"
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {applications
            .filter((app) => {
              if (statusFilter === "ALL") return true;
              if (statusFilter === "IN_REVIEW") return app.status === "PENDING" || app.status === "REVIEWING";
              if (statusFilter === "INTERVIEW") return app.status === "SHORTLISTED" || app.status === "INTERVIEWING";
              if (statusFilter === "ACCEPTED") return app.status === "ACCEPTED";
              if (statusFilter === "CLOSED") return app.status === "REJECTED" || app.status === "CANCELLED" || app.status === "JOB_CLOSED";
              return true;
            })
            .map((app) => {
            const jobInactive = INACTIVE_JOB_STATUSES.has(app.jobPost.status);
            const showJobStatus = jobInactive && (app.status === "PENDING" || app.status === "REVIEWING");
            return (
              <Card key={app.id} padding="md" className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                  <div>
                    <h3 className="font-semibold text-lg text-text-strong">{app.jobPost.title}</h3>
                    <p className="text-sm text-text-body mt-1">
                      <Icon name="building-2" size={14} className="inline-block mr-1 text-text-muted" />
                      {app.jobPost.company.name}
                    </p>
                    <p className="text-xs text-text-muted mt-2">
                      Nộp lúc: <span className="font-num tabular-nums">{formatVnDate(app.createdAt)}</span>
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-3 shrink-0">
                    <div className="flex flex-wrap justify-end gap-2">
                      {showJobStatus ? (
                        <Badge tone={JOB_STATUS_LABEL[app.jobPost.status]?.tone ?? "neutral"}>
                          Tin {JOB_STATUS_LABEL[app.jobPost.status]?.label?.toLowerCase() ?? app.jobPost.status}
                        </Badge>
                      ) : null}
                      <Badge tone={APPLICATION_STATUS_LABEL[app.status]?.tone ?? "neutral"}>
                        {APPLICATION_STATUS_LABEL[app.status]?.label ?? app.status}
                      </Badge>
                    </div>
                    {app.status === "JOB_CLOSED" ? (
                      <p className="text-sm text-text-muted">Tin đã ngừng nhận hồ sơ.</p>
                    ) : null}

                    <div className="flex gap-2">
                      {!jobInactive ? (
                        <Button variant="secondary" icon="messages-square" size="sm" onClick={() => void handleMessage(app.jobPostId)}>
                          Nhắn tin
                        </Button>
                      ) : null}
                      {(app.status === "PENDING" || app.status === "REVIEWING") && (
                        <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" size="sm" onClick={() => void handleCancel(app.id)}>
                          Hủy đơn
                        </Button>
                      )}
                      <Button as="a" href={"/jobs/" + app.jobPostId} variant="secondary" size="sm">
                        Xem tin
                      </Button>
                    </div>
                  </div>
                </div>
                <CandidateInterviewBlock
                  interviews={interviewsByApplication.get(app.id) ?? []}
                  applicationStatus={app.status}
                />
              </Card>
            );
          })}
        </div>
      )}
      
      <ConfirmDialog
        isOpen={dialog.isOpen}
        title={dialog.title}
        message={dialog.message}
        isDestructive={dialog.isDestructive ?? false}
        hideCancel={dialog.hideCancel ?? false}
        isConfirming={cancelMutation.isPending}
        onConfirm={() => {
          if (dialog.onConfirm) {
            dialog.onConfirm();
          } else {
            setDialog(prev => ({ ...prev, isOpen: false }));
          }
        }}
        onCancel={() => setDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </main>
  );

}
