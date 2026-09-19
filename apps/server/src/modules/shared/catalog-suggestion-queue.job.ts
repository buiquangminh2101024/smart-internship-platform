import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import type { CatalogDomain, CatalogMatchVerifier } from "../../shared/ports/CatalogMatchVerifier";
import type { SkillEmbeddingService } from "../skills/skill-embedding.service";
import type { SkillsRepository } from "../skills/skills.repository";
import type { EducationCatalogRepository } from "../education-catalog/education-catalog.types";

// Mỗi lượt chỉ xử lý một lô nhỏ mỗi bảng: cron chạy hàng giờ nên hàng đợi vẫn
// được vét hết, mà không bắn hàng trăm request Gemini cùng lúc khi bị dồn.
const VERIFY_BATCH_SIZE = 20;
const BACKFILL_BATCH_SIZE = 50;

export interface CatalogQueueDeps {
  skillsRepository: SkillsRepository;
  skillEmbeddingService: SkillEmbeddingService;
  universityRepository: EducationCatalogRepository;
  majorRepository: EducationCatalogRepository;
  catalogMatchVerifier: CatalogMatchVerifier;
  logger: Logger;
}

type QueueResult = { merged: number; deferred: number };

/** Hàng đợi vùng xám của một bảng catalog, quy về cùng một hình dạng. */
interface VerificationQueue {
  findPending(limit: number): Promise<Array<{ id: string; name: string; pendingMatch: { id: string; name: string } }>>;
  merge(sourceId: string, targetId: string): Promise<void>;
  clearPendingMatch(id: string): Promise<void>;
}

/**
 * Phần chạy lệch khỏi request của pipeline dedupe, cho cả Skill/University/Major
 * (đổi tên từ skill-suggestion-queue.job.ts — docs/06-backend/cv-ai-extraction-phase2/PLAN.md
 * Phần 2):
 *  (a) mục PENDING nằm vùng xám 0.6-0.85 → hỏi Gemini xem có trùng nghĩa với
 *      mục gần nhất không. MATCH thì gộp luôn + ghi alias (feedback loop);
 *      NEW/UNSURE thì gỡ pendingMatch để vòng sau không hỏi lại, mục nằm chờ
 *      Admin duyệt tay;
 *  (b) backfill embedding cho skill chưa có vector (chỉ Skill có embedding).
 */
export async function runCatalogSuggestionQueue(deps: CatalogQueueDeps): Promise<Record<CatalogDomain, QueueResult>> {
  const { skillsRepository, universityRepository, majorRepository } = deps;

  const skill = await verifyQueue(deps, "skill", {
    findPending: async (limit) =>
      (await skillsRepository.findPendingVerification(limit)).map((row) => ({
        id: row.id,
        name: row.name,
        pendingMatch: row.pendingMatchSkill,
      })),
    merge: (sourceId, targetId) => skillsRepository.merge(sourceId, targetId, "LLM_MERGE"),
    clearPendingMatch: (id) => skillsRepository.clearPendingMatch(id),
  });
  const university = await verifyQueue(deps, "university", educationQueue(universityRepository));
  const major = await verifyQueue(deps, "major", educationQueue(majorRepository));

  await backfillEmbeddings(deps);

  return { skill, university, major };
}

function educationQueue(repository: EducationCatalogRepository): VerificationQueue {
  return {
    findPending: (limit) => repository.findPendingVerification(limit),
    merge: (sourceId, targetId) => repository.merge(sourceId, targetId, "LLM_MERGE"),
    clearPendingMatch: (id) => repository.clearPendingMatch(id),
  };
}

async function verifyQueue(
  { catalogMatchVerifier, logger }: CatalogQueueDeps,
  domain: CatalogDomain,
  queue: VerificationQueue,
): Promise<QueueResult> {
  const pending = await queue.findPending(VERIFY_BATCH_SIZE);
  let merged = 0;
  let deferred = 0;

  for (const entry of pending) {
    const decision = await catalogMatchVerifier.verify(domain, entry.name, [
      { id: entry.pendingMatch.id, name: entry.pendingMatch.name },
    ]);

    if (decision.decision === "MATCH") {
      await queue.merge(entry.id, decision.matchedId);
      merged += 1;
      logger.info(`${domain} "${entry.name}" merged into "${entry.pendingMatch.name}" by LLM verification`);
      continue;
    }

    // NEW và UNSURE xử lý giống nhau ở đây (đều về tay Admin) nhưng vẫn gỡ cờ:
    // hỏi lại Gemini mỗi giờ cho cùng một cặp tên là lãng phí, và với UNSURE thì
    // hỏi lại cũng khó ra kết quả khác.
    await queue.clearPendingMatch(entry.id);
    deferred += 1;
  }

  if (merged > 0 || deferred > 0) {
    logger.info(`Catalog suggestion queue (${domain}): ${merged} merged, ${deferred} left for admin review`);
  }
  return { merged, deferred };
}

async function backfillEmbeddings({ skillEmbeddingService, logger }: CatalogQueueDeps): Promise<void> {
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

export function startCatalogSuggestionQueueJob(deps: CatalogQueueDeps): void {
  // Cùng lịch hàng giờ với job-post-expiry/subscription-expiry (AD-6 mục 3).
  cron.schedule("15 * * * *", () => {
    void runCatalogSuggestionQueue(deps).catch((error: unknown) => {
      deps.logger.error("Catalog suggestion queue failed", { error });
    });
  });
}
