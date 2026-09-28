"use client";

import type { JobRecommendation } from "@sip/shared-types";
import { useJobRecommendations } from "@/hooks/useJobRecommendations";
import { useCandidateAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { JobCard } from "@/components/ui/JobCard";
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge";
import { formatDeadline, formatSalary, isRecentlyPublished } from "@/lib/job-post-display";

// "Việc làm phù hợp" (B2, AD-14) — docs/05-frontend/phases/candidate-insights/PLAN.md.
// Ba trạng thái rỗng phải khác nhau: hồ sơ chưa có kỹ năng / không tin nào đạt
// ngưỡng / lỗi — không dùng chung câu chữ.

/**
 * Tin có thể lọt ngưỡng chỉ nhờ độ tương đồng ngữ nghĩa dù không khớp kỹ năng
 * nào (hồ sơ mỏng ⇒ trọng số dồn sang semantic) — nói rõ thay vì đổi công thức
 * chấm (dùng chung với trang tin và phía Employer).
 */
function lowConfidenceNote(match: JobRecommendation["match"]): string | null {
  if (match.skills.length > 0 && !match.skills.some((skill) => skill.status === "MATCHED")) {
    return "Độ tin cậy thấp — bạn chưa có kỹ năng nào tin này yêu cầu, điểm chủ yếu dựa trên mức liên quan chung giữa hồ sơ và tin.";
  }
  if (match.confidence === "LOW") {
    return "Độ tin cậy thấp — hồ sơ của bạn còn thiếu thông tin để so khớp chính xác.";
  }
  return null;
}

function RecommendationItem({ item }: { item: JobRecommendation }) {
  const { jobPost, match } = item;
  const note = lowConfidenceNote(match);

  const footer = (
    <div className="grid w-full gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm text-text-muted">
          <MatchScoreBadge score={match.score} status={match.status} />
          Phù hợp {match.score ?? 0}%
        </span>
        <Button as="a" href={`/jobs/${jobPost.id}`} variant="secondary" size="sm" iconAfter="arrow-right">
          Xem tin
        </Button>
      </div>
      {note ? (
        <p className="flex items-start gap-1.5 text-xs text-text-muted">
          <Icon name="info" size={14} className="mt-px shrink-0" />
          <span>{note}</span>
        </p>
      ) : null}
    </div>
  );

  return (
    <JobCard
      title={jobPost.title}
      company={jobPost.company.name}
      location={jobPost.cityName ?? jobPost.address ?? undefined}
      salary={formatSalary(jobPost)}
      deadline={formatDeadline(jobPost.expiresAt)}
      isNew={isRecentlyPublished(jobPost.publishedAt)}
      verified={jobPost.company.isVerified}
      tags={jobPost.skills.slice(0, 5).map((skill) => skill.name)}
      footer={footer}
    />
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Đang tải việc làm phù hợp">
      {[0, 1, 2].map((index) => (
        <Card key={index} padding="md" className="grid animate-pulse gap-3">
          <div className="flex items-center gap-3">
            <span className="h-11 w-11 rounded-lg bg-surface-page" />
            <div className="grid flex-1 gap-2">
              <span className="h-4 w-2/3 rounded bg-surface-page" />
              <span className="h-3 w-1/3 rounded bg-surface-page" />
            </div>
          </div>
          <span className="h-3 w-1/2 rounded bg-surface-page" />
        </Card>
      ))}
    </div>
  );
}

export function JobRecommendationsClient() {
  const user = useCandidateAuthStore((state) => state.user);
  const isLoggedIn = useCandidateAuthStore((state) => !!state.accessToken);
  const isCandidate = isLoggedIn && user?.role === "CANDIDATE";
  const { data, isError } = useJobRecommendations(isCandidate);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-strong">Việc làm phù hợp</h1>
        <p className="mt-1 text-sm text-text-muted">
          Các tin tuyển dụng gần đây hợp với kỹ năng và kinh nghiệm trong hồ sơ của bạn.
        </p>
      </div>

      {isError ? (
        <Card padding="lg" className="grid justify-items-center gap-2 text-center">
          <Icon name="circle-alert" size={32} className="text-red-500" />
          <p className="text-sm text-text-body">Không thể tải danh sách việc làm phù hợp. Vui lòng thử lại sau.</p>
        </Card>
      ) : !data ? (
        <ListSkeleton />
      ) : data.status === "INSUFFICIENT_PROFILE" ? (
        <Card padding="lg" tone="sunken" className="grid justify-items-center gap-4 text-center">
          <Icon name="user-round-pen" size={40} className="text-text-muted" />
          <p className="text-sm text-text-body">Hãy thêm kỹ năng vào hồ sơ để xem việc làm phù hợp.</p>
          <Button as="a" href="/profile" variant="secondary">
            Cập nhật hồ sơ
          </Button>
        </Card>
      ) : data.items.length === 0 ? (
        <Card padding="lg" tone="sunken" className="grid justify-items-center gap-4 text-center">
          <Icon name="search-x" size={40} className="text-text-muted" />
          <p className="max-w-md text-sm text-text-body">
            Chưa có tin nào thực sự phù hợp với hồ sơ hiện tại — thử bổ sung thêm kỹ năng/kinh nghiệm hoặc quay lại
            sau.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button as="a" href="/profile" variant="secondary">
              Cập nhật hồ sơ
            </Button>
            <Button as="a" href="/jobs" variant="ghost" icon="search">
              Xem tất cả việc làm
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {data.items.map((item) => (
            <RecommendationItem key={item.jobPost.id} item={item} />
          ))}
          <p className="text-xs text-text-muted">
            Điểm phù hợp chỉ mang tính tham khảo, tính theo hồ sơ hiện tại của bạn.
          </p>
        </div>
      )}
    </div>
  );
}
