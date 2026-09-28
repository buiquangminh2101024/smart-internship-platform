import type { OutreachInvitationStatus, SentOutreachInvitationDto } from "@sip/shared-types";
import { daysLeft, formatDate } from "@/lib/job-post-display";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { OutreachCandidateHeader } from "./CandidateSearchCard";

// Dòng ở tab "Đã mời" (D6/D7 backend) — điểm là điểm LÚC GỬI, không chấm lại.
// Không có nút mời lại: người EXPIRED tự quay về tab "Gợi ý".

const STATUS_LABEL: Record<OutreachInvitationStatus, { label: string; tone: NonNullable<BadgeProps["tone"]> }> = {
  PENDING: { label: "Đang chờ", tone: "warning" },
  ACCEPTED: { label: "Đã chấp nhận", tone: "success" },
  DECLINED: { label: "Đã từ chối", tone: "danger" },
  EXPIRED: { label: "Hết hạn", tone: "neutral" },
};

function pendingExpiry(expiresAt: string): string {
  const left = daysLeft(expiresAt);
  return left === null || left <= 1 ? "hết hạn trong vòng 1 ngày" : `hết hạn sau ${left} ngày`;
}

export function SentInvitationRow({ invitation }: { invitation: SentOutreachInvitationDto }) {
  const status = STATUS_LABEL[invitation.status];

  return (
    <Card padding="md" className="flex flex-wrap items-start justify-between gap-3">
      <OutreachCandidateHeader candidate={invitation} />
      <div className="grid justify-items-start gap-1.5 text-sm sm:justify-items-end">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {invitation.status === "PENDING" ? (
            <span className="text-xs text-text-muted">{pendingExpiry(invitation.expiresAt)}</span>
          ) : null}
        </div>
        <span className="text-xs text-text-muted">
          Gửi ngày {formatDate(invitation.createdAt)}
          {invitation.respondedAt ? ` · phản hồi ngày ${formatDate(invitation.respondedAt)}` : ""}
        </span>
        <span className="text-xs text-text-muted">
          Điểm lúc gửi lời mời:{" "}
          <span className="font-semibold text-text-strong">{invitation.matchScore ?? "—"}</span>
        </span>
        {invitation.canViewProfile ? (
          <Button
            as="a"
            href={`/employer/candidates/${invitation.candidateId}`}
            variant="secondary"
            size="sm"
            icon="user-round"
          >
            Xem hồ sơ
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
