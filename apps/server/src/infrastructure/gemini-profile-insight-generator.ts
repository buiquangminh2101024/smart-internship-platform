import type { Logger } from "../shared/logger";
import type {
  GeneratedProfileInsight,
  ProfileInsightGenerator,
  ProfileInsightInput,
} from "../shared/ports/ProfileInsightGenerator";
import {
  buildProfileInsightContent,
  parseProfileInsight,
  PROFILE_INSIGHT_INSTRUCTIONS,
  PROFILE_INSIGHT_RESPONSE_SCHEMA,
} from "./profile-insight-prompt";

interface GeminiConfig {
  GEMINI_API_KEY?: string | undefined;
  GEMINI_MODEL: string;
}

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Cùng khuôn GeminiRequirementExtractor: dùng cho tầng chính (GEMINI_MODEL) và tầng
 * dự phòng cùng key khác model. `model` là tham số thứ 2 vì awilix (PROXY mode) coi
 * mọi key destructure từ cradle là dependency.
 */
export class GeminiProfileInsightGenerator implements ProfileInsightGenerator {
  private readonly geminiConfig: GeminiConfig;
  private readonly logger: Logger;
  private readonly model: string;

  constructor({ config, logger }: { config: GeminiConfig; logger: Logger }, model?: string) {
    this.geminiConfig = config;
    this.logger = logger;
    this.model = model ?? config.GEMINI_MODEL;
  }

  async generate(input: ProfileInsightInput): Promise<GeneratedProfileInsight> {
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
          parts: [{ text: `${PROFILE_INSIGHT_INSTRUCTIONS}\n\n${buildProfileInsightContent(input)}` }],
        },
      ],
      config: {
        // Văn bản nhận xét — hơi mềm hơn trích xuất (0) nhưng vẫn thấp để bám dữ liệu.
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: PROFILE_INSIGHT_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
        httpOptions: { timeout: REQUEST_TIMEOUT_MS },
      },
    });

    const result = parseProfileInsight(response.text);
    this.logger.info("Gemini profile insight completed", {
      model: this.model,
      strengths: result.strengths.length,
      writingSuggestions: result.writingSuggestions.length,
    });
    return result;
  }
}
