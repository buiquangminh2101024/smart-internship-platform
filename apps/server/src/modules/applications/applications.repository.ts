import type { Prisma, ApplicationStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type ApplicationWithCandidateRelations = Prisma.ApplicationGetPayload<{
  include: {
    jobPost: {
      include: { company: true; city: true; industry: true; moderationActions: { orderBy: { createdAt: "desc" }; take: 1 } };
    };
    cv: true;
  };
}>;

export type ApplicationWithEmployerRelations = Prisma.ApplicationGetPayload<{
  include: {
    jobPost: {
      include: { company: true; city: true; industry: true; moderationActions: { orderBy: { createdAt: "desc" }; take: 1 } };
    };
    cv: true;
    candidate: {
      include: {
        user: true;
        city: true;
        educations: { include: { university: true; major: true } };
        skills: { include: { skill: true } };
        workExperiences: true;
        projects: true;
        certificates: true;
        awards: true;
      };
    };
  };
}>;

export class ApplicationsRepository {
  private readonly prisma: PrismaClient;
  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  async create(data: { jobPostId: string; candidateId: string; cvId: string; coverLetter?: string; status: ApplicationStatus }) {
    return this.prisma.application.create({
      data,
    });
  }

  async findByJobAndCandidate(jobPostId: string, candidateId: string) {
    return this.prisma.application.findUnique({
      where: {
        jobPostId_candidateId: { jobPostId, candidateId },
      },
    });
  }

  async findCandidateApplications(candidateId: string): Promise<ApplicationWithCandidateRelations[]> {
    return this.prisma.application.findMany({
      where: { candidateId },
      include: {
        jobPost: {
          include: { company: true, city: true, industry: true, moderationActions: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
        cv: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findCandidateApplicationById(id: string, candidateId: string): Promise<ApplicationWithCandidateRelations | null> {
    return this.prisma.application.findFirst({
      where: { id, candidateId },
      include: {
        jobPost: {
          include: { company: true, city: true, industry: true, moderationActions: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
        cv: true,
      },
    });
  }

  async findEmployerApplicationsByJobId(jobPostId: string, companyId: string, status?: ApplicationStatus): Promise<ApplicationWithEmployerRelations[]> {
    return this.prisma.application.findMany({
      where: {
        jobPostId,
        jobPost: { companyId },
        ...(status ? { status } : {}),
      },
      include: {
        jobPost: {
          include: { company: true, city: true, industry: true, moderationActions: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
        cv: true,
        candidate: {
          include: {
            user: true,
            city: true,
            educations: { include: { university: true, major: true } },
            skills: { include: { skill: true } },
            workExperiences: true,
            projects: true,
            certificates: true,
            awards: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findEmployerApplicationById(id: string, companyId: string): Promise<ApplicationWithEmployerRelations | null> {
    return this.prisma.application.findFirst({
      where: {
        id,
        jobPost: { companyId },
      },
      include: {
        jobPost: {
          include: { company: true, city: true, industry: true, moderationActions: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
        cv: true,
        candidate: {
          include: {
            user: true,
            city: true,
            educations: { include: { university: true, major: true } },
            skills: { include: { skill: true } },
            workExperiences: true,
            projects: true,
            certificates: true,
            awards: true,
          },
        },
      },
    });
  }

  async update(
    id: string,
    data: Partial<{ status: ApplicationStatus; employerNotes: string | null; rating: number | null; cvId: string; coverLetter: string | null; reappliedAt: Date }>,
    db: Db = this.prisma,
  ) {
    return db.application.update({
      where: { id },
      data,
    });
  }
}
