"use client";

import { useState } from "react";
import type { CandidateSearchResultDto, OutreachCandidateCardDto } from "@sip/shared-types";
import { JobMatchCard } from "@/components/jobs/JobMatchCard";
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

// Thẻ "Gợi ý" ở trang tìm ứng viên (B3, AD-15) — docs/05-frontend/phases/candidate-outreach/PLAN.md.
// DTO không bao giờ có phone/email (backend không trả) — thẻ chỉ hiện những gì có.

const SKILL_PREVIEW = 6;

export function outreachCandidateName(candidate: Pick<OutreachCandidateCardDto, "fullName">): string {
  return candidate.fullName?.trim() || "Ứng viên chưa đặt tên";
}

/** Ảnh + tên + tiêu đề + học vấn + thành phố — dùng chung cho "Gợi ý" và "Đã mời". */
export function OutreachCandidateHeader({ candidate }: { candidate: OutreachCandidateCardDto }) {
  const name = outreachCandidateName(candidate);
  const education = candidate.education
    ? [candidate.education.universityName, candidate.education.majorName, candidate.education.degree]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-surface-page">
        {candidate.avatarUrl ? (
          <img src={candidate.avatarUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <Icon name="user" size={22} className="text-text-muted" />
        )}
      </span>
      <div className="grid min-w-0 gap-0.5">
        <p className="truncate font-semibold text-text-strong">{name}</p>
        {candidate.headline ? <p className="truncate text-sm text-text-body">{candidate.headline}</p> : null}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-muted">
          {education ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="graduation-cap" size={13} />
              {education}
            </span>
          ) : null}
          {candidate.cityName ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="map-pin" size={13} />
              {candidate.cityName}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CandidateSearchCard({
  candidate,
  disabled,
  onInvite,
}: {
  candidate: CandidateSearchResultDto;
  disabled: boolean;
  onInvite: (candidate: CandidateSearchResultDto) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { match } = candidate;
  const skills = [...match.skills].sort((a, b) => Number(b.status === "MATCHED") - Number(a.status === "MATCHED"));
  const matchedCount = match.skills.filter((skill) => skill.status === "MATCHED").length;

  return (
    <Card padding="md" className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <OutreachCandidateHeader candidate={candidate} />
        <div className="flex shrink-0 gap-2">
          <Button
            as="a"
            href={`/employer/candidates/${candidate.candidateId}`}
            variant="secondary"
            size="sm"
            icon="user-round"
          >
            Xem hồ sơ
          </Button>
          <Button type="button" size="sm" icon="send" disabled={disabled} onClick={() => onInvite(candidate)}>
            Gửi lời mời
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
          <MatchScoreBadge score={match.score} status={match.status} />
          <span>
            Phù hợp với tin
            {match.skills.length > 0 ? ` · khớp ${matchedCount}/${match.skills.length} kỹ năng` : ""}
          </span>
          {candidate.previouslyInvitedExpired ? <Badge tone="neutral">Lời mời trước đã hết hạn</Badge> : null}
        </div>
        {skills.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Kỹ năng tin yêu cầu">
            {skills.slice(0, SKILL_PREVIEW).map((skill) => (
              <li key={skill.skillId}>
                <Badge tone={skill.status === "MATCHED" ? "success" : "neutral"} icon={skill.status === "MATCHED" ? "check" : "x"}>
                  {skill.name}
                </Badge>
              </li>
            ))}
            {skills.length > SKILL_PREVIEW ? (
              <li className="self-center text-xs text-text-muted">+{skills.length - SKILL_PREVIEW} kỹ năng</li>
            ) : null}
          </ul>
        ) : null}
        <Button
          type="button"
          variant="link"
          size="sm"
          className="w-fit text-sm"
          iconAfter={expanded ? "chevron-up" : "chevron-down"}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Ẩn chi tiết" : "Xem chi tiết mức phù hợp"}
        </Button>
      </div>

      {expanded ? <JobMatchCard result={match} audience="employer" /> : null}
    </Card>
  );
}
