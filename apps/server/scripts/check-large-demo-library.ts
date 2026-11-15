import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { LARGE_DEMO_ID_PREFIX } from "./lib/large-demo/generate";
import { DOMAINS, validateLargeDemoLibrary, type Domain } from "./lib/large-demo/library";

// Kiểm thư viện dữ liệu demo lớn với danh mục thật trong DB (chỉ đọc)
// (docs/06-backend/large-demo-data/PLAN.md, bước 1). Chạy sau mỗi đợt viết thư viện:
//
//   npm run check-large-demo-library --workspace server
//
// Có lỗi thì thoát mã 1. Cảnh báo không chặn, nhưng nên đọc từng dòng.

const DATA_DIR = path.join(__dirname, "data", "large-demo");
const prisma = new PrismaClient();

async function readJson(file: string): Promise<{ value: unknown; bytes: number }> {
  const content = await fs.readFile(path.join(DATA_DIR, file), "utf8");
  return { value: JSON.parse(content), bytes: Buffer.byteLength(content) };
}

async function main() {
  const files = {
    positions: await readJson("positions.json"),
    catalogAdditions: await readJson("catalog-additions.json"),
    names: await readJson("names.json"),
    companies: await readJson("companies.json"),
    jobTemplates: await readJson("job-templates.json"),
    personas: await readJson("personas.json"),
    showcase: await readJson("showcase.json"),
  };

  // Loại các mục danh mục do chính seed-large-demo tạo (id "clargedemo…"), kẻo bộ kiểm báo trùng chính nó.
  const notDemo = { NOT: { id: { startsWith: LARGE_DEMO_ID_PREFIX } } };
  const [skills, aliases, majors, universities, industries, cities, companyTypes] = await Promise.all([
    prisma.skill.findMany({ where: { status: "APPROVED", ...notDemo }, select: { name: true } }),
    prisma.skillAlias.findMany({ where: { skill: notDemo }, select: { alias: true, skill: { select: { name: true } } } }),
    prisma.major.findMany({ where: { status: "APPROVED" }, select: { name: true } }),
    prisma.university.findMany({ where: { status: "APPROVED" }, select: { name: true } }),
    prisma.industry.findMany({ where: notDemo, select: { name: true } }),
    prisma.city.findMany({ where: notDemo, select: { name: true } }),
    prisma.companyType.findMany({ select: { name: true } }),
  ]);
  const result = validateLargeDemoLibrary(
    {
      positions: files.positions.value,
      catalogAdditions: files.catalogAdditions.value,
      names: files.names.value,
      companies: files.companies.value,
      jobTemplates: files.jobTemplates.value,
      personas: files.personas.value,
      showcase: files.showcase.value,
    },
    {
      skills: skills.map((s) => s.name),
      skillAliases: new Map(aliases.map((a) => [a.alias, a.skill.name])),
      majors: majors.map((m) => m.name),
      universities: universities.map((u) => u.name),
      industries: industries.map((i) => i.name),
      cities: cities.map((c) => c.name),
      companyTypes: companyTypes.map((t) => t.name),
    },
  );

  const totalBytes = Object.values(files).reduce((sum, file) => sum + file.bytes, 0);
  console.log(
    Object.entries(files).map(([name, file]) => `${name} ${(file.bytes / 1024).toFixed(1)} KB`).join(", ") +
      ` — tổng ${(totalBytes / 1024).toFixed(1)} KB`,
  );
  if (result.library) {
    const { positions: file, catalogAdditions: additions, companies, jobTemplates, personas, showcase } = result.library;
    console.log(`Vị trí: ${file.positions.length} — ` + (Object.keys(DOMAINS) as Domain[])
      .map((domain) => `${DOMAINS[domain]} ${file.positions.filter((p) => p.domain === domain).length}`)
      .join(", "));
    console.log(`Thêm vào danh mục: ${additions.skills.length} kỹ năng, ${additions.industries.length} ngành nghề, ${additions.cities.length} thành phố`);
    const share = (pick: (c: (typeof companies.companies)[number]) => string) => {
      const counts = new Map<string, number>();
      for (const company of companies.companies) counts.set(pick(company), (counts.get(pick(company)) ?? 0) + 1);
      return [...counts].sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `${name} ${count} (${Math.round((count / companies.companies.length) * 100)}%)`).join(", ");
    };
    console.log(`Công ty: ${companies.companies.length}, nhà tuyển dụng: ${companies.companies.reduce((sum, c) => sum + c.employerCount, 0)}`);
    console.log(`  theo thành phố: ${share((c) => c.city)}`);
    console.log(`  theo ngành nghề: ${share((c) => c.industry)}`);
    console.log(`  theo loại hình: ${share((c) => c.companyType)}`);
    const templates = jobTemplates.templates;
    const variants = templates.flatMap((t) => t.variants);
    const longest = (pick: (v: (typeof variants)[number]) => string) => Math.max(0, ...variants.map((v) => Array.from(pick(v)).length));
    console.log(`Mẫu tin: ${templates.length}/${file.positions.length} vị trí, ${variants.length} biến thể, ` +
      `${templates.reduce((sum, t) => sum + Object.values(t.titles).flat().length, 0)} tiêu đề; ` +
      `dài nhất: mô tả ${longest((v) => v.description)}/300, yêu cầu ${longest((v) => v.requirements)}/260 ký tự`);
    const people = personas.groups.flatMap((g) => g.personas);
    const longestBio = Math.max(0, ...people.map((p) => Array.from(p.bio).length));
    console.log(`Chân dung: ${personas.groups.length}/${file.positions.length} vị trí, ${people.length} bộ ` +
      `(${file.levels.map((level) => `${level.key} ${people.filter((p) => p.level === level.key).length}`).join(", ")}; ` +
      `đổi ngành ${people.filter((p) => p.kind === "career-switch").length}); giới thiệu dài nhất ${longestBio}/210 ký tự; ` +
      `${personas.bioTails.length} câu riêng, ${personas.unrelatedJobs.length} việc không liên quan`);
    const tiers = new Map<string, number>();
    for (const c of showcase.candidates) tiers.set(c.tier, (tiers.get(c.tier) ?? 0) + 1);
    console.log(`Trưng bày: ${showcase.employers.length} nhà tuyển dụng, ${showcase.jobs.length} tin chính, ${showcase.candidates.length} hồ sơ ` +
      `(${[...tiers].map(([tier, count]) => `${tier} ${count}`).join(", ")}; đăng nhập demo ${showcase.candidates.filter((c) => c.demoLogin).length})`);
    for (const job of showcase.jobs) {
      const count = showcase.candidates.filter((c) => c.job === job.key).length;
      if (count > 0) console.log(`  ${job.key}: ${count} hồ sơ`);
    }
  }
  for (const warning of result.warnings) console.log(`  cảnh báo: ${warning}`);
  for (const error of result.errors) console.log(`  LỖI: ${error}`);
  console.log(`${result.errors.length} lỗi, ${result.warnings.length} cảnh báo`);
  if (result.errors.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
