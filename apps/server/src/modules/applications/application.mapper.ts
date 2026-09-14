import type { CandidateApplicationSummary, EmployerApplicationDetail, CvRecord } from "@sip/shared-types";
import type { ApplicationWithCandidateRelations, ApplicationWithEmployerRelations } from "./applications.repository";
import { toJobPostDto } from "../job-posts/job-post.mapper";

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
    createdAt: app.createdAt.toISOString(),
    updatedAt: app.updatedAt.toISOString(),
    jobPost: toJobPostDto(app.jobPost as any),
    cv: toCvRecord(app.cv),
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
