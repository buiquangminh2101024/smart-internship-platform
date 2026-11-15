"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { EmployerHiringProgress, HiringProgressItem } from "@sip/shared-types";
import { useEmployerHiringProgress } from "@/hooks/useEmployerDashboard";
import { formatNumber, formatVnDayMonth, formatVnTime } from "@/lib/dashboard-format";
import { daysLeft, formatDeadline } from "@/lib/job-post-display";
import { Icon } from "@/components/ui/Icon";
import { MatchedCount } from "@/components/employer/MatchedCount";
import { BlockError, BlockSkeleton } from "../BlockState";
import { Panel, PanelHead } from "../Panel";

/** Tin còn ít ngày hơn hoặc bằng số này thì hạn nộp tô marigold (khớp "Tin cần chú ý" và thứ tự của backend). */
const EXPIRING_DAYS = 7;
const PANEL_SKELETON_HEIGHT = 320;
const PUBLISHED_HREF = "/employer/jobs?status=PUBLISHED";

/**
 * "Tiến độ tuyển theo tin" (0.3, docs/05-frontend/phases/hiring-progress/PLAN.md F1): tối đa 5
 * tin đang hiển thị của công ty, giữ thứ tự "cần chú ý" backend trả về, không sắp lại.
 * Thay khối "Hiệu quả tin đang hiển thị" ở đúng vị trí cũ.
 */
export function HiringProgressPanel() {
  const progress = useEmployerHiringProgress();

  if (progress.isPending) return <BlockSkeleton height={PANEL_SKELETON_HEIGHT} />;
  if (progress.isError) {
    return (
      <BlockError
        what="tiến độ tuyển theo tin"
        onRetry={() => void progress.refetch()}
        retrying={progress.isFetching}
        minHeight={120}
      />
    );
  }

  const { items, totals } = progress.data;

  return (
    <Panel labelledBy="employer-hiring-progress-title">
      <PanelHead
        as="h2"
        id="employer-hiring-progress-title"
        title="Tiến độ tuyển theo tin"
        subtitle={items.length > 0 ? <Summary data={progress.data} /> : undefined}
      />

      {items.length === 0 ? (
        <div className="grid justify-items-center gap-3 py-6 text-center">
          <p className="max-w-md text-text-muted">
            Chưa có tin nào đang hiển thị. Tin được duyệt sẽ hiện ở đây kèm số ứng viên phù hợp và tiến độ tuyển.
          </p>
          <FootLink href="/employer/jobs">Xem tất cả tin</FootLink>
        </div>
      ) : (
        <>
          <WideTable items={items} />
          <NarrowList items={items} />
          <div className="border-t border-border-subtle pt-3">
            <FootLink href={PUBLISHED_HREF}>Xem tất cả {formatNumber(totals.publishedJobs)} tin đang hiển thị</FootLink>
          </div>
        </>
      )}
    </Panel>
  );
}

/** Dòng phụ dưới tiêu đề: tổng của mọi tin đang hiển thị, không chỉ 5 tin trong bảng. */
function Summary({ data }: { data: EmployerHiringProgress }) {
  const { totals, scoredAt } = data;
  return (
    <>
      Đã tuyển <Num>{formatNumber(totals.hired)}</Num>/<Num>{formatNumber(totals.hiringTarget)}</Num> người trên{" "}
      <Num>{formatNumber(totals.publishedJobs)}</Num> tin đang hiển thị · <Num>{formatNumber(totals.matched)}</Num> ứng
      viên phù hợp
      {scoredAt ? (
        <>
          {" "}
          · điểm phù hợp cập nhật lúc {formatVnTime(scoredAt)} ngày {formatVnDayMonth(scoredAt)}
        </>
      ) : null}
    </>
  );
}

/** Bảng cho vùng nội dung rộng (≥ @4xl): 7 cột không vừa ở @2xl như bảng cũ. */
function WideTable({ items }: { items: HiringProgressItem[] }) {
  return (
    <div className="hidden @4xl:block">
      <table className="w-full table-fixed text-left">
        <thead className="text-text-muted">
          <tr className="border-b border-border-subtle">
            <th scope="col" className="w-auto py-2 pr-4 font-medium">
              Tin tuyển dụng
            </th>
            <th scope="col" className="w-36 py-2 pr-4 font-medium">
              Phù hợp
            </th>
            <th scope="col" className="w-20 py-2 pr-4 text-right font-medium">
              Đã mời
            </th>
            <th scope="col" className="w-24 py-2 pr-4 text-right font-medium">
              Nhận lời
            </th>
            <th scope="col" className="w-24 py-2 pr-4 text-right font-medium">
              Phỏng vấn
            </th>
            <th scope="col" className="w-40 py-2 pr-4 font-medium">
              Đã tuyển
            </th>
            <th scope="col" className="w-28 py-2 text-right font-medium">
              Hạn nộp
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.jobPostId} className="border-b border-border-subtle align-top last:border-b-0">
              <td className="py-3 pr-4">
                <JobLink item={item} />
              </td>
              <td className="py-3 pr-4">
                <Matched item={item} />
              </td>
              <td className="py-3 pr-4 text-right">
                <Num>{formatNumber(item.invited)}</Num>
              </td>
              <td className="py-3 pr-4 text-right">
                <Num>{formatNumber(item.acceptedInvitations)}</Num>
              </td>
              <td className="py-3 pr-4 text-right">
                <Num>{formatNumber(item.interviewing)}</Num>
              </td>
              <td className="py-3 pr-4">
                <div className="flex items-center gap-2">
                  <Hired item={item} />
                  <Bar item={item} />
                </div>
                <div className="mt-1">
                  <AutoOutreachHint item={item} />
                </div>
              </td>
              <td className="py-3 text-right">
                <Deadline item={item} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Danh sách cho vùng hẹp (< @4xl): mỗi tin một thẻ, không cuộn ngang. */
function NarrowList({ items }: { items: HiringProgressItem[] }) {
  return (
    <ul className="grid @4xl:hidden">
      {items.map((item) => (
        <li key={item.jobPostId} className="grid gap-1.5 border-b border-border-subtle py-3 first:pt-0 last:border-b-0">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <JobLink item={item} />
            </div>
            <span className="shrink-0 whitespace-nowrap text-text-muted">
              Đã tuyển <Hired item={item} />
            </span>
          </div>
          <p className="flex flex-wrap gap-x-1.5 text-text-muted">
            <MatchedCount
              jobId={item.jobPostId}
              matched={item.matched}
              matchedApplied={item.matchedApplied}
              pending={item.matchScoresAt === null}
              label="Phù hợp"
              linked={item.ownedByViewer}
            />
            <span aria-hidden>·</span>
            <span>
              Đã mời <Num>{formatNumber(item.invited)}</Num>
            </span>
            <span aria-hidden>·</span>
            <span>
              Nhận lời <Num>{formatNumber(item.acceptedInvitations)}</Num>
            </span>
            <span aria-hidden>·</span>
            <span>
              Phỏng vấn <Num>{formatNumber(item.interviewing)}</Num>
            </span>
          </p>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <Deadline item={item} />
            <AutoOutreachHint item={item} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function JobLink({ item }: { item: HiringProgressItem }) {
  return (
    <Link
      href={`/employer/jobs/${item.jobPostId}`}
      className="block truncate font-medium text-text-strong hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      title={item.title}
    >
      {item.title}
    </Link>
  );
}

function Matched({ item }: { item: HiringProgressItem }) {
  return (
    <MatchedCount
      jobId={item.jobPostId}
      matched={item.matched}
      matchedApplied={item.matchedApplied}
      pending={item.matchScoresAt === null}
      linked={item.ownedByViewer}
    />
  );
}

const isTargetMet = (item: HiringProgressItem) => item.hired >= item.hiringTarget;

/** "a/b"; đủ chỉ tiêu thì màu thành công kèm chữ ẩn cho trình đọc màn hình (màu không là kênh duy nhất). */
function Hired({ item }: { item: HiringProgressItem }) {
  const met = isTargetMet(item);
  return (
    <b className={`shrink-0 font-num font-bold tabular-nums ${met ? "text-success-700" : "text-text-strong"}`}>
      {formatNumber(item.hired)}/{formatNumber(item.hiringTarget)}
      {met ? <span className="sr-only"> (đã đủ chỉ tiêu)</span> : null}
    </b>
  );
}

/** Thanh đã tuyển / chỉ tiêu; số luôn nằm cạnh nên thanh chỉ để so nhanh. */
function Bar({ item }: { item: HiringProgressItem }) {
  const pct = item.hiringTarget > 0 ? Math.min(100, (item.hired / item.hiringTarget) * 100) : 0;
  return (
    <span aria-hidden className="block h-2 w-full max-w-32 min-w-16 overflow-hidden rounded-full bg-brand-50">
      <span
        className={`block h-full rounded-full ${isTargetMet(item) ? "bg-success-600" : "bg-brand-500"}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/**
 * Tin chưa bật tự mời và chưa đủ chỉ tiêu: người đăng tin thấy link sang trang tin (thẻ cài
 * đặt chỉ người đăng tin thấy), người khác cùng công ty chỉ thấy chữ.
 */
function AutoOutreachHint({ item }: { item: HiringProgressItem }) {
  if (item.autoOutreachEnabled || isTargetMet(item)) return null;
  if (!item.ownedByViewer) return <span className="text-text-muted">Chưa bật tự mời</span>;
  return (
    <Link
      href={`/employer/jobs/${item.jobPostId}`}
      className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      aria-label={`Bật tự mời cho tin ${item.title}`}
    >
      Bật tự mời
      <Icon name="arrow-right" size={14} />
    </Link>
  );
}

function Deadline({ item }: { item: HiringProgressItem }) {
  const left = daysLeft(item.expiresAt);
  const expiringSoon = left !== null && left <= EXPIRING_DAYS;
  return (
    <span className={`shrink-0 whitespace-nowrap ${expiringSoon ? "font-medium text-marigold-800" : "text-text-muted"}`}>
      {formatDeadline(item.expiresAt)}
    </span>
  );
}

function FootLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      {children}
      <Icon name="arrow-right" size={16} />
    </Link>
  );
}

function Num({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <b className={`font-num font-bold tabular-nums text-text-strong ${className}`}>{children}</b>;
}
