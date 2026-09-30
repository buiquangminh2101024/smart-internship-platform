"use client";

import { useId, useState, type ReactNode } from "react";
import type { ApplicationStatus, CandidateInterview } from "@sip/shared-types";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { vnTodayIso } from "@/lib/dashboard-format";
import {
  MODE_ICON,
  MODE_LABEL,
  TZ_LABEL,
  daysBetween,
  formatInterviewWhen,
  formatLongDate,
  hhmm,
  interviewEndMs,
  isMeetingUrl,
  vnDateAndMinutes,
} from "@/lib/interview-format";

type MainState = "upcoming" | "past" | "cancelled";

function byTimeDesc(a: CandidateInterview, b: CandidateInterview) {
  return new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime();
}

/** Nhãn thời gian còn lại của buổi sắp tới / đang diễn ra. */
function relativeLabel(interview: CandidateInterview, now: number): string {
  if (new Date(interview.scheduledAt).getTime() <= now) return "Đang diễn ra";
  const days = daysBetween(vnTodayIso(new Date(now)), vnDateAndMinutes(interview.scheduledAt).date);
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Ngày mai";
  return `Còn ${days} ngày`;
}

/**
 * Khối "Lịch phỏng vấn" trong thẻ hồ sơ của ứng viên (FE-5). Buổi chính là
 * buổi sắp tới / đang diễn ra; không có thì là buổi gần nhất (đã diễn ra hoặc
 * đã huỷ, kèm lý do). Các buổi đã huỷ khác gom trong "Lịch đã huỷ (N)".
 */
export function CandidateInterviewBlock({
  interviews,
  applicationStatus,
}: {
  interviews: CandidateInterview[];
  applicationStatus: ApplicationStatus;
}) {
  const titleId = useId();
  // Mốc "bây giờ" lấy một lần khi hiện khối: đủ để chia sắp tới / đã diễn ra.
  const [now] = useState(Date.now);
  if (interviews.length === 0) return null;

  const upcoming = interviews
    .filter((interview) => interview.status === "SCHEDULED" && interviewEndMs(interview.scheduledAt, interview.durationMinutes) > now)
    .sort((a, b) => -byTimeDesc(a, b))[0];
  const recent = [...interviews].sort(byTimeDesc);
  const main = upcoming ?? recent[0]!;
  const state: MainState =
    main.status === "CANCELLED"
      ? "cancelled"
      : interviewEndMs(main.scheduledAt, main.durationMinutes) > now
        ? "upcoming"
        : "past";
  const otherCancelled = recent.filter((interview) => interview.status === "CANCELLED" && interview.id !== main.id);
  const when = formatInterviewWhen(main.scheduledAt, main.durationMinutes);

  return (
    <section
      aria-labelledby={titleId}
      className={`flex flex-col gap-2.5 rounded-[10px] border px-4 py-3.5 text-sm ${
        state === "upcoming" ? "border-brand-100 bg-brand-50" : "border-border-subtle bg-surface-page"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 id={titleId} className="flex items-center gap-2 text-[15px] font-bold text-text-strong">
          <Icon
            name={state === "cancelled" ? "calendar-x" : "calendar-clock"}
            size={18}
            className={state === "upcoming" ? "text-brand-600" : "text-text-muted"}
          />
          Lịch phỏng vấn
        </h4>
        {state === "upcoming" ? (
          <Badge tone="brand">{relativeLabel(main, now)}</Badge>
        ) : state === "past" ? (
          <Badge tone="neutral">Đã diễn ra</Badge>
        ) : (
          <Badge tone="danger">Đã huỷ</Badge>
        )}
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 max-[480px]:grid-cols-1">
        <Row icon="calendar" label="Thời gian">
          {state === "upcoming" ? (
            <>
              <b>{when}</b>
              <small className="ml-1.5 text-[13px] text-text-muted">{main.durationMinutes} phút</small>
            </>
          ) : state === "cancelled" ? (
            <s>{when}</s>
          ) : (
            when
          )}
        </Row>
        {state !== "cancelled" ? (
          <Row icon={MODE_ICON[main.mode]} label="Hình thức">
            {MODE_LABEL[main.mode]}
          </Row>
        ) : null}
        {state === "upcoming" && main.location ? (
          main.mode === "ONLINE" ? (
            <Row icon="link" label="Liên kết họp">
              {isMeetingUrl(main.location) ? (
                <a
                  href={main.location}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold break-all text-brand-700 hover:underline"
                >
                  {main.location.replace(/^https?:\/\//i, "")}
                  <Icon name="external-link" size={14} className="shrink-0" />
                  <span className="sr-only">(mở trong thẻ mới)</span>
                </a>
              ) : (
                main.location
              )}
            </Row>
          ) : (
            <Row icon="map-pin" label="Địa chỉ">
              {main.location}
            </Row>
          )
        ) : null}
        {state === "upcoming" && main.note ? (
          <Row icon="message-square-text" label="Ghi chú">
            <span className="whitespace-pre-line">{main.note}</span>
          </Row>
        ) : null}
      </dl>

      {state === "cancelled" ? (
        <>
          {main.cancelReason ? (
            <p className="rounded-r-md border-l-[3px] border-red-600 bg-red-50 px-2.5 py-1.5 text-text-body">
              Lý do huỷ: {main.cancelReason}
            </p>
          ) : null}
          {applicationStatus === "INTERVIEWING" ? (
            <p className="text-text-muted">
              Nhà tuyển dụng sẽ gửi lịch mới nếu tiếp tục phỏng vấn. Bạn sẽ nhận thông báo và email.
            </p>
          ) : null}
        </>
      ) : null}

      {otherCancelled.length > 0 ? (
        <details
          className={`border-t pt-2 ${state === "upcoming" ? "border-brand-100" : "border-border-subtle"}`}
        >
          <summary className="cursor-pointer font-semibold text-text-muted">Lịch đã huỷ ({otherCancelled.length})</summary>
          <ul className="mt-1.5 flex flex-col gap-1 text-text-muted">
            {otherCancelled.map((interview) => {
              const { date, minutes } = vnDateAndMinutes(interview.scheduledAt);
              return (
                <li key={interview.id}>
                  {formatLongDate(date)} · {hhmm(minutes)} {TZ_LABEL}
                  {interview.cancelReason ? ` — Lý do huỷ: ${interview.cancelReason}` : ""}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Row({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <>
      <dt className="flex items-center gap-1.5 text-text-muted max-[480px]:mt-1">
        <Icon name={icon} size={16} />
        {label}
      </dt>
      <dd className="min-w-0 text-text-strong [overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}
