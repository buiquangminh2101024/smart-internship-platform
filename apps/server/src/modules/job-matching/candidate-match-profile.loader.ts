import type { Prisma, PrismaClient } from "@prisma/client";
import type { CandidateMatchProfile } from "../../shared/ports/JobMatcher";
import { computeTotalExperienceYears } from "./candidate-experience.util";
import { buildCandidateMatchText } from "./match-text.builder";

const candidateMatchInclude = {
  skills: { include: { skill: { select: { id: true, name: true } } } },
  workExperiences: { select: { position: true, startDate: true, endDate: true, isCurrent: true } },
  educations: {
    select: {
      majorId: true,
      degree: true,
      startYear: true,
      endYear: true,
      isCurrent: true,
      major: { select: { name: true } },
    },
  },
  // GĐ2: chỉ để dựng văn bản embed.
  projects: { select: { name: true, startDate: true } },
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
    // Liệt kê từng trường: không truyền nguyên bản ghi Candidate (có SĐT, ngày sinh…) sang builder.
    matchText: buildCandidateMatchText({
      headline: candidate.headline,
      bio: candidate.bio,
      skills: candidate.skills.map((link) => ({ name: link.skill.name, yearsOfExperience: link.yearsOfExperience })),
      educations: candidate.educations.map((education) => ({
        majorName: education.major?.name ?? null,
        degree: education.degree,
        startYear: education.startYear,
        endYear: education.endYear,
        isCurrent: education.isCurrent,
      })),
      workExperiences: candidate.workExperiences.map((experience) => ({
        position: experience.position,
        startDate: experience.startDate,
      })),
      projects: candidate.projects.map((project) => ({ name: project.name, startDate: project.startDate })),
    }),
  };
}
