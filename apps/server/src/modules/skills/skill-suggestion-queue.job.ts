import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import type { SkillMatchVerifier } from "../../shared/ports/SkillMatchVerifier";
import type { SkillEmbeddingService } from "./skill-embedding.service";
import type { SkillsRepository } from "./skills.repository";

// Mỗi lượt chỉ xử lý một lô nhỏ: cron chạy hàng giờ nên hàng đợi vẫn được vét
// hết, mà không bắn hàng trăm request Gemini cùng lúc khi bị dồn.
const VERIFY_BATCH_SIZE = 20;
const BACKFILL_BATCH_SIZE = 50;

export interface SkillQueueDeps {
  skillsRepository: SkillsRepository;
  skillEmbeddingService: SkillEmbeddingService;
  skillMatchVerifier: SkillMatchVerifier;
  logger: Logger;
}

/**
 * Bậc 2 của pipeline, chạy lệch khỏi request (quyết định 7 trong PLAN):
 *  (a) skill PENDING nằm vùng xám 0.6-0.85 → hỏi Gemini xem có trùng nghĩa với
 *      skill gần nhất không. MATCH thì gộp luôn + ghi alias (feedback loop);
 *      NEW/UNSURE thì gỡ pendingMatchSkillId để vòng sau không hỏi lại, skill
 *      nằm chờ Admin duyệt tay;
 *  (b) backfill embedding cho skill chưa có vector (skill seed sẵn từ trước khi
 *      có tính năng này, hoặc skill tạo lúc model chưa tải xong).
 */
export async function runSkillSuggestionQueue(deps: SkillQueueDeps): Promise<{ merged: number; deferred: number }> {
  const { skillsRepository, skillMatchVerifier, logger } = deps;

  const pending = await skillsRepository.findPendingVerification(VERIFY_BATCH_SIZE);
  let merged = 0;
  let deferred = 0;

  for (const skill of pending) {
    const decision = await skillMatchVerifier.verify(skill.name, [
      { skillId: skill.pendingMatchSkill.id, name: skill.pendingMatchSkill.name },
    ]);

    if (decision.decision === "MATCH") {
      await skillsRepository.merge(skill.id, decision.matchedSkillId, "LLM_MERGE");
      merged += 1;
      logger.info(`Skill "${skill.name}" merged into "${skill.pendingMatchSkill.name}" by LLM verification`);
      continue;
    }

    // NEW và UNSURE xử lý giống nhau ở đây (đều về tay Admin) nhưng vẫn gỡ cờ:
    // hỏi lại Gemini mỗi giờ cho cùng một cặp tên là lãng phí, và với UNSURE thì
    // hỏi lại cũng khó ra kết quả khác.
    await skillsRepository.clearPendingMatch(skill.id);
    deferred += 1;
  }

  await backfillEmbeddings(deps);

  if (merged > 0 || deferred > 0) {
    logger.info(`Skill suggestion queue: ${merged} merged, ${deferred} left for admin review`);
  }
  return { merged, deferred };
}

async function backfillEmbeddings({ skillEmbeddingService, logger }: SkillQueueDeps): Promise<void> {
  const missing = await skillEmbeddingService.findWithoutEmbedding(BACKFILL_BATCH_SIZE);
  for (const skill of missing) {
    const vector = await skillEmbeddingService.embed(skill.name);
    // Model không dùng được (chưa tải xong / thiếu cấu hình) — dừng hẳn lượt
    // backfill này thay vì lặp vô ích qua cả lô.
    if (!vector) return;
    await skillEmbeddingService.saveEmbedding(skill.id, vector);
  }
  if (missing.length > 0) {
    logger.info(`Skill embedding backfill: ${missing.length} skills processed`);
  }
}

export function startSkillSuggestionQueueJob(deps: SkillQueueDeps): void {
  // Cùng lịch hàng giờ với job-post-expiry/subscription-expiry (AD-6 mục 3).
  cron.schedule("15 * * * *", () => {
    void runSkillSuggestionQueue(deps).catch((error: unknown) => {
      deps.logger.error("Skill suggestion queue failed", { error });
    });
  });
}
