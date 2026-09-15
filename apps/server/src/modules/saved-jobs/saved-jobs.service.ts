import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../shared/errors/AppError";
import { toJobPostDto } from "../job-posts/job-post.mapper";
import { jobPostInclude } from "../job-posts/job-post.repository";

export class SavedJobsService {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  async listForCandidate(userId: string) {
    const candidate = await this.ensureCandidate(userId);
    const rows = await this.prisma.savedJob.findMany({
      where: { candidateId: candidate.id },
      orderBy: { createdAt: "desc" },
      include: {
        jobPost: { include: jobPostInclude },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      candidateId: row.candidateId,
      jobPostId: row.jobPostId,
      createdAt: row.createdAt.toISOString(),
      jobPost: toJobPostDto(row.jobPost),
    }));
  }

  async saveForCandidate(userId: string, jobPostId: string) {
    const candidate = await this.ensureCandidate(userId);
    const jobPost = await this.prisma.jobPost.findUnique({ where: { id: jobPostId } });
    if (!jobPost) {
      throw new AppError(404, "Job post not found");
    }
    if (jobPost.status !== "PUBLISHED") {
      throw new AppError(409, "Only published job posts can be saved");
    }

    const saved = await this.prisma.savedJob.upsert({
      where: { candidateId_jobPostId: { candidateId: candidate.id, jobPostId } },
      update: {},
      create: { candidateId: candidate.id, jobPostId },
      include: {
        jobPost: { include: jobPostInclude },
      },
    });

    return {
      id: saved.id,
      candidateId: saved.candidateId,
      jobPostId: saved.jobPostId,
      createdAt: saved.createdAt.toISOString(),
      jobPost: toJobPostDto(saved.jobPost),
      saved: true,
    };
  }

  async unsaveForCandidate(userId: string, jobPostId: string) {
    const candidate = await this.ensureCandidate(userId);
    const deleted = await this.prisma.savedJob.deleteMany({
      where: { candidateId: candidate.id, jobPostId },
    });

    if (deleted.count === 0) {
      throw new AppError(404, "Saved job not found");
    }

    return { deleted: true, jobPostId };
  }

  async isSaved(userId: string, jobPostId: string) {
    const candidate = await this.ensureCandidate(userId);
    const item = await this.prisma.savedJob.findUnique({
      where: { candidateId_jobPostId: { candidateId: candidate.id, jobPostId } },
    });

    return { jobPostId, saved: !!item };
  }

  private async ensureCandidate(userId: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId } });
    if (candidate) return candidate;
    return this.prisma.candidate.create({ data: { userId } });
  }
}
