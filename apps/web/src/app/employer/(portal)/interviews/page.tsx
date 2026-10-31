"use client";

import { Suspense, useCallback, useRef, useState, type KeyboardEvent } from "react";
import { formatNumber } from "@/lib/dashboard-format";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { BlockSkeleton } from "@/components/dashboard/BlockState";
import { AwaitingScheduleTab, useAwaitingTab } from "@/components/interviews/AwaitingScheduleTab";
import { BookedInterviewsTab } from "@/components/interviews/BookedInterviewsTab";
import { useInterviewsPageParams, type InterviewsTab } from "@/components/interviews/useInterviewsPageParams";

let toastIdCounter = 0;

function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const push = useCallback((tone: ToastData["tone"], message: string) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, tone, message }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  return { toasts, push, dismiss };
}

const TABS: { value: InterviewsTab; label: string }[] = [
  { value: "awaiting", label: "Chờ đặt lịch" },
  { value: "booked", label: "Lịch đã đặt" },
];

const tabId = (tab: InterviewsTab) => `interviews-tab-${tab}`;
const PANEL_ID = "interviews-panel";

/** Lịch phỏng vấn của Employer: tab "Chờ đặt lịch" (mặc định) và "Lịch đã đặt". */
export default function EmployerInterviewsPage() {
  // useSearchParams() cần Suspense boundary khi Next prerender route này.
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1240px] p-4 sm:p-6">
          <BlockSkeleton height={480} />
        </div>
      }
    >
      <InterviewsPageContent />
    </Suspense>
  );
}

function InterviewsPageContent() {
  const { params, update } = useInterviewsPageParams();
  const { toasts, push, dismiss } = useToast();
  const awaiting = useAwaitingTab(params, push);
  const tabRefs = useRef<Partial<Record<InterviewsTab, HTMLButtonElement | null>>>({});

  function selectTab(tab: InterviewsTab) {
    if (tab === params.tab) return;
    update(tab === "booked" ? { tab: "booked" } : { tab: null, view: null }, "push");
  }

  function handleTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.value === params.tab);
    const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!.value;
    selectTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 p-4 text-sm text-text-body sm:p-6">
      <header>
        <h1 className="text-[28px] leading-[1.3] font-bold text-text-strong">Lịch phỏng vấn</h1>
        <p className="mt-1 text-text-muted">Đặt lịch cho hồ sơ đã lọt vào vòng trong và theo dõi các buổi đã hẹn.</p>
      </header>

      <div
        role="tablist"
        aria-label="Lịch phỏng vấn"
        onKeyDown={handleTabKey}
        className="flex gap-1 border-b border-border-subtle"
      >
        {TABS.map((tab) => {
          const isSelected = tab.value === params.tab;
          const count = tab.value === "awaiting" ? awaiting.awaitingTotal : null;
          return (
            <button
              key={tab.value}
              ref={(element) => {
                tabRefs.current[tab.value] = element;
              }}
              type="button"
              role="tab"
              id={tabId(tab.value)}
              aria-selected={isSelected}
              aria-controls={PANEL_ID}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => selectTab(tab.value)}
              className={`-mb-px inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 text-sm font-bold whitespace-nowrap transition-colors duration-150 focus-visible:rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none ${
                isSelected ? "border-brand-600 text-brand-700" : "border-transparent text-text-muted hover:text-text-strong"
              }`}
            >
              {tab.label}
              {count !== null ? (
                <span
                  className={`inline-grid h-[22px] min-w-[26px] place-items-center rounded-full px-2 font-num text-[13px] font-bold tabular-nums ${
                    count > 0 ? "bg-marigold-100 text-marigold-800" : "bg-surface-hover text-text-muted"
                  }`}
                >
                  <span className="sr-only">: </span>
                  {formatNumber(count)}
                  <span className="sr-only"> hồ sơ</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(params.tab)}>
        {params.tab === "awaiting" ? (
          <AwaitingScheduleTab params={params} update={update} state={awaiting} />
        ) : (
          <BookedInterviewsTab params={params} update={update} notify={push} />
        )}
      </div>

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
