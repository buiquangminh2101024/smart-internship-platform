import type { Redis } from "ioredis";
import type { Logger } from "../shared/logger";
import type {
  CatalogDomain,
  CatalogMatchCandidate,
  CatalogMatchDecision,
  CatalogMatchVerifier,
} from "../shared/ports/CatalogMatchVerifier";
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
    matchedId: { type: "string", nullable: true },
  },
  required: ["decision"],
} as const;

// Phần prompt khác nhau theo loại catalog. Luồng hỏi/parse/cache giữ chung.
const DOMAIN_PROMPTS: Record<CatalogDomain, { noun: string; catalog: string; caveat: string }> = {
  skill: {
    noun: "Kỹ năng",
    catalog: "danh mục kỹ năng",
    caveat:
      "Lưu ý: các phiên bản/biến thể khác nhau của cùng một công nghệ (ví dụ Java và JavaScript, C và C++) là những kỹ năng KHÁC NHAU.",
  },
  university: {
    noun: "Trường",
    catalog: "danh mục trường đại học/cao đẳng/học viện",
    caveat:
      "Lưu ý: các cơ sở/phân hiệu, hoặc các trường thành viên khác nhau của cùng một đại học (ví dụ ĐH Bách khoa và ĐH Khoa học Tự nhiên cùng thuộc ĐHQG TP.HCM) là những trường KHÁC NHAU. Tên viết tắt (HUST, NEU, UIT...) hoặc tên tiếng Anh của đúng một trường thì là MATCH.",
  },
  major: {
    noun: "Ngành học",
    catalog: "danh mục ngành học",
    caveat:
      "Lưu ý: các ngành khác nhau dù cùng nhóm ngành (ví dụ Khoa học máy tính và Kỹ thuật phần mềm, Kế toán và Kiểm toán) là những ngành KHÁC NHAU. Tên tiếng Anh hoặc cách viết khác của đúng một ngành thì là MATCH.",
  },
};

/**
 * Dùng chung cho Skill/University/Major (docs/06-backend/cv-ai-extraction-phase2/PLAN.md
 * Quyết định #3) — chỉ đổi nội dung prompt theo `domain`.
 */
export class GeminiCatalogMatchVerifier implements CatalogMatchVerifier {
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

  async verify(
    domain: CatalogDomain,
    newName: string,
    candidates: CatalogMatchCandidate[],
  ): Promise<CatalogMatchDecision> {
    if (candidates.length === 0) return { decision: "NEW" };
    if (!this.geminiConfig.GEMINI_API_KEY) {
      this.logger.warn(`GEMINI_API_KEY is not configured — ${domain} verification deferred to admin`);
      return { decision: "UNSURE" };
    }

    const cacheKey = this.cacheKey(domain, newName, candidates);
    const cached = await this.readCache(cacheKey, candidates);
    if (cached) return cached;

    try {
      const decision = await this.ask(domain, newName, candidates);
      // UNSURE thường là lỗi nhất thời (timeout, quota) — cache lại sẽ khoá luôn
      // kết quả sai trong 7 ngày, nên chỉ cache kết luận chắc chắn.
      if (decision.decision !== "UNSURE") {
        await this.redis.set(cacheKey, JSON.stringify(decision), "EX", CACHE_TTL_SECONDS);
      }
      return decision;
    } catch (error) {
      this.logger.error(`Gemini ${domain} verification failed`, { error });
      return { decision: "UNSURE" };
    }
  }

  private async ask(
    domain: CatalogDomain,
    newName: string,
    candidates: CatalogMatchCandidate[],
  ): Promise<CatalogMatchDecision> {
    const { GoogleGenAI } = await import("@google/genai");
    const client = new GoogleGenAI({ apiKey: this.geminiConfig.GEMINI_API_KEY! });
    const prompt = DOMAIN_PROMPTS[domain];

    const list = candidates.map((candidate) => `- id=${candidate.id} | name="${candidate.name}"`).join("\n");
    const response = await client.models.generateContent({
      model: this.geminiConfig.GEMINI_MODEL,
      contents: [
        `Bạn đang chuẩn hoá ${prompt.catalog} của một nền tảng tuyển dụng thực tập sinh Việt Nam.`,
        `${prompt.noun} người dùng vừa nhập: "${newName}"`,
        `Các mục đã có trong danh mục, gần nghĩa nhất:`,
        list,
        "",
        "Trả về MATCH kèm matchedId nếu tên mới chỉ là cách viết khác của đúng một mục trong danh sách (viết tắt, khác ngôn ngữ, khác dấu câu, sai chính tả nhẹ).",
        "Trả về NEW nếu đây là một mục khác hẳn — kể cả khi cùng lĩnh vực.",
        "Trả về UNSURE nếu không đủ căn cứ để quyết định.",
        prompt.caveat,
      ].join("\n"),
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
      },
    });

    return this.parse(domain, response.text, candidates);
  }

  private parse(domain: CatalogDomain, text: string | undefined, candidates: CatalogMatchCandidate[]): CatalogMatchDecision {
    if (!text) return { decision: "UNSURE" };

    let payload: { decision?: unknown; matchedId?: unknown };
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      this.logger.warn(`Gemini returned non-JSON ${domain} verification response`);
      return { decision: "UNSURE" };
    }

    if (payload.decision === "NEW") return { decision: "NEW" };
    if (payload.decision !== "MATCH") return { decision: "UNSURE" };

    // Không tin id model trả về: nếu nó bịa ra một id không nằm trong danh sách
    // đã gửi thì việc gộp sẽ trỏ dữ liệu vào mục sai — chặn ở đây.
    const matchedId = String(payload.matchedId ?? "");
    if (!candidates.some((candidate) => candidate.id === matchedId)) {
      this.logger.warn(`Gemini returned an unknown matchedId for ${domain}`, { matchedId });
      return { decision: "UNSURE" };
    }
    return { decision: "MATCH", matchedId };
  }

  private async readCache(key: string, candidates: CatalogMatchCandidate[]): Promise<CatalogMatchDecision | null> {
    const raw = await this.redis.get(key);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as CatalogMatchDecision;
      // Mục đích có thể đã bị Admin xoá kể từ lúc cache — bỏ cache, hỏi lại.
      if (parsed.decision === "MATCH" && !candidates.some((c) => c.id === parsed.matchedId)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private cacheKey(domain: CatalogDomain, newName: string, candidates: CatalogMatchCandidate[]): string {
    const ids = candidates.map((candidate) => candidate.id).sort().join(",");
    return `catalog-verify:${domain}:${normalizeSkillName(newName)}:${ids}`;
  }
}
