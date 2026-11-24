"use client";

import { useCallback, useState } from "react";
import type { CandidateOutreachInvitationDto, OutreachInvitationStatus } from "@sip/shared-types";
import {
  useApplyFromInvitation,
  useOutreachInvitations,
  useOutreachSetting,
  useRespondOutreachInvitation,
} from "@/hooks/useCandidateOutreach";
import { ApiError } from "@/lib/api-client";
import { daysLeft, formatDate } from "@/lib/job-post-display";
import { useCandidateAuthStore } from "@/stores/auth-store";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { AcceptInvitationDialog, type AcceptInvitationInput } from "./AcceptInvitationDialog";

// Hộp "Lời mời ứng tuyển" (B3, AD-15) — docs/05-frontend/phases/candidate-outreach/PLAN.md
// (quyết định 4). Từ AD-28 (docs/05-frontend/phases/invitation-apply/PLAN.md): nhận lời =
// ứng tuyển qua hộp thoại chọn CV; lời mời đã nhận mà chưa có đơn có "Ứng tuyển ngay".
// Xong chỉ đổi trạng thái tại chỗ, không tự điều hướng.

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

// ─── Hiển thị ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<OutreachInvitationStatus, { label: string; tone: NonNullable<BadgeProps["tone"]> }> = {
  PENDING: { label: "Đang chờ", tone: "warning" },
  ACCEPTED: { label: "Đã chấp nhận", tone: "success" },
  DECLINED: { label: "Đã từ chối", tone: "danger" },
  EXPIRED: { label: "Hết hạn", tone: "neutral" },
};

function expiryText(expiresAt: string): string {
  const left = daysLeft(expiresAt);
  if (left === null || left <= 1) return "Hết hạn trong vòng 1 ngày";
  return `Hết hạn sau ${left} ngày`;
}

function InvitationItem({
  invitation,
  busy,
  onDecline,
  onAccept,
  onApply,
}: {
  invitation: CandidateOutreachInvitationDto;
  busy: boolean;
  onDecline: (invitation: CandidateOutreachInvitationDto) => void;
  onAccept: (invitation: CandidateOutreachInvitationDto) => void;
  onApply: (invitation: CandidateOutreachInvitationDto) => void;
}) {
  const status = STATUS_LABEL[invitation.status];
  const isPending = invitation.status === "PENDING";
  const isAccepted = invitation.status === "ACCEPTED";
  const jobOpen = invitation.jobPost.status === "PUBLISHED";
  const conversationLink = invitation.conversationId ? (
    <Button
      as="a"
      href={`/messages?conversationId=${encodeURIComponent(invitation.conversationId)}`}
      variant="secondary"
      size="sm"
      iconAfter="arrow-right"
    >
      Xem hội thoại
    </Button>
  ) : null;

  return (
    <Card padding="md" className="grid gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-subtle bg-surface-page">
          {invitation.company.logoUrl ? (
            <img src={invitation.company.logoUrl} alt={invitation.company.name} className="h-full w-full object-contain" />
          ) : (
            <Icon name="building-2" size={20} className="text-text-muted" />
          )}
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="text-xs text-text-muted">Nhận ngày {formatDate(invitation.createdAt)}</span>
          </div>
          <p className="text-sm text-text-muted">{invitation.company.name}</p>
          {invitation.jobPost.status === "PUBLISHED" ? (
            <a href={`/jobs/${invitation.jobPost.id}`} className="font-semibold text-text-strong hover:underline">
              {invitation.jobPost.title}
            </a>
          ) : (
            <p className="font-semibold text-text-strong">
              {invitation.jobPost.title} <span className="text-xs font-normal text-text-muted">(tin không còn hiển thị)</span>
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-text-muted">
          {isPending
            ? expiryText(invitation.expiresAt)
            : invitation.respondedAt
              ? `Phản hồi ngày ${formatDate(invitation.respondedAt)}`
              : `Hết hạn ngày ${formatDate(invitation.expiresAt)}`}
        </span>
        {isPending ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => onDecline(invitation)}>
              Từ chối
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={() => onAccept(invitation)}>
              Nhận lời &amp; ứng tuyển
            </Button>
          </div>
        ) : isAccepted ? (
          <div className="flex flex-wrap gap-2">
            {invitation.applicationId ? (
              <Button as="a" href="/applications" variant="secondary" size="sm">
                Xem đơn ứng tuyển
              </Button>
            ) : jobOpen ? (
              <Button type="button" size="sm" disabled={busy} onClick={() => onApply(invitation)}>
                Ứng tuyển ngay
              </Button>
            ) : null}
            {conversationLink}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Đang tải lời mời">
      {[0, 1, 2].map((index) => (
        <Card key={index} padding="md" className="grid animate-pulse gap-3">
          <div className="flex items-center gap-3">
            <span className="h-11 w-11 rounded-lg bg-surface-page" />
            <div className="grid flex-1 gap-2">
              <span className="h-4 w-2/3 rounded bg-surface-page" />
              <span className="h-3 w-1/3 rounded bg-surface-page" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function OutreachInvitationInbox() {
  const user = useCandidateAuthStore((state) => state.user);
  const isLoggedIn = useCandidateAuthStore((state) => !!state.accessToken);
  const isCandidate = isLoggedIn && user?.role === "CANDIDATE";

  const { data, isError } = useOutreachInvitations(isCandidate);
  const { data: setting } = useOutreachSetting(isCandidate);
  const respond = useRespondOutreachInvitation();
  const applyFromInvitation = useApplyFromInvitation();
  const { toasts, push, dismiss } = useToast();
  const [declining, setDeclining] = useState<CandidateOutreachInvitationDto | null>(null);
  const [applying, setApplying] = useState<{ invitation: CandidateOutreachInvitationDto; mode: "accept" | "apply" } | null>(
    null,
  );
  const busy = respond.isPending || applyFromInvitation.isPending;

  function showError(cause: unknown) {
    push("danger", cause instanceof ApiError ? cause.message : "Không gửi được phản hồi, vui lòng thử lại.");
  }

  function confirmDecline() {
    if (!declining) return;
    respond.mutate(
      { invitationId: declining.invitationId, body: { action: "DECLINE" } },
      {
        onSuccess: () => {
          setDeclining(null);
          push("success", "Đã từ chối lời mời.");
        },
        onError: (cause) => {
          setDeclining(null);
          showError(cause);
        },
      },
    );
  }

  function submitApplication(input: AcceptInvitationInput) {
    if (!applying) return;
    const { invitation, mode } = applying;
    // Lỗi (409 — lời mời hết hạn, tin đã đóng): đóng hộp thoại, danh sách tự tải lại.
    const onError = (cause: unknown) => {
      setApplying(null);
      showError(cause);
    };
    if (mode === "apply") {
      applyFromInvitation.mutate(
        { invitationId: invitation.invitationId, body: input },
        {
          onSuccess: () => {
            setApplying(null);
            push("success", "Đã ứng tuyển. Hồ sơ của bạn đang được nhà tuyển dụng xem xét.");
          },
          onError,
        },
      );
      return;
    }
    respond.mutate(
      { invitationId: invitation.invitationId, body: { action: "ACCEPT", ...input } },
      {
        onSuccess: (result) => {
          setApplying(null);
          push(
            "success",
            result.linkedExisting
              ? "Bạn đã có đơn cho tin này. Lời mời đã được gắn vào đơn."
              : "Đã nhận lời. Hồ sơ của bạn đang được nhà tuyển dụng xem xét.",
          );
        },
        onError,
      },
    );
  }

  const isOff = setting ? !setting.isOpenToOutreach : false;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-strong">Lời mời ứng tuyển</h1>
        <p className="mt-1 text-sm text-text-muted">
          Nhà tuyển dụng thấy hồ sơ của bạn phù hợp và mời bạn ứng tuyển. Nhận lời để ứng tuyển bằng CV của bạn và trò chuyện với nhà tuyển dụng.
        </p>
      </div>

      {isOff ? (
        <Card padding="sm" tone="sunken" className="mb-4 flex items-start gap-2 text-sm text-text-body">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-indigo-600" />
          <span>
            Bạn đang tắt &quot;Cho phép nhà tuyển dụng tìm thấy&quot; — sẽ không nhận lời mời mới.{" "}
            <a href="/profile" className="text-brand-700 underline">
              Bật trong Hồ sơ
            </a>
          </span>
        </Card>
      ) : null}

      {isError ? (
        <Card padding="lg" className="grid justify-items-center gap-2 text-center">
          <Icon name="circle-alert" size={32} className="text-red-500" />
          <p className="text-sm text-text-body">Không thể tải lời mời. Vui lòng thử lại sau.</p>
        </Card>
      ) : !data ? (
        <ListSkeleton />
      ) : data.length === 0 ? (
        <Card padding="lg" tone="sunken" className="grid justify-items-center gap-3 text-center">
          <Icon name="mail" size={40} className="text-text-muted" />
          <p className="text-sm text-text-body">Bạn chưa có lời mời nào.</p>
          {isOff ? (
            <p className="max-w-md text-sm text-text-muted">
              Bật &quot;Cho phép nhà tuyển dụng tìm thấy&quot; trong hồ sơ để nhà tuyển dụng có thể mời bạn.
            </p>
          ) : null}
        </Card>
      ) : (
        <div className="grid gap-4">
          {data.map((invitation) => (
            <InvitationItem
              key={invitation.invitationId}
              invitation={invitation}
              busy={busy}
              onDecline={setDeclining}
              onAccept={(target) => setApplying({ invitation: target, mode: "accept" })}
              onApply={(target) => setApplying({ invitation: target, mode: "apply" })}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={declining !== null}
        title="Từ chối lời mời?"
        message="Nhà tuyển dụng sẽ được báo là bạn đã từ chối. Không thể hoàn tác."
        confirmLabel="Từ chối"
        isDestructive
        isConfirming={respond.isPending}
        onConfirm={confirmDecline}
        onCancel={() => setDeclining(null)}
      />
      <AcceptInvitationDialog
        key={applying?.invitation.invitationId ?? "closed"}
        invitation={applying?.invitation ?? null}
        mode={applying?.mode ?? "accept"}
        submitting={busy}
        onSubmit={submitApplication}
        onClose={() => setApplying(null)}
      />
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
