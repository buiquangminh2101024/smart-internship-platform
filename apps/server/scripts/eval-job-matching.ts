// Bộ đánh giá Job Matcher GĐ2 (bước 6 trong docs/06-backend/job-matcher-phase2/PLAN.md).
//
//   npm run eval-job-matching
//
// Cần dữ liệu demo đã seed (npm run seed-match-demo) và nhãn trong
// docs/06-backend/job-matcher-phase2/eval/labels.json. Dựng MatchInput bằng ĐÚNG loader và
// MatchEmbeddingService của service thật (vector được lưu vào bảng embedding như khi có người
// xem điểm — --reset của seed xoá theo cascade), chấm bằng các ScoringJobMatcher, hiệu chỉnh
// lo/hi + trọng số semantic CHỈ trên tập dev, rồi ghi eval/eval-results.md.
//
// Script không sửa config: đổi SEMANTIC_CALIBRATION / trọng số / JOB_MATCHER_MODE là việc làm
// tay sau khi đọc kết quả trên nhãn cuối cùng (không làm trên kết quả tạm).
//
// GĐ3 (bước 7 trong docs/06-backend/job-matcher-phase3/PLAN.md): cùng các cặp/cosine đó, so
// hybrid-v2 trên tin dạng GĐ2 với hybrid-v2 trên tin đã gắn yêu cầu xác nhận
// (job-matcher-phase3/eval/confirmed-requirements.json, áp trong bộ nhớ — không ghi DB), quét
// lưới RELATED_MAJOR_SCORE trên dev, ghi job-matcher-phase3/eval/eval-results.md.
import { PrismaClient } from "@prisma/client";
import type { MatchResult } from "@sip/shared-types";
import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../src/shared/config/env";
import { logger } from "../src/shared/logger";
import { SkillEmbeddingService } from "../src/modules/skills/skill-embedding.service";
import { SkillEmbeddingProvider } from "../src/infrastructure/skill-embedding-provider";
import { CandidateMatchProfileLoader } from "../src/modules/job-matching/candidate-match-profile.loader";
import { JobMatchProfileLoader } from "../src/modules/job-matching/job-match-profile.loader";
import { MatchEmbeddingRepository } from "../src/modules/job-matching/match-embedding.repository";
import { MatchEmbeddingService } from "../src/modules/job-matching/match-embedding.service";
import { ScoringJobMatcher } from "../src/modules/job-matching/scoring-job-matcher";
import {
  EMBEDDING_ONLY_WEIGHTS_V1,
  HYBRID_WEIGHTS_V1,
  HYBRID_WEIGHTS_V2,
  RELATED_MAJOR_SCORE,
  RULE_WEIGHTS_V1,
  SEMANTIC_CALIBRATION,
} from "../src/modules/job-matching/job-matching.config";
import type { MatchWeights, SemanticCalibration } from "../src/modules/job-matching/job-matching.types";
import type { CandidateMatchProfile, JobMatchProfile } from "../src/shared/ports/JobMatcher";
import { DEMO_EMAIL_DOMAIN, DEMO_EMPLOYER_EMAIL } from "./lib/match-demo-fixture";
import {
  applyConfirmedRequirements,
  validateConfirmedRequirements,
  withoutPhase3Requirements,
  type ConfirmedRequirements,
} from "./lib/confirmed-requirements";
import {
  DEFAULT_THRESHOLDS,
  MATCH_LABELS,
  accuracy,
  classify,
  cohenKappa,
  isFalseNegative,
  isFalsePositive,
  meanNdcgByJob,
  median,
  parseLabelsFile,
  resolveLabel,
  spearman,
  tuneThresholds,
  LABEL_VALUE,
  type LabelSource,
  type LabeledPair,
  type MatchLabel,
  type Split,
  type Thresholds,
} from "./lib/eval-metrics";

const EVAL_DIR = path.resolve(__dirname, "../../../docs/06-backend/job-matcher-phase2/eval");
const LABELS_PATH = path.join(EVAL_DIR, "labels.json");
const RESULTS_PATH = path.join(EVAL_DIR, "eval-results.md");
const FIXTURE_PATH = path.resolve(__dirname, "data/match-demo.json");

const PHASE3_EVAL_DIR = path.resolve(__dirname, "../../../docs/06-backend/job-matcher-phase3/eval");
const CONFIRMED_PATH = path.join(PHASE3_EVAL_DIR, "confirmed-requirements.json");
const PHASE3_RESULTS_PATH = path.join(PHASE3_EVAL_DIR, "eval-results.md");

/** Lưới trọng số semantic (PLAN); phần còn lại chia theo đúng tỉ lệ của hybrid-v1. */
const SEMANTIC_WEIGHT_GRID = [0.2, 0.3, 0.4];
/** Lưới RELATED_MAJOR_SCORE (PLAN GĐ3 bước 7). */
const RELATED_MAJOR_GRID = [0.3, 0.5, 0.65, 0.8];
/**
 * Chốt trước khi chạy: dưới số cặp dev có học vấn RELATED này thì không coi lưới là hiệu chỉnh
 * (giữ giá trị hiện tại và ghi rõ "chưa hiệu chỉnh được vì thiếu dữ liệu").
 */
const MIN_RELATED_DEV_PAIRS = 5;
const SPLITS: Split[] = ["dev", "test"];

const prisma = new PrismaClient();

interface EvalRow {
  pair: LabeledPair;
  label: MatchLabel;
  source: LabelSource;
  candidate: CandidateMatchProfile;
  job: JobMatchProfile;
  cosine: number | null;
}

interface Config {
  key: string;
  title: string;
  matcher: ScoringJobMatcher;
  weights: MatchWeights;
  calibration: SemanticCalibration | null;
}

interface SplitMetrics {
  n: number;
  rho: number | null;
  ndcg: number | null;
  ndcgJobs: number;
  accuracyDefault: number | null;
  accuracyTuned: number | null;
  fp: number;
  fn: number;
}

// ─── Nạp dữ liệu ────────────────────────────────────────────────────────────

async function loadLabels() {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(LABELS_PATH, "utf8"));
  } catch (error) {
    throw new Error(`Không đọc được ${LABELS_PATH}: ${error instanceof Error ? error.message : error}`);
  }
  const { pairs, errors } = parseLabelsFile(raw);
  if (errors.length > 0) {
    console.error(`✗ labels.json có ${errors.length} lỗi — sửa đúng các cặp dưới đây rồi chạy lại:`);
    for (const error of errors) console.error(`  - ${error}`);
    throw new Error("labels.json không hợp lệ.");
  }
  return pairs;
}

/** hardCase theo ref/tiêu đề, chỉ để chú thích phần phân tích lỗi; thiếu fixture thì bỏ qua. */
async function loadHardCases(): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  try {
    const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, "utf8")) as {
      candidates?: { ref: string; hardCase?: string }[];
      jobs?: { title: string; hardCase?: string }[];
    };
    for (const c of fixture.candidates ?? []) if (c.hardCase) result.set(`c:${c.ref}`, c.hardCase);
    for (const j of fixture.jobs ?? []) if (j.hardCase) result.set(`j:${j.title}`, j.hardCase);
  } catch {
    // Không bắt buộc.
  }
  return result;
}

async function loadRows(pairs: { pair: LabeledPair; label: MatchLabel; source: LabelSource }[]): Promise<EvalRow[]> {
  const candidateRefs = [...new Set(pairs.map((p) => p.pair.candidateRef))];
  const jobRefs = [...new Set(pairs.map((p) => p.pair.jobRef))];

  const users = await prisma.user.findMany({
    where: { email: { in: candidateRefs.map((ref) => `${ref}@${DEMO_EMAIL_DOMAIN}`) } },
    select: { email: true, candidate: { select: { id: true } } },
  });
  const candidateIdByRef = new Map(
    users.flatMap((u) => (u.candidate ? [[u.email.slice(0, -`@${DEMO_EMAIL_DOMAIN}`.length), u.candidate.id] as const] : [])),
  );
  const employer = await prisma.user.findUnique({
    where: { email: DEMO_EMPLOYER_EMAIL },
    select: { employer: { select: { companyId: true } } },
  });
  const companyId = employer?.employer?.companyId;
  const jobs = companyId
    ? await prisma.jobPost.findMany({ where: { companyId, title: { in: jobRefs } }, select: { id: true, title: true } })
    : [];
  const jobIdByRef = new Map(jobs.map((j) => [j.title, j.id]));

  const missing = [
    ...candidateRefs.filter((ref) => !candidateIdByRef.has(ref)).map((ref) => `hồ sơ "${ref}"`),
    ...jobRefs.filter((ref) => !jobIdByRef.has(ref)).map((ref) => `tin "${ref}"`),
  ];
  if (missing.length > 0) {
    throw new Error(
      `Chưa có trong DB: ${missing.join(", ")}. Chạy \`npm run seed-match-demo\` (fixture phải khớp labels.json) rồi chạy lại.`,
    );
  }

  const candidateLoader = new CandidateMatchProfileLoader({ prisma });
  const jobLoader = new JobMatchProfileLoader({ prisma });
  const skillEmbeddingService = new SkillEmbeddingService({ prisma, logger });
  const matchEmbeddingService = new MatchEmbeddingService({
    matchEmbeddingRepository: new MatchEmbeddingRepository({ prisma }),
    embeddingProvider: new SkillEmbeddingProvider({ skillEmbeddingService, config }),
    config,
    logger,
  });

  const candidates = await candidateLoader.loadMany([...candidateIdByRef.values()]);
  const jobProfiles = new Map<string, JobMatchProfile>();
  for (const [ref, id] of jobIdByRef) {
    const profile = await jobLoader.load(id);
    if (!profile) throw new Error(`Loader không dựng được tin "${ref}".`);
    jobProfiles.set(ref, profile);
  }

  // Cosine theo từng tin, đúng đường đi của danh sách đơn Employer (không giới hạn số vector mới).
  const cosine = new Map<string, number | null>();
  for (const [jobRef, job] of jobProfiles) {
    const targets = pairs
      .filter((p) => p.pair.jobRef === jobRef)
      .map((p) => candidates.get(candidateIdByRef.get(p.pair.candidateRef)!))
      .filter((c): c is CandidateMatchProfile => c !== undefined && c.skills.length > 0)
      .map((c) => ({ id: c.candidateId, text: c.matchText }));
    const result = await matchEmbeddingService.similarityForCandidates(
      { id: job.jobPostId, text: job.matchText },
      targets,
      Number.MAX_SAFE_INTEGER,
    );
    for (const [candidateId, value] of result) cosine.set(`${candidateId}|${jobRef}`, value);
  }

  return pairs.map(({ pair, label, source }) => {
    const candidateId = candidateIdByRef.get(pair.candidateRef)!;
    const candidate = candidates.get(candidateId);
    if (!candidate) throw new Error(`Loader không dựng được hồ sơ "${pair.candidateRef}".`);
    return { pair, label, source, candidate, job: jobProfiles.get(pair.jobRef)!, cosine: cosine.get(`${candidateId}|${pair.jobRef}`) ?? null };
  });
}

// ─── Cấu hình và chỉ số ─────────────────────────────────────────────────────

function hybridWithSemantic(semantic: number): MatchWeights {
  const { semantic: base, ...rest } = HYBRID_WEIGHTS_V1.weights;
  const scale = (1 - semantic) / (1 - base);
  const scaled = Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, round4(value * scale)]));
  return {
    version: `hybrid-s${semantic.toFixed(2)}`,
    weights: { ...(scaled as Omit<MatchWeights["weights"], "semantic">), semantic },
  };
}

function makeConfig(key: string, title: string, weights: MatchWeights, calibration: SemanticCalibration | null): Config {
  return {
    key,
    title,
    weights,
    calibration,
    matcher: new ScoringJobMatcher(weights, calibration ?? SEMANTIC_CALIBRATION),
  };
}

function scoreAll(config: Config, rows: EvalRow[]): Map<string, MatchResult> {
  return new Map(
    rows.map((row) => [row.pair.id, config.matcher.match({ candidate: row.candidate, job: row.job, semanticSimilarity: row.cosine })]),
  );
}

function metricsFor(rows: EvalRow[], scores: Map<string, number>, tuned: Thresholds): SplitMetrics {
  const items = rows.map((row) => ({ score: scores.get(row.pair.id)!, label: row.label, jobRef: row.pair.jobRef }));
  const ndcg = meanNdcgByJob(items);
  return {
    n: items.length,
    rho: spearman(
      items.map((item) => item.score),
      items.map((item) => LABEL_VALUE[item.label]),
    ),
    ndcg: ndcg.mean,
    ndcgJobs: ndcg.jobs,
    accuracyDefault: accuracy(items, DEFAULT_THRESHOLDS),
    accuracyTuned: accuracy(items, tuned),
    fp: items.filter((item) => isFalsePositive(item, DEFAULT_THRESHOLDS)).length,
    fn: items.filter((item) => isFalseNegative(item, DEFAULT_THRESHOLDS)).length,
  };
}

/** So sánh để chọn trọng số trên dev: ρ cao hơn, rồi NDCG@3, rồi ít FP hơn. */
function better(a: SplitMetrics, b: SplitMetrics): boolean {
  const eps = 1e-9;
  const rhoA = a.rho ?? -Infinity;
  const rhoB = b.rho ?? -Infinity;
  if (Math.abs(rhoA - rhoB) > eps) return rhoA > rhoB;
  const ndcgA = a.ndcg ?? -Infinity;
  const ndcgB = b.ndcg ?? -Infinity;
  if (Math.abs(ndcgA - ndcgB) > eps) return ndcgA > ndcgB;
  return a.fp < b.fp;
}

// ─── Chạy ───────────────────────────────────────────────────────────────────

async function main() {
  const labelPairs = await loadLabels();
  const resolved = labelPairs.map((pair) => ({ pair, resolved: resolveLabel(pair) }));
  const used = resolved.flatMap(({ pair, resolved: r }) => (r.status === "used" ? [{ pair, label: r.label, source: r.source }] : []));
  const excluded = resolved.flatMap(({ pair, resolved: r }) => (r.status === "excluded" ? [{ pair, reason: r.reason }] : []));
  const provisional = used.some((u) => u.source === "single-rater");

  console.log(`Nhãn: ${used.length} cặp dùng được, ${excluded.length} cặp bị loại${provisional ? " — CÓ nhãn một người (kết quả TẠM)" : ""}.`);
  console.log("Đang dựng hồ sơ/tin và tính cosine (lần đầu phải nạp model ~3 s)…");
  const allRows = await loadRows(used);
  const hardCases = await loadHardCases();

  // Cặp không chấm được ở bất kỳ cấu hình nào (thiếu cosine ⇒ EMBEDDING_ONLY không chấm;
  // rule INSUFFICIENT_* ⇒ phần kỹ năng không chấm) bị loại khỏi MỌI cấu hình để so trên cùng một tập.
  const ruleProbe = new ScoringJobMatcher(RULE_WEIGHTS_V1);
  const unscorable = allRows.filter(
    (row) => row.cosine === null || ruleProbe.match({ candidate: row.candidate, job: row.job, semanticSimilarity: null }).score === null,
  );
  const rows = allRows.filter((row) => !unscorable.includes(row));
  const bySplit = (split: Split) => rows.filter((row) => row.pair.split === split);
  const dev = bySplit("dev");

  // 1) lo/hi trên dev: trung vị cosine POOR / GOOD.
  const devCosines = (label: MatchLabel) => dev.filter((row) => row.label === label).map((row) => row.cosine!);
  const lo = median(devCosines("POOR_MATCH"));
  const hi = median(devCosines("GOOD_MATCH"));
  const calibrationOk = lo !== null && hi !== null && hi > lo;
  const calibrated: SemanticCalibration = calibrationOk ? { lo: round4(lo!), hi: round4(hi!) } : SEMANTIC_CALIBRATION;

  // 2) Cấu hình.
  const rule = makeConfig("rule", "RULE (rule-v1)", RULE_WEIGHTS_V1, null);
  const embeddingOnly = makeConfig("embedding", "EMBEDDING_ONLY (lo/hi hiệu chỉnh)", EMBEDDING_ONLY_WEIGHTS_V1, calibrated);
  const hybridV1 = makeConfig(
    "hybrid-v1",
    `HYBRID hybrid-v1 (semantic 0,30, lo/hi hiện tại ${fmt(SEMANTIC_CALIBRATION.lo, 4)}/${fmt(SEMANTIC_CALIBRATION.hi, 4)})`,
    HYBRID_WEIGHTS_V1,
    SEMANTIC_CALIBRATION,
  );
  const grid = SEMANTIC_WEIGHT_GRID.map((s) =>
    makeConfig(`hybrid-s${s}`, `HYBRID semantic ${fmt(s, 1)} (lo/hi hiệu chỉnh)`, hybridWithSemantic(s), calibrated),
  );

  const scoresOf = (cfg: Config) => {
    const scores = new Map<string, number>();
    for (const [id, result] of scoreAll(cfg, rows)) {
      // Không xảy ra sau khi đã lọc ở trên; giữ để lỗi lộ ra thay vì đo sai.
      if (result.score === null) throw new Error(`${cfg.key}: cặp ${id} không chấm được (${result.status}).`);
      scores.set(id, result.score);
    }
    return scores;
  };

  const allConfigs = [rule, embeddingOnly, hybridV1, ...grid];
  const scoreTable = new Map(allConfigs.map((c) => [c.key, scoresOf(c)]));

  // 3) Ngưỡng hiệu chỉnh trên dev cho từng cấu hình.
  const tuned = new Map(
    allConfigs.map((c) => [
      c.key,
      tuneThresholds(dev.map((row) => ({ score: scoreTable.get(c.key)!.get(row.pair.id)!, label: row.label }))),
    ]),
  );
  const metrics = (config: Config, split: Split) => metricsFor(bySplit(split), scoreTable.get(config.key)!, tuned.get(config.key)!);

  // 4) Chọn trọng số semantic trên dev.
  let chosen = grid[0]!;
  for (const candidate of grid.slice(1)) if (better(metrics(candidate, "dev"), metrics(chosen, "dev"))) chosen = candidate;

  // 5) Quy tắc quyết định (chốt trước trong PLAN) — chỉ trên dev.
  const decide = (hybrid: Config) => {
    const h = metrics(hybrid, "dev");
    const r = metrics(rule, "dev");
    const checks = [
      { name: "Spearman ρ", ok: (h.rho ?? -Infinity) >= (r.rho ?? -Infinity), detail: `${fmt(h.rho)} vs ${fmt(r.rho)}` },
      { name: "NDCG@3", ok: (h.ndcg ?? -Infinity) >= (r.ndcg ?? -Infinity), detail: `${fmt(h.ndcg)} vs ${fmt(r.ndcg)}` },
      { name: "False positive", ok: h.fp <= r.fp, detail: `${h.fp} vs ${r.fp}` },
    ];
    return { checks, pass: checks.every((c) => c.ok) };
  };
  const decision = decide(chosen);
  const decisionV1 = decide(hybridV1);

  // 6) κ trên cặp có đủ hai người.
  const bothRated = labelPairs.flatMap((p) =>
    p.ratings.rater1 && p.ratings.rater2 ? [{ a: p.ratings.rater1, b: p.ratings.rater2 }] : [],
  );
  const kappa = cohenKappa(bothRated);

  const report = renderReport({
    provisional,
    labelPairs,
    used,
    excluded,
    unscorable,
    rows,
    calibrationOk,
    calibrated,
    lo,
    hi,
    allConfigs,
    grid,
    chosen,
    rule,
    hybridV1,
    scoreTable,
    tuned,
    metrics,
    decision,
    decisionV1,
    kappa,
    hardCases,
  });
  const gd2Written = await writeReport(RESULTS_PATH, report);

  console.log("");
  for (const split of SPLITS) {
    console.log(`[${split}]`);
    for (const c of [rule, embeddingOnly, hybridV1, chosen]) {
      const m = metrics(c, split);
      console.log(`  ${c.title.padEnd(52)} n=${m.n} ρ=${fmt(m.rho)} NDCG@3=${fmt(m.ndcg)} acc=${pct(m.accuracyDefault)} FP=${m.fp} FN=${m.fn}`);
    }
  }
  console.log(`\nlo/hi (dev): ${fmt(calibrated.lo)} / ${fmt(calibrated.hi)}; trọng số semantic chọn: ${chosen.weights.weights.semantic}`);
  console.log(`Quy tắc quyết định: ${decision.pass ? "ĐẠT — có thể đổi mặc định sang hybrid" : "KHÔNG ĐẠT — giữ rule"}${provisional ? " (nhãn TẠM, chưa áp dụng)" : ""}`);
  console.log(gd2Written ? `✓ Đã ghi ${RESULTS_PATH}` : `= ${RESULTS_PATH} không đổi (ngoài dấu thời gian) — giữ nguyên file`);

  await evaluatePhase3(rows, { provisional, hardCases });
}

// ─── GĐ3: yêu cầu có cấu trúc đã xác nhận ───────────────────────────────────

interface Phase3Config {
  key: string;
  title: string;
  relatedMajorScore: number | null;
  matcher: ScoringJobMatcher;
  /** Hồ sơ tin mà cấu hình này thấy. */
  jobOf: (row: EvalRow) => JobMatchProfile;
}

async function loadConfirmedRequirements(): Promise<{ data: ConfirmedRequirements; majorIdByName: Map<string, string> }> {
  let raw: unknown;
  let fixture: { jobs: { title: string; skills: { name: string }[] }[] };
  try {
    raw = JSON.parse(await fs.readFile(CONFIRMED_PATH, "utf8"));
    fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, "utf8"));
  } catch (error) {
    throw new Error(`Không đọc được dữ liệu GĐ3: ${error instanceof Error ? error.message : error}`);
  }
  const names = [
    ...new Set(
      ((raw as { jobs?: { majors?: { name?: unknown }[] }[] }).jobs ?? []).flatMap((job) =>
        (job.majors ?? []).flatMap((major) => (typeof major.name === "string" ? [major.name] : [])),
      ),
    ),
  ];
  const majors = await prisma.major.findMany({
    where: { status: "APPROVED", name: { in: names } },
    select: { id: true, name: true },
  });
  const { data, errors } = validateConfirmedRequirements(raw, {
    jobs: fixture.jobs.map((job) => ({ title: job.title, skills: job.skills.map((skill) => skill.name) })),
    majors: majors.map((major) => major.name),
  });
  if (!data) {
    console.error(`✗ confirmed-requirements.json có ${errors.length} lỗi:`);
    for (const error of errors) console.error(`  - ${error}`);
    throw new Error("confirmed-requirements.json không hợp lệ.");
  }
  return { data, majorIdByName: new Map(majors.map((major) => [major.name, major.id])) };
}

async function evaluatePhase3(rows: EvalRow[], ctx: { provisional: boolean; hardCases: Map<string, string> }) {
  const { data, majorIdByName } = await loadConfirmedRequirements();
  const confirmedByTitle = new Map(data.jobs.map((job) => [job.jobTitle, job]));
  const phase3Jobs = new Map<string, JobMatchProfile>();
  const phase3Job = (row: EvalRow) => {
    let job = phase3Jobs.get(row.pair.jobRef);
    if (!job) {
      job = applyConfirmedRequirements(row.job, confirmedByTitle.get(row.pair.jobRef), majorIdByName);
      phase3Jobs.set(row.pair.jobRef, job);
    }
    return job;
  };

  const baseline: Phase3Config = {
    key: "gd2",
    title: "GĐ2 — hybrid-v2, tin chưa có ngành/số năm theo kỹ năng",
    relatedMajorScore: null,
    matcher: new ScoringJobMatcher(HYBRID_WEIGHTS_V2, SEMANTIC_CALIBRATION),
    jobOf: (row) => withoutPhase3Requirements(row.job),
  };
  const grid: Phase3Config[] = RELATED_MAJOR_GRID.map((value) => ({
    key: `gd3-r${value}`,
    title: `GĐ3 — hybrid-v2 + yêu cầu xác nhận, RELATED = ${fmt(value, 2)}`,
    relatedMajorScore: value,
    matcher: new ScoringJobMatcher(HYBRID_WEIGHTS_V2, SEMANTIC_CALIBRATION, value),
    jobOf: phase3Job,
  }));
  const configs = [baseline, ...grid];

  const results = new Map(
    configs.map((cfg) => [
      cfg.key,
      new Map(rows.map((row) => [row.pair.id, cfg.matcher.match({ candidate: row.candidate, job: cfg.jobOf(row), semanticSimilarity: row.cosine })])),
    ]),
  );
  const scoreTable = new Map(
    configs.map((cfg) => {
      const scores = new Map<string, number>();
      for (const [id, result] of results.get(cfg.key)!) {
        if (result.score === null) throw new Error(`${cfg.key}: cặp ${id} không chấm được (${result.status}).`);
        scores.set(id, result.score);
      }
      return [cfg.key, scores];
    }),
  );
  const bySplit = (split: Split) => rows.filter((row) => row.pair.split === split);
  const dev = bySplit("dev");
  const tuned = new Map(
    configs.map((cfg) => [cfg.key, tuneThresholds(dev.map((row) => ({ score: scoreTable.get(cfg.key)!.get(row.pair.id)!, label: row.label })))]),
  );
  const metrics = (cfg: Phase3Config, split: Split) => metricsFor(bySplit(split), scoreTable.get(cfg.key)!, tuned.get(cfg.key)!);

  // Trạng thái học vấn không phụ thuộc giá trị RELATED — lấy từ một cấu hình GĐ3 bất kỳ.
  const educationStatus = (row: EvalRow) => results.get(grid[0]!.key)!.get(row.pair.id)!.education.status;
  const relatedDev = dev.filter((row) => educationStatus(row) === "RELATED").length;

  // Chọn trên dev; hoà thì giữ giá trị hiện tại (better() là so sánh chặt).
  const current = grid.find((cfg) => cfg.relatedMajorScore === RELATED_MAJOR_SCORE) ?? grid[0]!;
  let best = current;
  for (const cfg of grid) if (cfg !== current && better(metrics(cfg, "dev"), metrics(best, "dev"))) best = cfg;
  const gridHasSignal = grid.some((cfg) => {
    const a = metrics(cfg, "dev");
    const b = metrics(current, "dev");
    return a.rho !== b.rho || a.ndcg !== b.ndcg || a.fp !== b.fp;
  });
  const calibrated = relatedDev >= MIN_RELATED_DEV_PAIRS && gridHasSignal;
  const chosen = calibrated ? best : current;

  const report = renderPhase3Report({
    ...ctx,
    data,
    rows,
    baseline,
    grid,
    chosen,
    calibrated,
    gridHasSignal,
    relatedDev,
    results,
    scoreTable,
    tuned,
    metrics,
    educationStatus,
  });
  await writeReport(PHASE3_RESULTS_PATH, report, true);

  console.log("\n[GĐ3]");
  for (const split of SPLITS) {
    for (const cfg of [baseline, chosen]) {
      const m = metrics(cfg, split);
      console.log(`  ${split.padEnd(4)} ${cfg.title.padEnd(62)} ρ=${fmt(m.rho)} NDCG@3=${fmt(m.ndcg)} acc=${pct(m.accuracyDefault)} FP=${m.fp} FN=${m.fn}`);
    }
  }
  console.log(
    `RELATED_MAJOR_SCORE: ${calibrated ? `chọn ${chosen.relatedMajorScore} trên dev` : `giữ ${RELATED_MAJOR_SCORE} — chưa hiệu chỉnh được (${relatedDev} cặp dev RELATED${gridHasSignal ? "" : ", lưới không đổi chỉ số"})`}`,
  );
  console.log(`✓ Đã ghi ${PHASE3_RESULTS_PATH}`);
}

function renderPhase3Report(ctx: {
  provisional: boolean;
  hardCases: Map<string, string>;
  data: ConfirmedRequirements;
  rows: EvalRow[];
  baseline: Phase3Config;
  grid: Phase3Config[];
  chosen: Phase3Config;
  calibrated: boolean;
  gridHasSignal: boolean;
  relatedDev: number;
  results: Map<string, Map<string, MatchResult>>;
  scoreTable: Map<string, Map<string, number>>;
  tuned: Map<string, Thresholds>;
  metrics: (cfg: Phase3Config, split: Split) => SplitMetrics;
  educationStatus: (row: EvalRow) => MatchResult["education"]["status"];
}): string {
  const { rows, baseline, grid, chosen, metrics, scoreTable, educationStatus } = ctx;
  const out: string[] = [];
  const line = (text = "") => out.push(text);
  const minYearsCount = ctx.data.jobs.reduce((sum, job) => sum + Object.keys(job.skillMinYears).length, 0);

  line("# Kết quả đánh giá Job Matcher GĐ3");
  line();
  line(`> Sinh tự động bởi \`apps/server/scripts/eval-job-matching.ts\` lúc ${new Date().toISOString()} — không sửa tay; chạy lại script để cập nhật. Phương pháp: \`../PLAN.md\` bước 7; cặp, nhãn, cosine và cách đo dùng lại nguyên của GĐ2 (\`../../job-matcher-phase2/eval/\`).`);
  line();
  if (ctx.provisional) {
    line("> **KẾT QUẢ TẠM** — còn nhãn một người gán.");
    line();
  }
  line("Cỡ mẫu nhỏ, dữ liệu tổng hợp: mọi con số chỉ mang tính chỉ báo.");
  line();

  line("## Dữ liệu GĐ3");
  line();
  line("Yêu cầu \"Employer đã xác nhận\" nằm ở `confirmed-requirements.json` (cùng thư mục), áp trong bộ nhớ lên hồ sơ tin — không ghi DB, không sửa `match-demo.json`/`labels.json`. Quy tắc gắn ngành chốt trước khi chạy, không dựa vào nhãn hay điểm (xem trường `description` của file).");
  line();
  line("| Tin | Tập | Căn cứ trong tin | Đúng ngành (PRIMARY) | Ngành liên quan (RELATED) |");
  line("| --- | --- | --- | --- | --- |");
  const splitOfJob = new Map(rows.map((row) => [row.pair.jobRef, row.pair.split]));
  for (const job of ctx.data.jobs) {
    const names = (relevance: "PRIMARY" | "RELATED") =>
      job.majors.filter((major) => major.relevance === relevance).map((major) => major.name).join(", ") || "—";
    line(`| ${job.jobTitle} | ${splitOfJob.get(job.jobTitle) ?? "—"} | "${job.evidence}" | ${names("PRIMARY")} | ${names("RELATED")} |`);
  }
  const untouched = [...new Set(rows.map((row) => row.pair.jobRef))].filter((title) => !ctx.data.jobs.some((job) => job.jobTitle === title));
  if (untouched.length > 0) line(`\nTin không nêu ngành (giữ nguyên, education không áp dụng): ${untouched.join(", ")}.`);
  line();
  line(
    minYearsCount === 0
      ? "**Số năm theo từng kỹ năng (`JobPostSkill.minYears`): không đánh giá được trên bộ dữ liệu này** — không tin demo nào nêu số năm cho riêng một kỹ năng (fixture viết cho GĐ2), và quy tắc là không tự đặt số năm khi văn bản tin không nêu. Phần chấm này chỉ được kiểm bằng test đơn vị (`scoring-job-matcher.test.ts`, E1–E5)."
      : `Số năm theo kỹ năng đã xác nhận: ${minYearsCount} dòng.`,
  );
  line();

  line("### Trạng thái học vấn của các cặp (theo nhãn)");
  line();
  const statuses = ["PRIMARY", "RELATED", "NONE", "UNKNOWN", "NOT_REQUIRED"] as const;
  line(`| Tập | Nhãn | ${statuses.join(" | ")} |`);
  line(`| --- | --- | ${statuses.map(() => "---").join(" | ")} |`);
  for (const split of SPLITS) {
    for (const label of [...MATCH_LABELS].reverse()) {
      const subset = rows.filter((row) => row.pair.split === split && row.label === label);
      const counts = countBy(subset, educationStatus);
      line(`| ${split} | ${short(label)} | ${statuses.map((s) => counts.get(s) ?? 0).join(" | ")} |`);
    }
  }
  line();

  line("## Lưới `RELATED_MAJOR_SCORE` (chỉ trên dev)");
  line();
  line(`Chọn theo ρ, rồi NDCG@3, rồi ít FP hơn; hoà thì giữ giá trị hiện tại (${fmt(RELATED_MAJOR_SCORE, 2)}). Quy tắc chốt trước: cần ≥ ${MIN_RELATED_DEV_PAIRS} cặp dev có học vấn RELATED và lưới phải làm đổi ít nhất một chỉ số thì mới coi là hiệu chỉnh.`);
  line();
  line("| RELATED | ρ | NDCG@3 | Acc (mặc định) | FP | FN | |");
  line("| --- | --- | --- | --- | --- | --- | --- |");
  for (const cfg of grid) {
    const m = metrics(cfg, "dev");
    line(`| ${fmt(cfg.relatedMajorScore, 2)} | ${fmt(m.rho)} | ${fmt(m.ndcg)} | ${pct(m.accuracyDefault)} | ${m.fp} | ${m.fn} | ${cfg === chosen ? "**chọn**" : ""} |`);
  }
  line();
  if (ctx.calibrated) {
    const rhos = grid.map((cfg) => metrics(cfg, "dev").rho ?? 0);
    const spread = Math.max(...rhos) - Math.min(...rhos);
    const ndcgFpFlat = grid.every((cfg) => {
      const m = metrics(cfg, "dev");
      const c = metrics(chosen, "dev");
      return m.ndcg === c.ndcg && m.fp === c.fp;
    });
    line(`Kết quả: **${fmt(chosen.relatedMajorScore, 2)}** (${ctx.relatedDev} cặp dev RELATED). ρ giữa các giá trị trong lưới chỉ chênh ${fmt(spread)}${ndcgFpFlat ? ", NDCG@3 và FP không đổi" : ""} — ${spread < 0.02 ? "mức chênh nằm trong nhiễu của cỡ mẫu này: giá trị được chọn **không bị dữ liệu bác bỏ**, nhưng cũng chưa đủ căn cứ để nói nó tốt hơn các giá trị lân cận" : "có tín hiệu nhưng vẫn trên cỡ mẫu nhỏ"}.`);
  } else {
    const reasons = [
      ...(ctx.relatedDev < MIN_RELATED_DEV_PAIRS ? [`chỉ ${ctx.relatedDev} cặp dev có học vấn RELATED (< ${MIN_RELATED_DEV_PAIRS})`] : []),
      ...(ctx.gridHasSignal ? [] : ["mọi giá trị trong lưới cho cùng ρ/NDCG@3/FP"]),
    ];
    line(`**Chưa hiệu chỉnh được vì thiếu dữ liệu** — ${reasons.join("; ")}. Giữ \`RELATED_MAJOR_SCORE = ${fmt(RELATED_MAJOR_SCORE, 2)}\` như giá trị đề xuất, **chưa được kiểm chứng**.`);
  }
  line();

  line("## GĐ2 so với GĐ3");
  line();
  line(`Cùng trọng số \`hybrid-v2\` và \`lo/hi\` đang dùng (${fmt(SEMANTIC_CALIBRATION.lo, 4)}/${fmt(SEMANTIC_CALIBRATION.hi, 4)}); khác nhau duy nhất ở dữ liệu tin. Ở GĐ2 trọng số \`education\` (${fmt(HYBRID_WEIGHTS_V2.weights.education, 4)}) luôn bị chia lại cho các thành phần khác; ở GĐ3 nó có điểm khi tin có ngành. rule-v1 có \`education = 0\` nên không đổi giữa hai giai đoạn khi không có số năm theo kỹ năng — không liệt kê.`);
  line();
  for (const split of SPLITS) {
    line(`### Tập ${split}${split === "test" ? " (chỉ để báo cáo)" : ""}`);
    line();
    line("| Cấu hình | n | Spearman ρ | NDCG@3 (số tin) | Acc (mặc định) | Acc (dev) — ngưỡng | FP | FN |");
    line("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const cfg of [baseline, chosen]) {
      const m = metrics(cfg, split);
      const t = ctx.tuned.get(cfg.key)!;
      line(`| ${cfg.title} | ${m.n} | ${fmt(m.rho)} | ${fmt(m.ndcg)} (${m.ndcgJobs}) | ${pct(m.accuracyDefault)} | ${pct(m.accuracyTuned)} — ${t.good}/${t.partial} | ${m.fp} | ${m.fn} |`);
    }
    line();
  }

  line("## Các cặp đổi điểm");
  line();
  const hard = (row: EvalRow) =>
    [...new Set([ctx.hardCases.get(`c:${row.pair.candidateRef}`), ctx.hardCases.get(`j:${row.pair.jobRef}`)].filter(Boolean))].join(", ") || "—";
  const changed = rows
    .filter((row) => scoreTable.get(baseline.key)!.get(row.pair.id) !== scoreTable.get(chosen.key)!.get(row.pair.id))
    .sort((a, b) => a.pair.id.localeCompare(b.pair.id));
  if (changed.length === 0) {
    line("Không có.");
  } else {
    line(`Dấu ✗ khi lớp suy ra từ điểm (ngưỡng mặc định) khác nhãn. ${changed.length}/${rows.length} cặp đổi điểm.`);
    line();
    line("| Cặp | Tập | Hồ sơ | Tin | Nhãn | Học vấn | Ngành ứng viên khớp | GĐ2 | GĐ3 | Ca khó |");
    line("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    const cell = (cfg: Phase3Config, row: EvalRow) => {
      const score = scoreTable.get(cfg.key)!.get(row.pair.id)!;
      return `${score}${classify(score, DEFAULT_THRESHOLDS) === row.label ? "" : " ✗"}`;
    };
    for (const row of changed) {
      const education = ctx.results.get(chosen.key)!.get(row.pair.id)!.education;
      line(`| ${row.pair.id} | ${row.pair.split} | ${row.pair.candidateRef} | ${row.pair.jobRef} | ${short(row.label)} | ${education.status} | ${education.matchedMajorName ?? "—"} | ${cell(baseline, row)} | ${cell(chosen, row)} | ${hard(row)} |`);
    }
  }
  line();

  line("## Hạn chế");
  line();
  line("- Trọng số `education` của hybrid-v2 chỉ 0,0429 nên một cặp đổi tối đa khoảng 4 điểm giữa \"đúng ngành\" và \"khác ngành\"; lưới RELATED chỉ dịch điểm cặp RELATED khoảng 1–2 điểm — khó đổi thứ hạng trên vài chục cặp.");
  line("- Nhãn GĐ2 được gán khi hệ thống chưa chấm ngành; người gán vẫn nhìn thấy ngành của ứng viên nên nhãn phản ánh ngành một phần, nhưng không có ca nào được thiết kế riêng để tách tác động của ngành liên quan.");
  line("- Tập ngành RELATED do người viết file xác nhận theo nhóm ngành của Bộ GD&ĐT, không phải do Employer thật chọn qua giao diện.");
  line();
  return out.join("\n");
}

/** Ghi báo cáo; bỏ qua khi chỉ khác dòng dấu thời gian (tránh làm bẩn file đã chốt). Trả true nếu có ghi. */
async function writeReport(filePath: string, content: string, createDir = false): Promise<boolean> {
  const stripStamp = (text: string) => text.replace(/lúc \d{4}-\d{2}-\d{2}T[\d:.]+Z/, "");
  try {
    if (stripStamp(await fs.readFile(filePath, "utf8")) === stripStamp(content)) return false;
  } catch {
    // Chưa có file.
  }
  if (createDir) await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return true;
}

// ─── Báo cáo ────────────────────────────────────────────────────────────────

function renderReport(ctx: {
  provisional: boolean;
  labelPairs: LabeledPair[];
  used: { pair: LabeledPair; label: MatchLabel; source: LabelSource }[];
  excluded: { pair: LabeledPair; reason: "disagreement" | "unlabeled" }[];
  unscorable: EvalRow[];
  rows: EvalRow[];
  calibrationOk: boolean;
  calibrated: SemanticCalibration;
  lo: number | null;
  hi: number | null;
  allConfigs: Config[];
  grid: Config[];
  chosen: Config;
  rule: Config;
  hybridV1: Config;
  scoreTable: Map<string, Map<string, number>>;
  tuned: Map<string, Thresholds>;
  metrics: (config: Config, split: Split) => SplitMetrics;
  decision: { checks: { name: string; ok: boolean; detail: string }[]; pass: boolean };
  decisionV1: { checks: { name: string; ok: boolean; detail: string }[]; pass: boolean };
  kappa: { kappa: number | null; agreement: number | null; n: number };
  hardCases: Map<string, string>;
}): string {
  const { rows, rule, chosen, hybridV1, metrics, scoreTable } = ctx;
  const sources = countBy(ctx.used, (u) => u.source);
  const out: string[] = [];
  const line = (text = "") => out.push(text);

  line("# Kết quả đánh giá Job Matcher GĐ2");
  line();
  line(`> Sinh tự động bởi \`apps/server/scripts/eval-job-matching.ts\` lúc ${new Date().toISOString()} — không sửa tay; chạy lại script để cập nhật. Phương pháp: \`../PLAN.md\` mục "Bộ đánh giá"; tiêu chí nhãn: \`labeling-guide.md\`.`);
  line();
  if (ctx.provisional) {
    line(`> **KẾT QUẢ TẠM.** ${sources.get("single-rater") ?? 0}/${ctx.used.length} cặp mới có nhãn của một người gán. Không dùng số ở đây để chỉnh config hay đưa vào báo cáo; chạy lại sau khi có nhãn người thứ hai và \`label\` cho các cặp bất đồng.`);
    line();
  }
  line(`Model embedding \`${config.EMBEDDING_MODEL_ID}\`, mẫu văn bản v${config.MATCH_EMBEDDING_TEMPLATE_VERSION}. Cỡ mẫu nhỏ, dữ liệu tổng hợp: mọi con số chỉ mang tính chỉ báo, không đủ kết luận có ý nghĩa thống kê.`);
  line();

  // Dữ liệu
  line("## Dữ liệu và nhãn");
  line();
  line(`- Cặp trong \`labels.json\`: ${ctx.labelPairs.length}; dùng để đo: ${rows.length}.`);
  line(`- Nguồn nhãn: \`label\` cuối ${sources.get("final") ?? 0} · hai người trùng nhau ${sources.get("agreed") ?? 0} · một người (tạm) ${sources.get("single-rater") ?? 0}.`);
  const disagreements = ctx.excluded.filter((e) => e.reason === "disagreement");
  const unlabeled = ctx.excluded.filter((e) => e.reason === "unlabeled");
  if (disagreements.length > 0) line(`- **Chưa thống nhất** (hai người khác nhau, \`label\` trống — bị loại): ${disagreements.map((e) => e.pair.id).join(", ")}.`);
  if (unlabeled.length > 0) line(`- Chưa gán nhãn (bị loại): ${unlabeled.map((e) => e.pair.id).join(", ")}.`);
  if (ctx.unscorable.length > 0) line(`- Không chấm được ở ít nhất một cấu hình — thiếu cosine hoặc \`INSUFFICIENT_*\` (bị loại khỏi mọi cấu hình): ${ctx.unscorable.map((r) => r.pair.id).join(", ")}.`);
  line();
  line("| Tập | Số tin | Số cặp | GOOD | PARTIAL | POOR |");
  line("| --- | --- | --- | --- | --- | --- |");
  for (const split of SPLITS) {
    const s = rows.filter((r) => r.pair.split === split);
    const labels = countBy(s, (r) => r.label);
    line(`| ${split} | ${new Set(s.map((r) => r.pair.jobRef)).size} | ${s.length} | ${labels.get("GOOD_MATCH") ?? 0} | ${labels.get("PARTIAL_MATCH") ?? 0} | ${labels.get("POOR_MATCH") ?? 0} |`);
  }
  line();

  // Độ tin cậy
  line("## Độ tin cậy của nhãn");
  line();
  if (ctx.kappa.n === 0) {
    line("Chưa có cặp nào đủ nhãn của hai người gán — chưa tính được Cohen's κ. Nếu cuối cùng chỉ có một lượt gán, nêu đó là hạn chế trong báo cáo.");
  } else {
    line(`Cohen's κ (không trọng số, 3 nhãn) trên ${ctx.kappa.n} cặp có đủ hai người: **${fmt(ctx.kappa.kappa)}**; tỉ lệ trùng khớp thô ${pct(ctx.kappa.agreement)}.`);
  }
  line();

  // Hiệu chỉnh
  line("## Hiệu chỉnh `lo/hi` (chỉ trên dev)");
  line();
  line("Cosine thô theo nhãn — mức tách giữa các nhãn cho biết embedding có mang tín hiệu hay không:");
  line();
  line("| Tập | Nhãn | n | Trung vị | Nhỏ nhất | Lớn nhất |");
  line("| --- | --- | --- | --- | --- | --- |");
  for (const split of SPLITS) {
    for (const label of [...MATCH_LABELS].reverse()) {
      const values = rows.filter((r) => r.pair.split === split && r.label === label).map((r) => r.cosine!);
      line(`| ${split} | ${label} | ${values.length} | ${fmt(median(values))} | ${fmt(values.length ? Math.min(...values) : null)} | ${fmt(values.length ? Math.max(...values) : null)} |`);
    }
  }
  line();
  if (ctx.calibrationOk) {
    line(`Kết quả: \`lo = ${fmt(ctx.calibrated.lo, 4)}\` (trung vị cosine POOR của dev), \`hi = ${fmt(ctx.calibrated.hi, 4)}\` (trung vị GOOD của dev) — giá trị tạm đang dùng là ${fmt(SEMANTIC_CALIBRATION.lo, 2)}/${fmt(SEMANTIC_CALIBRATION.hi, 2)}.`);
  } else {
    line(`**Không hiệu chỉnh được** (trung vị POOR ${fmt(ctx.lo)} ≥ trung vị GOOD ${fmt(ctx.hi)} hoặc thiếu nhãn) — giữ giá trị tạm ${fmt(SEMANTIC_CALIBRATION.lo, 2)}/${fmt(SEMANTIC_CALIBRATION.hi, 2)}.`);
  }
  line();

  // Lưới trọng số
  line("## Lưới trọng số semantic (chỉ trên dev)");
  line();
  line("Phần không phải semantic chia lại theo đúng tỉ lệ của hybrid-v1 (0,4 : 0,1 : 0,15 : 0,05). Chọn theo ρ, rồi NDCG@3, rồi ít FP hơn.");
  line();
  line("| semantic | requiredSkills | preferredSkills | experience | education | ρ | NDCG@3 | FP | |");
  line("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const c of ctx.grid) {
    const w = c.weights.weights;
    const m = metrics(c, "dev");
    line(`| ${fmt(w.semantic, 2)} | ${fmt(w.requiredSkills, 4)} | ${fmt(w.preferredSkills, 4)} | ${fmt(w.experience, 4)} | ${fmt(w.education, 4)} | ${fmt(m.rho)} | ${fmt(m.ndcg)} | ${m.fp} | ${c === chosen ? "**chọn**" : ""} |`);
  }
  line();

  // Kết quả chính
  line("## Kết quả");
  line();
  line(`Ngưỡng mặc định ≥ ${DEFAULT_THRESHOLDS.good} GOOD, ${DEFAULT_THRESHOLDS.partial}–${DEFAULT_THRESHOLDS.good - 1} PARTIAL, < ${DEFAULT_THRESHOLDS.partial} POOR. "Acc (dev)" dùng ngưỡng hiệu chỉnh trên dev của từng cấu hình (bội số của 5). FP = POOR mà điểm ≥ ${DEFAULT_THRESHOLDS.good}; FN = GOOD mà điểm < ${DEFAULT_THRESHOLDS.partial} (ngưỡng mặc định). NDCG@3 tính trên các tin có ≥ 3 cặp và ít nhất một cặp không POOR; điểm hoà được lấy độ lợi trung bình.`);
  line();
  const shown = [rule, ...ctx.allConfigs.filter((c) => c.key === "embedding"), hybridV1, chosen];
  for (const split of SPLITS) {
    line(`### Tập ${split}${split === "test" ? " (chỉ để báo cáo)" : ""}`);
    line();
    line("| Cấu hình | n | Spearman ρ | NDCG@3 (số tin) | Acc (mặc định) | Acc (dev) — ngưỡng | FP | FN |");
    line("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const c of shown) {
      const m = metrics(c, split);
      const t = ctx.tuned.get(c.key)!;
      line(`| ${c.title}${c === chosen ? " — **chọn**" : ""} | ${m.n} | ${fmt(m.rho)} | ${fmt(m.ndcg)} (${m.ndcgJobs}) | ${pct(m.accuracyDefault)} | ${pct(m.accuracyTuned)} — ${t.good}/${t.partial} | ${m.fp} | ${m.fn} |`);
    }
    line();
  }

  // Quyết định
  line("## Quy tắc quyết định (chốt trước trong PLAN, chỉ xét dev)");
  line();
  line("Đổi `JOB_MATCHER_MODE` mặc định sang `hybrid` chỉ khi HYBRID ≥ RULE ở cả Spearman ρ lẫn NDCG@3 và không tăng false positive.");
  line();
  line("| Điều kiện | HYBRID đã chọn vs RULE | Đạt | hybrid-v1 (semantic 0,30, chưa hiệu chỉnh trọng số) vs RULE | Đạt |");
  line("| --- | --- | --- | --- | --- |");
  ctx.decision.checks.forEach((check, i) => {
    const v1 = ctx.decisionV1.checks[i]!;
    line(`| ${check.name} | ${check.detail} | ${check.ok ? "✓" : "✗"} | ${v1.detail} | ${v1.ok ? "✓" : "✗"} |`);
  });
  line();
  const verdict = ctx.decision.pass
    ? `**Đạt** — có căn cứ đổi mặc định sang \`hybrid\` với \`lo/hi = ${fmt(ctx.calibrated.lo, 4)}/${fmt(ctx.calibrated.hi, 4)}\` và semantic = ${fmt(chosen.weights.weights.semantic, 2)}.`
    : "**Không đạt** — giữ mặc định `rule`, vẫn giữ code hybrid.";
  line(`${verdict}${ctx.provisional ? " *(Nhãn tạm — chưa áp dụng.)*" : ""}`);
  line();
  const eps = 1e-6;
  const calibrationApplied =
    Math.abs(SEMANTIC_CALIBRATION.lo - ctx.calibrated.lo) < eps && Math.abs(SEMANTIC_CALIBRATION.hi - ctx.calibrated.hi) < eps;
  const applied = !ctx.provisional && ctx.decision.pass && config.JOB_MATCHER_MODE === "hybrid" && calibrationApplied;
  line(
    applied
      ? `**Trạng thái áp dụng:** ✓ đã áp vào config — \`JOB_MATCHER_MODE=${config.JOB_MATCHER_MODE}\`, \`SEMANTIC_CALIBRATION\` khớp giá trị hiệu chỉnh ở trên.`
      : `**Trạng thái áp dụng:** chưa áp — config hiện tại \`JOB_MATCHER_MODE=${config.JOB_MATCHER_MODE}\`, \`SEMANTIC_CALIBRATION = {lo: ${fmt(SEMANTIC_CALIBRATION.lo, 4)}, hi: ${fmt(SEMANTIC_CALIBRATION.hi, 4)}}\`.`,
  );
  line();

  // Phân tích lỗi
  line("## Phân tích lỗi (ngưỡng mặc định)");
  line();
  const hard = (row: EvalRow) =>
    [...new Set([ctx.hardCases.get(`c:${row.pair.candidateRef}`), ctx.hardCases.get(`j:${row.pair.jobRef}`)].filter(Boolean))].join(", ") || "—";
  for (const c of [rule, chosen]) {
    const scores = scoreTable.get(c.key)!;
    const wrong = rows.filter((row) => {
      const item = { score: scores.get(row.pair.id)!, label: row.label };
      return isFalsePositive(item, DEFAULT_THRESHOLDS) || isFalseNegative(item, DEFAULT_THRESHOLDS);
    });
    line(`### ${c.title}: ${wrong.length} cặp sai nghiêm trọng (FP/FN)`);
    line();
    if (wrong.length === 0) {
      line("Không có.");
      line();
      continue;
    }
    line("| Cặp | Tập | Hồ sơ | Tin | Nhãn | Điểm | Loại | category | Ca khó |");
    line("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of wrong) {
      const score = scores.get(row.pair.id)!;
      const kind = row.label === "POOR_MATCH" ? "FP" : "FN";
      line(`| ${row.pair.id} | ${row.pair.split} | ${row.pair.candidateRef} | ${row.pair.jobRef} | ${short(row.label)} | ${score} | ${kind} | ${row.pair.category} | ${hard(row)} |`);
    }
    line();
  }

  // Phụ lục
  line("## Phụ lục — điểm từng cặp");
  line();
  line(`Dấu ✗ khi lớp suy ra từ điểm (ngưỡng mặc định) khác nhãn. Cột HYBRID là cấu hình đã chọn (semantic ${fmt(chosen.weights.weights.semantic, 2)}).`);
  line();
  line("| Cặp | Tập | Hồ sơ | Tin | Nhãn | Nguồn | Cosine | RULE | EMB | hybrid-v1 | HYBRID | category | Ca khó |");
  line("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  const cell = (c: Config, row: EvalRow) => {
    const score = scoreTable.get(c.key)!.get(row.pair.id)!;
    return `${score}${classify(score, DEFAULT_THRESHOLDS) === row.label ? "" : " ✗"}`;
  };
  const embedding = ctx.allConfigs.find((c) => c.key === "embedding")!;
  for (const row of [...rows].sort((a, b) => a.pair.id.localeCompare(b.pair.id))) {
    line(`| ${row.pair.id} | ${row.pair.split} | ${row.pair.candidateRef} | ${row.pair.jobRef} | ${short(row.label)} | ${sourceText(row.source)} | ${fmt(row.cosine)} | ${cell(rule, row)} | ${cell(embedding, row)} | ${cell(hybridV1, row)} | ${cell(chosen, row)} | ${row.pair.category} | ${hard(row)} |`);
  }
  line();

  line("## Hạn chế");
  line();
  line("- Cỡ mẫu nhỏ (vài chục cặp, tập test vài tin): chênh lệch vài phần trăm giữa các cấu hình có thể chỉ là nhiễu.");
  line("- Dữ liệu demo do LLM sinh theo prompt có ràng buộc, có thể \"sạch\" và đồng đều hơn hồ sơ thật.");
  line("- Nhãn chủ quan; người thiết kế fixture cũng là người gán nhãn. Nhãn không tham chiếu điểm hệ thống (xem `labeling-guide.md`).");
  if (ctx.provisional) line("- Lượt chạy này dùng nhãn một người gán — chưa có số đo độ tin cậy của nhãn.");
  line();
  return `${out.join("\n")}`;
}

// ─── Tiện ích ───────────────────────────────────────────────────────────────

function fmt(value: number | null, digits = 3): string {
  return value === null || Number.isNaN(value) ? "—" : value.toFixed(digits).replace(".", ",");
}

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(100 * value)}%`;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function short(label: MatchLabel): string {
  return label.replace("_MATCH", "");
}

function sourceText(source: LabelSource): string {
  return source === "final" ? "label" : source === "agreed" ? "2 người" : "1 người";
}

function countBy<T, K>(items: T[], key: (item: T) => K): Map<K, number> {
  const result = new Map<K, number>();
  for (const item of items) result.set(key(item), (result.get(key(item)) ?? 0) + 1);
  return result;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
