import type { PrismaClient } from "@prisma/client";
import { AppError } from "../../shared/errors/AppError";
import type { CandidateRepository } from "./candidate.repository";

export class CandidateService {
  private readonly candidateRepository: CandidateRepository;
  private readonly prisma: PrismaClient;

  constructor({ candidateRepository, prisma }: { candidateRepository: CandidateRepository; prisma: PrismaClient }) {
    this.candidateRepository = candidateRepository;
    this.prisma = prisma;
  }

  async getProfile(userId: string) {
    const candidate = await this.candidateRepository.findByUserId(userId);
    if (!candidate) {
      const created = await this.candidateRepository.ensureCandidate(userId);
      return this.candidateRepository.findByUserId(created.userId);
    }
    return candidate;
  }

  async updateProfile(userId: string, input: Record<string, unknown>) {
    const candidate = await this.candidateRepository.ensureCandidate(userId);

    const safeData = {
      ...(input.headline !== undefined ? { headline: String(input.headline) } : {}),
      ...(input.bio !== undefined ? { bio: String(input.bio) } : {}),
      ...(input.phone !== undefined ? { phone: String(input.phone) } : {}),
      ...(input.dateOfBirth !== undefined ? { dateOfBirth: new Date(String(input.dateOfBirth)) } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: String(input.avatarUrl) } : {}),
      ...(input.cityId !== undefined ? { cityId: input.cityId ? String(input.cityId) : null } : {}),
    };

    return this.prisma.candidate.update({
      where: { id: candidate.id },
      data: safeData,
      include: {
        city: true,
        educations: { orderBy: { createdAt: "desc" }, include: { university: true, major: true } },
        workExperiences: { orderBy: { createdAt: "desc" } },
        projects: { orderBy: { createdAt: "desc" } },
        certificates: { orderBy: { createdAt: "desc" } },
        awards: { orderBy: { createdAt: "desc" } },
        skills: { orderBy: { skill: { name: "asc" } }, include: { skill: true } },
      },
    });
  }

  async createEducation(userId: string, input: Record<string, unknown>) {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    const education = await this.candidateRepository.createEducation(candidate.id, {
      ...(input.universityId ? { university: { connect: { id: String(input.universityId) } } } : {}),
      ...(input.majorId ? { major: { connect: { id: String(input.majorId) } } } : {}),
      ...(input.degree !== undefined ? { degree: String(input.degree) } : {}),
      ...(input.startYear !== undefined ? { startYear: Number(input.startYear) } : {}),
      ...(input.endYear !== undefined ? { endYear: Number(input.endYear) } : {}),
      isCurrent: input.isCurrent !== undefined ? Boolean(input.isCurrent) : false,
      ...(input.description !== undefined ? { description: String(input.description) } : {}),
    });

    if (education.isCurrent) {
      await this.candidateRepository.clearCurrentEducationExcept(candidate.id, education.id);
    }

    return this.prisma.education.findUnique({
      where: { id: education.id },
      include: { university: true, major: true },
    });
  }

  async updateEducation(userId: string, educationId: string, input: Record<string, unknown>) {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    const education = await this.candidateRepository.getEducationById(candidate.id, educationId);
    if (!education) {
      throw new AppError(404, "Education not found");
    }

    const payload = {
      ...(input.universityId !== undefined ? { university: input.universityId ? { connect: { id: String(input.universityId) } } : { disconnect: true } } : {}),
      ...(input.majorId !== undefined ? { major: input.majorId ? { connect: { id: String(input.majorId) } } : { disconnect: true } } : {}),
      ...(input.degree !== undefined ? { degree: String(input.degree) } : {}),
      ...(input.startYear !== undefined ? { startYear: Number(input.startYear) } : {}),
      ...(input.endYear !== undefined ? { endYear: Number(input.endYear) } : {}),
      ...(input.isCurrent !== undefined ? { isCurrent: Boolean(input.isCurrent) } : {}),
      ...(input.description !== undefined ? { description: String(input.description) } : {}),
    };

    const updated = await this.candidateRepository.updateEducation(educationId, candidate.id, payload);

    if (updated.isCurrent) {
      await this.candidateRepository.clearCurrentEducationExcept(candidate.id, educationId);
    }

    return this.prisma.education.findUnique({
      where: { id: updated.id },
      include: { university: true, major: true },
    });
  }

  async deleteEducation(userId: string, educationId: string): Promise<void> {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    const education = await this.candidateRepository.getEducationById(candidate.id, educationId);
    if (!education) {
      throw new AppError(404, "Education not found");
    }
    await this.candidateRepository.deleteEducation(educationId, candidate.id);
  }

  async getCandidateSkills(userId: string) {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    return this.prisma.candidateSkill.findMany({
      where: { candidateId: candidate.id },
      include: { skill: true },
      orderBy: { skill: { name: "asc" } },
    });
  }

  async upsertSkill(userId: string, skillId: string, yearsOfExperience: number) {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    await this.candidateRepository.upsertSkill(candidate.id, skillId, yearsOfExperience);
    return this.prisma.candidateSkill.findUnique({
      where: { candidateId_skillId: { candidateId: candidate.id, skillId } },
      include: { skill: true },
    });
  }

  async removeSkill(userId: string, skillId: string): Promise<void> {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    await this.candidateRepository.removeSkill(candidate.id, skillId);
  }

  async createWorkExperience(userId: string, input: Record<string, unknown>) {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    return this.candidateRepository.createWorkExperience(candidate.id, {
      company: String(input.company),
      position: String(input.position),
      ...(input.startDate ? { startDate: new Date(String(input.startDate)) } : {}),
      ...(input.endDate ? { endDate: new Date(String(input.endDate)) } : {}),
      isCurrent: input.isCurrent !== undefined ? Boolean(input.isCurrent) : false,
      ...(input.description !== undefined ? { description: String(input.description) } : {}),
    });
  }

  async updateWorkExperience(userId: string, workExperienceId: string, input: Record<string, unknown>) {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    return this.candidateRepository.updateWorkExperience(workExperienceId, candidate.id, {
      ...(input.company !== undefined ? { company: String(input.company) } : {}),
      ...(input.position !== undefined ? { position: String(input.position) } : {}),
      ...(input.startDate !== undefined ? { startDate: new Date(String(input.startDate)) } : {}),
      ...(input.endDate !== undefined ? { endDate: new Date(String(input.endDate)) } : {}),
      ...(input.isCurrent !== undefined ? { isCurrent: Boolean(input.isCurrent) } : {}),
      ...(input.description !== undefined ? { description: String(input.description) } : {}),
    });
  }

  async deleteWorkExperience(userId: string, workExperienceId: string): Promise<void> {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    await this.candidateRepository.deleteWorkExperience(workExperienceId, candidate.id);
  }

  async createProject(userId: string, input: Record<string, unknown>) {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    return this.candidateRepository.createProject(candidate.id, {
      name: String(input.name),
      ...(input.description !== undefined ? { description: String(input.description) } : {}),
      ...(input.url !== undefined ? { url: String(input.url) } : {}),
      isWorkingOn: input.isWorkingOn !== undefined ? Boolean(input.isWorkingOn) : false,
      ...(input.startDate ? { startDate: new Date(String(input.startDate)) } : {}),
      ...(input.endDate ? { endDate: new Date(String(input.endDate)) } : {}),
    });
  }

  async updateProject(userId: string, projectId: string, input: Record<string, unknown>) {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    return this.candidateRepository.updateProject(projectId, candidate.id, {
      ...(input.name !== undefined ? { name: String(input.name) } : {}),
      ...(input.description !== undefined ? { description: String(input.description) } : {}),
      ...(input.url !== undefined ? { url: String(input.url) } : {}),
      ...(input.isWorkingOn !== undefined ? { isWorkingOn: Boolean(input.isWorkingOn) } : {}),
      ...(input.startDate !== undefined ? { startDate: new Date(String(input.startDate)) } : {}),
      ...(input.endDate !== undefined ? { endDate: new Date(String(input.endDate)) } : {}),
    });
  }

  async deleteProject(userId: string, projectId: string): Promise<void> {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    await this.candidateRepository.deleteProject(projectId, candidate.id);
  }

  async createCertificate(userId: string, input: Record<string, unknown>) {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    return this.candidateRepository.createCertificate(candidate.id, {
      name: String(input.name),
      ...(input.issuer !== undefined ? { issuer: String(input.issuer) } : {}),
      ...(input.issueDate ? { issueDate: new Date(String(input.issueDate)) } : {}),
      ...(input.credentialUrl !== undefined ? { credentialUrl: String(input.credentialUrl) } : {}),
      ...(input.description !== undefined ? { description: String(input.description) } : {}),
    });
  }

  async updateCertificate(userId: string, certificateId: string, input: Record<string, unknown>) {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    return this.candidateRepository.updateCertificate(certificateId, candidate.id, {
      ...(input.name !== undefined ? { name: String(input.name) } : {}),
      ...(input.issuer !== undefined ? { issuer: String(input.issuer) } : {}),
      ...(input.issueDate !== undefined ? { issueDate: new Date(String(input.issueDate)) } : {}),
      ...(input.credentialUrl !== undefined ? { credentialUrl: String(input.credentialUrl) } : {}),
      ...(input.description !== undefined ? { description: String(input.description) } : {}),
    });
  }

  async deleteCertificate(userId: string, certificateId: string): Promise<void> {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    await this.candidateRepository.deleteCertificate(certificateId, candidate.id);
  }

  async createAward(userId: string, input: Record<string, unknown>) {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    return this.candidateRepository.createAward(candidate.id, {
      name: String(input.name),
      ...(input.issuer !== undefined ? { issuer: String(input.issuer) } : {}),
      ...(input.date ? { date: new Date(String(input.date)) } : {}),
      ...(input.description !== undefined ? { description: String(input.description) } : {}),
    });
  }

  async updateAward(userId: string, awardId: string, input: Record<string, unknown>) {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    return this.candidateRepository.updateAward(awardId, candidate.id, {
      ...(input.name !== undefined ? { name: String(input.name) } : {}),
      ...(input.issuer !== undefined ? { issuer: String(input.issuer) } : {}),
      ...(input.date !== undefined ? { date: new Date(String(input.date)) } : {}),
      ...(input.description !== undefined ? { description: String(input.description) } : {}),
    });
  }

  async deleteAward(userId: string, awardId: string): Promise<void> {
    const candidate = await this.candidateRepository.ensureCandidate(userId);
    await this.candidateRepository.deleteAward(awardId, candidate.id);
  }
}
