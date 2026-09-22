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
          select: { importance: true, skill: { select: { id: true, name: true } } },
        },
      },
    });
    if (!jobPost) return null;

    const skills = jobPost.skills.map((link) => ({
      skillId: link.skill.id,
      name: link.skill.name,
      importance: link.importance,
    }));
    return {
      jobPostId: jobPost.id,
      skills,
      minExperienceYears: jobPost.minExperienceYears,
      matchText: buildJobMatchText({
        title: jobPost.title,
        requirements: jobPost.requirements,
        description: jobPost.description,
        skills: skills.map((skill) => ({ name: skill.name, importance: skill.importance })),
      }),
    };
  }
}
