import type { Prisma, PrismaClient } from "@prisma/client";
import type { CandidateMatchProfile } from "../../shared/ports/JobMatcher";
import { computeTotalExperienceYears } from "./candidate-experience.util";

const candidateMatchInclude = {
  skills: { include: { skill: { select: { id: true, name: true } } } },
  workExperiences: { select: { startDate: true, endDate: true, isCurrent: true } },
  educations: { select: { majorId: true, degree: true, major: { select: { name: true } } } },
} satisfies Prisma.CandidateInclude;

type CandidateForMatch = Prisma.CandidateGetPayload<{ include: typeof candidateMatchInclude }>;

/**
 * DB → CandidateMatchProfile. Tách khỏi bộ chấm điểm để hàm chấm test được
 * không cần DB, và để script đánh giá ở GĐ2 dùng chung đúng loader này.
 */
export class CandidateMatchProfileLoader {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  async load(candidateId: string): Promise<CandidateMatchProfile | null> {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: candidateMatchInclude,
    });
    return candidate ? toProfile(candidate) : null;
  }

  /** Một truy vấn cho cả danh sách — tránh N+1 ở danh sách đơn ứng tuyển. */
  async loadMany(candidateIds: string[]): Promise<Map<string, CandidateMatchProfile>> {
    if (candidateIds.length === 0) return new Map();
    const candidates = await this.prisma.candidate.findMany({
      where: { id: { in: [...new Set(candidateIds)] } },
      include: candidateMatchInclude,
    });
    return new Map(candidates.map((candidate) => [candidate.id, toProfile(candidate)]));
  }
}

function toProfile(candidate: CandidateForMatch, today: Date = new Date()): CandidateMatchProfile {
  return {
    candidateId: candidate.id,
    skills: candidate.skills.map((link) => ({
      skillId: link.skill.id,
      name: link.skill.name,
      yearsOfExperience: link.yearsOfExperience,
    })),
    totalExperienceYears: computeTotalExperienceYears(candidate.workExperiences, today),
    educations: candidate.educations.map((education) => ({
      majorId: education.majorId,
      majorName: education.major?.name ?? null,
      degree: education.degree,
    })),
    completeness: {
      hasSkills: candidate.skills.length > 0,
      hasWorkExperience: candidate.workExperiences.length > 0,
      hasEducation: candidate.educations.length > 0,
      hasHeadlineOrBio: Boolean(candidate.headline?.trim() || candidate.bio?.trim()),
    },
  };
}
