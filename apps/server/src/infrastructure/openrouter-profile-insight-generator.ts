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

interface OpenRouterConfig {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL: string;
}

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 60_000;

/** Tầng dự phòng cuối, cùng khuôn OpenRouterRequirementExtractor (fetch thẳng, không thêm SDK). */
export class OpenRouterProfileInsightGenerator implements ProfileInsightGenerator {
  private readonly openRouterConfig: OpenRouterConfig;
  private readonly logger: Logger;

  constructor({ config, logger }: { config: OpenRouterConfig; logger: Logger }) {
    this.openRouterConfig = config;
    this.logger = logger;
  }

  async generate(input: ProfileInsightInput): Promise<GeneratedProfileInsight> {
    if (!this.openRouterConfig.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    // Không ép được responseSchema với mọi model trên OpenRouter — mô tả schema
    // trong prompt, parseProfileInsight lo phần dữ liệu lệch kiểu.
    const prompt = [
      PROFILE_INSIGHT_INSTRUCTIONS,
      "",
      "Chỉ trả về MỘT object JSON (không kèm giải thích, không markdown) theo JSON schema sau:",
      JSON.stringify(PROFILE_INSIGHT_RESPONSE_SCHEMA),
      "",
      buildProfileInsightContent(input),
    ].join("\n");

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.openRouterConfig.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...this.modelSelection(),
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`OpenRouter request failed with ${response.status}: ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const result = parseProfileInsight(payload.choices?.[0]?.message?.content);
    this.logger.info("OpenRouter profile insight completed", {
      strengths: result.strengths.length,
      writingSuggestions: result.writingSuggestions.length,
    });
    return result;
  }

  // Danh sách model phân tách bằng dấu phẩy → gửi `models`, OpenRouter tự thử lần lượt.
  private modelSelection(): { model: string; models?: string[] } {
    const models = this.openRouterConfig.OPENROUTER_MODEL.split(",")
      .map((model) => model.trim())
      .filter(Boolean);
    return models.length > 1 ? { model: models[0]!, models } : { model: models[0] ?? "" };
  }
}
