import type { Logger } from "../shared/logger";
import type {
  RawJobRequirements,
  RequirementExtractionInput,
  RequirementExtractor,
} from "../shared/ports/RequirementExtractor";

export interface RequirementExtractorTier {
  // Chỉ để log — biết lượt nào rơi xuống tầng nào.
  name: string;
  extractor: RequirementExtractor;
}

/** Cùng khuôn FallbackCvExtractor: thử lần lượt từng tầng, tất cả lỗi thì ném lỗi của tầng cuối. */
export class FallbackRequirementExtractor implements RequirementExtractor {
  private readonly tiers: RequirementExtractorTier[];
  private readonly logger: Logger;

  constructor({ tiers, logger }: { tiers: RequirementExtractorTier[]; logger: Logger }) {
    if (tiers.length === 0) throw new Error("FallbackRequirementExtractor needs at least one tier");
    this.tiers = tiers;
    this.logger = logger;
  }

  async extract(input: RequirementExtractionInput): Promise<RawJobRequirements> {
    let lastError: unknown;
    for (const tier of this.tiers) {
      try {
        return await tier.extractor.extract(input);
      } catch (error) {
        lastError = error;
        this.logger.warn(`Requirement extractor tier "${tier.name}" failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.logger.error("All requirement extractor tiers failed");
    throw lastError;
  }
}
