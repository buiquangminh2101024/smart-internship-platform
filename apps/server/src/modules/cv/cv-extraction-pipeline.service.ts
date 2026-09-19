import type { Cv, Prisma, PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type { Logger } from "../../shared/logger";
import type { CvExtractionInput, CvExtractionResult, CvExtractor } from "../../shared/ports/CvExtractor";
import { AppError } from "../../shared/errors/AppError";
import type { CvExtractionRateLimitService } from "./cv-extraction-rate-limit.service";
import { isTextGoodEnough } from "./cv-quality-gate.util";
import { extractDocxText, extractPdfText } from "./cv-text-extractor.util";
import { ocrImage } from "./cv-tesseract-ocr.util";

type CvFormat = "pdf" | "docx" | "jpeg" | "png";

const DOWNLOAD_TIMEOUT_MS = 30_000;
// CV thật hiếm khi quá vài nghìn ký tự; chặn trần để một file bất thường
// không đốt hết token của một lượt gọi.
const MAX_TEXT_CHARS = 30_000;
// Lâu hơn tổng thời gian tối đa của 2 tầng LLM + OCR. Hết hạn thì khoá tự nhả,
// kể cả khi server chết giữa chừng — không để CV kẹt PROCESSING mãi mãi.
const LOCK_TTL_SECONDS = 300;

/**
 * Luồng xử lý: docs/06-backend/cv-ai-extraction-phase1/PLAN.md mục "Luồng xử lý".
 * Chạy đồng bộ trong request (Quyết định #4) — không có hàng đợi.
 */
export class CvExtractionPipelineService {
  private readonly prisma: PrismaClient;
  private readonly redis: Redis;
  private readonly logger: Logger;
  private readonly cvExtractor: CvExtractor;
  private readonly cvExtractionRateLimitService: CvExtractionRateLimitService;

  constructor(deps: {
    prisma: PrismaClient;
    redis: Redis;
    logger: Logger;
    cvExtractor: CvExtractor;
    cvExtractionRateLimitService: CvExtractionRateLimitService;
  }) {
    this.prisma = deps.prisma;
    this.redis = deps.redis;
    this.logger = deps.logger;
    this.cvExtractor = deps.cvExtractor;
    this.cvExtractionRateLimitService = deps.cvExtractionRateLimitService;
  }

  /** `cv` đã được kiểm tra thuộc về `userId` ở CvService. */
  async run(userId: string, cv: Cv): Promise<Cv> {
    // Kiểm tra định dạng trước quota: file không phân tích được thì không trừ lượt.
    const format = detectFormat(cv);

    await this.cvExtractionRateLimitService.assertWithinQuota(userId);

    // Khoá Redis thay vì dựa vào extractionStatus: status PROCESSING có thể bị
    // kẹt lại nếu server chết giữa chừng, còn khoá thì tự hết hạn.
    const lockKey = `cv-extract-lock:${cv.id}`;
    const acquired = await this.redis.set(lockKey, "1", "EX", LOCK_TTL_SECONDS, "NX");
    if (!acquired) {
      throw new AppError(409, "CV này đang được phân tích, vui lòng đợi trong giây lát");
    }

    try {
      await this.prisma.cv.update({ where: { id: cv.id }, data: { extractionStatus: "PROCESSING" } });

      const buffer = await this.download(cv.fileUrl);
      const input = await this.buildInput(format, buffer);

      await this.cvExtractionRateLimitService.recordUsage(userId);
      const result = await this.extractWithOcrFallback(input);

      return await this.prisma.cv.update({
        where: { id: cv.id },
        data: {
          extractionStatus: "DONE",
          extractedData: result as unknown as Prisma.InputJsonValue,
          extractedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error("CV extraction failed", { cvId: cv.id, error: error instanceof Error ? error.message : error });
      // Lần phân tích lại mà lỗi thì kết quả cũ vẫn còn dùng được — trả CV về
      // DONE thay vì FAILED để Candidate không mất bản đã có.
      await this.prisma.cv.update({
        where: { id: cv.id },
        data: { extractionStatus: cv.extractedData ? "DONE" : "FAILED" },
      });
      if (error instanceof AppError) throw error;
      throw new AppError(502, "Không phân tích được CV lúc này, vui lòng thử lại sau");
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private async download(fileUrl: string): Promise<Buffer> {
    const response = await fetch(fileUrl, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`Failed to download CV file (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async buildInput(format: CvFormat, buffer: Buffer): Promise<CvExtractionInput> {
    switch (format) {
      case "jpeg":
      case "png":
        return { kind: "image", buffer, mimeType: `image/${format}` };

      case "docx": {
        // DOCX không có "bản gốc dạng ảnh" nào để gửi thay — text kém vẫn phải
        // dùng, chỉ ghi log để theo dõi (PLAN Quyết định #2/#5).
        const { text, pageCount } = await extractDocxText(buffer);
        if (!isTextGoodEnough(text, pageCount)) {
          this.logger.warn("DOCX text failed quality gate — sending low-quality text anyway");
        }
        return { kind: "text", text: text.slice(0, MAX_TEXT_CHARS) };
      }

      case "pdf": {
        try {
          const { text, pageCount } = await extractPdfText(buffer);
          if (isTextGoodEnough(text, pageCount)) {
            return { kind: "text", text: text.slice(0, MAX_TEXT_CHARS) };
          }
        } catch (error) {
          // PDF hỏng/mã hoá — vẫn thử để model tự đọc file gốc.
          this.logger.warn("pdf-parse failed — falling back to raw PDF input", {
            error: error instanceof Error ? error.message : error,
          });
        }
        // PDF scan (không có text layer) — gửi nguyên file cho model đọc PDF.
        return { kind: "pdf", buffer };
      }
    }
  }

  private async extractWithOcrFallback(input: CvExtractionInput): Promise<CvExtractionResult> {
    try {
      return await this.cvExtractor.extract(input);
    } catch (error) {
      if (input.kind !== "image") throw error;
    }

    // Cả 2 LLM đều lỗi và đây là ảnh — đọc offline bằng Tesseract, trả text
    // thô cho Candidate tự nhập lại (PLAN Quyết định #3).
    const rawOcrText = await ocrImage(input.buffer);
    if (!rawOcrText) throw new Error("Tesseract returned no text");

    return {
      isValidCv: true,
      invalidReason: null,
      extractionConfidence: "low",
      rawOcrText,
      candidate: { fullName: null, headline: null, bio: null, phone: null, dateOfBirth: null, gender: null },
      educations: [],
      workExperiences: [],
      projects: [],
      certificates: [],
      awards: [],
      skills: [],
    };
  }
}

function detectFormat(cv: Cv): CvFormat {
  const extension = fileExtension(cv.fileName) ?? fileExtension(new URL(cv.fileUrl).pathname);
  switch (extension) {
    case "pdf":
      return "pdf";
    case "docx":
      return "docx";
    case "jpg":
    case "jpeg":
      return "jpeg";
    case "png":
      return "png";
    case "doc":
      throw new AppError(400, "File .doc (Word đời cũ) chưa hỗ trợ phân tích. Vui lòng lưu lại dưới dạng PDF hoặc DOCX rồi tải lên.");
    default:
      throw new AppError(400, "Định dạng file này chưa hỗ trợ phân tích CV");
  }
}

function fileExtension(name: string): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match?.[1] ? match[1].toLowerCase() : null;
}
