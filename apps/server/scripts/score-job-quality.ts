import { PrismaClient, type JobPostStatus } from "@prisma/client";
import { QUALITY_CRITERIA, QUALITY_SCORE_VERSION } from "../src/modules/job-posts/job-quality.config";
import { scoreJobPost, type JobQualityResult } from "../src/modules/job-posts/job-quality";
import { JobQualityInputLoader } from "../src/modules/job-posts/job-quality-input.loader";

// AD-29 — chấm điểm chất lượng tin (docs/06-backend/job-quality-moderation/PLAN.md, bước 3).
//
//   npm run score-job-quality --workspace=apps/server -- --dry-run [--status PENDING] [--company <id>] [--worst 15]
//
// - `--dry-run`: chấm mọi tin (trừ nháp) rồi in phân bố điểm, số tin mỗi vùng, mã lỗi hay gặp,
//   các tin có cờ chặn và thời gian chấm. KHÔNG ghi DB. Dùng để hiệu chỉnh trọng số / ngưỡng.
// - Chế độ ghi (bỏ `--dry-run`) làm ở bước 4, khi đã có `JobQualityService.scoreAndStore`.
// - `--status`: chỉ chấm tin ở trạng thái đó. `--company`: chỉ tin của công ty đó.
// - `--worst N`: in N tin điểm thấp nhất (mặc định 15).
// In id + tiêu đề tin (không phải dữ liệu cá nhân), không in tên người hay email.

const STATUSES: readonly JobPostStatus[] = ["DRAFT", "PENDING", "PUBLISHED", "EXPIRED", "CLOSED", "TAKEN_DOWN"];
const BATCH = 200;

function readFlag(name: string): string | undefined {
  const args = process.argv.slice(2);
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`${name} cần một giá trị.`);
    process.exit(1);
  }
  return value;
}

const dryRun = process.argv.includes("--dry-run");
const statusFlag = readFlag("--status")?.toUpperCase();
const companyId = readFlag("--company");
const worstCount = Number(readFlag("--worst") ?? 15);

if (!dryRun) {
  console.error("Chế độ ghi chưa có (bước 4). Chạy với --dry-run.");
  process.exit(1);
}
if (statusFlag && !STATUSES.includes(statusFlag as JobPostStatus)) {
  console.error(`--status phải là một trong ${STATUSES.join(", ")}.`);
  process.exit(1);
}

const prisma = new PrismaClient();
const loader = new JobQualityInputLoader({ prisma });

interface Scored {
  id: string;
  status: string;
  title: string;
  result: JobQualityResult;
}

function pct(part: number, total: number): string {
  return total === 0 ? "0%" : `${((part / total) * 100).toFixed(1)}%`;
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

function printBands(label: string, rows: Scored[]): void {
  const count = (band: string) => rows.filter((row) => row.result.band === band).length;
  const approve = count("SUGGEST_APPROVE");
  const review = count("NEEDS_REVIEW");
  const reject = count("SUGGEST_REJECT");
  console.log(
    `  ${label.padEnd(12)} ${pad(rows.length, 4)} tin | duyệt ${pad(approve, 4)} (${pct(approve, rows.length)}) | ` +
      `xem kỹ ${pad(review, 4)} (${pct(review, rows.length)}) | từ chối ${pad(reject, 4)} (${pct(reject, rows.length)})`,
  );
}

async function main(): Promise<void> {
  const now = new Date();
  const where = {
    status: statusFlag ? (statusFlag as JobPostStatus) : { not: "DRAFT" as JobPostStatus },
    ...(companyId ? { companyId } : {}),
  };
  const ids = (await prisma.jobPost.findMany({ where, select: { id: true }, orderBy: { createdAt: "asc" } })).map((row) => row.id);
  console.log(`Bộ chấm v${QUALITY_SCORE_VERSION} — ${ids.length} tin${statusFlag ? ` ${statusFlag}` : " (trừ nháp)"}${companyId ? `, công ty ${companyId}` : ""}. Không ghi DB.\n`);
  if (ids.length === 0) return;

  const scored: Scored[] = [];
  let loadMs = 0;
  let scoreMs = 0;
  for (let offset = 0; offset < ids.length; offset += BATCH) {
    const loadStart = performance.now();
    const loaded = await loader.loadMany(ids.slice(offset, offset + BATCH), now);
    loadMs += performance.now() - loadStart;
    for (const row of loaded) {
      const start = performance.now();
      const result = scoreJobPost(row.input, now);
      scoreMs += performance.now() - start;
      scored.push({ id: row.jobPostId, status: row.status, title: row.input.title, result });
    }
  }

  // ── Vùng ──
  console.log("Vùng gợi ý:");
  printBands("Tất cả", scored);
  for (const status of STATUSES) {
    const rows = scored.filter((row) => row.status === status);
    if (rows.length > 0) printBands(status, rows);
  }

  // ── Phân bố điểm ──
  const scores = scored.map((row) => row.result.score).sort((a, b) => a - b);
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  console.log(
    `\nĐiểm: thấp nhất ${scores[0]}, p10 ${percentile(scores, 10)}, p25 ${percentile(scores, 25)}, trung vị ${percentile(scores, 50)}, ` +
      `p75 ${percentile(scores, 75)}, p90 ${percentile(scores, 90)}, cao nhất ${scores[scores.length - 1]}, trung bình ${mean.toFixed(1)}`,
  );
  const buckets = new Array<number>(10).fill(0);
  for (const s of scores) {
    const i = Math.min(9, Math.floor(s / 10));
    buckets[i] = (buckets[i] ?? 0) + 1;
  }
  const maxBucket = Math.max(...buckets);
  for (let i = 9; i >= 0; i--) {
    const n = buckets[i] ?? 0;
    const bar = "█".repeat(Math.round((n / maxBucket) * 40));
    console.log(`  ${pad(i * 10, 3)}–${pad(i === 9 ? 100 : i * 10 + 9, 3)} ${pad(n, 4)} ${bar}`);
  }

  // ── Điểm trung bình từng tiêu chí ──
  console.log("\nĐiểm trung bình từng tiêu chí (thang 100):");
  for (const criterion of QUALITY_CRITERIA) {
    const values = scored.map((row) => row.result.criteria.find((c) => c.key === criterion.key)!.score);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const belowFloor = values.filter((v) => v < 50).length;
    console.log(`  ${criterion.label.padEnd(22)} ×${pad(criterion.weight, 2)}  TB ${pad(avg.toFixed(1), 5)}  dưới sàn: ${belowFloor}`);
  }

  // ── Mã lỗi hay gặp ──
  const issueCounts = new Map<string, number>();
  for (const row of scored) {
    for (const criterion of row.result.criteria) {
      for (const issue of new Set(criterion.issues.map((i) => i.code))) issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
    }
  }
  console.log("\nMã lỗi (số tin dính):");
  for (const [code, count] of [...issueCounts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${code.padEnd(28)} ${pad(count, 4)}  ${pct(count, scored.length)}`);
  }

  // ── Cờ chặn ──
  const flagged = scored.filter((row) => row.result.flags.length > 0);
  console.log(`\nTin có cờ chặn: ${flagged.length}`);
  for (const row of flagged) {
    const messages = row.result.criteria.flatMap((c) => c.issues.filter((i) => row.result.flags.includes(i.code)).map((i) => i.message));
    console.log(`  ${row.id} [${row.status}] ${row.result.score}đ "${row.title.slice(0, 60)}" — ${messages.join("; ")}`);
  }

  // ── Tin điểm thấp nhất ──
  if (worstCount > 0) {
    console.log(`\n${worstCount} tin điểm thấp nhất:`);
    for (const row of [...scored].sort((a, b) => a.result.score - b.result.score).slice(0, worstCount)) {
      const codes = row.result.criteria.flatMap((c) => c.issues.map((i) => i.code));
      console.log(`  ${pad(row.result.score, 3)}đ ${row.result.band.padEnd(15)} ${row.id} [${row.status}] "${row.title.slice(0, 50)}" — ${codes.join(", ")}`);
    }
  }

  console.log(
    `\nThời gian: nạp dữ liệu ${loadMs.toFixed(0)} ms (${(loadMs / scored.length).toFixed(1)} ms/tin, theo lô ${BATCH}), ` +
      `chấm ${scoreMs.toFixed(0)} ms (${(scoreMs / scored.length).toFixed(2)} ms/tin).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
