"use client";

import type { OutreachDailyQuotaStatus, SubscriptionAccessStatus } from "@sip/shared-types";
import { useCompanySubscription } from "@/hooks/useSubscription";
import { formatNumber, formatVnDate, vnTodayIso } from "@/lib/dashboard-format";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/** Nhắc khi gói / dùng thử còn ít hơn hoặc bằng số ngày này. */
const EXPIRY_WARNING_DAYS = 7;

/** Giờ làm mới hạn mức lời mời theo giờ Việt Nam (khớp CandidateOutreachRateLimitService). */
const OUTREACH_RESET_HOUR_VN = 7;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const SUBSCRIPTION_HREF = "/employer/subscription";
const OUTREACH_HREF = "/employer/outreach";

export interface Reminder {
  text: string;
  linkLabel: string;
  href: string;
}

/**
 * Chọn **một** câu nhắc theo thứ tự ưu tiên (docs/05-frontend/phases/employer-dashboard-v2/PLAN.md, F3).
 * Trả null khi không có gì cần nhắc. Hàm thuần để kiểm được mọi trường hợp mà không cần React.
 */
export function pickReminder(
  access: SubscriptionAccessStatus,
  quota: OutreachDailyQuotaStatus,
  now: number = Date.now(),
): Reminder | null {
  const toPlans = { linkLabel: "Xem gói dịch vụ", href: SUBSCRIPTION_HREF };

  if (access.mode === "BLOCKED") {
    return {
      text: "Công ty chưa có gói còn hiệu lực. Bạn chưa đăng được tin mới và chưa gửi được lời mời cho đến khi mua gói.",
      ...toPlans,
    };
  }

  if (access.mode === "TRIAL" && access.trialEndsAt) {
    const left = daysLeftAt(access.trialEndsAt, now);
    if (left <= EXPIRY_WARNING_DAYS) {
      return { text: `Bạn đang dùng thử, hết hạn ngày ${formatVnDate(access.trialEndsAt)} (${leftText(left)}).`, ...toPlans };
    }
  }

  if (access.mode === "SUBSCRIBED" && access.subscription) {
    const { plan, endDate } = access.subscription;
    const left = daysLeftAt(endDate, now);
    if (left <= EXPIRY_WARNING_DAYS) {
      return { text: `Gói ${plan.name} hết hạn ngày ${formatVnDate(endDate)} (${leftText(left)}).`, ...toPlans };
    }
    if (access.publishRemaining === 0) {
      return { text: `Bạn đã dùng hết lượt đăng tin của gói ${plan.name}.`, ...toPlans };
    }
  }

  if (quota.mode !== "BLOCKED" && quota.remainingToday === 0) {
    const vnHour = new Date(now + VN_OFFSET_MS).getUTCHours();
    const when = vnHour < OUTREACH_RESET_HOUR_VN ? "07:00 hôm nay" : "07:00 sáng mai";
    return {
      text: `Bạn đã gửi hết ${formatNumber(quota.dailyQuota)} lời mời hôm nay. Hạn mức làm mới lúc ${when}.`,
      linkLabel: "Xem lời mời",
      href: OUTREACH_HREF,
    };
  }

  return null;
}

/** Số ngày lịch (giờ Việt Nam) từ hôm nay tới ngày hết hạn: cùng ngày = 0, ngày mai = 1. */
function daysLeftAt(iso: string, now: number): number {
  const end = Date.parse(vnTodayIso(new Date(iso)));
  const today = Date.parse(vnTodayIso(new Date(now)));
  return Math.round((end - today) / DAY_MS);
}

function leftText(left: number): string {
  if (left <= 0) return "hôm nay";
  return `còn ${formatNumber(left)} ngày`;
}

/**
 * Dòng nhắc về gói dịch vụ dưới tiêu đề dashboard. Chỉ hiện khi có chuyện cần biết;
 * đang tải hoặc lỗi thì không hiện gì (không chặn trang).
 */
export function SubscriptionReminder({ quota }: { quota: OutreachDailyQuotaStatus }) {
  const subscription = useCompanySubscription();
  if (!subscription.data) return null;

  const reminder = pickReminder(subscription.data, quota);
  if (!reminder) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-l-[3px] border-marigold-300 border-l-marigold-500 bg-marigold-100 px-4 py-3 text-sm text-marigold-800"
    >
      <p className="inline-flex min-w-0 items-start gap-2">
        <Icon name="triangle-alert" size={18} className="mt-0.5 shrink-0" />
        <span>{reminder.text}</span>
      </p>
      <Button as="a" href={reminder.href} variant="secondary" size="sm" iconAfter="arrow-right">
        {reminder.linkLabel}
      </Button>
    </div>
  );
}
