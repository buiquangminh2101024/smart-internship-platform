"use client";

import { useEffect, useRef, useState } from "react";
import type { EmployerInterview } from "@sip/shared-types";
import { useUpcomingInterviews, type InterviewListFilter } from "@/hooks/useInterviews";
import { formatNumber } from "@/lib/dashboard-format";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { BookedEmpty, DayGroupList, groupByDay, type DayOpenState } from "./DayGroupList";

/** Gộp các trang, bỏ trùng theo `id` (buổi bị đổi giờ giữa hai lần tải có thể nằm ở hai trang). */
function mergePages(pages: { items: EmployerInterview[] }[]): EmployerInterview[] {
  const byId = new Map<string, EmployerInterview>();
  for (const page of pages) for (const interview of page.items) byId.set(interview.id, interview);
  return [...byId.values()];
}

/**
 * Chế độ "Sắp tới" (D12–D14): lịch từ đầu ngày hôm nay trở đi, nhóm theo ngày,
 * có dòng phân cách tháng. Tải thêm bằng nút, không tự tải khi cuộn.
 */
export function UpcomingView({
  today,
  now,
  filter,
  dayState,
  highlightId,
  onReschedule,
  onCancel,
  onOpenAwaiting,
}: {
  today: string;
  now: number;
  filter: InterviewListFilter;
  dayState: DayOpenState;
  highlightId: string | null;
  onReschedule: (interview: EmployerInterview) => void;
  onCancel: (interview: EmployerInterview) => void;
  onOpenAwaiting: () => void;
}) {
  const query = useUpcomingInterviews(filter);
  const [announcement, setAnnouncement] = useState("");
  // Tự giữ cờ đang tải: giữa các lần thử lại, `isFetchingNextPage` có lúc về false.
  const [loadingMore, setLoadingMore] = useState(false);
  const endRef = useRef<HTMLParagraphElement>(null);
  const focusEndRef = useRef(false);

  const items = query.data ? mergePages(query.data.pages) : [];
  const reachedEnd = query.data !== undefined && !query.hasNextPage;

  // Bấm "Tải thêm" tới trang cuối: nút biến mất, focus chuyển vào dòng báo hết.
  useEffect(() => {
    if (reachedEnd && focusEndRef.current) {
      focusEndRef.current = false;
      endRef.current?.focus();
    }
  }, [reachedEnd]);

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <BlockSkeleton height={40} />
        <BlockSkeleton height={320} />
      </div>
    );
  }
  // Chỉ báo lỗi cả khối khi chưa có trang nào; lỗi "Tải thêm" giữ danh sách đã có.
  if (query.isError && !query.data) {
    return <BlockError what="lịch sắp tới" onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }

  if (items.length === 0) {
    return (
      <BookedEmpty
        title={
          filter.jobPostId
            ? "Tin này chưa có buổi phỏng vấn nào từ hôm nay trở đi"
            : "Chưa có buổi phỏng vấn nào từ hôm nay trở đi"
        }
        onOpenAwaiting={onOpenAwaiting}
      />
    );
  }

  const days = groupByDay(items);
  const loading = loadingMore || query.isFetchingNextPage;

  async function loadMore() {
    if (loading) return;
    setAnnouncement("");
    setLoadingMore(true);
    const before = items.length;
    const result = await query.fetchNextPage();
    setLoadingMore(false);
    if (result.isFetchNextPageError) {
      setAnnouncement("Chưa tải thêm được. Kiểm tra kết nối rồi bấm lại.");
      return;
    }
    const after = result.data ? mergePages(result.data.pages).length : before;
    setAnnouncement(`Đã tải thêm ${formatNumber(Math.max(0, after - before))} buổi`);
    if (!result.hasNextPage) focusEndRef.current = true;
  }

  return (
    <div className="flex flex-col gap-4">
      <DayGroupList
        days={days}
        today={today}
        defaultOpen={days[0]?.date ?? null}
        overrides={dayState.overrides}
        onToggle={dayState.setOpen}
        onReset={() => dayState.reset(days.map((day) => day.date))}
        now={now}
        highlightId={highlightId}
        monthDividers
        summaryPrefix={
          <>
            Đã tải <span className="font-num tabular-nums">{formatNumber(items.length)}</span> buổi từ hôm nay ·{" "}
          </>
        }
        onReschedule={onReschedule}
        onCancel={onCancel}
      />

      <div className="flex flex-col items-center gap-2">
        {reachedEnd ? (
          <p
            ref={endRef}
            tabIndex={-1}
            className="rounded-md px-2 text-text-muted outline-brand-500 focus-visible:outline-2"
          >
            Đã hiện hết lịch sắp tới.
          </p>
        ) : (
          // aria-disabled thay cho disabled để focus ở lại nút trong lúc tải.
          <button
            type="button"
            aria-disabled={loading || undefined}
            onClick={() => void loadMore()}
            className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border-default bg-surface-card px-4 text-sm font-semibold text-text-strong transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none max-[720px]:w-full ${
              loading ? "cursor-progress opacity-75" : "cursor-pointer hover:bg-surface-hover"
            }`}
          >
            {loading ? "Đang tải…" : "Tải thêm lịch"}
          </button>
        )}
        {query.isFetchNextPageError && !loading ? (
          <p className="text-center text-red-700">Chưa tải thêm được. Kiểm tra kết nối rồi bấm lại.</p>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
      </div>
    </div>
  );
}
