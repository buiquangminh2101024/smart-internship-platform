"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { EMPLOYER_INTERVIEWS_KEY } from "@/hooks/useInterviews";
import { useEmployerJobPostOptions } from "@/hooks/useJobPosts";
import { vnTodayIso } from "@/lib/dashboard-format";
import { addDaysIso, formatWeekRange, mondayOf, vnDateAndMinutes } from "@/lib/interview-format";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import type { ToastData } from "@/components/ui/Toast";
import { DashButton } from "@/components/dashboard/DashButton";
import { SegmentedControl } from "@/components/dashboard/admin/AdminPanel";
import { useDayFocus, type DayOpenState } from "./DayGroupList";
import { UpcomingView } from "./UpcomingView";
import { useInterviewActions } from "./useInterviewActions";
import type { BookedView, InterviewsPageParams, useInterviewsPageParams } from "./useInterviewsPageParams";
import { WeekView } from "./WeekView";

type Notify = (tone: ToastData["tone"], message: string) => void;
type UpdateParams = ReturnType<typeof useInterviewsPageParams>["update"];

const VIEW_OPTIONS = [
  { value: "week" as const, label: "Theo tuần" },
  { value: "upcoming" as const, label: "Sắp tới" },
];

/** Giờ hiện tại, cập nhật mỗi phút: buổi tới giờ bắt đầu thì mất nút Đổi / Huỷ. */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Ngày đang mở của mỗi chế độ, theo khoá ngày. Nằm trong state của tab nên
 * chuyển tuần rồi quay lại vẫn giữ; tải lại trang thì về mặc định.
 */
function useDayOpenState(view: BookedView): DayOpenState {
  const [overrides, setOverrides] = useState<Record<BookedView, Record<string, boolean>>>({ week: {}, upcoming: {} });
  return {
    overrides: overrides[view],
    setOpen: (date, open) => setOverrides((prev) => ({ ...prev, [view]: { ...prev[view], [date]: open } })),
    reset: (dates) =>
      setOverrides((prev) => {
        const next = { ...prev[view] };
        for (const date of dates) delete next[date];
        return { ...prev, [view]: next };
      }),
  };
}

/**
 * Tab "Lịch đã đặt": chọn chế độ (Theo tuần / Sắp tới), điều hướng tuần, lọc
 * theo tin, hiện lịch đã huỷ. Đổi / huỷ xong thì tải lại danh sách đang xem để
 * buổi vừa đổi về đúng ngày mới, buổi vừa huỷ biến mất hoặc hiện nhãn "Đã huỷ".
 */
export function BookedInterviewsTab({
  params,
  update,
  notify,
}: {
  params: InterviewsPageParams;
  update: UpdateParams;
  notify: Notify;
}) {
  const queryClient = useQueryClient();
  const now = useNow();
  const today = vnTodayIso(new Date(now));
  const currentMonday = mondayOf(today);
  const monday = params.week ?? currentMonday;
  const isCurrentWeek = monday === currentMonday;
  const filter = { jobPostId: params.jobPostId ?? undefined, includeCancelled: params.includeCancelled };
  const dayState = useDayOpenState(params.view);
  const dayFocus = useDayFocus(dayState);
  const jobs = useEmployerJobPostOptions();

  const actions = useInterviewActions({
    notify,
    onChanged: (change) => {
      if (change.kind === "scheduled") return;
      // Huỷ lịch: hồ sơ quay lại nhóm chờ đặt lịch, số trên tab "Chờ đặt lịch" phải tăng.
      if (change.kind === "cancelled") {
        void queryClient.invalidateQueries({ queryKey: [...EMPLOYER_INTERVIEWS_KEY, "awaiting-page"] });
      }
      const { interview } = change;
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: [...EMPLOYER_INTERVIEWS_KEY, "list"] }),
        queryClient.invalidateQueries({ queryKey: [...EMPLOYER_INTERVIEWS_KEY, "upcoming"] }),
      ]).then(() => {
        // Tải lại xong, dòng vừa đổi có thể đã sang ngày khác (nhóm đang đóng); dòng vừa
        // huỷ biến mất hoặc mất nút. Mở ngày đó và đưa focus về dòng / tiêu đề ngày, không
        // để focus rơi về đầu trang.
        const date = vnDateAndMinutes(interview.scheduledAt).date;
        const fallback = () => document.getElementById("interviews-tab-booked")?.focus();
        if (change.kind === "rescheduled" || params.includeCancelled) {
          dayFocus.focusInterview(interview.id, date, fallback);
        } else {
          dayFocus.focusDay(date, fallback);
        }
      });
    },
  });

  function goToWeek(next: string) {
    update({ week: next === currentMonday ? null : next }, "replace");
  }

  function openAwaiting() {
    update({ tab: null, view: null }, "push");
  }

  const jobOptions = [
    { value: "", label: "Tất cả tin" },
    ...(jobs.data ?? []).map((job) => ({ value: job.id, label: job.title })),
  ];
  if (params.jobPostId && !jobOptions.some((option) => option.value === params.jobPostId)) {
    jobOptions.push({ value: params.jobPostId, label: jobs.isPending ? "Đang tải tên tin…" : "Tin đang lọc" });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 max-[720px]:flex-col max-[720px]:items-stretch">
        <div className="min-[721px]:w-fit">
          <SegmentedControl
            label="Chế độ xem lịch"
            size="md"
            fullWidth
            options={VIEW_OPTIONS}
            value={params.view}
            onChange={(value) =>
              update(value === "upcoming" ? { view: "upcoming", tab: null } : { view: null, tab: "booked" }, "push")
            }
          />
        </div>

        {params.view === "week" ? (
          <div className="flex items-center gap-1.5 max-[720px]:justify-between">
            <WeekNavButton label="Tuần trước" icon="chevron-left" onClick={() => goToWeek(addDaysIso(monday, -7))} />
            <p
              aria-live="polite"
              className="min-w-[150px] text-center font-num font-bold text-text-strong tabular-nums max-[720px]:flex-1"
            >
              <span className="sr-only">Tuần </span>
              {formatWeekRange(monday)}
            </p>
            <WeekNavButton label="Tuần sau" icon="chevron-right" onClick={() => goToWeek(addDaysIso(monday, 7))} />
            <DashButton
              variant="secondary"
              size="sm"
              disabled={isCurrentWeek}
              onClick={() => goToWeek(currentMonday)}
              className="ml-1"
            >
              Tuần này
            </DashButton>
          </div>
        ) : null}

        <ToolbarField>
          <Select
            size="sm"
            aria-label="Lọc theo tin tuyển dụng"
            options={jobOptions}
            value={params.jobPostId ?? ""}
            onChange={(event) => update({ job: event.target.value || null, page: null }, "replace")}
            className="min-[721px]:w-[240px] min-[721px]:truncate"
          />
        </ToolbarField>

        <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-[13px] font-semibold text-text-body">
          <input
            type="checkbox"
            checked={params.includeCancelled}
            onChange={(event) => update({ cancelled: event.target.checked ? "1" : null }, "replace")}
            className="h-[18px] w-[18px] cursor-pointer accent-brand-600"
          />
          Hiện lịch đã huỷ
        </label>
      </div>

      {params.view === "week" ? (
        <WeekView
          monday={monday}
          isCurrentWeek={isCurrentWeek}
          today={today}
          now={now}
          filter={filter}
          dayState={dayState}
          dayFocus={dayFocus}
          onReschedule={actions.reschedule}
          onCancel={actions.cancel}
          onOpenAwaiting={openAwaiting}
        />
      ) : (
        <UpcomingView
          today={today}
          now={now}
          filter={filter}
          dayState={dayState}
          highlightId={dayFocus.highlightId}
          onReschedule={actions.reschedule}
          onCancel={actions.cancel}
          onOpenAwaiting={openAwaiting}
        />
      )}

      {actions.dialogs}
    </div>
  );
}

function WeekNavButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-border-default bg-surface-card text-text-strong transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none"
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

function ToolbarField({ children }: { children: ReactNode }) {
  return <div className="min-w-0 max-[720px]:w-full">{children}</div>;
}
