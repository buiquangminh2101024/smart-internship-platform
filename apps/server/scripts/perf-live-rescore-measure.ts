import { writeFileSync } from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";
import { SkillEmbeddingProvider } from "../src/infrastructure/skill-embedding-provider";
import { AutoOutreachRepository } from "../src/modules/candidate-outreach/auto-outreach.repository";
import {
  AUTO_OUTREACH_MAX_NEW_EMBEDDINGS,
  AUTO_OUTREACH_PREFILTER_LIMIT,
  PREFILTER_LIMIT,
  TOP_RESULT_COUNT,
} from "../src/modules/candidate-outreach/candidate-outreach.config";
import { CandidateOutreachRepository } from "../src/modules/candidate-outreach/candidate-outreach.repository";
import { CandidateOutreachService } from "../src/modules/candidate-outreach/candidate-outreach.service";
import { CandidateMatchProfileLoader } from "../src/modules/job-matching/candidate-match-profile.loader";
import { JobMatchProfileLoader } from "../src/modules/job-matching/job-match-profile.loader";
import { HYBRID_WEIGHTS_V2, MAX_NEW_EMBEDDINGS_PER_REQUEST, RULE_WEIGHTS_V1 } from "../src/modules/job-matching/job-matching.config";
import { MatchEmbeddingRepository, type EmbeddingKind, type EmbeddingRecord } from "../src/modules/job-matching/match-embedding.repository";
import { MatchEmbeddingService } from "../src/modules/job-matching/match-embedding.service";
import { markSemanticPending, ScoringJobMatcher } from "../src/modules/job-matching/scoring-job-matcher";
import { VISIBLE_JOB } from "../src/modules/match-scores/match-score.repository";
import { SkillEmbeddingService } from "../src/modules/skills/skill-embedding.service";
import { config } from "../src/shared/config/env";
import { logger } from "../src/shared/logger";
import type { CandidateMatchProfile, JobMatchProfile, MatchResult } from "../src/shared/ports/JobMatcher";
import { idOf } from "./lib/large-demo/generate";
import showcase from "./data/large-demo/showcase.json";

// Bước 0 của docs/06-backend/live-rescore/PLAN.md (0.6, AD-27) — mục 1, 2, 4, 5, 6, 7.
// CHỈ ĐỌC DB đang dùng (DATABASE_URL): mọi câu là SELECT hoặc EXPLAIN ANALYZE của SELECT.
// Vector embedding tính ra để đo KHÔNG được lưu (repository bọc `upsertMany` thành no-op).
//
//   npm run perf:live-rescore-measure --workspace server -- [--parts=1,2,4,5,6,7] [--sample=20] [--out=<file.json>]
//
// Chỉ in số đo, id tin / ứng viên (id do hệ thống sinh) và tên kỹ năng / ngành / công ty demo;
// không in họ tên, email hay SĐT.

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key ?? "", value ?? "true"] as const;
  }),
);
const parts = new Set((args.get("parts") ?? "1,2,4,5,6,7").split(",").map((p) => p.trim()));
const sampleSize = Number(args.get("sample") ?? 20);
const outFile = args.get("out");

// ─── Prisma với đếm câu truy vấn ──────────────────────────────────────────────

const prisma = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
const queryLog = { count: 0, engineMs: 0 };
prisma.$on("query", (event) => {
  queryLog.count += 1;
  queryLog.engineMs += event.duration;
});

/** Đo một đoạn: thời gian thật, số câu Prisma gửi và tổng thời gian engine báo (gồm mạng). */
async function measure<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number; queries: number; engineMs: number }> {
  const before = { ...queryLog };
  const start = performance.now();
  const value = await fn();
  return {
    value,
    ms: performance.now() - start,
    queries: queryLog.count - before.count,
    engineMs: queryLog.engineMs - before.engineMs,
  };
}

// ─── Dựng service như scripts/rescore-match-scores.ts, nhưng không ghi embedding ──────

class ReadOnlyMatchEmbeddingRepository extends MatchEmbeddingRepository {
  skippedWrites = 0;
  override async upsertMany(_kind: EmbeddingKind, records: EmbeddingRecord[]): Promise<void> {
    this.skippedWrites += records.length;
  }
}

const embeddingRepository = new ReadOnlyMatchEmbeddingRepository({ prisma });
const embeddingProvider = new SkillEmbeddingProvider({
  skillEmbeddingService: new SkillEmbeddingService({ prisma, logger }),
  config,
});
const matchEmbeddingService = new MatchEmbeddingService({
  matchEmbeddingRepository: embeddingRepository,
  embeddingProvider,
  config,
  logger,
});
const candidateLoader = new CandidateMatchProfileLoader({ prisma });
const jobLoader = new JobMatchProfileLoader({ prisma });
const ruleMatcher = new ScoringJobMatcher(RULE_WEIGHTS_V1);
const hybridMatcher = new ScoringJobMatcher(HYBRID_WEIGHTS_V2);
const outreachRepository = new CandidateOutreachRepository({ prisma });
const autoOutreachRepository = new AutoOutreachRepository({ prisma } as unknown as ConstructorParameters<typeof AutoOutreachRepository>[0]);
const outreachService = new CandidateOutreachService({
  prisma,
  ruleJobMatcher: ruleMatcher,
  hybridJobMatcher: hybridMatcher,
  matchEmbeddingService,
  candidateMatchProfileLoader: candidateLoader,
  jobMatchProfileLoader: jobLoader,
  logger,
  config,
} as unknown as ConstructorParameters<typeof CandidateOutreachService>[0]);

// ─── Tiện ích ─────────────────────────────────────────────────────────────────

const sortNum = (values: number[]) => [...values].sort((a, b) => a - b);
const pct = (values: number[], p: number) => {
  if (values.length === 0) return 0;
  const sorted = sortNum(values);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
};
const stats = (values: number[]) => ({
  n: values.length,
  p50: round(pct(values, 50)),
  p90: round(pct(values, 90)),
  max: round(values.length ? Math.max(...values) : 0),
  mean: round(values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0),
});
const round = (n: number) => Math.round(n * 10) / 10;
const fmt = (s: ReturnType<typeof stats>, unit = "ms") =>
  `p50 ${s.p50} ${unit} · p90 ${s.p90} ${unit} · max ${s.max} ${unit} (n=${s.n})`;

interface PlanNode {
  "Node Type": string;
  "Index Name"?: string;
  "Relation Name"?: string;
  "Actual Rows"?: number;
  Plans?: PlanNode[];
}
interface ExplainResult {
  Plan: PlanNode;
  "Planning Time": number;
  "Execution Time": number;
}
function scans(node: PlanNode, out: string[] = []): string[] {
  if (/Scan/.test(node["Node Type"])) {
    const target = node["Index Name"] ?? node["Relation Name"];
    const text = `${node["Node Type"]}${target ? ` (${target})` : ""}`;
    if (!out.includes(text)) out.push(text);
  }
  for (const child of node.Plans ?? []) scans(child, out);
  return out;
}
async function explain(query: Prisma.Sql): Promise<{ executionMs: number; planningMs: number; rows: number; plan: string[] }> {
  // Làm nóng một lần, lấy lần thứ hai (giống perf-audit-log-measure.ts).
  await prisma.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, FORMAT JSON) ${query}`);
  const rows = await prisma.$queryRaw<Array<{ "QUERY PLAN": ExplainResult[] }>>(
    Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
  );
  const result = rows[0]!["QUERY PLAN"][0]!;
  return {
    executionMs: round(result["Execution Time"]),
    planningMs: round(result["Planning Time"]),
    rows: result.Plan["Actual Rows"] ?? 0,
    plan: scans(result.Plan),
  };
}

/** Pool ngược (D4): tin đang hiển thị có chung ≥ 1 kỹ năng APPROVED với ứng viên. */
const reversePoolSql = (candidateId: string) => Prisma.sql`
  SELECT DISTINCT jps."jobPostId" AS id
  FROM candidate_skills cs
  JOIN skills s ON s."id" = cs."skillId" AND s."status" = 'APPROVED'
  JOIN job_post_skills jps ON jps."skillId" = cs."skillId"
  JOIN job_posts j ON j."id" = jps."jobPostId"
  WHERE cs."candidateId" = ${candidateId} AND ${VISIBLE_JOB}
`;
async function reversePool(candidateId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(reversePoolSql(candidateId));
  return rows.map((row) => row.id);
}

/** Nguyên mẫu chấm theo ứng viên: cùng quy tắc với CandidateOutreachService.score. */
function scoreOne(candidate: CandidateMatchProfile, job: JobMatchProfile, similarity: number | null): MatchResult {
  if (config.JOB_MATCHER_MODE === "rule") return ruleMatcher.match({ candidate, job, semanticSimilarity: null });
  if (similarity === null) return markSemanticPending(ruleMatcher.match({ candidate, job, semanticSimilarity: null }));
  return hybridMatcher.match({ candidate, job, semanticSimilarity: similarity });
}

const report: Record<string, unknown> = { at: new Date().toISOString(), matcherMode: config.JOB_MATCHER_MODE };

// ─── Chọn ứng viên ───────────────────────────────────────────────────────────

async function pickCandidates(): Promise<{ random: string[]; showcase: string[] }> {
  const random = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT c."id" FROM candidates c
    WHERE EXISTS (SELECT 1 FROM candidate_skills cs WHERE cs."candidateId" = c."id")
    ORDER BY random() LIMIT ${sampleSize}
  `);
  const showcaseIds = (showcase.candidates as Array<{ key: string; demoLogin?: boolean }>)
    .filter((c) => c.demoLogin)
    .slice(0, 5)
    .map((c) => idOf("cand", `sc${c.key}`));
  const existing = await prisma.candidate.findMany({ where: { id: { in: showcaseIds } }, select: { id: true } });
  return { random: random.map((r) => r.id), showcase: existing.map((c) => c.id) };
}

// ─── Mục 1 + 7: chi phí chấm lại một ứng viên ────────────────────────────────

interface CandidateRun {
  candidateId: string;
  group: "random" | "showcase";
  skills: number;
  pool: number;
  poolMs: number;
  candidateMs: number;
  candidateQueries: number;
  jobsMs: number;
  jobsQueries: number;
  embedMs: number;
  embedQueries: number;
  newEmbeddings: number;
  scoreMs: number;
  totalNoCacheMs: number;
  totalCacheMs: number;
  queriesNoCache: number;
  queriesCache: number;
  sameAsTable: number;
  diffFromTable: number;
  missingInTable: number;
  maxAbsDiff: number;
}

async function part1(candidates: { random: string[]; showcase: string[] }): Promise<void> {
  console.log("\n## Mục 1 — chi phí chấm lại một ứng viên (nguyên mẫu, không ghi bảng)");
  const [rtt] = await Promise.all([measureRtt()]);
  console.log(`Round trip tới Neon (SELECT 1, 10 lần): ${fmt(stats(rtt))}`);

  const jobCache = new Map<string, JobMatchProfile>();
  const runs: CandidateRun[] = [];
  const all = [
    ...candidates.random.map((id) => ({ id, group: "random" as const })),
    ...candidates.showcase.map((id) => ({ id, group: "showcase" as const })),
  ];

  for (const { id, group } of all) {
    const skipsBefore = embeddingRepository.skippedWrites;
    const pool = await measure(() => reversePool(id));
    const cand = await measure(() => candidateLoader.loadMany([id]));
    const profile = cand.value.get(id);
    if (!profile) continue;
    const jobs = await measure(() => jobLoader.loadMany(pool.value));
    const jobProfiles = [...jobs.value.values()];
    for (const job of jobProfiles) jobCache.set(job.jobPostId, job);

    const embed = await measure(() =>
      config.JOB_MATCHER_MODE === "hybrid" && profile.skills.length > 0
        ? matchEmbeddingService.similarityForJobs(
            { id: profile.candidateId, text: profile.matchText },
            jobProfiles.map((job) => ({ id: job.jobPostId, text: job.matchText })),
            50,
          )
        : Promise.resolve(new Map<string, number | null>()),
    );
    const newEmbeddings = embeddingRepository.skippedWrites - skipsBefore;

    const scoreStart = performance.now();
    const results = new Map<string, MatchResult>();
    for (const job of jobProfiles) results.set(job.jobPostId, scoreOne(profile, job, embed.value.get(job.jobPostId) ?? null));
    const scoreMs = performance.now() - scoreStart;

    // So với điểm đang lưu trong bảng (lượt đêm / lối a): xem trước test "theo ứng viên = theo tin".
    const stored = await prisma.jobCandidateMatchScore.findMany({
      where: { candidateId: id, jobPostId: { in: pool.value } },
      select: { jobPostId: true, score: true },
    });
    const storedMap = new Map(stored.map((row) => [row.jobPostId, row.score]));
    let same = 0;
    let diff = 0;
    let missing = 0;
    let maxAbsDiff = 0;
    for (const [jobPostId, result] of results) {
      if (result.score === null) continue;
      const s = storedMap.get(jobPostId);
      if (s === undefined) missing += 1;
      else if (Math.abs(s - result.score) < 1e-6) same += 1;
      else {
        diff += 1;
        maxAbsDiff = Math.max(maxAbsDiff, Math.abs(s - result.score));
      }
    }

    // Lần hai, có cache hồ sơ tin: bỏ phần nạp tin.
    const cached = await measure(async () => {
      const p = await reversePool(id);
      const c = (await candidateLoader.loadMany([id])).get(id)!;
      const js = p.map((jobId) => jobCache.get(jobId)!).filter(Boolean);
      const sims =
        config.JOB_MATCHER_MODE === "hybrid" && c.skills.length > 0
          ? await matchEmbeddingService.similarityForJobs(
              { id: c.candidateId, text: c.matchText },
              js.map((job) => ({ id: job.jobPostId, text: job.matchText })),
              50,
            )
          : new Map<string, number | null>();
      for (const job of js) scoreOne(c, job, sims.get(job.jobPostId) ?? null);
    });

    const run: CandidateRun = {
      candidateId: id,
      group,
      skills: profile.skills.length,
      pool: pool.value.length,
      poolMs: round(pool.ms),
      candidateMs: round(cand.ms),
      candidateQueries: cand.queries,
      jobsMs: round(jobs.ms),
      jobsQueries: jobs.queries,
      embedMs: round(embed.ms),
      embedQueries: embed.queries,
      newEmbeddings,
      scoreMs: round(scoreMs),
      totalNoCacheMs: round(pool.ms + cand.ms + jobs.ms + embed.ms + scoreMs),
      totalCacheMs: round(cached.ms),
      queriesNoCache: pool.queries + cand.queries + jobs.queries + embed.queries,
      queriesCache: cached.queries,
      sameAsTable: same,
      diffFromTable: diff,
      missingInTable: missing,
      maxAbsDiff: round(maxAbsDiff),
    };
    runs.push(run);
    console.log(
      `  ${group === "showcase" ? "[trưng bày] " : ""}${id}: ${run.skills} kỹ năng, pool ${run.pool} tin — ` +
        `không cache ${run.totalNoCacheMs} ms (${run.queriesNoCache} câu), có cache ${run.totalCacheMs} ms (${run.queriesCache} câu)` +
        `${newEmbeddings ? `, ${newEmbeddings} embedding mới` : ""}; so bảng: ${same} khớp, ${diff} lệch, ${missing} chưa có dòng`,
    );
  }

  const pick = (key: keyof CandidateRun) => runs.map((r) => Number(r[key]));
  const summary = {
    rttMs: stats(rtt),
    pool: stats(pick("pool")),
    poolMs: stats(pick("poolMs")),
    candidateMs: stats(pick("candidateMs")),
    candidateQueries: stats(pick("candidateQueries")),
    jobsMs: stats(pick("jobsMs")),
    jobsQueries: stats(pick("jobsQueries")),
    embedMs: stats(pick("embedMs")),
    embedQueries: stats(pick("embedQueries")),
    scoreMs: stats(pick("scoreMs")),
    totalNoCacheMs: stats(pick("totalNoCacheMs")),
    totalCacheMs: stats(pick("totalCacheMs")),
    queriesNoCache: stats(pick("queriesNoCache")),
    queriesCache: stats(pick("queriesCache")),
    newEmbeddings: pick("newEmbeddings").reduce((a, b) => a + b, 0),
    vsTable: {
      same: pick("sameAsTable").reduce((a, b) => a + b, 0),
      diff: pick("diffFromTable").reduce((a, b) => a + b, 0),
      missing: pick("missingInTable").reduce((a, b) => a + b, 0),
      maxAbsDiff: Math.max(0, ...pick("maxAbsDiff")),
    },
  };
  console.log("Tổng hợp:");
  for (const [key, value] of Object.entries(summary)) {
    console.log(`  ${key}: ${typeof value === "object" && value && "p50" in value ? fmt(value as ReturnType<typeof stats>, "") : JSON.stringify(value)}`);
  }
  // Ước phần ghi: transaction tương tác của Prisma = BEGIN + DELETE + INSERT (createMany) + COMMIT.
  console.log(`  Ước ghi replaceForCandidate ≈ 4 round trip ≈ ${round(4 * pct(rtt, 50))} ms (chưa gồm thời gian Postgres xoá / chèn ~${summary.pool.p50} dòng).`);
  report.part1 = { summary, runs };
}

async function measureRtt(): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < 11; i += 1) {
    const start = performance.now();
    await prisma.$queryRaw(Prisma.sql`SELECT 1`);
    if (i > 0) out.push(performance.now() - start);
  }
  return out;
}

// ─── Mục 1 (phần thử): nạp hồ sơ bằng relationLoadStrategy "join" ─────────────
//
// Schema thật chưa bật preview `relationJoins`, nên phần này dùng một client tạm sinh từ bản
// sao schema (không đổi schema / client đang dùng). Từ thư mục gốc repo:
//   1. chép apps/server/prisma/schema.prisma sang node_modules/.perf-live-rescore-joins/schema.prisma;
//   2. trong bản chép, thêm "relationJoins" vào previewFeatures và dòng `output = "./client"`;
//   3. cd apps/server && npx prisma generate --schema ../../node_modules/.perf-live-rescore-joins/schema.prisma
// Đo xong xoá thư mục node_modules/.perf-live-rescore-joins.
// Chỉ đọc. Bản sao include / select của hai loader (không export) — giữ khớp khi sửa loader.

const JOIN_CANDIDATE_INCLUDE = {
  skills: { include: { skill: { select: { id: true, name: true } } } },
  workExperiences: { select: { position: true, startDate: true, endDate: true, isCurrent: true } },
  educations: {
    select: { majorId: true, degree: true, startYear: true, endYear: true, isCurrent: true, major: { select: { name: true } } },
  },
  projects: { select: { name: true, startDate: true } },
};
const JOIN_JOB_SELECT = {
  id: true,
  minExperienceYears: true,
  title: true,
  requirements: true,
  description: true,
  skills: {
    where: { skill: { status: "APPROVED" } },
    select: { importance: true, minYears: true, skill: { select: { id: true, name: true } } },
  },
  majors: { select: { relevance: true, major: { select: { id: true, name: true } } } },
};

async function partJoins(candidates: { random: string[]; showcase: string[] }): Promise<void> {
  console.log('\n## Mục 1 (thử) — nạp hồ sơ bằng relationLoadStrategy "join"');
  const clientPath = process.env.PERF_JOINS_CLIENT ?? require("node:path").resolve(__dirname, "../../../node_modules/.perf-live-rescore-joins/client");
  let JoinClient: new (options: unknown) => any;
  try {
    JoinClient = require(clientPath).PrismaClient;
  } catch {
    console.log(`  Không thấy client tạm ở ${clientPath} — bỏ qua (xem chú thích trong script).`);
    return;
  }
  const joinPrisma = new JoinClient({ log: [{ emit: "event", level: "query" }] });
  let count = 0;
  joinPrisma.$on("query", () => {
    count += 1;
  });
  const ids = [...candidates.random, ...candidates.showcase];
  const rows: Array<{ strategy: string; candidateMs: number; candidateQueries: number; jobsMs: number; jobsQueries: number }> = [];
  try {
    for (const id of ids) {
      const pool = await reversePool(id);
      for (const strategy of ["query", "join"] as const) {
        let before = count;
        let start = performance.now();
        await joinPrisma.candidate.findMany({ where: { id: { in: [id] } }, include: JOIN_CANDIDATE_INCLUDE, relationLoadStrategy: strategy });
        const candidateMs = performance.now() - start;
        const candidateQueries = count - before;
        before = count;
        start = performance.now();
        await joinPrisma.jobPost.findMany({ where: { id: { in: pool } }, select: JOIN_JOB_SELECT, relationLoadStrategy: strategy });
        rows.push({ strategy, candidateMs, candidateQueries, jobsMs: performance.now() - start, jobsQueries: count - before });
      }
    }
  } finally {
    await joinPrisma.$disconnect();
  }
  const result: Record<string, unknown> = {};
  for (const strategy of ["query", "join"]) {
    const r = rows.filter((row) => row.strategy === strategy);
    const summary = {
      candidateMs: stats(r.map((x) => x.candidateMs)),
      candidateQueries: stats(r.map((x) => x.candidateQueries)),
      jobsMs: stats(r.map((x) => x.jobsMs)),
      jobsQueries: stats(r.map((x) => x.jobsQueries)),
    };
    result[strategy] = summary;
    console.log(
      `  ${strategy}: hồ sơ ứng viên ${fmt(summary.candidateMs)} (${summary.candidateQueries.p50} câu); ` +
        `hồ sơ tin của pool ${fmt(summary.jobsMs)} (${summary.jobsQueries.p50} câu)`,
    );
  }
  report.partJoins = result;
}

// ─── Mục 2: EXPLAIN ───────────────────────────────────────────────────────────

async function part2(candidates: { random: string[]; showcase: string[] }): Promise<void> {
  console.log("\n## Mục 2 — EXPLAIN ANALYZE (chỉ SELECT)");
  const sizes = await prisma.$queryRaw<Array<{ name: string; rows: number; size: string }>>(Prisma.sql`
    SELECT relname AS name, n_live_tup::int AS rows, pg_size_pretty(pg_total_relation_size(relid)) AS size
    FROM pg_stat_user_tables
    WHERE relname IN ('candidate_skills', 'job_post_skills', 'job_post_majors', 'educations', 'candidates', 'job_posts', 'job_candidate_match_scores')
    ORDER BY relname
  `);
  for (const s of sizes) console.log(`  ${s.name}: ~${s.rows} dòng, ${s.size}`);

  const results: Record<string, unknown> = { tables: sizes };
  const bySkills = await prisma.$queryRaw<Array<{ id: string; n: number }>>(Prisma.sql`
    SELECT "candidateId" AS id, COUNT(*)::int AS n FROM candidate_skills GROUP BY "candidateId" ORDER BY n DESC LIMIT 1
  `);
  const probes = [
    ...(bySkills[0] ? [{ label: `ứng viên nhiều kỹ năng nhất (${bySkills[0].n})`, id: bySkills[0].id }] : []),
    ...(candidates.random[0] ? [{ label: "ứng viên ngẫu nhiên", id: candidates.random[0] }] : []),
    ...(candidates.showcase[0] ? [{ label: "ứng viên trưng bày", id: candidates.showcase[0] }] : []),
  ];
  for (const probe of probes) {
    const e = await explain(reversePoolSql(probe.id));
    results[`reversePool:${probe.label}`] = e;
    console.log(`  Pool ngược — ${probe.label}: ${e.executionMs} ms (+${e.planningMs} ms lập kế hoạch), ${e.rows} tin; ${e.plan.join(", ")}`);
  }

  const [topSkill] = await prisma.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
    SELECT s."id", s."name" FROM skills s JOIN candidate_skills cs ON cs."skillId" = s."id"
    WHERE s."status" = 'APPROVED' GROUP BY s."id" ORDER BY COUNT(*) DESC LIMIT 1
  `);
  const [topMajor] = await prisma.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
    SELECT m."id", m."name" FROM majors m JOIN educations e ON e."majorId" = m."id"
    GROUP BY m."id" ORDER BY COUNT(*) DESC LIMIT 1
  `);
  if (topSkill) {
    const e1 = await explain(Prisma.sql`SELECT DISTINCT cs."candidateId" FROM candidate_skills cs WHERE cs."skillId" IN (${topSkill.id})`);
    const e2 = await explain(Prisma.sql`
      SELECT DISTINCT jps."jobPostId" FROM job_post_skills jps JOIN job_posts j ON j."id" = jps."jobPostId"
      WHERE jps."skillId" IN (${topSkill.id}) AND ${VISIBLE_JOB}
    `);
    results.markBySkill = { skill: topSkill.name, candidates: e1, jobs: e2 };
    console.log(`  D6 đánh dấu theo kỹ năng "${topSkill.name}" — chọn ứng viên: ${e1.executionMs} ms, ${e1.rows} người; ${e1.plan.join(", ")}`);
    console.log(`  Q1 tin gắn kỹ năng đó: ${e2.executionMs} ms, ${e2.rows} tin; ${e2.plan.join(", ")}`);
  }
  if (topMajor) {
    const e1 = await explain(Prisma.sql`SELECT DISTINCT e."candidateId" FROM educations e WHERE e."majorId" IN (${topMajor.id})`);
    const e2 = await explain(Prisma.sql`
      SELECT DISTINCT jpm."jobPostId" FROM job_post_majors jpm JOIN job_posts j ON j."id" = jpm."jobPostId"
      WHERE jpm."majorId" IN (${topMajor.id}) AND ${VISIBLE_JOB}
    `);
    results.markByMajor = { major: topMajor.name, candidates: e1, jobs: e2 };
    console.log(`  D6 đánh dấu theo ngành "${topMajor.name}" — chọn ứng viên: ${e1.executionMs} ms, ${e1.rows} người; ${e1.plan.join(", ")}`);
    console.log(`  Q1 tin gắn ngành đó: ${e2.executionMs} ms, ${e2.rows} tin; ${e2.plan.join(", ")}`);
  }
  report.part2 = results;
}

// ─── Mục 4: quy mô của D6 ─────────────────────────────────────────────────────

async function part4(): Promise<void> {
  console.log("\n## Mục 4 — quy mô khi Admin đổi danh mục (10 kỹ năng / ngành phổ biến nhất)");
  const skills = await prisma.$queryRaw<Array<{ name: string; candidates: number; jobs: number }>>(Prisma.sql`
    SELECT s."name",
      (SELECT COUNT(DISTINCT cs."candidateId")::int FROM candidate_skills cs WHERE cs."skillId" = s."id") AS candidates,
      (SELECT COUNT(DISTINCT jps."jobPostId")::int FROM job_post_skills jps JOIN job_posts j ON j."id" = jps."jobPostId"
        WHERE jps."skillId" = s."id" AND ${VISIBLE_JOB}) AS jobs
    FROM skills s WHERE s."status" = 'APPROVED'
    ORDER BY candidates DESC LIMIT 10
  `);
  const majors = await prisma.$queryRaw<Array<{ name: string; candidates: number; jobs: number }>>(Prisma.sql`
    SELECT m."name",
      (SELECT COUNT(DISTINCT e."candidateId")::int FROM educations e WHERE e."majorId" = m."id") AS candidates,
      (SELECT COUNT(DISTINCT jpm."jobPostId")::int FROM job_post_majors jpm JOIN job_posts j ON j."id" = jpm."jobPostId"
        WHERE jpm."majorId" = m."id" AND ${VISIBLE_JOB}) AS jobs
    FROM majors m
    ORDER BY candidates DESC LIMIT 10
  `);
  const [totals] = await prisma.$queryRaw<Array<{ candidates: number; visibleJobs: number }>>(Prisma.sql`
    SELECT (SELECT COUNT(*)::int FROM candidates) AS candidates,
           (SELECT COUNT(*)::int FROM job_posts j WHERE ${VISIBLE_JOB}) AS "visibleJobs"
  `);
  console.log(`  Tổng: ${totals?.candidates} ứng viên, ${totals?.visibleJobs} tin đang hiển thị`);
  console.log("  Kỹ năng: " + skills.map((s) => `${s.name} ${s.candidates} người / ${s.jobs} tin`).join("; "));
  console.log("  Ngành: " + majors.map((m) => `${m.name} ${m.candidates} người / ${m.jobs} tin`).join("; "));
  report.part4 = { totals, skills, majors };
}

// ─── Mục 5: mốc so sánh (trang tìm ứng viên, lượt tự mời Mây Xanh) ─────────────

async function searchPageCurrent(jobPostId: string) {
  return measure(async () => {
    const poolIds = await outreachRepository.searchCandidatePool(jobPostId, PREFILTER_LIMIT);
    if (poolIds.length === 0) return 0;
    const scores = await outreachService.scorePool(jobPostId, poolIds, MAX_NEW_EMBEDDINGS_PER_REQUEST);
    const topIds = poolIds
      .filter((id) => scores.has(id))
      .sort((l, r) => (scores.get(r)!.score ?? -1) - (scores.get(l)!.score ?? -1))
      .slice(0, TOP_RESULT_COUNT);
    await Promise.all([
      outreachRepository.findSearchCards(topIds),
      outreachRepository.findExpiredInvitedCandidateIds(jobPostId, topIds),
      outreachRepository.countReceivedTodayByCandidate(topIds),
    ]);
    return poolIds.length;
  });
}

/** Nguyên mẫu D8 / D9: top N người còn mời được, đọc từ bảng điểm. */
const tableQueueSql = (jobPostId: string, minScore: number, limit: number) => Prisma.sql`
  SELECT s."candidateId", s."score"
  FROM job_candidate_match_scores s
  JOIN candidates c ON c."id" = s."candidateId" AND c."isOpenToOutreach" = true
  WHERE s."jobPostId" = ${jobPostId} AND s."score" >= ${minScore}
    AND NOT EXISTS (SELECT 1 FROM applications a WHERE a."candidateId" = s."candidateId" AND a."jobPostId" = s."jobPostId")
    AND NOT EXISTS (
      SELECT 1 FROM candidate_outreach_invitations i
      WHERE i."candidateId" = s."candidateId" AND i."jobPostId" = s."jobPostId"
        AND i."status" IN ('PENDING', 'ACCEPTED', 'DECLINED'))
  ORDER BY s."score" DESC, s."candidateId"
  LIMIT ${limit}
`;

async function searchPageFromTable(jobPostId: string) {
  return measure(async () => {
    const rows = await prisma.$queryRaw<Array<{ candidateId: string }>>(tableQueueSql(jobPostId, 0, TOP_RESULT_COUNT));
    const ids = rows.map((r) => r.candidateId);
    if (ids.length === 0) return 0;
    await outreachService.scorePool(jobPostId, ids, MAX_NEW_EMBEDDINGS_PER_REQUEST);
    await Promise.all([
      outreachRepository.findSearchCards(ids),
      outreachRepository.findExpiredInvitedCandidateIds(jobPostId, ids),
      outreachRepository.countReceivedTodayByCandidate(ids),
    ]);
    return ids.length;
  });
}

async function part5(): Promise<void> {
  console.log("\n## Mục 5 — mốc so sánh với đường hiện tại");
  const jobs = await prisma.$queryRaw<Array<{ id: string; title: string; pool: number }>>(Prisma.sql`
    SELECT j."id", j."title",
      (SELECT COUNT(DISTINCT cs."candidateId")::int FROM candidate_skills cs
        JOIN job_post_skills jps ON jps."skillId" = cs."skillId" AND jps."jobPostId" = j."id"
        JOIN skills s ON s."id" = cs."skillId" AND s."status" = 'APPROVED') AS pool
    FROM job_posts j WHERE ${VISIBLE_JOB} AND j."matchScoresAt" IS NOT NULL
    ORDER BY pool DESC
  `);
  const nonEmpty = jobs.filter((j) => j.pool > 0);
  const picks = [
    ...nonEmpty.slice(0, 3).map((j) => ({ ...j, size: "lớn" })),
    ...nonEmpty.slice(-3).map((j) => ({ ...j, size: "nhỏ" })),
  ];
  const search: unknown[] = [];
  for (const job of picks) {
    await searchPageCurrent(job.id); // làm nóng (vector, kết nối)
    const current = [await searchPageCurrent(job.id), await searchPageCurrent(job.id), await searchPageCurrent(job.id)];
    const fromTable = [await searchPageFromTable(job.id), await searchPageFromTable(job.id), await searchPageFromTable(job.id)];
    const e = await explain(tableQueueSql(job.id, 0, TOP_RESULT_COUNT));
    const row = {
      jobPostId: job.id,
      size: job.size,
      pool: job.pool,
      currentMs: stats(current.map((c) => c.ms)),
      currentQueries: current[0]!.queries,
      fromTableMs: stats(fromTable.map((c) => c.ms)),
      fromTableQueries: fromTable[0]!.queries,
      tableQuery: e,
    };
    search.push(row);
    console.log(
      `  Tìm ứng viên — tin ${job.size} (pool ${job.pool}) ${job.id}: hiện tại p50 ${row.currentMs.p50} ms (${row.currentQueries} câu); ` +
        `đọc bảng + chấm 10 người p50 ${row.fromTableMs.p50} ms (${row.fromTableQueries} câu); câu đọc bảng ${e.executionMs} ms (${e.plan.join(", ")})`,
    );
  }

  const [company] = await prisma.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
    SELECT "id", "name" FROM companies WHERE "name" ILIKE ${"%Mây Xanh%"} ORDER BY "createdAt" LIMIT 1
  `);
  let outreach: unknown = null;
  if (company) {
    const runnable = await autoOutreachRepository.findRunnableJobs(company.id);
    // Không có tin nào bật tự mời thì đo giả định: coi mọi tin đang hiển thị của công ty
    // đều bật (trường hợp xấu nhất của một lượt), ngưỡng là autoOutreachMinScore của tin.
    const hypothetical = runnable.length === 0;
    const jobsToScan = async (): Promise<Array<{ id: string; minScore: number }>> =>
      hypothetical
        ? prisma.$queryRaw<Array<{ id: string; minScore: number }>>(Prisma.sql`
            SELECT j."id", j."autoOutreachMinScore" AS "minScore" FROM job_posts j
            WHERE j."companyId" = ${company.id} AND ${VISIBLE_JOB} ORDER BY j."id"
          `)
        : autoOutreachRepository.findRunnableJobs(company.id);
    const scannedJobs = (await jobsToScan()).length;
    const scan = async () =>
      measure(async () => {
        let queued = 0;
        for (const row of await jobsToScan()) {
          const poolIds = await outreachRepository.searchCandidatePool(row.id, AUTO_OUTREACH_PREFILTER_LIMIT, { excludeCappedToday: true });
          if (poolIds.length === 0) continue;
          const scores = await outreachService.scorePool(row.id, poolIds, AUTO_OUTREACH_MAX_NEW_EMBEDDINGS);
          queued += [...scores.values()].filter((m) => m.score !== null && m.score >= row.minScore).length;
        }
        return queued;
      });
    const scanTable = async () =>
      measure(async () => {
        let queued = 0;
        for (const row of await jobsToScan()) {
          // R × 2 với R ước 10 lượt còn lại.
          const rows = await prisma.$queryRaw<unknown[]>(tableQueueSql(row.id, row.minScore, 20));
          queued += rows.length;
        }
        return queued;
      });
    await scan();
    const current = [await scan(), await scan(), await scan()];
    const fromTable = [await scanTable(), await scanTable(), await scanTable()];
    outreach = {
      company: company.name,
      runnableJobs: runnable.length,
      hypothetical,
      scannedJobs,
      currentMs: stats(current.map((c) => c.ms)),
      currentQueries: current[0]!.queries,
      queuedCurrent: current[0]!.value,
      fromTableMs: stats(fromTable.map((c) => c.ms)),
      fromTableQueries: fromTable[0]!.queries,
      queuedFromTable: fromTable[0]!.value,
    };
    const o = outreach as { currentMs: ReturnType<typeof stats>; fromTableMs: ReturnType<typeof stats> };
    console.log(
      `  Lượt tự mời ${company.name}: ${runnable.length} tin bật tự mời` +
        `${hypothetical ? ` — đo giả định trên ${scannedJobs} tin đang hiển thị` : ""}; phần tìm + chấm hiện tại p50 ${o.currentMs.p50} ms ` +
        `(${current[0]!.queries} câu, ${current[0]!.value} người ≥ ngưỡng trong pool 50); đọc bảng p50 ${o.fromTableMs.p50} ms ` +
        `(${fromTable[0]!.queries} câu, ${fromTable[0]!.value} người, tối đa 20 / tin)`,
    );
  } else {
    console.log("  Không thấy công ty Mây Xanh — bỏ phần tự mời.");
  }
  report.part5 = { search, outreach };
}

// ─── Mục 6: cho script mô phỏng ───────────────────────────────────────────────

async function part6(): Promise<void> {
  console.log("\n## Mục 6 — cho script mô phỏng (Q4)");
  const emails = showcase.employers.map((e) => `${e.key}@large-demo.local`);
  const employers = await prisma.$queryRaw<
    Array<{ key: string; status: string; company: string; isVerified: boolean; requiresApproval: boolean; visibleJobs: number }>
  >(Prisma.sql`
    SELECT split_part(u."email", '@', 1) AS key, u."status"::text AS status, c."name" AS company,
           c."isVerified", c."requiresApproval",
           (SELECT COUNT(*)::int FROM job_posts j WHERE j."companyId" = c."id" AND ${VISIBLE_JOB}) AS "visibleJobs"
    FROM users u JOIN employers e ON e."userId" = u."id" JOIN companies c ON c."id" = e."companyId"
    WHERE u."email" IN (${Prisma.join(emails)})
  `);
  for (const e of employers) {
    console.log(
      `  ${e.key} — ${e.company}: tài khoản ${e.status}, công ty ${e.isVerified ? "đã xác minh" : "CHƯA xác minh"}, ` +
        `${e.requiresApproval ? "tin cần Admin duyệt" : "tự đăng tin"}, ${e.visibleJobs} tin đang hiển thị`,
    );
  }
  const [admins] = await prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT COUNT(*)::int AS n FROM users WHERE "role" = 'ADMIN' AND "status" = 'ACTIVE'`);
  const [inflow] = await prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT COUNT(*)::int AS n FROM users WHERE "email" LIKE ${"%@inflow-demo.local"}`);
  const [approvedSkills] = await prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`SELECT COUNT(*)::int AS n FROM skills WHERE "status" = 'APPROVED'`);
  console.log(`  Admin đang hoạt động: ${admins?.n}; tài khoản @inflow-demo.local đã có: ${inflow?.n}; kỹ năng APPROVED: ${approvedSkills?.n}`);
  report.part6 = { employers, activeAdmins: admins?.n, inflowUsers: inflow?.n, approvedSkills: approvedSkills?.n };
}

// ─── Mục 7: ước tải job alert lần đầu ─────────────────────────────────────────

async function part7(candidates: { random: string[]; showcase: string[] }): Promise<void> {
  console.log("\n## Mục 7 — ước tải job alert lần đầu (Q3), từ điểm đang lưu");
  const ids = [...candidates.random, ...candidates.showcase];
  const perCandidate = await prisma.$queryRaw<Array<{ candidateId: string; raw: number; withSettings: number }>>(Prisma.sql`
    SELECT c."id" AS "candidateId",
      COUNT(s."jobPostId") FILTER (WHERE s."score" >= GREATEST(j."autoOutreachMinScore", 70)
        AND NOT EXISTS (SELECT 1 FROM applications ap WHERE ap."jobPostId" = j."id" AND ap."candidateId" = c."id" AND ap."status" <> 'CANCELLED')
        AND NOT EXISTS (SELECT 1 FROM candidate_outreach_invitations inv WHERE inv."jobPostId" = j."id" AND inv."candidateId" = c."id"
          AND inv."status" IN ('PENDING', 'ACCEPTED', 'DECLINED')))::int AS raw,
      COUNT(s."jobPostId") FILTER (WHERE s."score" >= GREATEST(j."autoOutreachMinScore", 70)
        AND c."jobAlertEnabled" AND (NOT c."jobAlertSameCityOnly" OR c."cityId" = j."cityId")
        AND NOT EXISTS (SELECT 1 FROM applications ap WHERE ap."jobPostId" = j."id" AND ap."candidateId" = c."id" AND ap."status" <> 'CANCELLED')
        AND NOT EXISTS (SELECT 1 FROM candidate_outreach_invitations inv WHERE inv."jobPostId" = j."id" AND inv."candidateId" = c."id"
          AND inv."status" IN ('PENDING', 'ACCEPTED', 'DECLINED')))::int AS "withSettings"
    FROM candidates c
    LEFT JOIN job_candidate_match_scores s ON s."candidateId" = c."id"
    LEFT JOIN job_posts j ON j."id" = s."jobPostId" AND ${VISIBLE_JOB}
    WHERE c."id" IN (${Prisma.join(ids)})
    GROUP BY c."id"
  `);
  const everyone = await prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT COUNT(s."jobPostId")::int AS n
    FROM candidates c
    LEFT JOIN job_candidate_match_scores s ON s."candidateId" = c."id"
      AND EXISTS (SELECT 1 FROM job_posts j WHERE j."id" = s."jobPostId" AND ${VISIBLE_JOB} AND s."score" >= GREATEST(j."autoOutreachMinScore", 70))
    GROUP BY c."id"
  `);
  const raw = stats(perCandidate.map((r) => r.raw));
  const withSettings = stats(perCandidate.map((r) => r.withSettings));
  const all = stats(everyone.map((r) => r.n));
  console.log(`  25 ứng viên mẫu — số tin sẽ báo (bỏ qua cài đặt báo tin): ${fmt(raw, "tin")}`);
  console.log(`  25 ứng viên mẫu — theo cài đặt báo tin hiện tại: ${fmt(withSettings, "tin")}`);
  console.log(`  Mọi ứng viên — số tin ≥ max(ngưỡng, 70), chưa trừ đơn / lời mời: ${fmt(all, "tin")}`);
  report.part7 = { sample: { raw, withSettings }, everyone: all };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Bước 0 live-rescore — chỉ đọc. Bộ chấm: ${config.JOB_MATCHER_MODE}. Mục: ${[...parts].join(", ")}`);
  const candidates = await pickCandidates();
  console.log(`Ứng viên mẫu: ${candidates.random.length} ngẫu nhiên (có kỹ năng) + ${candidates.showcase.length} trưng bày.`);
  report.candidates = candidates;

  if (parts.has("1")) await part1(candidates);
  if (parts.has("j")) await partJoins(candidates);
  if (parts.has("2")) await part2(candidates);
  if (parts.has("4")) await part4();
  if (parts.has("5")) await part5();
  if (parts.has("6")) await part6();
  if (parts.has("7")) await part7(candidates);

  console.log(`\nEmbedding đã tính nhưng không lưu (chỉ đọc): ${embeddingRepository.skippedWrites}`);
  report.skippedEmbeddingWrites = embeddingRepository.skippedWrites;
  if (outFile) {
    writeFileSync(outFile, JSON.stringify(report, null, 2));
    console.log(`Đã ghi ${outFile}`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
