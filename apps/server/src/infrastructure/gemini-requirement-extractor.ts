import type { Logger } from "../shared/logger";
import type {
  RawJobRequirements,
  RequirementExtractionInput,
  RequirementExtractor,
} from "../shared/ports/RequirementExtractor";
import {
  buildRequirementExtractionContent,
  parseRequirementExtraction,
  REQUIREMENT_EXTRACTION_INSTRUCTIONS,
  REQUIREMENT_EXTRACTION_RESPONSE_SCHEMA,
} from "./requirement-extraction-prompt";

interface GeminiConfig {
  GEMINI_API_KEY?: string | undefined;
  GEMINI_MODEL: string;
}

// Chỉ có văn bản (không ảnh/PDF như CV) nên ngắn hơn timeout của CV extraction.
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Cùng khuôn GeminiCvExtractor: dùng cho tầng chính (GEMINI_MODEL) và tầng dự
 * phòng cùng key khác model. `model` là tham số thứ 2 vì awilix (PROXY mode) coi
 * mọi key destructure từ cradle là dependency.
 */
export class GeminiRequirementExtractor implements RequirementExtractor {
  private readonly geminiConfig: GeminiConfig;
  private readonly logger: Logger;
  private readonly model: string;

  constructor({ config, logger }: { config: GeminiConfig; logger: Logger }, model?: string) {
    this.geminiConfig = config;
    this.logger = logger;
    this.model = model ?? config.GEMINI_MODEL;
  }

  async extract(input: RequirementExtractionInput): Promise<RawJobRequirements> {
    if (!this.geminiConfig.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const { GoogleGenAI } = await import("@google/genai");
    const client = new GoogleGenAI({ apiKey: this.geminiConfig.GEMINI_API_KEY });

    const response = await client.models.generateContent({
      model: this.model,
      contents: [
        {
          role: "user",
          parts: [{ text: `${REQUIREMENT_EXTRACTION_INSTRUCTIONS}\n\n${buildRequirementExtractionContent(input)}` }],
        },
      ],
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: REQUIREMENT_EXTRACTION_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
        httpOptions: { timeout: REQUEST_TIMEOUT_MS },
      },
    });

    const result = parseRequirementExtraction(response.text);
    this.logger.info("Gemini requirement extraction completed", {
      model: this.model,
      skills: result.skills.length,
      majors: result.majors.length,
    });
    return result;
  }
}
