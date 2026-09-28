"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import type { CandidateSearchResultDto } from "@sip/shared-types";
import {
  useCandidateSearch,
  useSendOutreachInvitation,
  useSentOutreachInvitations,
} from "@/hooks/useCandidateOutreach";
import { useEmployerJobPost } from "@/hooks/useJobPosts";
import { ApiError } from "@/lib/api-client";
import { CandidateSearchCard, outreachCandidateName } from "@/components/employer/CandidateSearchCard";
import { SentInvitationRow } from "@/components/employer/SentInvitationRow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";

// Tìm & mời ứng viên theo tin (B3, AD-15) — docs/05-frontend/phases/candidate-outreach/PLAN.md
// (quyết định 1, 6, 7). "Gợi ý" không tự tìm lại (hybrid, tốn) — chỉ khi bấm "Tìm lại".

type Tab = "suggested" | "invited";

// ─── Toast helper (cùng khuôn SavedJobsClient) ─────────────────────────────

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

function ListSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Đang tìm ứng viên">
      {[0, 1, 2].map((index) => (
        <Card key={index} padding="md" className="grid animate-pulse gap-3">
          <div className="flex items-center gap-3">
            <span className="h-12 w-12 rounded-full bg-surface-page" />
            <div className="grid flex-1 gap-2">
              <span className="h-4 w-1/2 rounded bg-surface-page" />
              <span className="h-3 w-1/3 rounded bg-surface-page" />
            </div>
          </div>
          <span className="h-3 w-2/3 rounded bg-surface-page" />
        </Card>
      ))}
    </div>
  );
}

/** 403 (công ty BLOCKED — Q1) / 409 (tin không PUBLISHED — Q2) thay cho danh sách. */
function SearchBlockedCard({ error }: { error: unknown }) {
  const status = error instanceof ApiError ? error.status : 0;
  const message = error instanceof ApiError ? error.message : "Không thể tìm ứng viên lúc này. Vui lòng thử lại sau.";

  return (
    <Card padding="lg" tone="sunken" className="grid justify-items-center gap-3 text-center">
      <Icon
        name={status === 403 ? "lock" : status === 409 ? "eye-off" : "circle-alert"}
        size={36}
        className={status === 403 || status === 409 ? "text-text-muted" : "text-red-500"}
      />
      <p className="max-w-md text-sm text-text-body">{message}</p>
      {status === 403 ? (
        <Button as="a" href="/employer/subscription" variant="secondary">
          Xem gói dịch vụ
        </Button>
      ) : null}
      {status === 409 ? (
        <p className="text-xs text-text-muted">Bạn vẫn xem được các lời mời đã gửi ở tab &quot;Đã mời&quot;.</p>
      ) : null}
    </Card>
  );
}

export default function EmployerCandidateSearchPage() {
  const params = useParams();
  const jobId = params.id as string;

  const [tab, setTab] = useState<Tab>("suggested");
  const [inviting, setInviting] = useState<CandidateSearchResultDto | null>(null);
  const [invitedCount, setInvitedCount] = useState(0);
  const { toasts, push, dismiss } = useToast();

  const { data: job } = useEmployerJobPost(jobId);
  const search = useCandidateSearch(jobId);
  const sent = useSentOutreachInvitations(jobId);
  const sendInvitation = useSendOutreachInvitation(jobId);

  function confirmInvite() {
    if (!inviting) return;
    const target = inviting;
    sendInvitation.mutate(target.candidateId, {
      onSuccess: () => {
        setInviting(null);
        setInvitedCount((count) => count + 1);
        push("success", `Đã gửi lời mời cho ${outreachCandidateName(target)}. Xem tiến trình ở tab "Đã mời".`);
      },
      onError: (cause) => {
        // 429 (hết hạn mức ngày) / 409 / 403 — giữ nguyên danh sách, chỉ báo lỗi.
        setInviting(null);
        push("danger", cause instanceof ApiError ? cause.message : "Không gửi được lời mời, vui lòng thử lại.");
      },
    });
  }

  const sentCount = sent.data?.length;

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5 px-6 py-12">
      <Button as="a" href={`/employer/jobs/${jobId}`} variant="link" className="w-fit" icon="arrow-left">
        Về chi tiết tin
      </Button>

      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold text-text-strong">Tìm ứng viên phù hợp</h1>
        <p className="text-sm text-text-muted">
          {job ? <>Cho tin &quot;{job.title}&quot;. </> : null}
          Chỉ gồm ứng viên cho phép nhà tuyển dụng tìm thấy và chưa ứng tuyển tin này. Số điện thoại và email không
          hiển thị — liên hệ qua lời mời.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-surface-hover p-1" role="tablist" aria-label="Danh sách ứng viên">
          {(
            [
              { key: "suggested", label: "Gợi ý" },
              { key: "invited", label: `Đã mời${sentCount !== undefined ? ` (${sentCount})` : ""}` },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === item.key ? "bg-surface-card text-text-strong shadow-sm" : "text-text-muted hover:text-text-strong"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === "suggested" && !search.isError ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon="refresh-cw"
            loading={search.isFetching}
            onClick={() => void search.refetch()}
          >
            Tìm lại
          </Button>
        ) : null}
      </div>

      {tab === "suggested" ? (
        search.isError ? (
          <SearchBlockedCard error={search.error} />
        ) : !search.data || (search.isFetching && search.data.length === 0) ? (
          <ListSkeleton />
        ) : search.data.length === 0 ? (
          <Card padding="lg" tone="sunken" className="grid justify-items-center gap-3 text-center">
            <Icon name={invitedCount > 0 ? "circle-check" : "search-x"} size={36} className="text-text-muted" />
            <p className="max-w-md text-sm text-text-body">
              {invitedCount > 0
                ? "Đã mời hết gợi ý hiện có."
                : "Chưa tìm thấy ứng viên phù hợp đang cho phép nhà tuyển dụng tìm kiếm."}
            </p>
            <Button
              type="button"
              variant="secondary"
              icon="refresh-cw"
              loading={search.isFetching}
              onClick={() => void search.refetch()}
            >
              Tìm lại
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {search.data.map((candidate) => (
              <CandidateSearchCard
                key={candidate.candidateId}
                candidate={candidate}
                disabled={sendInvitation.isPending}
                onInvite={setInviting}
              />
            ))}
            <p className="text-xs text-text-muted">
              Điểm chỉ mang tính tham khảo, tính theo hồ sơ hiện tại của ứng viên.
            </p>
          </div>
        )
      ) : sent.isError ? (
        <Card padding="lg" className="grid justify-items-center gap-2 text-center">
          <Icon name="circle-alert" size={32} className="text-red-500" />
          <p className="text-sm text-text-body">Không thể tải danh sách lời mời đã gửi. Vui lòng thử lại sau.</p>
        </Card>
      ) : !sent.data ? (
        <ListSkeleton />
      ) : sent.data.length === 0 ? (
        <Card padding="lg" tone="sunken" className="grid justify-items-center gap-3 text-center">
          <Icon name="mail" size={36} className="text-text-muted" />
          <p className="text-sm text-text-body">Chưa gửi lời mời nào cho tin này.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sent.data.map((invitation) => (
            <SentInvitationRow key={invitation.invitationId} invitation={invitation} />
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={inviting !== null}
        title={inviting ? `Gửi lời mời cho ${outreachCandidateName(inviting)}?` : "Gửi lời mời?"}
        message="Ứng viên sẽ nhận thông báo kèm tên công ty và tin này. Lời mời có hiệu lực 14 ngày."
        confirmLabel="Gửi lời mời"
        isConfirming={sendInvitation.isPending}
        onConfirm={confirmInvite}
        onCancel={() => setInviting(null)}
      />
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
