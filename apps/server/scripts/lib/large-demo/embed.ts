// Bước embedding của dữ liệu demo lớn (docs/06-backend/large-demo-data/PLAN.md, bước 4):
// tính sẵn vector cho kỹ năng seed thêm, tin và hồ sơ ứng viên demo, để buổi demo không
// phải chờ tính lần đầu khi mở "Việc làm phù hợp" / danh sách đơn / "Tìm ứng viên".
//
// Dùng đúng các mảnh của service thật: loader dựng matchText, computeContentHash,
// MatchEmbeddingRepository ghi bảng embedding, SkillEmbeddingService giữ model (cùng cách
// eval-job-matching.ts). Vector nào đã có và khớp hash thì bỏ qua — chạy lại / chạy tiếp
// sau khi bị ngắt chỉ tính phần còn thiếu.
import { Prisma, type PrismaClient } from "@prisma/client";
import { config } from "../../../src/shared/config/env";
import { logger } from "../../../src/shared/logger";
import { SkillEmbeddingService } from "../../../src/modules/skills/skill-embedding.service";
import { CandidateMatchProfileLoader } from "../../../src/modules/job-matching/candidate-match-profile.loader";
import { JobMatchProfileLoader } from "../../../src/modules/job-matching/job-match-profile.loader";
import { MatchEmbeddingRepository, type EmbeddingKind, type EmbeddingRecord } from "../../../src/modules/job-matching/match-embedding.repository";
import { computeContentHash } from "../../../src/modules/job-matching/match-embedding.service";
import { LARGE_DEMO_ID_PREFIX } from "./generate";
import { chunk, EMBED_BATCH_SIZE, remainingSeconds, staleTargets, type EmbedTarget } from "./write-plan";

export interface EmbedSummary {
  skills: { total: number; stale: number };
  jobs: { total: number; stale: number };
  candidates: { total: number; stale: number };
  seconds: number;
}

type Log = (line: string) => void;

const demoIdLike = `${LARGE_DEMO_ID_PREFIX}%`;

/**
 * Tính embedding cho phần demo lớn đang có trong DB. `dryRun` chỉ đếm (không nạp model).
 * Model không dùng được ⇒ ném lỗi (vector đã ghi ở các lô trước vẫn giữ, chạy lại để tiếp).
 */
export async function embedLargeDemo(prisma: PrismaClient, options: { dryRun: boolean; log: Log }): Promise<EmbedSummary> {
  const { dryRun, log } = options;
  const started = Date.now();
  const skillEmbedding = new SkillEmbeddingService({ prisma, logger });
  const repository = new MatchEmbeddingRepository({ prisma });
  const hashOf = (text: string) =>
    computeContentHash({ templateVersion: config.MATCH_EMBEDDING_TEMPLATE_VERSION, modelId: config.EMBEDDING_MODEL_ID, text });

  const embed = async (text: string): Promise<number[]> => {
    const vector = await skillEmbedding.embed(text);
    if (!vector) throw new Error(`Model embedding ${config.EMBEDDING_MODEL_ID} không dùng được (xem log phía trên). Phần đã tính được giữ lại — sửa lỗi rồi chạy --embed-only để tính tiếp.`);
    return vector;
  };

  // 1. Kỹ năng seed thêm chưa có vector (bước chống trùng kỹ năng cần cột này — PLAN H7).
  const skillTotal = await prisma.skill.count({ where: { id: { startsWith: LARGE_DEMO_ID_PREFIX } } });
  const missingSkills = await prisma.$queryRaw<{ id: string; name: string }[]>(Prisma.sql`
    SELECT id, name FROM skills WHERE id LIKE ${demoIdLike} AND embedding IS NULL ORDER BY id
  `);
  if (!dryRun && missingSkills.length > 0) {
    const t = Date.now();
    for (const skill of missingSkills) await skillEmbedding.saveEmbedding(skill.id, await embed(skill.name));
    log(`  ✓ kỹ năng: ${missingSkills.length} (${((Date.now() - t) / 1000).toFixed(1)} giây)`);
  }

  // 2–3. Tin và hồ sơ ứng viên demo.
  const jobIds = (await prisma.jobPost.findMany({ where: { id: { startsWith: LARGE_DEMO_ID_PREFIX } }, select: { id: true }, orderBy: { id: "asc" } })).map((j) => j.id);
  const candidateIds = (await prisma.candidate.findMany({ where: { id: { startsWith: LARGE_DEMO_ID_PREFIX } }, select: { id: true }, orderBy: { id: "asc" } })).map((c) => c.id);
  const jobLoader = new JobMatchProfileLoader({ prisma });
  const candidateLoader = new CandidateMatchProfileLoader({ prisma });

  const runKind = async (
    kind: EmbeddingKind,
    label: string,
    ids: string[],
    load: (ids: string[]) => Promise<EmbedTarget[]>,
  ): Promise<number> => {
    // Lượt đếm trước: so hash cả danh sách để in tổng và ước thời gian đúng.
    const stalePerBatch: { target: EmbedTarget; contentHash: string }[][] = [];
    for (const batch of chunk(ids, EMBED_BATCH_SIZE)) {
      const targets = await load(batch);
      stalePerBatch.push(staleTargets(targets, await repository.findHashes(kind, targets.map((t) => t.id)), hashOf));
    }
    const staleCount = stalePerBatch.reduce((sum, b) => sum + b.length, 0);
    if (dryRun || staleCount === 0) return staleCount;

    const t = Date.now();
    let done = 0;
    for (const stale of stalePerBatch) {
      if (stale.length === 0) continue;
      const records: EmbeddingRecord[] = [];
      for (const { target, contentHash } of stale) {
        records.push({
          id: target.id,
          vector: await embed(target.text),
          contentHash,
          model: config.EMBEDDING_MODEL_ID,
          templateVersion: config.MATCH_EMBEDDING_TEMPLATE_VERSION,
        });
      }
      await repository.upsertMany(kind, records);
      done += records.length;
      const left = remainingSeconds(done, staleCount, Date.now() - t);
      log(`  ${label}: ${done}/${staleCount} (${((Date.now() - t) / 1000).toFixed(1)} giây${left !== null ? `, còn ~${left} giây` : ""})`);
    }
    log(`  ✓ ${label}: ${staleCount} (${((Date.now() - t) / 1000).toFixed(1)} giây)`);
    return staleCount;
  };

  const jobsStale = await runKind("job", "tin", jobIds, async (ids) =>
    [...(await jobLoader.loadMany(ids)).values()].map((p) => ({ id: p.jobPostId, text: p.matchText })));
  const candidatesStale = await runKind("candidate", "hồ sơ ứng viên", candidateIds, async (ids) =>
    [...(await candidateLoader.loadMany(ids)).values()].map((p) => ({ id: p.candidateId, text: p.matchText })));

  return {
    skills: { total: skillTotal, stale: missingSkills.length },
    jobs: { total: jobIds.length, stale: jobsStale },
    candidates: { total: candidateIds.length, stale: candidatesStale },
    seconds: (Date.now() - started) / 1000,
  };
}
