import type { Logger } from "../shared/logger";
import type { CvExtractionInput, CvExtractionResult, CvExtractor } from "../shared/ports/CvExtractor";
import { CV_EXTRACTION_INSTRUCTIONS, CV_EXTRACTION_RESPONSE_SCHEMA, parseCvExtraction } from "./cv-extraction-prompt";

interface OpenRouterConfig {
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL: string;
}

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
// Model free chậm hơn Gemini nhiều (đo thực tế 9-20 giây với 1 ảnh CV).
const REQUEST_TIMEOUT_MS = 90_000;

/**
 * Tầng dự phòng khi Gemini lỗi. API tương thích OpenAI nên gọi thẳng bằng
 * fetch, không thêm SDK. Các model free mặc định đọc được text và ảnh, nhưng
 * định dạng nhận PDF thô không thống nhất giữa các model, nên kind "pdf" bị từ
 * chối ngay để FallbackCvExtractor biết tầng này không dùng được.
 */
export class OpenRouterCvExtractor implements CvExtractor {
  private readonly openRouterConfig: OpenRouterConfig;
  private readonly logger: Logger;

  constructor({ config, logger }: { config: OpenRouterConfig; logger: Logger }) {
    this.openRouterConfig = config;
    this.logger = logger;
  }

  async extract(input: CvExtractionInput): Promise<CvExtractionResult> {
    if (!this.openRouterConfig.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }
    if (input.kind === "pdf") {
      throw new Error("OpenRouter fallback does not accept raw PDF input");
    }

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.openRouterConfig.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Model free trên OpenRouter hay bị gỡ hoặc rate-limit upstream. Nhận
        // danh sách phân tách bằng dấu phẩy → gửi `models`, OpenRouter tự thử
        // lần lượt; nên trộn nhiều nhà cung cấp để không chết cùng lúc.
        ...this.modelSelection(),
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: this.buildContent(input) }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`OpenRouter request failed with ${response.status}: ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const result = parseCvExtraction(payload.choices?.[0]?.message?.content);
    this.logger.info("OpenRouter CV extraction completed", { kind: input.kind, isValidCv: result.isValidCv });
    return result;
  }

  private modelSelection(): { model: string; models?: string[] } {
    const models = this.openRouterConfig.OPENROUTER_MODEL.split(",")
      .map((model) => model.trim())
      .filter(Boolean);
    return models.length > 1 ? { model: models[0]!, models } : { model: models[0] ?? "" };
  }

  private buildContent(input: Exclude<CvExtractionInput, { kind: "pdf" }>) {
    // Không ép được responseSchema với mọi model trên OpenRouter — mô tả schema
    // ngay trong prompt, parseCvExtraction lo phần dữ liệu lệch kiểu.
    const instructions = [
      CV_EXTRACTION_INSTRUCTIONS,
      "",
      "Chỉ trả về MỘT object JSON (không kèm giải thích, không markdown) theo JSON schema sau:",
      JSON.stringify(CV_EXTRACTION_RESPONSE_SCHEMA),
    ].join("\n");

    if (input.kind === "text") {
      return `${instructions}\n\nNội dung CV:\n"""\n${input.text}\n"""`;
    }
    return [
      { type: "text", text: instructions },
      { type: "image_url", image_url: { url: `data:${input.mimeType};base64,${input.buffer.toString("base64")}` } },
    ];
  }
}
