import type { Logger } from "../shared/logger";
import type { CvExtractionInput, CvExtractionResult, CvExtractor } from "../shared/ports/CvExtractor";

export interface CvExtractorTier {
  // Chỉ để log — biết lượt nào rơi xuống tầng nào khi xem lại sự cố.
  name: string;
  extractor: CvExtractor;
}

/**
 * Thử lần lượt từng tầng, tầng nào lỗi thì chuyển tầng kế tiếp. Tất cả cùng
 * lỗi thì ném lỗi của tầng cuối để pipeline quyết định bước tiếp (OCR offline
 * cho ảnh, hoặc FAILED) — composite này không biết gì về Tesseract.
 */
export class FallbackCvExtractor implements CvExtractor {
  private readonly tiers: CvExtractorTier[];
  private readonly logger: Logger;

  constructor({ tiers, logger }: { tiers: CvExtractorTier[]; logger: Logger }) {
    if (tiers.length === 0) throw new Error("FallbackCvExtractor needs at least one tier");
    this.tiers = tiers;
    this.logger = logger;
  }

  async extract(input: CvExtractionInput): Promise<CvExtractionResult> {
    let lastError: unknown;
    for (const tier of this.tiers) {
      try {
        return await tier.extractor.extract(input);
      } catch (error) {
        lastError = error;
        this.logger.warn(`CV extractor tier "${tier.name}" failed`, { error: errorMessage(error) });
      }
    }
    this.logger.error("All CV extractor tiers failed", { kind: input.kind });
    throw lastError;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
