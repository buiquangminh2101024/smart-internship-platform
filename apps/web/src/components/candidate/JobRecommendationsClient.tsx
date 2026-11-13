"use client";

import type { JobRecommendation, ProfileInsightSuggestion } from "@sip/shared-types";
import { useJobRecommendations } from "@/hooks/useJobRecommendations";
import { useCandidateAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { JobCard } from "@/components/ui/JobCard";
import { MatchReasons } from "@/components/jobs/MatchReasons";
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge";
import { ProfileCompletenessCard } from "@/components/candidate/ProfileCompletenessCard";
import { formatDeadline, formatSalary, isRecentlyPublished } from "@/lib/job-post-display";
import { PROFILE_COMPLETENESS_META } from "@/lib/profile-completeness";

// "Việc làm phù hợp" — AD-26, docs/05-frontend/phases/job-discovery/PLAN.md bước F1
// (nền: B2/AD-14, docs/05-frontend/phases/candidate-insights/PLAN.md).
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
    <div className="grid w-full gap-3">
      <MatchReasons result={match} />
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
        <p className="flex items-start gap-1.5 text-[13px] text-text-muted">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
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

const EVIDENCE_PREVIEW = 3;

/** "Kỹ năng nên bổ sung" — SKILL_GAP / INDUSTRY_MISMATCH do server tính từ trang đầu. */
function SkillGapSuggestions({ suggestions }: { suggestions: ProfileInsightSuggestion[] }) {
  const skillGaps = suggestions.filter((suggestion) => suggestion.kind === "SKILL_GAP");
  const industry = suggestions.filter((suggestion) => suggestion.kind === "INDUSTRY_MISMATCH");
  if (skillGaps.length === 0 && industry.length === 0) return null;

  return (
    <Card padding="sm" className="grid gap-4">
      {skillGaps.length > 0 ? (
        <SuggestionGroup title="Kỹ năng nên bổ sung" hint="Kỹ năng bạn còn thiếu mà nhiều tin phù hợp nhất cần." items={skillGaps} />
      ) : null}
      {industry.length > 0 ? <SuggestionGroup title="Có thể bạn muốn cân nhắc" items={industry} /> : null}
    </Card>
  );
}

function SuggestionGroup({ title, hint, items }: { title: string; hint?: string; items: ProfileInsightSuggestion[] }) {
  return (
    <div className="grid gap-2">
      <div>
        <h2 className="text-sm font-semibold text-text-strong">{title}</h2>
        {hint ? <p className="text-[13px] text-text-muted">{hint}</p> : null}
      </div>
      <ul className="grid gap-2">
        {items.map((suggestion) => {
          const evidence = suggestion.evidence ?? [];
          const shown = evidence.slice(0, EVIDENCE_PREVIEW);
          const rest = evidence.length - shown.length;
          return (
            <li key={suggestion.text} className="text-sm text-text-body">
              <span>{suggestion.text}</span>
              {evidence.length > 0 ? (
                <details className="mt-0.5">
                  <summary className="cursor-pointer text-[13px] text-text-muted hover:text-text-strong">
                    Xem {evidence.length} tin liên quan
                  </summary>
                  <ul className="mt-1 grid gap-0.5 text-[13px] text-text-muted">
                    {shown.map((entry) => (
                      <li key={entry}>– {entry}</li>
                    ))}
                    {rest > 0 ? <li>và {rest} tin khác</li> : null}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
      {items.some((item) => item.kind === "SKILL_GAP") ? (
        <Button as="a" href={PROFILE_COMPLETENESS_META.skills.href} variant="link" size="sm" className="w-fit text-[13px]">
          Thêm kỹ năng vào hồ sơ
        </Button>
      ) : null}
    </div>
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
  const { data, isError, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } =
    useJobRecommendations(isCandidate);

  const first = data?.pages[0];
  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-strong">Việc làm phù hợp</h1>
        <p className="mt-1 text-sm text-text-muted">
          Các tin tuyển dụng hợp với kỹ năng và kinh nghiệm trong hồ sơ của bạn, phù hợp nhất ở trên.
        </p>
        <p className="mt-1 text-[13px] text-text-subtle">Không hiện tin bạn đã ứng tuyển hoặc đã được mời.</p>
      </div>

      {isError && !first ? (
        <Card padding="lg" className="grid justify-items-center gap-2 text-center">
          <Icon name="circle-alert" size={32} className="text-red-500" />
          <p className="text-sm text-text-body">Không thể tải danh sách việc làm phù hợp. Vui lòng thử lại sau.</p>
        </Card>
      ) : !first ? (
        <ListSkeleton />
      ) : first.status === "INSUFFICIENT_PROFILE" ? (
        <Card padding="lg" tone="sunken" className="grid justify-items-center gap-4 text-center">
          <Icon name="user-round-pen" size={40} className="text-text-muted" />
          <p className="text-sm text-text-body">Hãy thêm kỹ năng vào hồ sơ để xem việc làm phù hợp.</p>
          <Button as="a" href={PROFILE_COMPLETENESS_META.skills.href} variant="secondary">
            Thêm kỹ năng
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          <ProfileCompletenessCard variant="compact" />

          {items.length === 0 ? (
            <Card padding="lg" tone="sunken" className="grid justify-items-center gap-4 text-center">
              <Icon name="search-x" size={40} className="text-text-muted" />
              <p className="max-w-md text-sm text-text-body">
                Chưa có tin nào thực sự phù hợp với hồ sơ hiện tại — thử bổ sung thêm kỹ năng/kinh nghiệm hoặc quay
                lại sau.
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
            <>
              <SkillGapSuggestions suggestions={first.suggestions} />

              <p className="text-sm text-text-body" aria-live="polite">
                <span className="font-num font-semibold tabular-nums">{first.total.toLocaleString("vi-VN")}</span> tin
                phù hợp với hồ sơ của bạn
                {first.total > items.length ? (
                  <span className="text-text-muted"> · đang xem {items.length.toLocaleString("vi-VN")}</span>
                ) : null}
              </p>

              {items.map((item) => (
                <RecommendationItem key={item.jobPost.id} item={item} />
              ))}

              {hasNextPage ? (
                <div className="grid justify-items-center gap-2">
                  {isFetchNextPageError ? (
                    <p className="text-sm text-red-600">Không tải được thêm tin. Bấm để thử lại.</p>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    loading={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                  >
                    {isFetchingNextPage ? "Đang tải..." : "Xem thêm"}
                  </Button>
                </div>
              ) : null}

              {first.source === "LIVE" ? (
                <p className="flex items-start gap-1.5 text-[13px] text-text-muted">
                  <Icon name="info" size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Danh sách đầy đủ sẽ có sau khi hệ thống cập nhật hồ sơ của bạn (trong vòng một ngày).
                  </span>
                </p>
              ) : null}

              <p className="text-[13px] text-text-muted">
                Điểm phù hợp chỉ mang tính tham khảo, tính theo hồ sơ hiện tại của bạn.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
