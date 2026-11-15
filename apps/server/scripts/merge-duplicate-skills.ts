import { PrismaClient } from "@prisma/client";
import { mergeDuplicateSkills, printSkillMergeReports } from "./lib/merge-duplicate-skills";

// Gộp 5 cặp kỹ năng trùng (NodeJS → Node.js, ReactJS → React, JS → JavaScript,
// Apache Kafka → Kafka, MSSQL → MS SQL Server) trên DB trong DATABASE_URL
// (docs/06-backend/large-demo-data/PLAN.md, "Gộp kỹ năng trùng").
//
//   npm run merge-duplicate-skills --workspace server -- [--dry-run]
//
// `--dry-run`: chỉ in số hồ sơ / tin đang dùng mỗi mục nguồn, không ghi. Chạy lại
// nhiều lần vẫn an toàn. Mỗi người một DB Neon: ai cũng tự chạy trên DB của mình.
// Chạy lại `seed-match-demo` sẽ tạo lại NodeJS / ReactJS / JS — khi đó chạy lại script này.

const dryRun = process.argv.slice(2).includes("--dry-run");
const prisma = new PrismaClient();

function databaseHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host || "(không rõ)";
  } catch {
    return "(không đọc được DATABASE_URL)";
  }
}

async function main() {
  console.log(`DB: ${databaseHost()}${dryRun ? " — chỉ xem, không ghi" : ""}`);
  const reports = await mergeDuplicateSkills(prisma, { dryRun });
  printSkillMergeReports(reports);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
