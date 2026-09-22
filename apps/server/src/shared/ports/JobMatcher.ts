// Ranh giới chấm điểm mức phù hợp Candidate ↔ JobPost (Job Matcher, hướng A2 —
// docs/06-backend/job-matcher-phase1/PLAN.md, AD-13). Hàm thuần: không chạm
// DB/mạng, mọi dữ liệu đã được loader nạp sẵn vào MatchInput. Kiểu đầu ra nằm ở
// shared-types vì frontend cần; kiểu đầu vào chỉ dùng ở server nên ở đây.
import type { MajorRelevance, MatchResult, SkillImportance } from "@sip/shared-types";

export type { MatchResult };

export interface CandidateMatchProfile {
  candidateId: string;
  /** yearsOfExperience = 0 nghĩa là chưa khai (D1). */
  skills: { skillId: string; name: string; yearsOfExperience: number }[];
  /** Tổng thời gian làm việc (hợp các khoảng WorkExperience); null = không xác định. */
  totalExperienceYears: number | null;
  /** Toàn bộ học vấn — GĐ3 chấm thành phần education bằng majorId. */
  educations: { majorId: string | null; majorName: string | null; degree: string | null }[];
  completeness: {
    hasSkills: boolean;
    hasWorkExperience: boolean;
    hasEducation: boolean;
    hasHeadlineOrBio: boolean;
  };
  /** Văn bản đưa vào model embedding (GĐ2, match-text.builder); bộ chấm điểm không đọc. Rỗng ⇒ không có semantic. */
  matchText: string;
}

export interface JobMatchProfile {
  jobPostId: string;
  /** Chỉ skill APPROVED (PLAN GĐ1 quyết định #4). minYears null = không yêu cầu số năm riêng (GĐ3). */
  skills: { skillId: string; name: string; importance: SkillImportance; minYears: number | null }[];
  /** null = không yêu cầu. */
  minExperienceYears: number | null;
  /** Ngành học phù hợp (GĐ3); rỗng = tin không nêu ngành ⇒ education không áp dụng. */
  majors: { majorId: string; name: string; relevance: MajorRelevance }[];
  /** Văn bản đưa vào model embedding (GĐ2, match-text.builder); bộ chấm điểm không đọc. */
  matchText: string;
}

export interface MatchInput {
  candidate: CandidateMatchProfile;
  job: JobMatchProfile;
  /** Cosine thô giữa vector hồ sơ và vector tin (GĐ2); null = chưa có. Cấu hình không có trọng số semantic bỏ qua giá trị này. */
  semanticSimilarity: number | null;
}

export interface JobMatcher {
  match(input: MatchInput): MatchResult;
}
