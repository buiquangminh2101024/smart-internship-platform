import type { PrismaClient } from "@prisma/client";
import type { JobMatchProfile } from "../../shared/ports/JobMatcher";

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
        skills: {
          where: { skill: { status: "APPROVED" } },
          select: { importance: true, skill: { select: { id: true, name: true } } },
        },
      },
    });
    if (!jobPost) return null;

    return {
      jobPostId: jobPost.id,
      skills: jobPost.skills.map((link) => ({
        skillId: link.skill.id,
        name: link.skill.name,
        importance: link.importance,
      })),
      minExperienceYears: jobPost.minExperienceYears,
    };
  }
}
