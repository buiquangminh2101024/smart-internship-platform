// Ranh giới chấm điểm mức phù hợp Candidate ↔ JobPost (Job Matcher, hướng A2 —
// docs/06-backend/job-matcher-phase1/PLAN.md, AD-13). Hàm thuần: không chạm
// DB/mạng, mọi dữ liệu đã được loader nạp sẵn vào MatchInput. Kiểu đầu ra nằm ở
// shared-types vì frontend cần; kiểu đầu vào chỉ dùng ở server nên ở đây.
import type { MatchResult, SkillImportance } from "@sip/shared-types";

export type { MatchResult };

export interface CandidateMatchProfile {
  candidateId: string;
  /** yearsOfExperience = 0 nghĩa là chưa khai (D1). */
  skills: { skillId: string; name: string; yearsOfExperience: number }[];
  /** Tổng thời gian làm việc (hợp các khoảng WorkExperience); null = không xác định. */
  totalExperienceYears: number | null;
  /** Chưa dùng để chấm ở GĐ1 — có sẵn để GĐ3 không phải đổi chữ ký. */
  educations: { majorId: string | null; majorName: string | null; degree: string | null }[];
  completeness: {
    hasSkills: boolean;
    hasWorkExperience: boolean;
    hasEducation: boolean;
    hasHeadlineOrBio: boolean;
  };
}

export interface JobMatchProfile {
  jobPostId: string;
  /** Chỉ skill APPROVED (PLAN GĐ1 quyết định #4). */
  skills: { skillId: string; name: string; importance: SkillImportance }[];
  /** null = không yêu cầu. */
  minExperienceYears: number | null;
}

export interface MatchInput {
  candidate: CandidateMatchProfile;
  job: JobMatchProfile;
  /** Cosine giữa vector hồ sơ và vector tin (GĐ2); GĐ1 luôn null. */
  semanticSimilarity: number | null;
}

export interface JobMatcher {
  match(input: MatchInput): MatchResult;
}
