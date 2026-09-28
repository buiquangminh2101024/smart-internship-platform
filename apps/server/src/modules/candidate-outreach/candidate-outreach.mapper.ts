import type {
  CandidateOutreachInvitationDto,
  CandidateSearchResultDto,
  MatchResult,
  OutreachCandidateCardDto,
  OutreachInvitationStatus,
  SentOutreachInvitationDto,
} from "@sip/shared-types";
import type { CandidateSearchCardRow, InvitationWithRelations } from "./candidate-outreach.repository";

// Không hàm nào ở đây nhận/trả phone, email, dateOfBirth (D2) — nguồn dữ liệu
// (CandidateSearchCardRow, invitationInclude) vốn đã không select các cột đó.

export function toCandidateSearchResultDto(
  card: CandidateSearchCardRow,
  match: MatchResult,
  previouslyInvitedExpired: boolean,
): CandidateSearchResultDto {
  return { ...toCardDto(card), match, previouslyInvitedExpired };
}

/**
 * `card` null khi không đọc được thẻ (không xảy ra trong thực tế vì lời mời
 * cascade theo Candidate) — vẫn trả dòng với tên lưu trong lời mời.
 */
export function toSentOutreachInvitationDto(
  invitation: InvitationWithRelations,
  card: CandidateSearchCardRow | null,
  canViewProfile: boolean,
  now: Date = new Date(),
): SentOutreachInvitationDto {
  const base: OutreachCandidateCardDto = card
    ? toCardDto(card)
    : {
        candidateId: invitation.candidateId,
        fullName: invitation.candidate.fullName,
        avatarUrl: null,
        headline: null,
        cityName: null,
        education: null,
      };
  return {
    ...base,
    invitationId: invitation.id,
    status: effectiveStatus(invitation, now),
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    respondedAt: invitation.respondedAt ? invitation.respondedAt.toISOString() : null,
    matchScore: invitation.matchScore,
    matchWeightsVersion: invitation.matchWeightsVersion,
    canViewProfile,
  };
}

export function toCandidateOutreachInvitationDto(
  invitation: InvitationWithRelations,
  conversationId: string | null,
  now: Date = new Date(),
): CandidateOutreachInvitationDto {
  const status = effectiveStatus(invitation, now);
  return {
    invitationId: invitation.id,
    status,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    respondedAt: invitation.respondedAt ? invitation.respondedAt.toISOString() : null,
    jobPost: { id: invitation.jobPost.id, title: invitation.jobPost.title, status: invitation.jobPost.status },
    company: { id: invitation.company.id, name: invitation.company.name, logoUrl: invitation.company.logoUrl },
    conversationId: status === "ACCEPTED" ? conversationId : null,
  };
}

/**
 * Sweep chỉ chạy mỗi giờ: lời mời PENDING đã quá hạn hoặc tin không còn
 * PUBLISHED (Q3) được HIỂN THỊ là EXPIRED ngay — respond cũng đã chặn đúng
 * các trường hợp này nên hai phía luôn thấy khớp nhau.
 */
export function effectiveStatus(invitation: InvitationWithRelations, now: Date = new Date()): OutreachInvitationStatus {
  if (invitation.status !== "PENDING") return invitation.status;
  if (invitation.expiresAt <= now || invitation.jobPost.status !== "PUBLISHED") return "EXPIRED";
  return "PENDING";
}

function toCardDto(card: CandidateSearchCardRow): OutreachCandidateCardDto {
  return {
    candidateId: card.candidateId,
    fullName: card.fullName,
    avatarUrl: card.avatarUrl,
    headline: card.headline,
    cityName: card.cityName,
    education: card.education,
  };
}
