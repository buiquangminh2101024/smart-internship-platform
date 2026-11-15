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

/** Kết quả `similarityForPairs`: cosine theo ứng viên → tin, và phần embedding của lần gọi. */
export interface PairSimilarities {
  /** cosine của cặp; thiếu (hoặc null) ⇒ chưa có vector hợp lệ cho một trong hai bên. */
  cosines: Map<string, Map<string, number>>;
  /** Số vector mới đã tính (tin + hồ sơ). */
  embedded: number;
  /** Hồ sơ có vector cũ / chưa có mà không được tính vì hết `maxNew` (không phải vì model lỗi). */
  deferredCandidates: Set<string>;
}

interface EnsureResult {
  ready: Set<string>;
  /** Id cần tính lại nhưng nằm ngoài `maxNew`. */
  deferred: Set<string>;
  embedded: number;
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
      const jobReady = (await this.ensureVectors("job", [job], 1)).ready;
      if (!jobReady.has(job.id)) return result;

      const candidatesReady = (await this.ensureVectors("candidate", candidates, maxNewCandidates)).ready;
      const cosines = await this.repository.cosinesForJob(job.id, [...candidatesReady]);
      for (const [candidateId, cosine] of cosines) result.set(candidateId, cosine);
      return result;
    } catch (error) {
      this.logger.error("Match embedding failed — falling back to rule-only score", { error });
      return new Map(candidates.map((candidate) => [candidate.id, null]));
    }
  }

  /**
   * Cosine của một hồ sơ với nhiều tin (Việc làm phù hợp) — đối xứng với
   * similarityForCandidates: chỉ embed tối đa `maxNewJobs` tin chưa có vector hợp
   * lệ, phần vượt trả `null` và đầy dần ở các lần gọi sau.
   * Mọi id trong `jobs` đều có mặt trong Map kết quả.
   */
  async similarityForJobs(
    candidate: EmbeddingTarget,
    jobs: EmbeddingTarget[],
    maxNewJobs: number,
  ): Promise<Map<string, number | null>> {
    const result = new Map<string, number | null>(jobs.map((job) => [job.id, null]));
    try {
      const candidateReady = (await this.ensureVectors("candidate", [candidate], 1)).ready;
      if (!candidateReady.has(candidate.id)) return result;

      const jobsReady = (await this.ensureVectors("job", jobs, maxNewJobs)).ready;
      const cosines = await this.repository.cosinesForCandidate(candidate.id, [...jobsReady]);
      for (const [jobPostId, cosine] of cosines) result.set(jobPostId, cosine);
      return result;
    } catch (error) {
      this.logger.error("Match embedding failed — falling back to rule-only score", { error });
      return new Map(jobs.map((job) => [job.id, null]));
    }
  }

  /**
   * "Việc làm tương tự" (S3): bảo đảm riêng tin đang xem có vector khớp hash hiện tại.
   * false nếu không tính được (model lỗi, văn bản rỗng, lỗi DB) ⇒ gọi bên rơi về
   * nhánh kỹ năng trùng.
   */
  async ensureJobVector(job: EmbeddingTarget): Promise<boolean> {
    try {
      const { ready } = await this.ensureVectors("job", [job], 1);
      return ready.has(job.id);
    } catch (error) {
      this.logger.error("Match embedding failed — similar jobs fall back to shared skills", { error });
      return false;
    }
  }

  /**
   * Cosine của nhiều cặp (ứng viên, tin) cùng lúc — chấm lại theo lô ứng viên (0.6, AD-27
   * mục 5, Q8). Cùng quy tắc với `similarityForCandidates` / `similarityForJobs`: chỉ cặp có
   * vector khớp hash hiện tại ở **cả hai** bên mới có cosine, cùng biểu thức
   * `1 - (c <=> j)`. Một câu hash mỗi loại, một câu cosine cho mọi cặp.
   *
   * `maxNew` chung cho tin và hồ sơ (tin trước: thường đã có vector từ lúc đăng). Lỗi (DB,
   * model) ⇒ mọi cặp không có cosine, như hai hàm kia.
   */
  async similarityForPairs(
    candidates: EmbeddingTarget[],
    jobs: EmbeddingTarget[],
    pairs: Array<{ candidateId: string; jobPostId: string }>,
    maxNew: number,
  ): Promise<PairSimilarities> {
    const empty: PairSimilarities = { cosines: new Map(), embedded: 0, deferredCandidates: new Set() };
    if (pairs.length === 0) return empty;
    let embedded = 0;
    try {
      const jobsResult = await this.ensureVectors("job", jobs, maxNew);
      embedded += jobsResult.embedded;
      const candidatesResult = await this.ensureVectors("candidate", candidates, Math.max(0, maxNew - embedded));
      embedded += candidatesResult.embedded;

      const readyPairs = pairs.filter(
        (pair) => candidatesResult.ready.has(pair.candidateId) && jobsResult.ready.has(pair.jobPostId),
      );
      return {
        cosines: await this.repository.cosinesForPairs(readyPairs),
        embedded,
        deferredCandidates: candidatesResult.deferred,
      };
    } catch (error) {
      this.logger.error("Match embedding failed — falling back to rule-only score", { error });
      // Vector đã tính và ghi trước khi lỗi vẫn được tính vào giới hạn của lượt.
      return { ...empty, embedded };
    }
  }

  /**
   * Bảo đảm mỗi target có vector khớp hash hiện tại. `ready`: id đã sẵn sàng; `deferred`:
   * id cần tính mà nằm ngoài `maxNew`; `embedded`: số vector vừa tính và ghi.
   */
  private async ensureVectors(kind: EmbeddingKind, targets: EmbeddingTarget[], maxNew: number): Promise<EnsureResult> {
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
    const deferred = new Set(stale.slice(Math.max(0, maxNew)).map(({ target }) => target.id));
    return { ready, deferred, embedded: records.length };
  }
}
