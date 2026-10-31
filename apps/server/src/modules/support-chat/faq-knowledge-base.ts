import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { EmbeddingProvider } from "../../shared/ports/EmbeddingProvider";
import type { Logger } from "../../shared/logger";
import { stripVietnameseMarks } from "../applications/applications.repository";
import { normalizeFaqText, parseFaqMarkdown, type FaqItem } from "./faq-markdown.util";

// Kho FAQ của chatbot hỗ trợ (PLAN mục "Index trong bộ nhớ, không dùng pgvector"):
// ~40 mục × ~6 câu hỏi mẫu (mỗi câu thêm một bản bỏ dấu) ≈ 560 vector 384 chiều, so bằng
// tích vô hướng trong JS —
// không migration, không truy vấn DB nào cho chatbot.
//
// Vector tính sẵn bằng `npm run support-chat:index` và commit trong faq-index.json để
// server khởi động không phải embed lại. Index lệch (sửa FAQ mà quên chạy script, đổi
// model) ⇒ log cảnh báo và tính lại trong bộ nhớ ở lần search đầu tiên.

/** apps/server/content/support-faq — cùng đường dẫn khi chạy từ src (tsx) hay dist. */
export const FAQ_CONTENT_DIR = path.resolve(__dirname, "../../../content/support-faq");
export const FAQ_INDEX_FILE = "faq-index.json";

/**
 * Tăng khi đổi cách dựng văn bản đem embed (contentTextOf) hoặc cách lưu vector — đi
 * vào contentHash nên index cũ tự hết hiệu lực.
 */
const INDEX_FORMAT_VERSION = 2;

/** Người hỏi. Admin được xử lý như khách (PLAN mục "Xác thực tuỳ chọn"). */
export type FaqViewer = "guest" | "candidate" | "employer";

export interface FaqIndexFile {
  formatVersion: number;
  modelId: string;
  contentHash: string;
  /**
   * Vector Float32 little-endian mã hoá base64 — gọn hơn ~1/3 so với mảng số JSON.
   * `accentFreeQuestionVectors[i]` là vector của stripVietnameseMarks(questions[i]).
   */
  items: Array<{ faqId: string; questionVectors: string[]; accentFreeQuestionVectors: string[]; contentVector: string }>;
}

export interface FaqScore {
  faqId: string;
  /** Cosine cao nhất giữa câu hỏi và các câu hỏi mẫu của mục — dùng cho bậc 2. */
  questionScore: number;
  matchedQuestion: string;
  /** Cosine giữa câu hỏi và `title + nội dung` của mục. */
  contentScore: number;
}

interface ItemVectors {
  questionVectors: Float32Array[];
  accentFreeQuestionVectors: Float32Array[];
  contentVector: Float32Array;
}

/**
 * Câu gõ không dấu (PLAN mục "Pipeline xử lý một câu hỏi"): bậc 2 không trả thẳng và không chặn
 * "ngoài phạm vi" — model embedding chấm câu không dấu thất thường (khớp sai mục với score
 * 0,95, câu đúng mục lại dưới 0,4), nên luôn xuống bậc 4. Bản bỏ dấu của câu hỏi mẫu chỉ
 * dùng để chọn đoạn đưa vào prompt cho câu không dấu. Câu có dấu vẫn chỉ so với câu hỏi mẫu
 * gốc, để bản bỏ dấu (mơ hồ hơn: "dang" là đăng hay đang) không kéo điểm câu ngoài phạm vi lên.
 */
export function isAccentFree(text: string): boolean {
  return stripVietnameseMarks(text) === text;
}

/**
 * Khách thấy mọi mục (khách có thể là sinh viên hoặc nhà tuyển dụng chưa đăng nhập).
 * Người đã đăng nhập thấy mục `all` và mục của đúng vai trò mình.
 */
export function isFaqVisibleTo(item: FaqItem, viewer: FaqViewer): boolean {
  return viewer === "guest" || item.audience === "all" || item.audience === viewer;
}

export function loadFaqItems(contentDir = FAQ_CONTENT_DIR): { items: FaqItem[]; contentHash: string } {
  const files = readdirSync(contentDir)
    .filter((file) => file.endsWith(".md"))
    .sort();
  if (files.length === 0) throw new Error(`No FAQ markdown files in ${contentDir}`);

  const hash = createHash("sha256").update(`format:${INDEX_FORMAT_VERSION}\n`);
  const items: FaqItem[] = [];
  const seen = new Map<string, string>();
  for (const file of files) {
    const content = normalizeFaqText(readFileSync(path.join(contentDir, file), "utf8"));
    hash.update(`file:${file}\n${content}\n`);
    for (const item of parseFaqMarkdown(content, file)) {
      const previous = seen.get(item.id);
      if (previous) throw new Error(`Duplicate FAQ id "${item.id}" in ${previous} and ${file}`);
      seen.set(item.id, file);
      items.push(item);
    }
  }
  return { items, contentHash: hash.digest("hex") };
}

/** Văn bản đại diện cho cả mục (bậc 4 chọn đoạn đưa vào prompt). Bỏ dấu ** vì không mang nghĩa. */
export function contentTextOf(item: FaqItem): string {
  return `${item.title}\n${item.answer}`.replace(/\*\*/g, "");
}

/**
 * Điểm xếp hạng khi chọn đoạn cho prompt bậc 4: trung bình score câu hỏi mẫu và score
 * nội dung. Đợt B so 4 cách trên bộ eval, cách này đưa mục đúng vào top-3 nhiều nhất
 * (docs/06-backend/support-chatbot/eval/eval-results.md). Bậc 2 vẫn chỉ dùng questionScore.
 */
export function contextRankOf(score: FaqScore): number {
  return (score.questionScore + score.contentScore) / 2;
}

/** Embed toàn bộ câu hỏi mẫu và nội dung; null nếu model không dùng được. */
export async function buildFaqIndex(
  items: FaqItem[],
  contentHash: string,
  provider: EmbeddingProvider,
): Promise<FaqIndexFile | null> {
  const result: FaqIndexFile = { formatVersion: INDEX_FORMAT_VERSION, modelId: provider.modelId, contentHash, items: [] };
  // Tuần tự: model chạy CPU đơn luồng, song song không nhanh hơn.
  for (const item of items) {
    const questionVectors: string[] = [];
    const accentFreeQuestionVectors: string[] = [];
    for (const question of item.questions) {
      const vector = await provider.embed(question);
      if (!vector) return null;
      questionVectors.push(encodeVector(vector));
      const stripped = stripVietnameseMarks(question);
      const accentFreeVector = stripped === question ? vector : await provider.embed(stripped);
      if (!accentFreeVector) return null;
      accentFreeQuestionVectors.push(encodeVector(accentFreeVector));
    }
    const contentVector = await provider.embed(contentTextOf(item));
    if (!contentVector) return null;
    result.items.push({
      faqId: item.id,
      questionVectors,
      accentFreeQuestionVectors,
      contentVector: encodeVector(contentVector),
    });
  }
  return result;
}

export class FaqKnowledgeBase {
  /** = contentHash; đi vào key cache câu trả lời để sửa FAQ là cache cũ tự hết hiệu lực. */
  readonly version: string;
  private readonly items: FaqItem[];
  private readonly byId: Map<string, FaqItem>;
  private readonly provider: EmbeddingProvider;
  private readonly logger: Logger;
  private vectors: Map<string, ItemVectors> | null = null;
  private building: Promise<Map<string, ItemVectors> | null> | null = null;

  constructor({ embeddingProvider, logger }: { embeddingProvider: EmbeddingProvider; logger: Logger }) {
    this.provider = embeddingProvider;
    this.logger = logger;
    // Đọc đồng bộ: chỉ chạy một lần lúc dựng singleton, và FAQ sai định dạng phải làm
    // hỏng ngay chứ không để chatbot chạy với kho thiếu mục.
    const { items, contentHash } = loadFaqItems();
    this.items = items;
    this.byId = new Map(items.map((item) => [item.id, item]));
    this.version = contentHash;
    this.vectors = this.readIndexFile();
  }

  getById(id: string): FaqItem | undefined {
    return this.byId.get(id);
  }

  listVisible(viewer: FaqViewer): FaqItem[] {
    return this.items.filter((item) => isFaqVisibleTo(item, viewer));
  }

  /**
   * Điểm của mọi mục người hỏi được thấy, xếp theo questionScore giảm dần. null khi
   * không có vector (model embedding không dùng được) — pipeline bỏ qua bậc 2.
   * `vector` phải đã chuẩn hoá độ dài (EmbeddingProvider đảm bảo). `accentFree`: câu hỏi gõ
   * không dấu (isAccentFree) — so với bản bỏ dấu của câu hỏi mẫu.
   */
  async score(
    vector: number[],
    viewer: FaqViewer,
    { accentFree = false }: { accentFree?: boolean } = {},
  ): Promise<FaqScore[] | null> {
    const vectors = await this.ensureVectors();
    if (!vectors) return null;

    const scores: FaqScore[] = [];
    for (const item of this.items) {
      if (!isFaqVisibleTo(item, viewer)) continue;
      const itemVectors = vectors.get(item.id);
      if (!itemVectors) continue;
      let questionScore = -Infinity;
      let matchedQuestion = "";
      const questionVectors = accentFree ? itemVectors.accentFreeQuestionVectors : itemVectors.questionVectors;
      questionVectors.forEach((questionVector, index) => {
        const score = dot(vector, questionVector);
        if (score > questionScore) {
          questionScore = score;
          matchedQuestion = item.questions[index] ?? "";
        }
      });
      scores.push({ faqId: item.id, questionScore, matchedQuestion, contentScore: dot(vector, itemVectors.contentVector) });
    }
    return scores.sort((a, b) => b.questionScore - a.questionScore);
  }

  /** `k` mục đưa vào prompt bậc 4, xếp theo contextRankOf. null khi không có vector. */
  async topContext(
    vector: number[],
    viewer: FaqViewer,
    k: number,
    options: { accentFree?: boolean } = {},
  ): Promise<FaqItem[] | null> {
    const scores = await this.score(vector, viewer, options);
    if (!scores) return null;
    return scores
      .sort((a, b) => contextRankOf(b) - contextRankOf(a))
      .slice(0, k)
      .flatMap((score) => this.byId.get(score.faqId) ?? []);
  }

  private async ensureVectors(): Promise<Map<string, ItemVectors> | null> {
    if (this.vectors) return this.vectors;
    // Một lần dựng cho mọi request đang chờ; dựng hỏng thì lần sau thử lại (rẻ, vì
    // SkillEmbeddingService đã nhớ trạng thái model hỏng và trả null ngay).
    this.building ??= buildFaqIndex(this.items, this.version, this.provider)
      .then((index) => (index ? decodeIndex(index) : null))
      .catch((error) => {
        this.logger.error("Failed to build FAQ index", { error });
        return null;
      })
      .finally(() => {
        this.building = null;
      });
    const vectors = await this.building;
    if (vectors) this.vectors = vectors;
    return vectors;
  }

  private readIndexFile(): Map<string, ItemVectors> | null {
    const indexPath = path.join(FAQ_CONTENT_DIR, FAQ_INDEX_FILE);
    if (!existsSync(indexPath)) {
      this.logger.warn(`${FAQ_INDEX_FILE} not found — FAQ index will be built in memory on first use`);
      return null;
    }
    try {
      const index = JSON.parse(readFileSync(indexPath, "utf8")) as FaqIndexFile;
      const stale =
        index.formatVersion !== INDEX_FORMAT_VERSION ||
        index.modelId !== this.provider.modelId ||
        index.contentHash !== this.version;
      if (stale) {
        this.logger.warn(
          `${FAQ_INDEX_FILE} is stale (FAQ or model changed) — run "npm run support-chat:index -w apps/server"; rebuilding in memory on first use`,
        );
        return null;
      }
      return decodeIndex(index);
    } catch (error) {
      this.logger.warn(`${FAQ_INDEX_FILE} is unreadable — rebuilding in memory on first use`, { error });
      return null;
    }
  }
}

function decodeIndex(index: FaqIndexFile): Map<string, ItemVectors> {
  return new Map(
    index.items.map((item) => [
      item.faqId,
      {
        questionVectors: item.questionVectors.map(decodeVector),
        accentFreeQuestionVectors: item.accentFreeQuestionVectors.map(decodeVector),
        contentVector: decodeVector(item.contentVector),
      },
    ]),
  );
}

function encodeVector(vector: number[]): string {
  const buffer = Buffer.alloc(vector.length * 4);
  vector.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer.toString("base64");
}

function decodeVector(encoded: string): Float32Array {
  const buffer = Buffer.from(encoded, "base64");
  const vector = new Float32Array(buffer.length / 4);
  for (let index = 0; index < vector.length; index++) vector[index] = buffer.readFloatLE(index * 4);
  return vector;
}

function dot(a: number[], b: Float32Array): number {
  if (a.length !== b.length) return -Infinity;
  let sum = 0;
  for (let index = 0; index < a.length; index++) sum += a[index]! * b[index]!;
  return sum;
}
