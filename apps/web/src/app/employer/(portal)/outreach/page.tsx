"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { OutreachInvitationStatus } from "@sip/shared-types";
import { type CompanyInvitationFilter, useOutreachSummary } from "@/hooks/useCandidateOutreach";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { CompanyInvitationsPanel, OutreachJobsPanel, OutreachStats } from "@/components/employer/OutreachHubBlocks";

// Trang "Lời mời" cấp công ty — docs/05-frontend/phases/outreach-hub/PLAN.md.
// Bộ lọc nằm trên URL (?status=&job=&mine=1) để quay lại vẫn giữ.

const STATUS_PARAMS: Record<string, OutreachInvitationStatus> = {
  pending: "PENDING",
  accepted: "ACCEPTED",
  declined: "DECLINED",
  expired: "EXPIRED",
};

export default function EmployerOutreachPage() {
  // useSearchParams() cần Suspense boundary khi Next prerender route này.
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1240px] p-4 sm:p-6">
          <BlockSkeleton height={480} />
        </div>
      }
    >
      <OutreachPageContent />
    </Suspense>
  );
}

function OutreachPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const summary = useOutreachSummary();

  const jobParam = searchParams.get("job") || null;
  const filter: CompanyInvitationFilter = {
    status: STATUS_PARAMS[searchParams.get("status") ?? ""] ?? null,
    // Tin không còn trong danh sách của công ty (link cũ, id sai) ⇒ bỏ lọc thay vì báo lỗi.
    jobPostId:
      jobParam && summary.data && !summary.data.jobs.some((job) => job.jobPostId === jobParam) ? null : jobParam,
    mine: searchParams.get("mine") === "1",
  };

  function updateFilter(patch: Partial<CompanyInvitationFilter>) {
    const next = { ...filter, ...patch };
    const params = new URLSearchParams();
    if (next.status) params.set("status", next.status.toLowerCase());
    if (next.jobPostId) params.set("job", next.jobPostId);
    if (next.mine) params.set("mine", "1");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 p-4 text-sm text-text-body sm:p-6">
      <header>
        <h1 className="text-[28px] leading-[1.3] font-bold text-text-strong">Lời mời</h1>
        <p className="mt-1 text-text-muted">Mời ứng viên phù hợp ứng tuyển vào tin của bạn.</p>
      </header>

      {summary.isPending ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <BlockSkeleton height={188} />
            <BlockSkeleton height={188} />
          </div>
          <BlockSkeleton height={160} />
        </>
      ) : summary.isError ? (
        <BlockError
          what="số liệu lời mời"
          onRetry={() => void summary.refetch()}
          retrying={summary.isFetching}
          minHeight={120}
        />
      ) : (
        <>
          <OutreachStats summary={summary.data} />
          <OutreachJobsPanel jobs={summary.data.jobs} />
        </>
      )}

      <CompanyInvitationsPanel
        filter={filter}
        jobs={summary.data?.jobs}
        onFilterChange={updateFilter}
        onReset={() => router.replace(pathname, { scroll: false })}
      />
    </div>
  );
}
