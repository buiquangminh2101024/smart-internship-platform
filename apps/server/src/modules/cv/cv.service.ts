import type { PrismaClient } from "@prisma/client";
import type { MediaStorage } from "../../shared/ports/MediaStorage";
import { AppError } from "../../shared/errors/AppError";

const MAX_CV_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_CV_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export class CvService {
  private readonly prisma: PrismaClient;
  private readonly mediaStorage: MediaStorage;

  constructor({ prisma, mediaStorage }: { prisma: PrismaClient; mediaStorage: MediaStorage }) {
    this.prisma = prisma;
    this.mediaStorage = mediaStorage;
  }

  async listForCandidate(userId: string) {
    const candidate = await this.ensureCandidate(userId);
    return this.prisma.cv.findMany({
      where: { candidateId: candidate.id },
      orderBy: { uploadedAt: "desc" },
    });
  }

  async getForCandidate(userId: string, cvId: string) {
    const candidate = await this.ensureCandidate(userId);
    const item = await this.prisma.cv.findFirst({ where: { id: cvId, candidateId: candidate.id } });
    if (!item) throw new AppError(404, "CV not found");
    return item;
  }

  async uploadForCandidate(userId: string, file: Express.Multer.File | undefined) {
    if (!file) {
      throw new AppError(400, "A CV file is required");
    }

    if (file.size > MAX_CV_FILE_SIZE) {
      throw new AppError(400, "CV file size must be under 5MB");
    }

    if (!ALLOWED_CV_MIME_TYPES.has(file.mimetype)) {
      throw new AppError(400, "Only PDF or DOCX files are allowed for CV upload");
    }

    const candidate = await this.ensureCandidate(userId);

    const uploaded = await this.mediaStorage.upload(file.buffer, {
      folder: "candidate-cvs",
      filename: `${candidate.id}-${Date.now()}-${this.safeFileName(file.originalname || "cv")}`,
      resourceType: "raw",
    });

    return this.prisma.cv.create({
      data: {
        candidateId: candidate.id,
        fileUrl: uploaded.url,
        fileName: file.originalname || "cv.pdf",
        isDefault: false,
      },
    });
  }

  async setDefaultForCandidate(userId: string, cvId: string) {
    const candidate = await this.ensureCandidate(userId);
    const target = await this.prisma.cv.findFirst({ where: { id: cvId, candidateId: candidate.id } });
    if (!target) throw new AppError(404, "CV not found");

    return this.prisma.$transaction(async (tx) => {
      await tx.cv.updateMany({
        where: { candidateId: candidate.id, isDefault: true },
        data: { isDefault: false },
      });

      return tx.cv.update({
        where: { id: cvId },
        data: { isDefault: true },
      });
    });
  }

  async deleteForCandidate(userId: string, cvId: string): Promise<void> {
    const candidate = await this.ensureCandidate(userId);
    const existing = await this.prisma.cv.findFirst({ where: { id: cvId, candidateId: candidate.id } });
    if (!existing) throw new AppError(404, "CV not found");

    await this.prisma.$transaction(async (tx) => {
      const remaining = await tx.cv.findFirst({
        where: { candidateId: candidate.id, id: { not: cvId } },
        orderBy: { uploadedAt: "desc" },
      });

      if (existing.isDefault && remaining) {
        await tx.cv.update({ where: { id: remaining.id }, data: { isDefault: true } });
      }

      await tx.cv.delete({ where: { id: cvId } });
    });
  }

  private async ensureCandidate(userId: string) {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId } });
    if (candidate) return candidate;

    return this.prisma.candidate.create({ data: { userId } });
  }

  private safeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "cv";
  }
}
