import type { PrismaClient } from "@prisma/client";
import type { JobMatchProfile } from "../../shared/ports/JobMatcher";
import { buildJobMatchText } from "./match-text.builder";

/** DB → JobMatchProfile. Chỉ tính skill APPROVED (PLAN GĐ1 quyết định #4). */
export class JobMatchProfileLoader {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  async load(jobPostId: string): Promise<JobMatchProfile | null> {
    const jobPost = await this.prisma.jobPost.findUnique({
      where: { id: jobPostId },
      select: {
        id: true,
        minExperienceYears: true,
        // GĐ2: chỉ để dựng văn bản embed.
        title: true,
        requirements: true,
        description: true,
        skills: {
          where: { skill: { status: "APPROVED" } },
          select: { importance: true, minYears: true, skill: { select: { id: true, name: true } } },
        },
        majors: { select: { relevance: true, major: { select: { id: true, name: true } } } },
      },
    });
    if (!jobPost) return null;

    const skills = jobPost.skills.map((link) => ({
      skillId: link.skill.id,
      name: link.skill.name,
      importance: link.importance,
      minYears: link.minYears,
    }));
    return {
      jobPostId: jobPost.id,
      skills,
      minExperienceYears: jobPost.minExperienceYears,
      majors: jobPost.majors.map((link) => ({ majorId: link.major.id, name: link.major.name, relevance: link.relevance })),
      matchText: buildJobMatchText({
        title: jobPost.title,
        requirements: jobPost.requirements,
        description: jobPost.description,
        skills: skills.map((skill) => ({ name: skill.name, importance: skill.importance })),
      }),
    };
  }
}
