import type { Redis } from "ioredis";
import type { Logger } from "../shared/logger";
import type {
  SkillMatchCandidate,
  SkillMatchDecision,
  SkillMatchVerifier,
} from "../shared/ports/SkillMatchVerifier";
import { normalizeSkillName } from "../modules/skills/skill-normalize.util";

interface GeminiConfig {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
}

// Cùng một cặp (tên mới, danh sách ứng viên) sẽ xuất hiện lại nhiều lần: nhiều
// người cùng gõ một biến thể, và cron chạy lại sau khi bị gián đoạn. Cache 7
// ngày để không trả tiền hai lần cho cùng một câu hỏi.
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["MATCH", "NEW", "UNSURE"] },
    matchedSkillId: { type: "string", nullable: true },
  },
  required: ["decision"],
} as const;

export class GeminiSkillMatchVerifier implements SkillMatchVerifier {
  private readonly geminiConfig: GeminiConfig;
  private readonly redis: Redis;
  private readonly logger: Logger;

  // Lazy giống ResendEmailSender: instance bị awilix resolve ngay khi service
  // phụ thuộc được dựng, kể cả ở môi trường dev không cấu hình GEMINI_API_KEY.
  constructor({ config, redis, logger }: { config: GeminiConfig; redis: Redis; logger: Logger }) {
    this.geminiConfig = config;
    this.redis = redis;
    this.logger = logger;
  }

  async verify(newName: string, candidates: SkillMatchCandidate[]): Promise<SkillMatchDecision> {
    if (candidates.length === 0) return { decision: "NEW" };
    if (!this.geminiConfig.GEMINI_API_KEY) {
      this.logger.warn("GEMINI_API_KEY is not configured — skill verification deferred to admin");
      return { decision: "UNSURE" };
    }

    const cacheKey = this.cacheKey(newName, candidates);
    const cached = await this.readCache(cacheKey, candidates);
    if (cached) return cached;

    try {
      const decision = await this.ask(newName, candidates);
      // UNSURE thường là lỗi nhất thời (timeout, quota) — cache lại sẽ khoá luôn
      // kết quả sai trong 7 ngày, nên chỉ cache kết luận chắc chắn.
      if (decision.decision !== "UNSURE") {
        await this.redis.set(cacheKey, JSON.stringify(decision), "EX", CACHE_TTL_SECONDS);
      }
      return decision;
    } catch (error) {
      this.logger.error("Gemini skill verification failed", { error });
      return { decision: "UNSURE" };
    }
  }

  private async ask(newName: string, candidates: SkillMatchCandidate[]): Promise<SkillMatchDecision> {
    const { GoogleGenAI } = await import("@google/genai");
    const client = new GoogleGenAI({ apiKey: this.geminiConfig.GEMINI_API_KEY! });

    const list = candidates.map((candidate) => `- id=${candidate.skillId} | name="${candidate.name}"`).join("\n");
    const response = await client.models.generateContent({
      model: this.geminiConfig.GEMINI_MODEL,
      contents: [
        "Bạn đang chuẩn hoá danh mục kỹ năng của một nền tảng tuyển dụng thực tập sinh Việt Nam.",
        `Kỹ năng người dùng vừa nhập: "${newName}"`,
        "Các kỹ năng đã có trong danh mục, gần nghĩa nhất:",
        list,
        "",
        'Trả về MATCH kèm matchedSkillId nếu tên mới chỉ là cách viết khác của đúng một kỹ năng trong danh sách (viết tắt, khác ngôn ngữ, khác dấu câu, sai chính tả nhẹ).',
        'Trả về NEW nếu đây là một kỹ năng khác hẳn — kể cả khi cùng lĩnh vực.',
        'Trả về UNSURE nếu không đủ căn cứ để quyết định.',
        "Lưu ý: các phiên bản/biến thể khác nhau của cùng một công nghệ (ví dụ Java và JavaScript, C và C++) là những kỹ năng KHÁC NHAU.",
      ].join("\n"),
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      },
    });

    return this.parse(response.text, candidates);
  }

  private parse(text: string | undefined, candidates: SkillMatchCandidate[]): SkillMatchDecision {
    if (!text) return { decision: "UNSURE" };

    let payload: { decision?: unknown; matchedSkillId?: unknown };
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      this.logger.warn("Gemini returned non-JSON skill verification response");
      return { decision: "UNSURE" };
    }

    if (payload.decision === "NEW") return { decision: "NEW" };
    if (payload.decision !== "MATCH") return { decision: "UNSURE" };

    // Không tin id model trả về: nếu nó bịa ra một id không nằm trong danh sách
    // đã gửi thì việc gộp sẽ trỏ dữ liệu vào skill sai — chặn ở đây.
    const matchedSkillId = String(payload.matchedSkillId ?? "");
    if (!candidates.some((candidate) => candidate.skillId === matchedSkillId)) {
      this.logger.warn("Gemini returned an unknown matchedSkillId", { matchedSkillId });
      return { decision: "UNSURE" };
    }
    return { decision: "MATCH", matchedSkillId };
  }

  private async readCache(key: string, candidates: SkillMatchCandidate[]): Promise<SkillMatchDecision | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as SkillMatchDecision;
      // Skill đích có thể đã bị Admin xoá kể từ lúc cache — bỏ cache, hỏi lại.
      if (parsed.decision === "MATCH" && !candidates.some((c) => c.skillId === parsed.matchedSkillId)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private cacheKey(newName: string, candidates: SkillMatchCandidate[]): string {
    const ids = candidates.map((candidate) => candidate.skillId).sort().join(",");
    return `skill-verify:${normalizeSkillName(newName)}:${ids}`;
  }
}
