import cron from "node-cron";
import type { Logger } from "../../shared/logger";
import type { CandidateOutreachRepository } from "./candidate-outreach.repository";

/**
 * Quét mỗi giờ (cùng lịch với job-post-expiry.job.ts): lời mời PENDING đã quá
 * expiresAt HOẶC tin không còn PUBLISHED (Q3) → EXPIRED. Giữa 2 lần quét, mapper
 * đã hiển thị các lời mời này là EXPIRED và respond đã chặn — sweep chỉ đồng bộ
 * lại DB để người đó quay về danh sách "Gợi ý" và được mời lại (Q4).
 */
export async function runCandidateOutreachExpirySweep(
  candidateOutreachRepository: CandidateOutreachRepository,
  logger: Logger,
): Promise<number> {
  const expired = await candidateOutreachRepository.expireOverdue();
  if (expired > 0) {
    logger.info(`Candidate outreach expiry sweep: ${expired} invitation(s) expired`);
  }
  return expired;
}

export function startCandidateOutreachExpiryJob(
  candidateOutreachRepository: CandidateOutreachRepository,
  logger: Logger,
): void {
  cron.schedule("0 * * * *", () => {
    void runCandidateOutreachExpirySweep(candidateOutreachRepository, logger).catch((error: unknown) => {
      logger.error("Candidate outreach expiry sweep failed", { error });
    });
  });
}
