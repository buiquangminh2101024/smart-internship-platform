import type { PrismaClient } from "@prisma/client";
import type { ProfileInsight, ProfileInsightSuggestion, ProfileInsightSuggestionKind } from "@sip/shared-types";
import type { ProfileInsightInput } from "../../shared/ports/ProfileInsightGenerator";

export interface SaveProfileInsightData {
  completenessScore: number;
  strengths: string[];
  suggestions: ProfileInsightSuggestion[];
  topJobPostIds: string[];
}

/** Chỉ đọc bảng candidates (+ quan hệ) và đọc/ghi candidate_profile_insights. */
export class CandidateInsightsRepository {
  private readonly prisma: PrismaClient;

  constructor({ prisma }: { prisma: PrismaClient }) {
    this.prisma = prisma;
  }

  async findCandidateIdByUserId(userId: string): Promise<string | null> {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
    return candidate?.id ?? null;
  }

  /** Dữ liệu gửi LLM — liệt kê đúng các trường ở D13, không select thêm gì. */
  async loadGeneratorInput(candidateId: string): Promise<ProfileInsightInput | null> {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        headline: true,
        bio: true,
        skills: { select: { skill: { select: { name: true } } } },
        workExperiences: {
          select: { position: true, description: true },
          orderBy: [{ startDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        },
        projects: {
          select: { name: true, description: true },
          orderBy: [{ startDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        },
      },
    });
    if (!candidate) return null;
    return {
      headline: candidate.headline,
      bio: candidate.bio,
      skills: candidate.skills.map((link) => link.skill.name),
      experiences: candidate.workExperiences,
      projects: candidate.projects,
    };
  }

  async findByCandidateId(candidateId: string): Promise<ProfileInsight | null> {
    const row = await this.prisma.candidateProfileInsight.findUnique({ where: { candidateId } });
    return row ? toProfileInsight(row) : null;
  }

  async upsert(candidateId: string, data: SaveProfileInsightData): Promise<ProfileInsight> {
    const values = {
      completenessScore: data.completenessScore,
      strengths: data.strengths,
      suggestions: data.suggestions as unknown as object[],
      topJobPostIds: data.topJobPostIds,
      // generatedAt chỉ có @default(now()) — lần phân tích lại phải tự đặt.
      generatedAt: new Date(),
    };
    const row = await this.prisma.candidateProfileInsight.upsert({
      where: { candidateId },
      create: { candidateId, ...values },
      update: values,
    });
    return toProfileInsight(row);
  }
}

const SUGGESTION_KINDS: ProfileInsightSuggestionKind[] = ["WRITING", "SKILL_GAP", "INDUSTRY_MISMATCH"];

/** Cột Json không có kiểu — đọc phòng thủ, bỏ phần tử sai dạng thay vì làm hỏng cả response. */
function toProfileInsight(row: {
  completenessScore: number;
  strengths: unknown;
  suggestions: unknown;
  topJobPostIds: unknown;
  generatedAt: Date;
}): ProfileInsight {
  const suggestions = (Array.isArray(row.suggestions) ? row.suggestions : []).flatMap(
    (item): ProfileInsightSuggestion[] => {
      if (typeof item !== "object" || item === null) return [];
      const { kind, text, evidence } = item as Record<string, unknown>;
      if (typeof text !== "string" || !SUGGESTION_KINDS.includes(kind as ProfileInsightSuggestionKind)) return [];
      return [
        {
          kind: kind as ProfileInsightSuggestionKind,
          text,
          ...(Array.isArray(evidence) ? { evidence: evidence.filter((entry) => typeof entry === "string") } : {}),
        },
      ];
    },
  );
  return {
    completenessScore: row.completenessScore,
    strengths: stringArray(row.strengths),
    suggestions,
    basedOnJobCount: stringArray(row.topJobPostIds).length,
    generatedAt: row.generatedAt.toISOString(),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}
