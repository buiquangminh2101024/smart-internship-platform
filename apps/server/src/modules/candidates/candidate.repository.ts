import type { Candidate, Certificate, Education, Prisma, Project, Skill, WorkExperience, Award } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../shared/errors/AppError";

export class CandidateRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  async ensureCandidate(userId: string): Promise<Candidate> {
    const existing = await this.prisma.candidate.findUnique({ where: { userId } });
    if (existing) return existing;

    return this.prisma.candidate.create({
      data: {
        userId,
      },
    });
  }

  findByUserId(userId: string): Promise<(Candidate & {
    educations: Education[];
    workExperiences: WorkExperience[];
    projects: Project[];
    certificates: Certificate[];
    awards: Award[];
    skills: Array<{ yearsOfExperience: number; skill: Skill }>;
    city: { id: string; name: string } | null;
  }) | null> {
    return this.prisma.candidate.findUnique({
      where: { userId },
      include: {
        city: true,
        educations: {
          orderBy: { createdAt: "desc" },
          include: { university: true, major: true },
        },
        workExperiences: {
          orderBy: { createdAt: "desc" },
        },
        projects: {
          orderBy: { createdAt: "desc" },
        },
        certificates: {
          orderBy: { createdAt: "desc" },
        },
        awards: {
          orderBy: { createdAt: "desc" },
        },
        skills: {
          orderBy: { skill: { name: "asc" } },
          include: { skill: true },
        },
      },
    });
  }

  async updateProfile(userId: string, data: Prisma.CandidateUpdateInput): Promise<Candidate> {
    const candidate = await this.ensureCandidate(userId);
    return this.prisma.candidate.update({
      where: { id: candidate.id },
      data,
    });
  }

  getEducationById(candidateId: string, educationId: string): Promise<Education | null> {
    return this.prisma.education.findFirst({
      where: { id: educationId, candidateId },
    });
  }

  async createEducation(candidateId: string, data: Prisma.EducationCreateWithoutCandidateInput): Promise<Education> {
    return this.prisma.education.create({
      data: {
        ...data,
        candidate: { connect: { id: candidateId } },
      },
    });
  }

  async updateEducation(educationId: string, candidateId: string, data: Prisma.EducationUpdateInput): Promise<Education> {
    return this.prisma.education.update({
      where: { id: educationId, candidateId },
      data,
    });
  }

  async deleteEducation(educationId: string, candidateId: string): Promise<void> {
    await this.prisma.education.delete({
      where: { id: educationId, candidateId },
    });
  }

  async clearCurrentEducationExcept(candidateId: string, excludeEducationId?: string): Promise<void> {
    await this.prisma.education.updateMany({
      where: {
        candidateId,
        isCurrent: true,
        ...(excludeEducationId ? { id: { not: excludeEducationId } } : {}),
      },
      data: { isCurrent: false },
    });
  }

  private async assertOwned<T>(record: Promise<T | null>, resource: string): Promise<T> {
    const entity = await record;
    if (!entity) throw new AppError(404, `${resource} not found`);
    return entity;
  }

  createWorkExperience(candidateId: string, data: Prisma.WorkExperienceCreateWithoutCandidateInput): Promise<WorkExperience> {
    return this.prisma.workExperience.create({
      data: {
        ...data,
        candidate: { connect: { id: candidateId } },
      },
    });
  }

  async updateWorkExperience(workExperienceId: string, candidateId: string, data: Prisma.WorkExperienceUpdateInput): Promise<WorkExperience> {
    await this.assertOwned(this.prisma.workExperience.findFirst({ where: { id: workExperienceId, candidateId } }), "Work experience");
    return this.prisma.workExperience.update({
      where: { id: workExperienceId },
      data,
    });
  }

  async deleteWorkExperience(workExperienceId: string, candidateId: string): Promise<void> {
    await this.assertOwned(this.prisma.workExperience.findFirst({ where: { id: workExperienceId, candidateId } }), "Work experience");
    await this.prisma.workExperience.delete({ where: { id: workExperienceId } });
  }

  createProject(candidateId: string, data: Prisma.ProjectCreateWithoutCandidateInput): Promise<Project> {
    return this.prisma.project.create({
      data: {
        ...data,
        candidate: { connect: { id: candidateId } },
      },
    });
  }

  async updateProject(projectId: string, candidateId: string, data: Prisma.ProjectUpdateInput): Promise<Project> {
    await this.assertOwned(this.prisma.project.findFirst({ where: { id: projectId, candidateId } }), "Project");
    return this.prisma.project.update({
      where: { id: projectId },
      data,
    });
  }

  async deleteProject(projectId: string, candidateId: string): Promise<void> {
    await this.assertOwned(this.prisma.project.findFirst({ where: { id: projectId, candidateId } }), "Project");
    await this.prisma.project.delete({ where: { id: projectId } });
  }

  createCertificate(candidateId: string, data: Prisma.CertificateCreateWithoutCandidateInput): Promise<Certificate> {
    return this.prisma.certificate.create({
      data: {
        ...data,
        candidate: { connect: { id: candidateId } },
      },
    });
  }

  async updateCertificate(certificateId: string, candidateId: string, data: Prisma.CertificateUpdateInput): Promise<Certificate> {
    await this.assertOwned(this.prisma.certificate.findFirst({ where: { id: certificateId, candidateId } }), "Certificate");
    return this.prisma.certificate.update({
      where: { id: certificateId },
      data,
    });
  }

  async deleteCertificate(certificateId: string, candidateId: string): Promise<void> {
    await this.assertOwned(this.prisma.certificate.findFirst({ where: { id: certificateId, candidateId } }), "Certificate");
    await this.prisma.certificate.delete({ where: { id: certificateId } });
  }

  createAward(candidateId: string, data: Prisma.AwardCreateWithoutCandidateInput): Promise<Award> {
    return this.prisma.award.create({
      data: {
        ...data,
        candidate: { connect: { id: candidateId } },
      },
    });
  }

  async updateAward(awardId: string, candidateId: string, data: Prisma.AwardUpdateInput): Promise<Award> {
    await this.assertOwned(this.prisma.award.findFirst({ where: { id: awardId, candidateId } }), "Award");
    return this.prisma.award.update({
      where: { id: awardId },
      data,
    });
  }

  async deleteAward(awardId: string, candidateId: string): Promise<void> {
    await this.assertOwned(this.prisma.award.findFirst({ where: { id: awardId, candidateId } }), "Award");
    await this.prisma.award.delete({ where: { id: awardId } });
  }

  async upsertSkill(candidateId: string, skillId: string, yearsOfExperience: number): Promise<void> {
    await this.prisma.candidateSkill.upsert({
      where: { candidateId_skillId: { candidateId, skillId } },
      update: { yearsOfExperience },
      create: { candidateId, skillId, yearsOfExperience },
    });
  }

  async removeSkill(candidateId: string, skillId: string): Promise<void> {
    await this.prisma.candidateSkill.delete({
      where: { candidateId_skillId: { candidateId, skillId } },
    });
  }

  async setCurrentEducation(candidateId: string, educationId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.education.updateMany({
        where: { candidateId, isCurrent: true },
        data: { isCurrent: false },
      });

      await tx.education.update({
        where: { id: educationId, candidateId },
        data: { isCurrent: true },
      });
    });
  }
}
