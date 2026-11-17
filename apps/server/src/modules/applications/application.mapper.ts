import type { CandidateApplicationSummary, EmployerApplicationDetail, EmployerApplicationListItem, CvRecord } from "@sip/shared-types";
import type { ApplicationWithCandidateRelations, ApplicationWithEmployerRelations, CompanyApplicationRow } from "./applications.repository";
import { toJobPostDto } from "../job-posts/job-post.mapper";
import { matchBand } from "../application-automation/application-automation.policy";

function toCvRecord(cv: any): CvRecord {
  return {
    id: cv.id,
    candidateId: cv.candidateId,
    fileUrl: cv.fileUrl,
    fileName: cv.fileName,
    isDefault: cv.isDefault,
    uploadedAt: cv.uploadedAt.toISOString(),
  };
}

export function toCandidateApplicationSummary(app: ApplicationWithCandidateRelations): CandidateApplicationSummary {
  return {
    id: app.id,
    jobPostId: app.jobPostId,
    candidateId: app.candidateId,
    cvId: app.cvId,
    status: app.status,
    coverLetter: app.coverLetter,
    invitationId: app.invitationId,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    jobPost: toJobPostDto(app.jobPost as any),
    cv: toCvRecord(app.cv),
  };
}

export function toEmployerApplicationDetail(app: ApplicationWithEmployerRelations): EmployerApplicationDetail {
  return {
    id: app.id,
    jobPostId: app.jobPostId,
    candidateId: app.candidateId,
    cvId: app.cvId,
    status: app.status,
    coverLetter: app.coverLetter,
    employerNotes: app.employerNotes,
    rating: app.rating,
    invitationId: app.invitationId,
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    jobPost: toJobPostDto(app.jobPost as any),
    cv: toCvRecord(app.cv),
    invitation: app.invitation ? { id: app.invitation.id, source: app.invitation.source } : null,
    candidate: {
      ...app.candidate,
      createdAt: app.candidate.createdAt.toISOString(),
      updatedAt: app.candidate.updatedAt.toISOString(),
      dateOfBirth: app.candidate.dateOfBirth?.toISOString() ?? null,
      user: {
        ...app.candidate.user,
        createdAt: app.candidate.user.createdAt.toISOString(),
        updatedAt: app.candidate.user.updatedAt.toISOString(),
        emailVerifiedAt: app.candidate.user.emailVerifiedAt?.toISOString() ?? null,
      }
    } as any,
  };
}

export function toEmployerApplicationListItem(row: CompanyApplicationRow): EmployerApplicationListItem {
  return {
    applicationId: row.applicationId,
    status: row.status,
    appliedAt: row.appliedAt.toISOString(),
    candidate: {
      id: row.candidateId,
      fullName: row.candidateName,
      avatarUrl: row.candidateAvatarUrl,
      universityName: row.universityName,
    },
    jobPost: { id: row.jobPostId, title: row.jobPostTitle, status: row.jobPostStatus },
    awaitingSchedule: row.awaitingSchedule,
    invitation: row.invitationId && row.invitationSource ? { id: row.invitationId, source: row.invitationSource } : null,
    nextInterviewAt: row.nextInterviewAt?.toISOString() ?? null,
    lastInterviewAt: row.lastInterviewAt?.toISOString() ?? null,
    skillMatch: {
      requiredMatched: row.requiredMatched,
      requiredTotal: row.requiredTotal,
      optionalMatched: row.optionalMatched,
      optionalTotal: row.optionalTotal,
    },
    matchScore: row.matchScore,
    matchBand: matchBand(row.matchScore, row.matchThreshold, row.rejectSuggestBelowScore),
    changedBySystem: row.changedBySystem,
    needsResult: row.needsResult,
  };
}
