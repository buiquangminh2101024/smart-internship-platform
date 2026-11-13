import type { PrismaClient } from "@prisma/client";
import type { JobPost, JobRecommendationList, MatchResult } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { CandidateMatchProfile, JobMatcher, JobMatchProfile } from "../../shared/ports/JobMatcher";
import { buildCodeSuggestions } from "../candidate-insights/profile-suggestions.util";
import type { CandidateMatchProfileLoader } from "./candidate-match-profile.loader";
import type { JobMatchProfileLoader } from "./job-match-profile.loader";
import {
  MAX_NEW_EMBEDDINGS_PER_REQUEST,
  MIN_RECOMMENDATION_SCORE,
  RECOMMENDATION_LIMIT,
  RECOMMENDATION_POOL_SIZE,
  RECOMMENDATION_RERANK_SIZE,
} from "./job-matching.config";
import type { JobMatcherMode } from "./job-matching.service";
import type { JobRecommendationRepository } from "./job-recommendation.repository";
import type { MatchEmbeddingService } from "./match-embedding.service";
import { markSemanticPending } from "./scoring-job-matcher";

/** Offset lớn nhất nhận qua cursor — ứng viên nhiều tin nhất ở bước 0 có 218 tin ≥ 20. */
const MAX_CURSOR_OFFSET = 10_000;

export interface TopMatchOptions {
  limit?: number;
  minScore?: number;
}

interface PageOptions {
  offset: number;
  limit: number;
  minScore: number;
}

/**
 * "Việc làm phù hợp" (B2, AD-14; AD-26 — docs/06-backend/job-discovery/PLAN.md bước 2):
 * tin hợp với MỘT hồ sơ, đối xứng với listApplicationMatches (N hồ sơ ↔ 1 tin).
 * Không LLM, không hạn mức.
 * - TABLE (D1): đọc bảng điểm lưu sẵn (AD-24), phân trang; chấm hybrid lại các tin của
 *   trang để có lý do theo tiêu chí và điểm mới nhất, rồi sắp lại trong trang.
 * - LIVE (D2): ứng viên chưa có dòng nào cho tin đang hiển thị (vd. vừa tạo hồ sơ) —
 *   lọc thô + rule + hybrid như trước, bỏ giới hạn 30 ngày, chỉ một trang.
 * Cả hai trừ tin đã ứng tuyển / đã được mời (D3).
 * `getTopMatches` là trang đầu, dùng chung với candidate-insights (trợ lý hồ sơ) để hai
 * nơi cùng một danh sách.
 */
export class JobRecommendationService {
  private readonly prisma: PrismaClient;
  private readonly ruleJobMatcher: JobMatcher;
  private readonly hybridJobMatcher: JobMatcher;
  private readonly matchEmbeddingService: MatchEmbeddingService;
  private readonly candidateMatchProfileLoader: CandidateMatchProfileLoader;
  private readonly jobMatchProfileLoader: JobMatchProfileLoader;
  private readonly repository: JobRecommendationRepository;
  private readonly mode: JobMatcherMode;

  constructor({
    prisma,
    ruleJobMatcher,
    hybridJobMatcher,
    matchEmbeddingService,
    candidateMatchProfileLoader,
    jobMatchProfileLoader,
    jobRecommendationRepository,
    config,
  }: {
    prisma: PrismaClient;
    ruleJobMatcher: JobMatcher;
    hybridJobMatcher: JobMatcher;
    matchEmbeddingService: MatchEmbeddingService;
    candidateMatchProfileLoader: CandidateMatchProfileLoader;
    jobMatchProfileLoader: JobMatchProfileLoader;
    jobRecommendationRepository: JobRecommendationRepository;
    config: { JOB_MATCHER_MODE: JobMatcherMode };
  }) {
    this.prisma = prisma;
    this.ruleJobMatcher = ruleJobMatcher;
    this.hybridJobMatcher = hybridJobMatcher;
    this.matchEmbeddingService = matchEmbeddingService;
    this.candidateMatchProfileLoader = candidateMatchProfileLoader;
    this.jobMatchProfileLoader = jobMatchProfileLoader;
    this.repository = jobRecommendationRepository;
    this.mode = config.JOB_MATCHER_MODE;
  }

  async recommendForUser(userId: string, options: { cursor?: string | undefined } = {}): Promise<JobRecommendationList> {
    const candidate = await this.prisma.candidate.findUnique({ where: { userId }, select: { id: true } });
    if (!candidate) throw new AppError(404, "Candidate profile not found");
    return this.listForCandidate(candidate.id, options);
  }

  async listForCandidate(candidateId: string, options: { cursor?: string | undefined } = {}): Promise<JobRecommendationList> {
    return this.findPage(candidateId, {
      offset: parseRecommendationCursor(options.cursor),
      limit: RECOMMENDATION_LIMIT,
      minScore: MIN_RECOMMENDATION_SCORE,
    });
  }

  /** Trang đầu — candidate-insights gọi thẳng hàm này thay vì tự lọc/chấm lại. */
  async getTopMatches(candidateId: string, options: TopMatchOptions = {}): Promise<JobRecommendationList> {
    return this.findPage(candidateId, {
      offset: 0,
      limit: options.limit ?? RECOMMENDATION_LIMIT,
      minScore: options.minScore ?? MIN_RECOMMENDATION_SCORE,
    });
  }

  /**
   * `MatchResult` (chấm rule) của các tin trang đầu — cùng tập tin với `getTopMatches`, chỉ
   * khác thứ tự trong trang. Không nạp tin công khai, không lấy vector: dùng cho "Nên làm
   * trước" của độ hoàn thiện (AD-26 mục 8), vốn chỉ đọc trạng thái kinh nghiệm / học vấn,
   * hai thứ không phụ thuộc thành phần nội dung. Bước 3 đo: ~1,3 s qua getTopMatches.
   */
  async getTopMatchResults(candidateId: string, options: TopMatchOptions = {}): Promise<MatchResult[]> {
    const pageOptions: PageOptions = {
      offset: 0,
      limit: options.limit ?? RECOMMENDATION_LIMIT,
      minScore: options.minScore ?? MIN_RECOMMENDATION_SCORE,
    };
    const [candidate, page] = await Promise.all([
      this.candidateMatchProfileLoader.load(candidateId),
      this.repository.findScoredPage(candidateId, {
        minScore: pageOptions.minScore,
        offset: 0,
        take: pageOptions.limit,
      }),
    ]);
    if (!candidate) throw new AppError(404, "Candidate profile not found");
    if (candidate.skills.length === 0) return [];
    if (page.total === 0 && !(await this.repository.hasScoredVisibleJob(candidateId))) {
      return (await this.findLivePage(candidate, pageOptions)).items.map((item) => item.match);
    }
    const scored = await this.scoreRule(
      candidate,
      page.rows.map((row) => row.jobPostId),
    );
    return scored.map((entry) => entry.match);
  }

  private async findPage(candidateId: string, options: PageOptions): Promise<JobRecommendationList> {
    // Các bước độc lập chạy song song: thời gian chủ yếu là độ trễ tới DB, không phải câu
    // đọc bảng điểm (bước 2: câu trang 55–110 ms, nạp hồ sơ ~350 ms, nạp tin ~600 ms).
    const [candidate, page] = await Promise.all([
      this.candidateMatchProfileLoader.load(candidateId),
      this.repository.findScoredPage(candidateId, {
        minScore: options.minScore,
        offset: options.offset,
        take: options.limit,
      }),
    ]);
    if (!candidate) throw new AppError(404, "Candidate profile not found");
    // Cùng điều kiện với ScoringJobMatcher: không kỹ năng ⇒ mọi tin đều INSUFFICIENT_PROFILE
    // (nên bảng điểm cũng không có dòng nào của ứng viên này).
    if (candidate.skills.length === 0) return emptyList("INSUFFICIENT_PROFILE", "TABLE");

    if (page.total === 0 && !(await this.repository.hasScoredVisibleJob(candidateId))) {
      // D2 — chỉ một trang: trang sau của đường LIVE luôn rỗng.
      return options.offset === 0 ? this.findLivePage(candidate, options) : emptyList("OK", "LIVE");
    }

    const ids = page.rows.map((row) => row.jobPostId);
    const [rescored, jobPosts] = await Promise.all([
      this.scoreJobs(candidate, ids),
      this.repository.findPublicByIds(ids),
    ]);
    const items = attachJobPosts(sortByScore(rescored), jobPosts);

    const nextOffset = options.offset + page.rows.length;
    return {
      status: "OK",
      source: "TABLE",
      items,
      total: page.total,
      nextCursor: page.rows.length > 0 && nextOffset < page.total ? String(nextOffset) : null,
      suggestions: options.offset === 0 ? buildCodeSuggestions(items) : [],
    };
  }

  /** Đường chấm trực tiếp (lọc thô → rule → hybrid top), bỏ giới hạn 30 ngày (D2). */
  private async findLivePage(candidate: CandidateMatchProfile, options: PageOptions): Promise<JobRecommendationList> {
    // Giai đoạn A — SQL lọc thô (kèm nới lỏng 1 lần), đã trừ đơn / lời mời.
    const poolIds = await this.repository.findCandidatePool({
      candidateId: candidate.candidateId,
      skillIds: candidate.skills.map((skill) => skill.skillId),
      poolSize: RECOMMENDATION_POOL_SIZE,
      minPool: options.limit,
    });
    const jobs = await this.jobMatchProfileLoader.loadMany(poolIds);

    // Giai đoạn B — rule cho cả tập, rồi chấm lại top bằng hybrid.
    const ruleScored = [...jobs.values()]
      .map((job) => ({ job, match: this.ruleJobMatcher.match({ candidate, job, semanticSimilarity: null }) }))
      .filter((entry) => entry.match.status === "SCORED");
    const shortlist = sortByScore(ruleScored).slice(0, RECOMMENDATION_RERANK_SIZE);
    const rescored = this.mode === "hybrid" ? await this.rescoreHybrid(candidate, shortlist) : shortlist;

    // Giai đoạn C — ngưỡng theo từng tin (D6), rồi lấy top.
    const passing = rescored.filter((entry) => (entry.match.score ?? 0) >= options.minScore);
    const top = sortByScore(passing).slice(0, options.limit);
    const items = attachJobPosts(top, await this.repository.findPublicByIds(top.map((entry) => entry.job.jobPostId)));
    return {
      status: "OK",
      source: "LIVE",
      items,
      total: items.length,
      nextCursor: null,
      suggestions: buildCodeSuggestions(items),
    };
  }

  /**
   * Chấm đầy đủ các tin của một trang bảng điểm (rule, rồi hybrid nếu bật). Giữ thứ tự
   * `ids` (điểm lưu, mới đăng trước) để làm thứ tự hoà khi sắp lại (sort ổn định).
   */
  private async scoreJobs(candidate: CandidateMatchProfile, ids: string[]): Promise<ScoredJob[]> {
    const ruleScored = await this.scoreRule(candidate, ids);
    return this.mode === "hybrid" ? this.rescoreHybrid(candidate, ruleScored) : ruleScored;
  }

  /** Chấm rule các tin theo đúng thứ tự `ids`; tin đã bị xoá hoặc không chấm được bị bỏ. */
  private async scoreRule(candidate: CandidateMatchProfile, ids: string[]): Promise<ScoredJob[]> {
    const jobs = await this.jobMatchProfileLoader.loadMany(ids);
    return ids.flatMap((id) => {
      const job = jobs.get(id);
      if (!job) return [];
      const match = this.ruleJobMatcher.match({ candidate, job, semanticSimilarity: null });
      return match.status === "SCORED" ? [{ job, match }] : [];
    });
  }

  /**
   * Tin chưa kịp có vector (vướng giới hạn embed mới / model lỗi) giữ điểm rule-v1
   * kèm semantic PENDING — không lỗi, không chờ; lần gọi sau tự bổ sung.
   */
  private async rescoreHybrid(candidate: CandidateMatchProfile, entries: ScoredJob[]): Promise<ScoredJob[]> {
    const similarities = await this.matchEmbeddingService.similarityForJobs(
      { id: candidate.candidateId, text: candidate.matchText },
      entries.map((entry) => ({ id: entry.job.jobPostId, text: entry.job.matchText })),
      MAX_NEW_EMBEDDINGS_PER_REQUEST,
    );
    return entries.map(({ job, match }) => {
      const similarity = similarities.get(job.jobPostId) ?? null;
      return {
        job,
        match:
          similarity === null
            ? markSemanticPending(match)
            : this.hybridJobMatcher.match({ candidate, job, semanticSimilarity: similarity }),
      };
    });
  }
}

interface ScoredJob {
  job: JobMatchProfile;
  match: MatchResult;
}

function sortByScore(entries: ScoredJob[]): ScoredJob[] {
  return [...entries].sort((left, right) => (right.match.score ?? 0) - (left.match.score ?? 0));
}

/** Ghép JobPost công khai theo đúng thứ tự `entries`; tin vừa bị xoá bị bỏ qua. */
function attachJobPosts(entries: ScoredJob[], jobPosts: JobPost[]): JobRecommendationList["items"] {
  const jobPostById = new Map(jobPosts.map((jobPost) => [jobPost.id, jobPost]));
  return entries.flatMap(({ job, match }) => {
    const jobPost = jobPostById.get(job.jobPostId);
    return jobPost ? [{ jobPost, match }] : [];
  });
}

function emptyList(
  status: JobRecommendationList["status"],
  source: JobRecommendationList["source"],
): JobRecommendationList {
  return { status, source, items: [], total: 0, nextCursor: null, suggestions: [] };
}

/** `cursor` là offset dạng chuỗi (thứ tự theo điểm không hợp với cursor theo id). */
export function parseRecommendationCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === "") return 0;
  if (!/^\d{1,5}$/.test(cursor) || Number(cursor) > MAX_CURSOR_OFFSET) {
    throw new AppError(400, "Invalid cursor", "INVALID_CURSOR");
  }
  return Number(cursor);
}
