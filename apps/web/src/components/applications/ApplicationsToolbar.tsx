"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { EmployerApplicationJobCount, EmployerApplicationsSort } from "@sip/shared-types";
import { JOB_STATUS_LABEL } from "@/lib/job-post-display";
import { formatNumber } from "@/lib/dashboard-format";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import { SEARCH_MIN_LENGTH, normalizeSearch } from "./useApplicationsPageParams";

const SEARCH_DEBOUNCE_MS = 300;

const SORT_OPTIONS: { value: EmployerApplicationsSort; label: string }[] = [
  { value: "oldest", label: "Nộp lâu nhất trước" },
  { value: "newest", label: "Mới nhất trước" },
  // D10: "khớp kỹ năng" — không gọi là "độ phù hợp" (điểm của Job Matcher).
  { value: "skills", label: "Khớp kỹ năng nhiều nhất" },
];

const ALL_JOBS = "";

/**
 * Ô tìm, ô chọn tin và sắp xếp của trang "Ứng viên". Ô tìm gửi từ khoá sau
 * 300ms ngừng gõ; dưới 2 ký tự thì coi như không tìm.
 */
export function ApplicationsToolbar({
  q,
  jobPostId,
  sort,
  jobs,
  fallbackJobTitle,
  onSearch,
  onJob,
  onSort,
}: {
  q: string;
  jobPostId: string | null;
  sort: EmployerApplicationsSort;
  jobs: EmployerApplicationJobCount[];
  /** Tên tin đang lọc khi tin đó không còn trong `jobs` (vd. từ khoá không khớp hồ sơ nào của tin). */
  fallbackJobTitle: string | undefined;
  onSearch: (q: string) => void;
  onJob: (jobPostId: string | null) => void;
  onSort: (sort: EmployerApplicationsSort) => void;
}) {
  const [text, setText] = useState(q);
  const [seenQ, setSeenQ] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hintId = useId();

  // URL đổi từ ngoài (Back, "Bỏ lọc"): ô tìm theo URL. Từ khoá do chính ô này gửi
  // thì giữ nguyên chữ đang gõ (kể cả khoảng trắng cuối).
  if (seenQ !== q) {
    setSeenQ(q);
    if (normalizeSearch(text) !== q) setText(q);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function changeText(value: string) {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = normalizeSearch(value);
      if (next !== q) onSearch(next);
    }, SEARCH_DEBOUNCE_MS);
  }

  const jobOptions = [
    { value: ALL_JOBS, label: "Tất cả tin" },
    ...jobs.map((job) => ({
      value: job.jobPostId,
      label: `${job.title}${job.status === "PUBLISHED" ? "" : ` · ${JOB_STATUS_LABEL[job.status].label}`} (${formatNumber(job.count)})`,
    })),
  ];
  if (jobPostId && !jobs.some((job) => job.jobPostId === jobPostId)) {
    jobOptions.push({ value: jobPostId, label: `${fallbackJobTitle ?? "Tin đang lọc"} (0)` });
  }

  const tooShort = text.trim().length > 0 && text.trim().length < SEARCH_MIN_LENGTH;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[220px] flex-[2_1_280px]">
          <Input
            type="search"
            icon="search"
            size="sm"
            value={text}
            onChange={(event) => changeText(event.target.value)}
            placeholder="Tìm theo tên hoặc email"
            aria-label="Tìm theo tên hoặc email ứng viên"
            maxLength={100}
            aria-describedby={tooShort ? hintId : undefined}
          />
          {/* Gợi ý đặt ngoài `Input`: truyền `hint` làm ô nhập bị dựng lại và mất focus khi đang gõ. */}
          {tooShort ? (
            <p id={hintId} className="mt-1 text-[13px] text-text-muted">
              Nhập ít nhất {SEARCH_MIN_LENGTH} ký tự để tìm.
            </p>
          ) : null}
        </div>
        <div className="min-w-[200px] flex-[1_1_220px]">
          <Select
            size="sm"
            aria-label="Lọc theo tin tuyển dụng"
            value={jobPostId ?? ALL_JOBS}
            onChange={(event) => onJob(event.target.value === ALL_JOBS ? null : event.target.value)}
            options={jobOptions}
          />
        </div>
        <div className="min-w-[200px] flex-[1_1_200px]">
          <Select
            size="sm"
            aria-label="Sắp xếp hồ sơ"
            value={sort}
            onChange={(event) => onSort(event.target.value as EmployerApplicationsSort)}
            options={SORT_OPTIONS}
          />
        </div>
      </div>
      {jobPostId ? (
        // Q1: điểm phù hợp chỉ tính theo từng tin, nên sắp theo điểm nằm ở trang hồ sơ của tin.
        <Link
          href={`/employer/jobs/${jobPostId}/applications`}
          className="inline-flex w-fit items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline"
        >
          Xếp theo độ phù hợp
          <Icon name="arrow-right" size={14} />
        </Link>
      ) : null}
    </div>
  );
}
