"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { JobPost, JobPostSort } from "@sip/shared-types";
import { useJobPostSearch } from "@/hooks/useJobPosts";
import { useCities, useIndustries, useSkills } from "@/hooks/useCatalog";
import { useCandidateAuthStore } from "@/stores/auth-store";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { JobFilters } from "@/components/jobs/JobFilters";
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { JobCard } from "@/components/ui/JobCard";
import { Select } from "@/components/ui/Select";
import { JOB_TYPE_LABEL, formatDeadline, formatSalary, isRecentlyPublished } from "@/lib/job-post-display";
import {
  activeFilterChips,
  clearedJobFilters,
  parseJobSearchParams,
  toJobSearchParams,
  toJobSearchQuery,
  type JobSearchFilters,
} from "@/lib/job-search-params";

/**
 * Tìm việc (bản đầu: 6-FE-4, `docs/05-frontend/phases/phase-06-job-recruitment/PLAN.md`; làm lại
 * cho vài trăm tin ở AD-26, `docs/05-frontend/phases/job-discovery/PLAN.md` bước F2): bộ lọc
 * trên URL, "Xem thêm", tổng số, sắp theo mức phù hợp và nhãn theo người xem cho ứng viên.
 */
export default function PublicJobsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <CandidateHomeHeader />
      {/* useSearchParams() cần Suspense boundary khi Next prerender route này. */}
      <Suspense
        fallback={
          <main className="mx-auto grid w-full max-w-6xl flex-1 gap-5 px-4 py-10 sm:px-6">
            <ListSkeleton />
          </main>
        }
      >
        <PublicJobsView />
      </Suspense>
      <SiteFooter />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label="Đang tải việc làm">
      {[0, 1, 2, 3].map((index) => (
        <Card key={index} padding="md" className="grid animate-pulse gap-3">
          <div className="flex items-center gap-3">
            <span className="h-11 w-11 rounded-lg bg-surface-page" />
            <div className="grid flex-1 gap-2">
              <span className="h-4 w-2/3 rounded bg-surface-page" />
              <span className="h-3 w-1/3 rounded bg-surface-page" />
            </div>
          </div>
          <span className="h-3 w-1/2 rounded bg-surface-page" />
          <span className="h-5 w-1/3 rounded bg-surface-page" />
        </Card>
      ))}
    </div>
  );
}

function JobItem({ job }: { job: JobPost }) {
  const viewer = job.viewer;
  const hasViewerInfo = !!viewer && (viewer.matchScore !== null || viewer.saved || viewer.applied);
  return (
    <JobCard
      href={`/jobs/${job.id}`}
      title={job.title}
      company={job.company.name}
      verified={job.company.isVerified}
      location={job.cityName ?? job.address ?? undefined}
      salary={formatSalary(job)}
      deadline={formatDeadline(job.expiresAt)}
      isNew={isRecentlyPublished(job.publishedAt)}
      tags={[JOB_TYPE_LABEL[job.jobType], ...(job.industryName ? [job.industryName] : [])]}
      footer={
        hasViewerInfo ? (
          <>
            {viewer.matchScore !== null ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-text-muted">
                Phù hợp <MatchScoreBadge score={viewer.matchScore} status="SCORED" />
              </span>
            ) : null}
            {viewer.applied ? (
              <Badge tone="success" icon="check">
                Đã ứng tuyển
              </Badge>
            ) : null}
            {viewer.saved ? (
              <Badge tone="neutral" icon="bookmark">
                Đã lưu
              </Badge>
            ) : null}
          </>
        ) : undefined
      }
    />
  );
}

const SORT_OPTIONS: Array<{ value: JobPostSort; label: string }> = [
  { value: "newest", label: "Mới nhất" },
  { value: "match", label: "Phù hợp nhất" },
];

function PublicJobsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const filters = useMemo(() => parseJobSearchParams(new URLSearchParams(search)), [search]);

  const hasHydrated = useCandidateAuthStore((state) => state.hasHydrated);
  const isCandidate = useCandidateAuthStore((state) => !!state.accessToken && state.user?.role === "CANDIDATE");

  const { data: cities } = useCities();
  const { data: industries } = useIndustries();
  const { data: skills } = useSkills();
  const catalogs = useMemo(() => ({ cities, industries, skills }), [cities, industries, skills]);

  const query = useMemo(() => toJobSearchQuery(filters, isCandidate), [filters, isCandidate]);
  // Chờ đọc xong phiên đăng nhập để không gọi một lần như khách rồi gọi lại như ứng viên.
  const list = useJobPostSearch(query, isCandidate ? "candidate" : "guest", hasHydrated);
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.total ?? null;

  const chips = activeFilterChips(filters, catalogs, isCandidate);
  const activeCount = chips.filter((chip) => chip.key !== "q").length;
  const sort: JobPostSort = isCandidate ? filters.sort : "newest";

  // Bộ lọc mới nhất đã gửi đi: router.replace chưa đổi URL ngay, nên hai thao tác liền nhau
  // (chọn hai kỹ năng) phải cộng dồn trên bản này chứ không trên `filters` của lần render trước.
  const latest = useRef(filters);
  useEffect(() => {
    latest.current = filters;
  }, [filters]);

  // Đổi bộ lọc thay URL tại chỗ (không thêm mục lịch sử, không cuộn lên đầu).
  const update = useCallback(
    (change: JobSearchFilters | ((prev: JobSearchFilters) => JobSearchFilters)) => {
      const next = typeof change === "function" ? change(latest.current) : change;
      latest.current = next;
      const qs = toJobSearchParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 content-start gap-5 px-4 py-10 sm:px-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold text-text-strong">Việc thực tập đang tuyển</h1>
        <p className="text-sm text-text-muted">Tin tuyển dụng từ doanh nghiệp đã được xác minh trên InternHub.</p>
      </div>

      <JobFilters
        filters={filters}
        onChange={update}
        catalogs={catalogs}
        isCandidate={isCandidate}
        activeCount={activeCount}
        total={total}
      />

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-text-muted">Đang lọc:</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => update(chip.without)}
              aria-label={`Bỏ bộ lọc ${chip.label}`}
              className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border border-brand-100 bg-brand-50 px-3 text-[13px] text-brand-800 hover:bg-brand-100"
            >
              <span className="truncate">{chip.label}</span>
              <Icon name="x" size={14} className="shrink-0" />
            </button>
          ))}
          <Button type="button" variant="link" size="sm" className="text-[13px]" onClick={() => update(clearedJobFilters(filters))}>
            Xoá tất cả
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-text-body" aria-live="polite">
          {total !== null ? (
            <>
              <span className="font-num font-semibold tabular-nums">{total.toLocaleString("vi-VN")}</span> việc làm
              {items.length < total ? (
                <span className="text-text-muted">
                  {" "}
                  · đang xem <span className="font-num tabular-nums">{items.length.toLocaleString("vi-VN")}</span>
                </span>
              ) : null}
            </>
          ) : null}
          {list.isPlaceholderData ? <span className="text-text-muted"> · đang cập nhật...</span> : null}
        </p>
        {isCandidate ? (
          <label className="inline-flex items-center gap-2 whitespace-nowrap text-sm text-text-muted">
            Sắp xếp
            <Select
              size="sm"
              className="w-auto"
              value={sort}
              onChange={(event) => update({ ...filters, sort: event.target.value as JobPostSort })}
              options={SORT_OPTIONS}
            />
          </label>
        ) : hasHydrated ? (
          <p className="text-[13px] text-text-muted">
            Mới nhất trước ·{" "}
            <Link href="/login" className="text-brand-700 underline-offset-2 hover:underline">
              Đăng nhập để xếp theo mức phù hợp
            </Link>
          </p>
        ) : null}
      </div>

      {!hasHydrated || (list.isPending && !list.data) ? (
        <ListSkeleton />
      ) : list.isError && !list.data ? (
        <Card padding="lg" className="grid justify-items-center gap-3 text-center">
          <Icon name="circle-alert" size={32} className="text-red-500" />
          <p className="text-sm text-text-body">Không tải được danh sách việc làm. Bạn thử lại sau ít phút.</p>
          <Button type="button" variant="secondary" icon="refresh-cw" onClick={() => void list.refetch()}>
            Thử lại
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <Card padding="lg" tone="sunken" className="grid justify-items-center gap-3 text-center">
          <Icon name="search-x" size={36} className="text-text-muted" />
          {chips.length > 0 ? (
            <>
              <p className="max-w-md text-sm text-text-body">
                Chưa có tin nào khớp bộ lọc của bạn. Thử bỏ bớt bộ lọc hoặc đổi từ khoá.
              </p>
              <Button type="button" variant="secondary" onClick={() => update(clearedJobFilters(filters))}>
                Xoá tất cả bộ lọc
              </Button>
            </>
          ) : (
            <p className="max-w-md text-sm text-text-body">Hiện chưa có tin tuyển dụng nào đang hiển thị. Bạn quay lại sau nhé.</p>
          )}
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2" aria-busy={list.isPlaceholderData}>
            {items.map((job) => (
              <JobItem key={job.id} job={job} />
            ))}
          </div>

          {list.hasNextPage ? (
            <div className="grid justify-items-center gap-2">
              {list.isFetchNextPageError ? (
                <p className="text-sm text-red-600">Không tải được thêm tin. Bấm để thử lại.</p>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                loading={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? "Đang tải..." : "Xem thêm"}
              </Button>
            </div>
          ) : null}

          {isCandidate ? (
            <p className="text-[13px] text-text-muted">
              Điểm phù hợp cập nhật hằng đêm theo hồ sơ của bạn, chỉ mang tính tham khảo.
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}
