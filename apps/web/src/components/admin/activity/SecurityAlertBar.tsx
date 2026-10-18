"use client";

import Link from "next/link";
import type { AuditActivityItem } from "@sip/shared-types";
import { entityHref, formatVnDateTime } from "@/lib/audit-activity";
import { formatNumber } from "@/lib/dashboard-format";
import { Icon } from "@/components/ui/Icon";
import { DashButton } from "@/components/dashboard/DashButton";

/** Email trong câu summary của server: "… vào tài khoản <email>". */
function targetEmail(summary: string): string | null {
  return /tài khoản (\S+@\S+)$/.exec(summary)?.[1] ?? null;
}

/**
 * Thanh cảnh báo bảo mật (L27): chỉ hiện khi `/stats` báo `securityAlerts > 0`.
 * Kèm 3 lần gần nhất (giờ, tài khoản bị dò, IP) và nút lọc cả danh sách theo
 * `AUTH_LOGIN_FAILED_REPEATED`. Dùng đỏ vì đây là dấu hiệu rủi ro, không phải "chờ duyệt".
 */
export function SecurityAlertBar({
  count,
  recent,
  recentStatus,
  filtered,
  onShowAll,
}: {
  count: number;
  recent: AuditActivityItem[];
  recentStatus: "pending" | "error" | "success";
  /** Danh sách đang lọc đúng hành động này thì ẩn nút "Xem cả N dòng". */
  filtered: boolean;
  onShowAll: () => void;
}) {
  return (
    <section
      aria-labelledby="security-alert-title"
      className="grid gap-3 rounded-[14px] border border-red-200 bg-red-50 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start lg:gap-6"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-lg bg-red-100 text-red-700">
          <Icon name="shield-alert" size={20} />
        </span>
        <div className="grid min-w-0 gap-2">
          <h2 id="security-alert-title" className="text-sm leading-[1.4] font-bold text-red-800">
            Có <span className="tabular-nums">{formatNumber(count)}</span> lần đăng nhập sai 5 lần trong 15 phút
          </h2>
          <p className="text-[13px] text-text-body">
            Có thể có người đang dò mật khẩu. Bạn kiểm tra tài khoản bị nhắm tới và khoá nếu cần.
          </p>
          {filtered ? null : (
            <div>
              <DashButton variant="secondary" size="sm" icon="filter" onClick={onShowAll}>
                Xem cả <span className="tabular-nums">{formatNumber(count)}</span> dòng
              </DashButton>
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <h3 className="mb-1.5 text-[13px] font-semibold text-text-muted">Gần nhất</h3>
        {recentStatus === "pending" ? (
          <ul aria-hidden className="grid gap-1.5">
            {[0, 1, 2].map((index) => (
              <li key={index} className="h-9 rounded-lg bg-red-100/60 motion-safe:animate-pulse" />
            ))}
          </ul>
        ) : recentStatus === "error" ? (
          <p className="text-[13px] text-text-body">Không tải được các lần gần nhất.</p>
        ) : (
          <ul className="grid gap-1">
            {recent.map((item) => {
              const email = targetEmail(item.summary);
              const link = entityHref(item);
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-surface-card px-3 py-2 text-[13px]"
                >
                  <span className="text-text-muted tabular-nums">{formatVnDateTime(item.createdAt)}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-text-strong" title={email ?? item.summary}>
                    {email ?? item.summary}
                  </span>
                  {item.ip ? <span className="text-text-muted tabular-nums">IP {item.ip}</span> : null}
                  {link ? (
                    <Link
                      href={link.href}
                      className="inline-flex items-center gap-1 rounded font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                    >
                      Mở trang người dùng
                      <span className="sr-only"> {email ?? ""}</span>
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
