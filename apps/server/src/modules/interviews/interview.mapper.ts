import type { AwaitingScheduleApplication, CandidateInterview, EmployerInterview } from "@sip/shared-types";
import type { AwaitingScheduleRow, InterviewWithRelations } from "./interviews.repository";

export function toEmployerInterview(interview: InterviewWithRelations): EmployerInterview {
  const { application } = interview;
  return {
    id: interview.id,
    applicationId: interview.applicationId,
    candidateName: application.candidate.fullName,
    candidateAvatarUrl: application.candidate.avatarUrl,
    jobPostId: application.jobPost.id,
    jobPostTitle: application.jobPost.title,
    scheduledAt: interview.scheduledAt.toISOString(),
    durationMinutes: interview.durationMinutes,
    mode: interview.mode,
    location: interview.location,
    note: interview.note,
    status: interview.status,
    cancelReason: interview.cancelReason,
    createdById: interview.createdById,
    createdAt: interview.createdAt.toISOString(),
  };
}

export function toCandidateInterview(interview: InterviewWithRelations): CandidateInterview {
  const { jobPost } = interview.application;
  return {
    id: interview.id,
    applicationId: interview.applicationId,
    jobPostId: jobPost.id,
    jobPostTitle: jobPost.title,
    companyName: jobPost.company.name,
    companyLogoUrl: jobPost.company.logoUrl,
    scheduledAt: interview.scheduledAt.toISOString(),
    durationMinutes: interview.durationMinutes,
    mode: interview.mode,
    location: interview.location,
    note: interview.note,
    status: interview.status,
    cancelReason: interview.cancelReason,
  };
}

export function toAwaitingScheduleApplication(row: AwaitingScheduleRow): AwaitingScheduleApplication {
  return { ...row, waitingSince: row.waitingSince.toISOString() };
}
