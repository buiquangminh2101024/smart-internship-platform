import type { Logger } from "../shared/logger";
import type {
  GeneratedProfileInsight,
  ProfileInsightGenerator,
  ProfileInsightInput,
} from "../shared/ports/ProfileInsightGenerator";

export interface ProfileInsightGeneratorTier {
  // Chỉ để log — biết lượt nào rơi xuống tầng nào.
  name: string;
  generator: ProfileInsightGenerator;
}

/** Cùng khuôn FallbackRequirementExtractor: thử lần lượt từng tầng, tất cả lỗi thì ném lỗi của tầng cuối. */
export class FallbackProfileInsightGenerator implements ProfileInsightGenerator {
  private readonly tiers: ProfileInsightGeneratorTier[];
  private readonly logger: Logger;

  constructor({ tiers, logger }: { tiers: ProfileInsightGeneratorTier[]; logger: Logger }) {
    if (tiers.length === 0) throw new Error("FallbackProfileInsightGenerator needs at least one tier");
    this.tiers = tiers;
    this.logger = logger;
  }

  async generate(input: ProfileInsightInput): Promise<GeneratedProfileInsight> {
    let lastError: unknown;
    for (const tier of this.tiers) {
      try {
        return await tier.generator.generate(input);
      } catch (error) {
        lastError = error;
        this.logger.warn(`Profile insight generator tier "${tier.name}" failed`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.logger.error("All profile insight generator tiers failed");
    throw lastError;
  }
}
