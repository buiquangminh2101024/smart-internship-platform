"use client";

import { use } from "react";
import { usePublicJobPost } from "@/hooks/useJobPosts";
import { JobPostContent, JobPostCompanyCard, JobPostHeaderCard } from "@/components/jobs/JobPostContent";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCandidateAuthStore } from "@/stores/auth-store";

/**
 * Chi tiết tin tuyển dụng công khai (6-FE-4, bản tối giản). Mỗi lần mở trang
 * gọi `GET /job-posts/:id` — chính lời gọi này tăng `viewCount` phía server.
 * Nút "Ứng tuyển ngay"/"Lưu tin" chỉ điều hướng đăng nhập: luồng ứng tuyển và
 * lưu tin thuộc Phase 7/8, KHÔNG implement ở đây.
 */
export default function PublicJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: job, isLoading, isError } = usePublicJobPost(id);
  const isLoggedIn = useCandidateAuthStore((state) => !!state.accessToken);

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
                  <Button as="a" href={isLoggedIn ? "/applications" : "/login"} iconAfter="arrow-right">
                    Ứng tuyển ngay
                  </Button>
                  <Button as="a" href={isLoggedIn ? "/saved-jobs" : "/login"} variant="secondary" icon="bookmark">
                    Lưu tin
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
