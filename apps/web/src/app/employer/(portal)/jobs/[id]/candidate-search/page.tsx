"use client";

import { Suspense, useCallback, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BulkInviteResponse, CandidateSearchResultDto, OutreachInviteSkipReason } from "@sip/shared-types";
import {
  useBulkInviteOutreach,
  useCandidateSearch,
  useOutreachSummary,
  useSendOutreachInvitation,
  useSentOutreachInvitations,
} from "@/hooks/useCandidateOutreach";
import { useEmployerJobPost } from "@/hooks/useJobPosts";
import { useJobAutoOutreach } from "@/hooks/useAutoOutreach";
import { ApiError } from "@/lib/api-client";
import { formatNumber } from "@/lib/dashboard-format";
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

// AD-23 — tab nằm trên URL (?tab=invited) để link trong thông báo AUTO_OUTREACH_SENT mở thẳng "Đã mời".
function parseTab(value: string | null): Tab {
  return value === "invited" ? "invited" : "suggested";
}

const SKIP_REASON_LABEL: Record<OutreachInviteSkipReason, string> = {
  QUOTA: "hết lượt mời hôm nay",
  CANDIDATE_CAP: "đã nhận đủ lời mời hôm nay",
  APPLIED: "đã ứng tuyển tin này",
  BLOCKED: "đã có lời mời cho tin này",
  NOT_OPEN: "đã tắt cho phép nhà tuyển dụng mời",
  NOT_FOUND: "không còn hồ sơ",
};

/** "Đã mời 8 người. Bỏ qua 2 người: 1 hết lượt mời hôm nay, 1 đã ứng tuyển tin này." */
function bulkInviteSummary(result: BulkInviteResponse): string {
  const invited = result.invited.length;
  const head = invited > 0 ? `Đã mời ${invited} người.` : "Chưa mời được ai.";
  if (result.skipped.length === 0) return `${head} Xem tiến trình ở tab "Đã mời".`;

  const counts = new Map<OutreachInviteSkipReason, number>();
  for (const item of result.skipped) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  const reasons = [...counts.entries()].map(([reason, count]) => `${count} ${SKIP_REASON_LABEL[reason]}`).join(", ");
  return `${head} Bỏ qua ${result.skipped.length} người: ${reasons}.`;
}

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

function SummaryNum({ value }: { value: number }) {
  return <b className="font-num font-bold tabular-nums text-text-strong">{formatNumber(value)}</b>;
}

/**
 * 0.3 F3b (docs/05-frontend/phases/hiring-progress/PLAN.md): từ số "Phù hợp 32" ở trang tổng quan
 * sang đây chỉ thấy tối đa 10 người, nên ghi rõ 10 người này nằm trong bao nhiêu người phù hợp.
 * Số Phù hợp đọc bảng điểm lưu sẵn (cùng quyền xem với trang này: chỉ người đăng tin), còn
 * "Gợi ý" vẫn chấm trực tiếp và không lọc theo ngưỡng, nên có thể gồm người dưới ngưỡng; khi
 * đó câu chữ nói thẳng ra thay vì gọi cả danh sách là "trong số người phù hợp".
 */
function MatchedSummary({ jobId, candidates }: { jobId: string; candidates: CandidateSearchResultDto[] }) {
  const auto = useJobAutoOutreach(jobId, true);
  if (!auto.data || auto.data.status.matchScoresAt === null) return null;

  const { matched, matchedApplied } = auto.data.status;
  const minScore = auto.data.minScore;
  const shown = candidates.length;
  const belowThreshold = candidates.filter((candidate) => (candidate.match.score ?? -1) < minScore).length;
  const applied =
    matchedApplied > 0 ? (
      <>
        {" "}
        (<SummaryNum value={matchedApplied} /> đã nộp đơn)
      </>
    ) : null;

  if (belowThreshold === 0 && shown <= matched) {
    return (
      <p className="text-sm text-text-body">
        <SummaryNum value={shown} /> người điểm cao nhất trong <SummaryNum value={matched} /> người phù hợp{applied}.
      </p>
    );
  }
  return (
    <p className="text-sm text-text-body">
      {matched > 0 ? (
        <>
          <SummaryNum value={matched} /> người phù hợp với ngưỡng {minScore}%{applied}.
        </>
      ) : (
        <>Chưa có ứng viên đạt ngưỡng {minScore}%.</>
      )}{" "}
      Dưới đây là <SummaryNum value={shown} /> người điểm cao nhất chưa ứng tuyển
      {belowThreshold === 0 ? null : belowThreshold === shown ? (
        ", đều dưới ngưỡng"
      ) : (
        <>
          , <SummaryNum value={belowThreshold} /> người dưới ngưỡng
        </>
      )}
      .
    </p>
  );
}

export default function EmployerCandidateSearchPage() {
  // useSearchParams() cần Suspense boundary khi Next prerender route.
  return (
    <Suspense
      fallback={
        <div className="mx-auto grid w-full max-w-4xl gap-5 px-6 py-12">
          <ListSkeleton />
        </div>
      }
    >
      <CandidateSearchContent />
    </Suspense>
  );
}

function CandidateSearchContent() {
  const params = useParams();
  const jobId = params.id as string;
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tab = parseTab(searchParams.get("tab"));
  const [inviting, setInviting] = useState<CandidateSearchResultDto | null>(null);
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const [invitedCount, setInvitedCount] = useState(0);
  const { toasts, push, dismiss } = useToast();

  const { data: job } = useEmployerJobPost(jobId);
  const search = useCandidateSearch(jobId);
  const sent = useSentOutreachInvitations(jobId);
  const sendInvitation = useSendOutreachInvitation(jobId);
  const bulkInvite = useBulkInviteOutreach(jobId);
  const summary = useOutreachSummary();

  // "Mời tất cả" chỉ gửi người chưa đủ trần lời mời hôm nay, theo thứ tự điểm đang hiện.
  const invitable = search.data?.filter((candidate) => !candidate.cappedToday) ?? [];
  const quota = summary.data?.quota;
  const remaining = quota && quota.mode !== "BLOCKED" ? quota.remainingToday : null;
  const busy = sendInvitation.isPending || bulkInvite.isPending;

  function setTab(next: Tab) {
    const query = new URLSearchParams(searchParams.toString());
    if (next === "invited") query.set("tab", "invited");
    else query.delete("tab");
    const qs = query.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function confirmBulkInvite() {
    const ids = invitable.map((candidate) => candidate.candidateId);
    bulkInvite.mutate(ids, {
      onSuccess: (result) => {
        setConfirmingBulk(false);
        setInvitedCount((count) => count + result.invited.length);
        push(result.invited.length > 0 ? "success" : "danger", bulkInviteSummary(result));
        if (result.invited.length > 0) setTab("invited");
      },
      onError: (cause) => {
        setConfirmingBulk(false);
        push("danger", cause instanceof ApiError ? cause.message : "Không gửi được lời mời, vui lòng thử lại.");
      },
    });
  }

  function bulkMessage(): string {
    const n = invitable.length;
    if (remaining === null) return "Ứng viên sẽ nhận thông báo kèm tên công ty và tin này. Mỗi lời mời có hiệu lực 14 ngày.";
    const parts = [`Hôm nay công ty còn ${remaining} lượt mời.`];
    if (n > remaining) parts.push(`Chỉ ${remaining} người điểm cao nhất được mời.`);
    parts.push("Mỗi lời mời có hiệu lực 14 ngày.");
    return parts.join(" ");
  }

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
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Button as="a" href={`/employer/jobs/${jobId}`} variant="link" className="w-fit" icon="arrow-left">
          Về chi tiết tin
        </Button>
        <Button as="a" href="/employer/outreach" variant="link" className="w-fit" icon="send">
          Tất cả lời mời
        </Button>
      </div>

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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon="refresh-cw"
              loading={search.isFetching}
              disabled={busy}
              onClick={() => void search.refetch()}
            >
              Tìm lại
            </Button>
            {invitable.length > 0 ? (
              <Button
                type="button"
                size="sm"
                icon="send"
                disabled={busy || search.isFetching || remaining === 0}
                onClick={() => setConfirmingBulk(true)}
              >
                Mời tất cả ({invitable.length})
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {tab === "suggested" && invitable.length > 0 && remaining === 0 ? (
        <p className="text-[13px] text-text-muted">
          Hôm nay công ty đã dùng hết lượt mời. Lượt mới có từ 7h sáng mỗi ngày.
        </p>
      ) : null}

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
            <MatchedSummary jobId={jobId} candidates={search.data} />
            {search.data.map((candidate) => (
              <CandidateSearchCard
                key={candidate.candidateId}
                candidate={candidate}
                disabled={busy}
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
      <ConfirmDialog
        isOpen={confirmingBulk}
        title={`Gửi lời mời cho ${invitable.length} ứng viên?`}
        message={bulkMessage()}
        confirmLabel="Gửi lời mời"
        isConfirming={bulkInvite.isPending}
        onConfirm={confirmBulkInvite}
        onCancel={() => setConfirmingBulk(false)}
      />
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
