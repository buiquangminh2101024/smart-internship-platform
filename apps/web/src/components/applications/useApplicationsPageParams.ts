"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ApplicationStatus, EmployerApplicationsSort } from "@sip/shared-types";
import { APPLICATION_STATUSES } from "@/lib/application-status";
import type { CompanyApplicationsQuery } from "@/hooks/useApplications";

/** Tên tham số trên URL của `/employer/applications` (PLAN FE "URL giữ bộ lọc"). */
type ParamName = "status" | "job" | "q" | "sort" | "page";

/** Từ khoá ngắn hơn thì không tìm; dài hơn thì cắt (giới hạn của API). */
export const SEARCH_MIN_LENGTH = 2;
const SEARCH_MAX_LENGTH = 100;

const SORTS: EmployerApplicationsSort[] = ["oldest", "newest", "skills"];

/** Cùng mặc định với API: tab Chờ duyệt xếp hồ sơ nộp lâu nhất lên trước. */
export function defaultSortFor(status: ApplicationStatus | null): EmployerApplicationsSort {
  return status === "PENDING" ? "oldest" : "newest";
}

/** Từ khoá gửi API: cắt khoảng trắng, dưới 2 ký tự ⇒ rỗng. */
export function normalizeSearch(value: string): string {
  const trimmed = value.trim().slice(0, SEARCH_MAX_LENGTH);
  return trimmed.length >= SEARCH_MIN_LENGTH ? trimmed : "";
}

function parsePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}

/**
 * Nguồn sự thật duy nhất cho tab, bộ lọc, sắp xếp và trang của trang "Ứng viên".
 * Giá trị lạ trên URL bị bỏ qua (dùng mặc định); giá trị mặc định không ghi lên
 * URL. `update(..., "push")` cho đổi tab / trang (nút Back quay lại được),
 * `"replace"` cho ô tìm, ô chọn tin và sắp xếp.
 */
export function useApplicationsPageParams() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawStatus = searchParams.get("status");
  const status = APPLICATION_STATUSES.find((value) => value === rawStatus) ?? null;
  const rawSort = searchParams.get("sort");
  const query: CompanyApplicationsQuery = {
    status,
    jobPostId: searchParams.get("job") || null,
    q: normalizeSearch(searchParams.get("q") ?? ""),
    sort: SORTS.find((value) => value === rawSort) ?? defaultSortFor(status),
    page: parsePage(searchParams.get("page")),
  };

  /** `null` xoá tham số khỏi URL. */
  function update(patch: Partial<Record<ParamName, string | null>>, how: "push" | "replace") {
    const next = new URLSearchParams(searchParams.toString());
    for (const [name, value] of Object.entries(patch)) {
      if (value === null || value === undefined) next.delete(name);
      else next.set(name, value);
    }
    const search = next.toString();
    const href = search ? `${pathname}?${search}` : pathname;
    if (how === "push") router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  }

  return { query, update };
}
