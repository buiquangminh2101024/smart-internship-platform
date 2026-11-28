"use client";

import { useRouter } from "next/navigation";
import { usePublicJobPosts } from "@/hooks/useJobPosts";
import { JOB_TYPE_LABEL, formatDeadline, formatSalary, isRecentlyPublished } from "@/lib/job-post-display";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { JobCard } from "@/components/ui/JobCard";

/**
 * Section "Tin mới trong tuần" ở trang chủ Candidate — thay dữ liệu tĩnh
 * `lib/sample-jobs.ts` bằng API thật `GET /job-posts` sau khi Phase 6 có tin
 * tuyển dụng công khai.
 */
export function LatestJobsSection() {
  const router = useRouter();
  const { data, isLoading } = usePublicJobPosts({});
  const jobs = (data?.items ?? []).slice(0, 4);

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-6 px-6 py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold tracking-wider text-brand-600 uppercase">Cơ hội mới nhất</span>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-text-strong sm:text-3xl">Tin mới trong tuần</h2>
        </div>
        <Button as="a" href="/jobs" variant="secondary" iconAfter="arrow-right">
          Xem tất cả tin
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-text-muted">Đang tải tin tuyển dụng...</p>
      ) : jobs.length === 0 ? (
        <Card padding="lg" className="text-center text-sm text-text-muted">
          Chưa có tin tuyển dụng nào được đăng. Hãy quay lại sau nhé!
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              title={job.title}
              company={job.company.name}
              verified={job.company.isVerified}
              location={job.cityName ?? job.address ?? undefined}
              salary={formatSalary(job)}
              deadline={formatDeadline(job.expiresAt)}
              tags={[JOB_TYPE_LABEL[job.jobType], ...(job.industryName ? [job.industryName] : [])]}
              isNew={isRecentlyPublished(job.publishedAt)}
              onClick={() => router.push(`/jobs/${job.id}`)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
