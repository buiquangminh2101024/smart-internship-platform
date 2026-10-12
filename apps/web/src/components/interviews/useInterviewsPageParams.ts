"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AwaitingScheduleSort } from "@sip/shared-types";
import { vnTodayIso } from "@/lib/dashboard-format";
import { isIsoDate, mondayOf } from "@/lib/interview-format";

export type InterviewsTab = "awaiting" | "booked";
export type BookedView = "week" | "upcoming";

/** Tên tham số trên URL của `/employer/interviews` (PLAN FE, Phần 2 "Trạng thái trên URL"). */
type ParamName = "tab" | "view" | "week" | "job" | "cancelled" | "group" | "sort" | "page";

export interface InterviewsPageParams {
  tab: InterviewsTab;
  view: BookedView;
  /** Thứ Hai của tuần đang xem (YYYY-MM-DD); `null` là tuần hiện tại. */
  week: string | null;
  jobPostId: string | null;
  includeCancelled: boolean;
  /** Tab "Chờ đặt lịch": nhóm theo tin (bị bỏ qua khi lọc một tin). */
  groupByJob: boolean;
  sort: AwaitingScheduleSort;
  page: number;
}

/** Ngày hợp lệ → thứ Hai của tuần đó; sai hoặc là tuần hiện tại → `null`. */
function parseWeek(value: string | null): string | null {
  if (!value || !isIsoDate(value)) return null;
  const monday = mondayOf(value);
  return monday === mondayOf(vnTodayIso()) ? null : monday;
}

function parsePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/**
 * Nguồn sự thật duy nhất cho tab, chế độ, tuần, trang và bộ lọc của trang lịch
 * phỏng vấn. Giá trị mặc định không ghi lên URL. `update(..., "push")` cho đổi
 * tab / chế độ / trang (nút Back quay lại được), `"replace"` cho bộ lọc.
 */
export function useInterviewsPageParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const view: BookedView = searchParams.get("view") === "upcoming" ? "upcoming" : "week";
  const params: InterviewsPageParams = {
    tab: searchParams.get("tab") === "booked" || view === "upcoming" ? "booked" : "awaiting",
    view,
    week: parseWeek(searchParams.get("week")),
    jobPostId: searchParams.get("job") || null,
    includeCancelled: searchParams.get("cancelled") === "1",
    groupByJob: searchParams.get("group") === "job",
    sort: searchParams.get("sort") === "new" ? "newest" : "oldest",
    page: parsePage(searchParams.get("page")),
  };

  /** `null` xoá tham số khỏi URL. */
  function update(patch: Partial<Record<ParamName, string | null>>, how: "push" | "replace") {
    const next = new URLSearchParams(searchParams.toString());
    for (const [name, value] of Object.entries(patch)) {
      if (value === null || value === undefined) next.delete(name);
      else next.set(name, value);
    }
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    if (how === "push") router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  }

  return { params, update };
}
