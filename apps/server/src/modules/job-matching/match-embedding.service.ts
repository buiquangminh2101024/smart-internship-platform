import { createHash } from "node:crypto";
import type { EmbeddingProvider } from "../../shared/ports/EmbeddingProvider";
import type { Logger } from "../../shared/logger";
import type { EmbeddingKind, EmbeddingRecord, MatchEmbeddingRepository } from "./match-embedding.repository";

// Cosine giữa vector hồ sơ và vector tin (Job Matcher GĐ2, PLAN quyết định #3–#6).
// Vector tính LƯỜI khi có người xem điểm, lưu kèm contentHash; lần sau so hash tại
// chỗ — không dirty flag, không cron. Mọi lỗi (model, DB, vector sai chiều) đều
// thành `null` để JobMatchingService rơi về rule-v1 thay vì làm hỏng request.

export interface EmbeddingTarget {
  id: string;
  /** Văn bản do match-text.builder dựng; rỗng ⇒ không embed, cosine = null. */
  text: string;
}

export function computeContentHash(input: { templateVersion: number; modelId: string; text: string }): string {
  return createHash("sha256").update(`${input.templateVersion}|${input.modelId}|${input.text}`).digest("hex");
}

export class MatchEmbeddingService {
  private readonly repository: MatchEmbeddingRepository;
  private readonly provider: EmbeddingProvider;
  private readonly templateVersion: number;
  private readonly logger: Logger;

  constructor({
    matchEmbeddingRepository,
    embeddingProvider,
    config,
    logger,
  }: {
    matchEmbeddingRepository: MatchEmbeddingRepository;
    embeddingProvider: EmbeddingProvider;
    config: { MATCH_EMBEDDING_TEMPLATE_VERSION: number };
    logger: Logger;
  }) {
    this.repository = matchEmbeddingRepository;
    this.provider = embeddingProvider;
    this.templateVersion = config.MATCH_EMBEDDING_TEMPLATE_VERSION;
    this.logger = logger;
  }

  /** Cosine của một cặp; null nếu chưa tính được (model lỗi, thiếu văn bản, lỗi DB). */
  async similarity(candidate: EmbeddingTarget, job: EmbeddingTarget): Promise<number | null> {
    const result = await this.similarityForCandidates(job, [candidate], 1);
    return result.get(candidate.id) ?? null;
  }

  /**
   * Cosine của một tin với nhiều hồ sơ (danh sách đơn Employer). Chỉ embed tối đa
   * `maxNewCandidates` hồ sơ chưa có vector hợp lệ; phần vượt được trả `null`
   * (semanticStatus PENDING) và đầy dần ở các lần tải sau. Embed tuần tự: model
   * chạy CPU đơn luồng, song song không nhanh hơn.
   * Mọi id trong `candidates` đều có mặt trong Map kết quả.
   */
  async similarityForCandidates(
    job: EmbeddingTarget,
    candidates: EmbeddingTarget[],
    maxNewCandidates: number,
  ): Promise<Map<string, number | null>> {
    const result = new Map<string, number | null>(candidates.map((candidate) => [candidate.id, null]));
    try {
      const jobReady = await this.ensureVectors("job", [job], 1);
      if (!jobReady.has(job.id)) return result;

      const candidatesReady = await this.ensureVectors("candidate", candidates, maxNewCandidates);
      const cosines = await this.repository.cosinesForJob(job.id, [...candidatesReady]);
      for (const [candidateId, cosine] of cosines) result.set(candidateId, cosine);
      return result;
    } catch (error) {
      this.logger.error("Match embedding failed — falling back to rule-only score", { error });
      return new Map(candidates.map((candidate) => [candidate.id, null]));
    }
  }

  /** Bảo đảm mỗi target có vector khớp hash hiện tại; trả về tập id đã sẵn sàng. */
  private async ensureVectors(kind: EmbeddingKind, targets: EmbeddingTarget[], maxNew: number): Promise<Set<string>> {
    const byId = new Map<string, EmbeddingTarget>();
    for (const target of targets) {
      if (target.text.trim() !== "" && !byId.has(target.id)) byId.set(target.id, target);
    }

    const stored = await this.repository.findHashes(kind, [...byId.keys()]);
    const ready = new Set<string>();
    const stale: { target: EmbeddingTarget; contentHash: string }[] = [];
    for (const target of byId.values()) {
      const contentHash = computeContentHash({
        templateVersion: this.templateVersion,
        modelId: this.provider.modelId,
        text: target.text,
      });
      if (stored.get(target.id) === contentHash) ready.add(target.id);
      else stale.push({ target, contentHash });
    }

    const records: EmbeddingRecord[] = [];
    for (const { target, contentHash } of stale.slice(0, Math.max(0, maxNew))) {
      const vector = await this.provider.embed(target.text);
      // Model không dùng được: dừng luôn — các hồ sơ còn lại cũng sẽ null, và lần
      // tải sau tự thử lại.
      if (!vector) break;
      records.push({
        id: target.id,
        vector,
        contentHash,
        model: this.provider.modelId,
        templateVersion: this.templateVersion,
      });
    }

    await this.repository.upsertMany(kind, records);
    for (const record of records) ready.add(record.id);
    return ready;
  }
}
