import { Prisma, PrismaClient } from "@prisma/client";
import { SkillEmbeddingProvider } from "../src/infrastructure/skill-embedding-provider";
import { CandidateOutreachService } from "../src/modules/candidate-outreach/candidate-outreach.service";
import { CandidateMatchProfileLoader } from "../src/modules/job-matching/candidate-match-profile.loader";
import { JobMatchProfileLoader } from "../src/modules/job-matching/job-match-profile.loader";
import { HYBRID_WEIGHTS_V2, RULE_WEIGHTS_V1 } from "../src/modules/job-matching/job-matching.config";
import { MatchEmbeddingRepository } from "../src/modules/job-matching/match-embedding.repository";
import { MatchEmbeddingService } from "../src/modules/job-matching/match-embedding.service";
import { ScoringJobMatcher } from "../src/modules/job-matching/scoring-job-matcher";
import { runMatchScoreNightly } from "../src/modules/match-scores/match-score.job";
import { MatchScoreRepository } from "../src/modules/match-scores/match-score.repository";
import { MatchScoreService, type RescoreAllResult, type RescoreJobResult } from "../src/modules/match-scores/match-score.service";
import { SkillEmbeddingService } from "../src/modules/skills/skill-embedding.service";
import { config } from "../src/shared/config/env";
import { logger } from "../src/shared/logger";

// Chấm tay bảng điểm lưu sẵn (0.3, AD-24) — docs/06-backend/hiring-progress/PLAN.md bước 4.
// Gọi cùng hàm với job đêm 03:30. Dùng để nạp bảng lần đầu sau migration và để demo.
//
//   npm run rescore-match-scores --workspace=apps/server -- [--company <id>] [--job <id>] [--dry-run]
//
// - Không có bộ lọc: như job đêm (xoá điểm của tin hết hiển thị, rồi chấm mọi tin đang
//   hiển thị) nhưng không giới hạn thời gian.
// - `--company` / `--job`: chỉ chấm các tin đó, không xoá gì khác.
// - `--dry-run`: chỉ in số tin và kích thước pool, không chấm, không ghi.
//
// Script chạy trong process riêng: khoá chống chạy trùng của MatchScoreService chỉ có tác
// dụng trong một process. Chạy cùng lúc với job đêm của server thì một tin có thể bị chấm
// hai lần; mỗi lần thay trọn điểm của tin trong một transaction nên không sai dữ liệu.
// Chỉ in số đếm và id tin, không in tên hay email.

function readFlag(name: string): string | undefined {
  const args = process.argv.slice(2);
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`${name} cần một id.`);
    process.exit(1);
  }
  return value;
}

const dryRun = process.argv.includes("--dry-run");
const companyId = readFlag("--company");
const jobPostId = readFlag("--job");

const prisma = new PrismaClient();
const matchScoreRepository = new MatchScoreRepository({ prisma });
const candidateMatchProfileLoader = new CandidateMatchProfileLoader({ prisma });

function buildService(): MatchScoreService {
  const matchEmbeddingService = new MatchEmbeddingService({
    matchEmbeddingRepository: new MatchEmbeddingRepository({ prisma }),
    embeddingProvider: new SkillEmbeddingProvider({
      skillEmbeddingService: new SkillEmbeddingService({ prisma, logger }),
      config,
    }),
    config,
    logger,
  });
  // MatchScoreService chỉ dùng loadJobProfile + scoreProfiles, cần đúng các phụ thuộc
  // dưới đây (cùng cấu hình với job-matching.routes.ts). Các phụ thuộc còn lại của
  // CandidateOutreachService (mời, thông báo, hạn mức...) không dùng tới nên bỏ trống.
  const candidateOutreachService = new CandidateOutreachService({
    prisma,
    ruleJobMatcher: new ScoringJobMatcher(RULE_WEIGHTS_V1),
    hybridJobMatcher: new ScoringJobMatcher(HYBRID_WEIGHTS_V2),
    matchEmbeddingService,
    candidateMatchProfileLoader,
    jobMatchProfileLoader: new JobMatchProfileLoader({ prisma }),
    logger,
    config,
  } as unknown as ConstructorParameters<typeof CandidateOutreachService>[0]);

  return new MatchScoreService({ matchScoreRepository, candidateOutreachService, candidateMatchProfileLoader, logger });
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} giây`;

async function printDryRun(): Promise<void> {
  const jobs = await matchScoreRepository.findJobsToRescore({
    ...(companyId ? { companyId } : {}),
    ...(jobPostId ? { jobPostId } : {}),
  });
  const sizes: number[] = [];
  for (const job of jobs) sizes.push((await matchScoreRepository.findScoringPool(job.id)).length);
  const sorted = [...sizes].sort((a, b) => a - b);
  const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  console.log(`Tin cần chấm: ${jobs.length} (chưa chấm lần nào: ${jobs.filter((job) => !job.matchScoresAt).length})`);
  console.log(`Pool: min ${sorted[0] ?? 0}, trung vị ${pick(0.5)}, p95 ${pick(0.95)}, max ${sorted.at(-1) ?? 0}`);
  console.log(`Tổng số cặp sẽ chấm: ${sizes.reduce((sum, n) => sum + n, 0)}`);
}

function progressPrinter(total: number) {
  let done = 0;
  return (id: string, result: RescoreJobResult | null) => {
    done += 1;
    if (result === null) console.log(`  [${done}/${total}] ${id}: LỖI (xem log)`);
    else if (result.status !== "DONE") console.log(`  [${done}/${total}] ${id}: ${result.status}${"reason" in result ? ` ${result.reason}` : ""}`);
    else if (done % 25 === 0 || done === total) console.log(`  [${done}/${total}] đã chấm`);
  };
}

function printSummary(result: RescoreAllResult): void {
  if (result.status === "LOCKED") {
    console.log("Đang có lượt khác trong process này — bỏ qua.");
    return;
  }
  console.log(
    `Tin: ${result.jobsScored} đã chấm / ${result.jobsTotal}` +
      ` (bỏ qua ${result.jobsSkipped}, lỗi ${result.jobsFailed}, để lượt sau ${result.jobsDeferred})`,
  );
  console.log(`Dòng đã ghi: ${result.rows} (chưa có embedding, điểm rule-only: ${result.pendingRows})`);
  console.log(`Hồ sơ đã nạp: ${result.profilesLoaded}. Thời gian: ${seconds(result.durationMs)}`);
}

async function printTableSize(): Promise<void> {
  const [row] = await prisma.$queryRaw<Array<{ rows: number; size: string }>>(Prisma.sql`
    SELECT (SELECT COUNT(*)::int FROM job_candidate_match_scores) AS rows,
           pg_size_pretty(pg_total_relation_size('job_candidate_match_scores')) AS size
  `);
  console.log(`Bảng job_candidate_match_scores: ${row?.rows ?? 0} dòng, ${row?.size ?? "?"}`);
}

async function main(): Promise<void> {
  const scope = jobPostId ? `tin ${jobPostId}` : companyId ? `công ty ${companyId}` : "mọi tin đang hiển thị";
  console.log(`Phạm vi: ${scope}${dryRun ? " — chỉ xem, không chấm, không ghi" : ""}`);
  if (dryRun) {
    await printDryRun();
    return;
  }

  const service = buildService();
  const total = (
    await matchScoreRepository.findJobsToRescore({
      ...(companyId ? { companyId } : {}),
      ...(jobPostId ? { jobPostId } : {}),
    })
  ).length;
  const onJobDone = progressPrinter(total);

  if (!companyId && !jobPostId) {
    // Cùng hàm với job đêm, nhưng không giới hạn thời gian.
    const { cleaned, rescore } = await runMatchScoreNightly(
      { matchScoreRepository, matchScoreService: service, logger },
      { budgetMs: Number.POSITIVE_INFINITY, onJobDone },
    );
    console.log(`Đã xoá ${cleaned.deletedRows} dòng của tin hết hiển thị, đặt lại ${cleaned.resetJobs} tin.`);
    printSummary(rescore);
  } else {
    printSummary(
      await service.rescoreAll({
        budgetMs: Number.POSITIVE_INFINITY,
        ...(companyId ? { companyId } : {}),
        ...(jobPostId ? { jobPostId } : {}),
        onJobDone,
      }),
    );
  }
  await printTableSize();
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
