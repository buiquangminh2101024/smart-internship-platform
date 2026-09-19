import type { Logger } from "../shared/logger";
import type { CvExtractionInput, CvExtractionResult, CvExtractor } from "../shared/ports/CvExtractor";
import { CV_EXTRACTION_INSTRUCTIONS, CV_EXTRACTION_RESPONSE_SCHEMA, parseCvExtraction } from "./cv-extraction-prompt";

interface GeminiConfig {
  GEMINI_API_KEY?: string | undefined;
  GEMINI_MODEL: string;
}

// Đọc ảnh/PDF nhiều trang mất 5-20 giây; quá 60 giây coi như treo để còn thời
// gian cho tầng dự phòng trước khi FE bỏ cuộc.
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Gemini nhận thẳng PDF và ảnh làm input đa phương thức — đây là lý do PDF
 * scan (text layer kém) được gửi nguyên file thay vì OCR rời (xem PLAN Quyết
 * định #2).
 *
 * Dùng cho 2 tầng: tầng chính (GEMINI_MODEL) và tầng dự phòng cùng key nhưng
 * model khác (`model` truyền vào). Không tự retry khi 503 "high demand": lỗi
 * này theo từng model và đo thực tế retry cùng model sau 2s vẫn lỗi, trong khi
 * chuyển sang model khác trả kết quả ngay.
 */
export class GeminiCvExtractor implements CvExtractor {
  private readonly geminiConfig: GeminiConfig;
  private readonly logger: Logger;
  private readonly model: string;

  // Lazy giống GeminiSkillMatchVerifier: không kiểm tra API key trong constructor
  // vì awilix có thể resolve instance ở môi trường dev chưa cấu hình Gemini.
  // `model` là tham số thứ 2, KHÔNG nằm trong object đầu: awilix (PROXY mode)
  // coi mọi key destructure từ cradle là dependency cần resolve.
  constructor({ config, logger }: { config: GeminiConfig; logger: Logger }, model?: string) {
    this.geminiConfig = config;
    this.logger = logger;
    this.model = model ?? config.GEMINI_MODEL;
  }

  async extract(input: CvExtractionInput): Promise<CvExtractionResult> {
    if (!this.geminiConfig.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const { GoogleGenAI } = await import("@google/genai");
    const client = new GoogleGenAI({ apiKey: this.geminiConfig.GEMINI_API_KEY });

    const response = await client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts: this.buildParts(input) }],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: CV_EXTRACTION_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
        httpOptions: { timeout: REQUEST_TIMEOUT_MS },
      },
    });

    const result = parseCvExtraction(response.text);
    this.logger.info("Gemini CV extraction completed", { model: this.model, kind: input.kind, isValidCv: result.isValidCv });
    return result;
  }

  private buildParts(input: CvExtractionInput) {
    switch (input.kind) {
      case "text":
        return [{ text: `${CV_EXTRACTION_INSTRUCTIONS}\n\nNội dung CV:\n"""\n${input.text}\n"""` }];
      case "pdf":
        return [
          { text: CV_EXTRACTION_INSTRUCTIONS },
          { inlineData: { mimeType: "application/pdf", data: input.buffer.toString("base64") } },
        ];
      case "image":
        return [
          { text: CV_EXTRACTION_INSTRUCTIONS },
          { inlineData: { mimeType: input.mimeType, data: input.buffer.toString("base64") } },
        ];
    }
  }
}
