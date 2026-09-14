"use client";

import { use } from "react";
import { usePublicJobPost } from "@/hooks/useJobPosts";
import { useSavedJobCheck, useSaveJob, useUnsaveJob } from "@/hooks/useSavedJobs";
import { useJobApplicationStatus } from "@/hooks/useApplications";
import { JobPostContent, JobPostCompanyCard, JobPostHeaderCard } from "@/components/jobs/JobPostContent";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCandidateAuthStore } from "@/stores/auth-store";

export default function PublicJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: job, isLoading, isError } = usePublicJobPost(id);

  // Chỉ CANDIDATE đăng nhập mới có thể lưu tin — kiểm tra cả token lẫn role.
  const user = useCandidateAuthStore((state) => state.user);
  const isLoggedIn = useCandidateAuthStore((state) => !!state.accessToken);
  const isCandidate = isLoggedIn && user?.role === "CANDIDATE";

  // Lấy trạng thái lưu từ backend — chỉ gọi khi là CANDIDATE.
  const { data: checkResult } = useSavedJobCheck(id, isCandidate);
  const saved = checkResult?.saved ?? false;

  // Kiểm tra trạng thái đơn ứng tuyển hiện tại cho job này
  const { status: appStatus } = useJobApplicationStatus(id, isCandidate);

  const saveMutation = useSaveJob();
  const unsaveMutation = useUnsaveJob();
  const saving = saveMutation.isPending || unsaveMutation.isPending;

  async function toggleSave() {
    if (!isCandidate) {
      window.location.href = "/login";
      return;
    }

    try {
      if (saved) {
        await unsaveMutation.mutateAsync(id);
      } else {
        await saveMutation.mutateAsync(id);
      }
    } catch {
      // Lỗi được phản ánh qua mutation state — không cần xử lý thêm ở đây.
    }
  }

  // Xác định trạng thái nút ứng tuyển
  const applyHref = isCandidate ? `/jobs/${id}/apply` : "/login";
  const isApplied = appStatus !== undefined && appStatus !== "CANCELLED";
  const applyLabel = (() => {
    if (!isCandidate) return "Đăng nhập để ứng tuyển";
    switch (appStatus) {
      case "PENDING": return "Đang chờ duyệt";
      case "REVIEWING": return "Đang xem xét";
      case "SHORTLISTED": return "Đã vào danh sách";
      case "INTERVIEWING": return "Đang phỏng vấn";
      case "ACCEPTED": return "Đã được nhận";
      case "REJECTED": return "Đã bị từ chối";
      case "CANCELLED": return "Ứng tuyển lại";
      default: return "Ứng tuyển ngay";
    }
  })();

  return (
    <div className="flex min-h-screen flex-col">
      <CandidateHomeHeader />

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-6 py-10">
        <Button as="a" href="/jobs" variant="link" className="w-fit" icon="arrow-left">
          Danh sách việc làm
        </Button>

        {isLoading ? (
          <p className="text-sm text-text-muted">Đang tải...</p>
        ) : isError || !job ? (
          <Card padding="lg" className="grid justify-items-center gap-3 text-center">
            <p className="text-text-body">Tin tuyển dụng này không còn hiển thị.</p>
            <Button as="a" href="/jobs" variant="secondary">
              Xem các tin khác
            </Button>
          </Card>
        ) : (
          <>
            <JobPostHeaderCard
              job={job}
              action={
                <div className="flex flex-wrap gap-2">
                  {isApplied ? (
                    <Button
                      type="button"
                      disabled
                      variant="secondary"
                    >
                      {applyLabel}
                    </Button>
                  ) : (
                    <Button
                      as="a"
                      href={applyHref}
                      iconAfter="arrow-right"
                      variant="primary"
                    >
                      {applyLabel}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant={saved ? "secondary" : "ghost"}
                    icon="bookmark"
                    loading={saving}
                    onClick={() => void toggleSave()}
                  >
                    {saved ? "Đã lưu" : "Lưu tin"}
                  </Button>
                </div>
              }
            />
            <JobPostContent
              job={job}
              aside={
                <JobPostCompanyCard
                  job={job}
                  footer={
                    <p className="text-sm text-text-muted">
                      {job.viewCount} lượt xem tin này.
                    </p>
                  }
                />
              }
            />
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

