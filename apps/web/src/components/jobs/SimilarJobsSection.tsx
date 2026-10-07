"use client";

import type { SimilarJobItem } from "@sip/shared-types";
import { useSimilarJobs } from "@/hooks/useJobPosts";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { JobCard } from "@/components/ui/JobCard";
import { formatDeadline, formatSalary, isRecentlyPublished } from "@/lib/job-post-display";

// "Việc làm tương tự" — docs/05-frontend/phases/similar-jobs/PLAN.md.
// Backend trả kết quả theo vector hoặc theo kỹ năng trùng (S6); hai nhánh hiển
// thị như nhau, không đọc `similarity`. Rỗng hoặc lỗi thì ẩn cả khối (S4).

// Tối đa 2 cột: JobCard đặt tiêu đề cạnh logo, ở 4 cột tiêu đề "Thực tập sinh …" bị cắt mất phần phân biệt.
const GRID = "grid gap-4 md:grid-cols-2";
const HEADING_ID = "similar-jobs-heading";

function SimilarJobLink({ item }: { item: SimilarJobItem }) {
  const { jobPost, sharedSkills } = item;
  return (
    // Cả thẻ là một link: bấm, Tab, mở tab mới đều được (JobCard không chứa phần tử tương tác nào).
    <a
      href={`/jobs/${jobPost.id}`}
      className="block h-full rounded-xl transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 [&>*]:h-full [&>*]:content-start"
    >
      <JobCard
        title={jobPost.title}
        company={jobPost.company.name}
        location={jobPost.cityName ?? jobPost.address ?? undefined}
        salary={formatSalary(jobPost)}
        deadline={formatDeadline(jobPost.expiresAt)}
        isNew={isRecentlyPublished(jobPost.publishedAt)}
        verified={jobPost.company.isVerified}
        footer={
          sharedSkills.length > 0 ? (
            <p className="inline-flex min-w-0 items-start gap-1.5 text-sm text-text-muted">
              <Icon name="link-2" size={14} className="mt-[3px] shrink-0" />
              <span>
                Cùng kỹ năng: <span className="text-text-body">{sharedSkills.join(", ")}</span>
              </span>
            </p>
          ) : undefined
        }
      />
    </a>
  );
}

function SimilarJobsSkeleton() {
  return (
    <div className={GRID} aria-busy="true" aria-label="Đang tải việc làm tương tự">
      {[0, 1, 2, 3].map((index) => (
        <Card key={index} padding="md" className="grid animate-pulse gap-3">
          <div className="flex items-center gap-3">
            <span className="h-11 w-11 shrink-0 rounded-lg bg-surface-page" />
            <div className="grid flex-1 gap-2">
              <span className="h-4 w-4/5 rounded bg-surface-page" />
              <span className="h-3 w-1/2 rounded bg-surface-page" />
            </div>
          </div>
          <span className="h-3 w-2/3 rounded bg-surface-page" />
        </Card>
      ))}
    </div>
  );
}

export function SimilarJobsSection({ jobId }: { jobId: string }) {
  const { data, isLoading } = useSimilarJobs(jobId);

  if (!isLoading && (!data || data.length === 0)) return null;

  return (
    <section aria-labelledby={HEADING_ID} className="mt-6 grid gap-4">
      <h2 id={HEADING_ID} className="text-lg font-semibold text-text-strong">
        Việc làm tương tự
      </h2>
      {isLoading || !data ? (
        <SimilarJobsSkeleton />
      ) : (
        <ul className={GRID}>
          {data.map((item) => (
            <li key={item.jobPost.id}>
              <SimilarJobLink item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
