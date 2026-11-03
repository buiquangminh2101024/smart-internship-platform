"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { JobPost } from "@sip/shared-types";
import { useEmployerJobPosts } from "@/hooks/useJobPosts";
import { formatDecimal, formatNumber } from "@/lib/dashboard-format";
import { daysLeft, formatDeadline } from "@/lib/job-post-display";
import { Icon } from "@/components/ui/Icon";
import { BlockError, BlockSkeleton } from "../BlockState";
import { Panel, PanelHead } from "../Panel";

/** Số tin hiện trong bảng. */
const TOP_COUNT = 5;
/** Tin còn ít ngày hơn hoặc bằng số này thì hạn nộp tô marigold (khớp "Tin cần chú ý"). */
const EXPIRING_DAYS = 7;
const PANEL_SKELETON_HEIGHT = 320;
const PUBLISHED_HREF = "/employer/jobs?status=PUBLISHED";

interface Row {
  job: JobPost;
  /** Hồ sơ / lượt xem, phần trăm; null khi chưa có lượt xem. */
  rate: number | null;
  expiringSoon: boolean;
}

/**
 * "Hiệu quả tin đang hiển thị" (docs/05-frontend/phases/employer-dashboard-v2/PLAN.md, F4):
 * 5 tin nhiều hồ sơ nhất trong trang đầu (20 tin mới nhất) của danh sách tin đang hiển thị.
 */
export function JobPerformancePanel({ publishedTotal }: { publishedTotal: number }) {
  const jobs = useEmployerJobPosts({ status: "PUBLISHED" });

  if (jobs.isPending) return <BlockSkeleton height={PANEL_SKELETON_HEIGHT} />;
  if (jobs.isError) {
    return (
      <BlockError
        what="hiệu quả tin đang hiển thị"
        onRetry={() => void jobs.refetch()}
        retrying={jobs.isFetching}
        minHeight={120}
      />
    );
  }

  const rows = topRows(jobs.data.items);
  const total = Math.max(publishedTotal, jobs.data.items.length);
  const maxApplications = Math.max(...rows.map((r) => r.job.applicationCount), 0);

  return (
    <Panel labelledBy="employer-job-performance-title">
      <PanelHead
        as="h2"
        id="employer-job-performance-title"
        title="Hiệu quả tin đang hiển thị"
        subtitle={
          rows.length > 0 ? (
            <>
              <Num>{formatNumber(rows.length)}</Num> tin nhiều hồ sơ nhất trong <Num>{formatNumber(total)}</Num> tin đang
              hiển thị{jobs.data.hasMore ? " (xét 20 tin mới nhất)" : ""}.
            </>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <div className="grid justify-items-center gap-3 py-6 text-center">
          <p className="max-w-md text-text-muted">
            Chưa có tin nào đang hiển thị. Tin được duyệt sẽ hiện ở đây kèm lượt xem và số hồ sơ.
          </p>
          <FootLink href="/employer/jobs">Xem tất cả tin</FootLink>
        </div>
      ) : (
        <>
          <WideTable rows={rows} maxApplications={maxApplications} />
          <NarrowList rows={rows} maxApplications={maxApplications} />
          <div className="border-t border-border-subtle pt-3">
            <FootLink href={PUBLISHED_HREF}>Xem tất cả {formatNumber(total)} tin đang hiển thị</FootLink>
          </div>
        </>
      )}
    </Panel>
  );
}

function topRows(items: JobPost[]): Row[] {
  return [...items]
    .sort((a, b) => b.applicationCount - a.applicationCount || b.viewCount - a.viewCount)
    .slice(0, TOP_COUNT)
    .map((job) => {
      const left = daysLeft(job.expiresAt);
      return {
        job,
        rate: job.viewCount > 0 ? (job.applicationCount / job.viewCount) * 100 : null,
        expiringSoon: left !== null && left <= EXPIRING_DAYS,
      };
    });
}

/** Bảng cho vùng nội dung rộng (≥ @2xl). */
function WideTable({ rows, maxApplications }: { rows: Row[]; maxApplications: number }) {
  return (
    <div className="hidden @2xl:block">
      <table className="w-full table-fixed text-left">
        <thead className="text-text-muted">
          <tr className="border-b border-border-subtle">
            <th scope="col" className="w-auto py-2 pr-4 font-medium">
              Tin tuyển dụng
            </th>
            <th scope="col" className="w-24 py-2 pr-4 text-right font-medium">
              Lượt xem
            </th>
            <th scope="col" className="w-44 py-2 pr-4 font-medium">
              Hồ sơ
            </th>
            <th scope="col" className="w-24 py-2 pr-4 text-right font-medium">
              Tỉ lệ nộp
            </th>
            <th scope="col" className="w-32 py-2 text-right font-medium">
              Hạn nộp
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ job, rate, expiringSoon }) => (
            <tr key={job.id} className="border-b border-border-subtle last:border-b-0">
              <td className="py-3 pr-4">
                <JobLink job={job} />
              </td>
              <td className="py-3 pr-4 text-right">
                <Num>{formatNumber(job.viewCount)}</Num>
              </td>
              <td className="py-3 pr-4">
                <div className="flex items-center gap-2">
                  <Num className="w-8 shrink-0 text-right">{formatNumber(job.applicationCount)}</Num>
                  <Bar value={job.applicationCount} max={maxApplications} />
                </div>
              </td>
              <td className="py-3 pr-4 text-right">
                <Rate rate={rate} />
              </td>
              <td className="py-3 text-right">
                <Deadline job={job} expiringSoon={expiringSoon} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Danh sách cho vùng hẹp (< @2xl): mỗi tin 3 dòng, không cuộn ngang. */
function NarrowList({ rows, maxApplications }: { rows: Row[]; maxApplications: number }) {
  return (
    <ul className="grid @2xl:hidden">
      {rows.map(({ job, rate, expiringSoon }) => (
        <li key={job.id} className="grid gap-1.5 border-b border-border-subtle py-3 first:pt-0 last:border-b-0">
          <JobLink job={job} />
          <p className="text-text-muted">
            <Num>{formatNumber(job.applicationCount)}</Num> hồ sơ · <Num>{formatNumber(job.viewCount)}</Num> lượt xem ·
            tỉ lệ nộp <Rate rate={rate} />
          </p>
          <div className="flex items-center justify-between gap-4">
            <Bar value={job.applicationCount} max={maxApplications} />
            <Deadline job={job} expiringSoon={expiringSoon} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function JobLink({ job }: { job: JobPost }) {
  return (
    <Link
      href={`/employer/jobs/${job.id}`}
      className="block truncate font-medium text-text-strong hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      title={job.title}
    >
      {job.title}
    </Link>
  );
}

/** Thanh ngang tỉ lệ theo tin nhiều hồ sơ nhất; số luôn nằm cạnh nên thanh chỉ để so nhanh. */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <span aria-hidden className="block h-2 w-full max-w-32 min-w-16 overflow-hidden rounded-full bg-brand-50">
      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
    </span>
  );
}

function Rate({ rate }: { rate: number | null }) {
  if (rate === null) return <span title="Chưa có lượt xem">—</span>;
  return <Num>{formatDecimal(rate)}%</Num>;
}

function Deadline({ job, expiringSoon }: { job: JobPost; expiringSoon: boolean }) {
  return (
    <span className={`shrink-0 whitespace-nowrap ${expiringSoon ? "font-medium text-marigold-800" : "text-text-muted"}`}>
      {formatDeadline(job.expiresAt)}
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
