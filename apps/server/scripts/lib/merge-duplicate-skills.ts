import type { PrismaClient } from "@prisma/client";
import { SkillAliasRepository } from "../../src/modules/skills/skill-alias.repository";
import { SkillsRepository } from "../../src/modules/skills/skills.repository";

// Gộp các cặp kỹ năng trùng trong danh mục (docs/06-backend/large-demo-data/PLAN.md,
// "Gộp kỹ năng trùng", Q3). Dùng chung cho script merge-duplicate-skills và bước
// đầu của seed-large-demo. Tìm theo tên, không phân biệt hoa thường, nên chạy nhiều
// lần vẫn an toàn: nguồn đã gộp thì bỏ qua.

/** [giữ lại (đích), gộp vào (nguồn)] */
export const DUPLICATE_SKILL_PAIRS: ReadonlyArray<{ target: string; source: string }> = [
  { target: "Node.js", source: "NodeJS" },
  { target: "React", source: "ReactJS" },
  { target: "JavaScript", source: "JS" },
  { target: "Kafka", source: "Apache Kafka" },
  { target: "MS SQL Server", source: "MSSQL" },
];

export interface SkillMergeReport {
  target: string;
  source: string;
  status: "merged" | "would-merge" | "already-merged";
  candidates: number;
  jobPosts: number;
  /** Hồ sơ / tin đã gắn cả nguồn lẫn đích (không tạo thêm, chỉ giữ mức mạnh hơn). */
  candidatesWithBoth: number;
  jobPostsWithBoth: number;
  aliases: number;
}

function findByName(prisma: PrismaClient, name: string) {
  return prisma.skill.findMany({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true, status: true },
  });
}

async function usage(prisma: PrismaClient, sourceId: string, targetId: string) {
  const [candidates, jobPosts, candidatesWithBoth, jobPostsWithBoth, aliases] = await Promise.all([
    prisma.candidateSkill.count({ where: { skillId: sourceId } }),
    prisma.jobPostSkill.count({ where: { skillId: sourceId } }),
    prisma.candidateSkill.count({
      where: { skillId: sourceId, candidate: { skills: { some: { skillId: targetId } } } },
    }),
    prisma.jobPostSkill.count({
      where: { skillId: sourceId, jobPost: { skills: { some: { skillId: targetId } } } },
    }),
    prisma.skillAlias.count({ where: { skillId: sourceId } }),
  ]);
  return { candidates, jobPosts, candidatesWithBoth, jobPostsWithBoth, aliases };
}

/**
 * Kiểm đủ mọi đích trước rồi mới gộp: thiếu đích (hoặc tên đích khớp nhiều mục)
 * thì dừng hẳn, không gộp cặp nào, tránh gộp dở dang.
 */
export async function mergeDuplicateSkills(
  prisma: PrismaClient,
  options: { dryRun: boolean },
): Promise<SkillMergeReport[]> {
  const resolved: Array<{ pair: (typeof DUPLICATE_SKILL_PAIRS)[number]; targetId: string; sourceIds: string[] }> = [];
  for (const pair of DUPLICATE_SKILL_PAIRS) {
    const targets = await findByName(prisma, pair.target);
    if (targets.length !== 1) {
      throw new Error(`Kỹ năng đích "${pair.target}": tìm thấy ${targets.length} mục (cần đúng 1). Không gộp gì.`);
    }
    const target = targets[0]!;
    if (target.status !== "APPROVED") {
      throw new Error(`Kỹ năng đích "${target.name}" chưa được duyệt (${target.status}). Không gộp gì.`);
    }
    const sources = (await findByName(prisma, pair.source)).filter((skill) => skill.id !== target.id);
    resolved.push({ pair, targetId: target.id, sourceIds: sources.map((skill) => skill.id) });
  }

  const skillsRepository = new SkillsRepository({
    prisma,
    skillAliasRepository: new SkillAliasRepository({ prisma }),
  });

  const reports: SkillMergeReport[] = [];
  for (const { pair, targetId, sourceIds } of resolved) {
    if (sourceIds.length === 0) {
      reports.push({ ...pair, status: "already-merged", candidates: 0, jobPosts: 0, candidatesWithBoth: 0, jobPostsWithBoth: 0, aliases: 0 });
      continue;
    }
    // Tên unique phân biệt hoa thường, nên "NodeJS" và "nodejs" có thể cùng tồn tại: gộp hết.
    for (const sourceId of sourceIds) {
      const counts = await usage(prisma, sourceId, targetId);
      if (!options.dryRun) await skillsRepository.merge(sourceId, targetId, "ADMIN_MERGE");
      reports.push({ ...pair, status: options.dryRun ? "would-merge" : "merged", ...counts });
    }
  }
  return reports;
}

export function printSkillMergeReports(reports: readonly SkillMergeReport[]): void {
  const label = { merged: "đã gộp", "would-merge": "sẽ gộp", "already-merged": "đã gộp trước đó, bỏ qua" } as const;
  for (const report of reports) {
    const line = `  ${report.source} → ${report.target}: ${label[report.status]}`;
    if (report.status === "already-merged") {
      console.log(line);
      continue;
    }
    console.log(
      `${line} — ${report.candidates} hồ sơ (${report.candidatesWithBoth} có sẵn đích), ` +
        `${report.jobPosts} tin (${report.jobPostsWithBoth} có sẵn đích), ${report.aliases} alias`,
    );
  }
}
