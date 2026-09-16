import type { PrismaClient } from "@prisma/client";
import type { SuggestSkillResponse } from "@sip/shared-types";
import type { Logger } from "../../shared/logger";
import type { SkillEmbeddingService } from "./skill-embedding.service";
import type { SkillAliasRepository } from "./skill-alias.repository";
import type { SkillRateLimitService } from "./skill-rate-limit.service";
import type { SkillsRepository } from "./skills.repository";
import { rankSkillsByName, type SkillSimilarity } from "./skill-token-match.util";

// Ngưỡng chốt ở docs/06-backend/jobpost-skill-huong-b/PLAN.md mục 4.
export const AUTO_MATCH_THRESHOLD = 0.85;
export const GRAY_ZONE_THRESHOLD = 0.6;

/**
 * Orchestrator pipeline khử trùng lặp skill, chạy đồng bộ trong request:
 *
 *   bậc 0  alias exact match          → ALIAS          (rẻ nhất, 1 truy vấn)
 *   bậc 1  token/bigram ≥ 0.85        → AUTO           (trong RAM, không I/O)
 *   bậc 2  embedding local ≥ 0.85     → AUTO           (không gọi API ngoài)
 *   vùng xám 0.6-0.85                 → PENDING_REVIEW + để cron hỏi Gemini
 *   < 0.6                             → PENDING_REVIEW (chắc chắn là skill mới)
 *
 * LLM cố tình KHÔNG nằm trong luồng request: gọi Gemini đồng bộ sẽ làm người
 * dùng chờ vài giây chỉ để thêm một cái tag, nên bậc vùng xám tạo bản ghi tạm
 * rồi trả về ngay, cron xử lý sau (quyết định 7 trong PLAN).
 */
export class SkillDedupeService {
  private readonly prisma: PrismaClient;
  private readonly skillsRepository: SkillsRepository;
  private readonly skillAliasRepository: SkillAliasRepository;
  private readonly skillEmbeddingService: SkillEmbeddingService;
  private readonly skillRateLimitService: SkillRateLimitService;
  private readonly logger: Logger;

  constructor({
    prisma,
    skillsRepository,
    skillAliasRepository,
    skillEmbeddingService,
    skillRateLimitService,
    logger,
  }: {
    prisma: PrismaClient;
    skillsRepository: SkillsRepository;
    skillAliasRepository: SkillAliasRepository;
    skillEmbeddingService: SkillEmbeddingService;
    skillRateLimitService: SkillRateLimitService;
    logger: Logger;
  }) {
    this.prisma = prisma;
    this.skillsRepository = skillsRepository;
    this.skillAliasRepository = skillAliasRepository;
    this.skillEmbeddingService = skillEmbeddingService;
    this.skillRateLimitService = skillRateLimitService;
    this.logger = logger;
  }

  async suggest(userId: string, rawName: string): Promise<SuggestSkillResponse> {
    const name = rawName.trim();

    // Chặn sớm theo PLAN Phần 2 bước 1: người đã hết quota không chạy tiếp
    // pipeline (đỡ tải embedding vô ích). Bộ đếm chỉ tăng ở recordCreation().
    await this.skillRateLimitService.assertWithinQuota(userId);

    const alias = await this.skillAliasRepository.findByName(name);
    if (alias) {
      return { skillId: alias.skill.id, name: alias.skill.name, status: "APPROVED", matchType: "ALIAS" };
    }

    // Trùng tên với skill đã tồn tại (kể cả PENDING do người khác vừa gõ): trả
    // luôn skill đó, vừa tránh vi phạm ràng buộc unique trên `name`, vừa tránh
    // hai bản ghi chờ duyệt y hệt nhau trong hàng đợi của Admin.
    const existing = await this.prisma.skill.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true, name: true, status: true },
    });
    if (existing) {
      return {
        skillId: existing.id,
        name: existing.name,
        status: existing.status,
        matchType: existing.status === "APPROVED" ? "AUTO" : "PENDING_REVIEW",
      };
    }

    const best = await this.findBestMatch(name);

    if (best && best.score >= AUTO_MATCH_THRESHOLD) {
      return { skillId: best.skillId, name: best.name, status: "APPROVED", matchType: "AUTO" };
    }

    const inGrayZone = best !== null && best.score >= GRAY_ZONE_THRESHOLD;
    const created = await this.skillsRepository.createPending({
      name,
      createdByUserId: userId,
      // Chỉ vùng xám mới cần LLM xác nhận. Dưới 0.6 coi như chắc chắn khác
      // nghĩa — để null thì cron bỏ qua, tiết kiệm hẳn một lượt gọi Gemini.
      pendingMatchSkillId: inGrayZone ? best.skillId : null,
    });

    await this.storeEmbedding(created.id, name);
    await this.skillRateLimitService.recordCreation(userId);

    return { skillId: created.id, name: created.name, status: "PENDING", matchType: "PENDING_REVIEW" };
  }

  /** Điểm cao nhất giữa so khớp chuỗi (bậc 1) và embedding ngữ nghĩa (bậc 2). */
  private async findBestMatch(name: string): Promise<SkillSimilarity | null> {
    const approved = await this.skillsRepository.listApproved();
    const byToken = rankSkillsByName(name, approved, 1)[0] ?? null;
    if (byToken && byToken.score >= AUTO_MATCH_THRESHOLD) return byToken;

    // Embedding chỉ chạy khi so khớp chuỗi không kết luận nổi — đây là phần tốn
    // CPU nhất của luồng đồng bộ.
    const vector = await this.skillEmbeddingService.embed(name);
    if (!vector) return byToken;

    const byEmbedding = (await this.skillEmbeddingService.findNearestApproved(vector, 1))[0] ?? null;
    if (!byEmbedding) return byToken;
    if (!byToken) return byEmbedding;
    return byEmbedding.score > byToken.score ? byEmbedding : byToken;
  }

  private async storeEmbedding(skillId: string, name: string): Promise<void> {
    try {
      const vector = await this.skillEmbeddingService.embed(name);
      if (vector) await this.skillEmbeddingService.saveEmbedding(skillId, vector);
    } catch (error) {
      // Skill vẫn dùng được nếu thiếu embedding (cron có bước backfill) — không
      // để hỏng cả request chỉ vì model chưa tải xong.
      this.logger.error("Failed to store embedding for new skill", { error, skillId });
    }
  }
}
