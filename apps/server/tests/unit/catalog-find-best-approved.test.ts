// Chạy: node --import tsx --test tests/unit/catalog-find-best-approved.test.ts (từ apps/server)
import { test } from "node:test";
import assert from "node:assert/strict";
import { SkillDedupeService } from "../../src/modules/skills/skill-dedupe.service";
import { findApprovedCatalogEntry } from "../../src/modules/education-catalog/education-catalog-dedupe";
import { normalizeMajorName } from "../../src/modules/education-catalog/education-catalog-normalize.util";
import { normalizeSkillName } from "../../src/modules/skills/skill-normalize.util";
import type { CatalogEntryRow, EducationCatalogRepository } from "../../src/modules/education-catalog/education-catalog.types";

// --- Skill: fake chỉ các phụ thuộc findBestApproved dùng; mọi thứ khác ném lỗi nếu bị gọi ---
const forbidden = new Proxy(
  {},
  {
    get(_target, key) {
      throw new Error(`findBestApproved không được đụng tới ${String(key)}`);
    },
  },
);

function skillService(approved: Array<{ id: string; name: string }>, aliases: Record<string, { id: string; name: string }> = {}) {
  return new SkillDedupeService({
    prisma: forbidden as never,
    skillsRepository: { listApproved: async () => approved } as never,
    skillAliasRepository: {
      findByName: async (name: string) => {
        const skill = aliases[normalizeSkillName(name)];
        return skill ? { skill } : null;
      },
    } as never,
    skillEmbeddingService: forbidden as never,
    catalogRateLimitService: forbidden as never,
    logger: forbidden as never,
  });
}

const skills = [
  { id: "s-java", name: "Java" },
  { id: "s-js", name: "JavaScript" },
  { id: "s-react", name: "ReactJS" },
  { id: "s-c", name: "C" },
  { id: "s-cpp", name: "C++" },
  { id: "s-spring", name: "Spring Boot" },
];

test("skill: alias → ALIAS", async () => {
  const service = skillService(skills, { js: { id: "s-js", name: "JavaScript" } });
  assert.deepEqual(await service.findBestApproved("JS"), { id: "s-js", name: "JavaScript", matchType: "ALIAS" });
});

test("skill: trùng tên không phân biệt hoa/thường → EXACT, kể cả tên 1 ký tự", async () => {
  const service = skillService(skills);
  assert.deepEqual(await service.findBestApproved("  java "), { id: "s-java", name: "Java", matchType: "EXACT" });
  assert.equal((await service.findBestApproved("c"))?.id, "s-c");
  assert.equal((await service.findBestApproved("C++"))?.id, "s-cpp");
});

test("skill: biến thể viết khác → TOKEN", async () => {
  const service = skillService(skills);
  assert.deepEqual(await service.findBestApproved("React.js"), { id: "s-react", name: "ReactJS", matchType: "TOKEN" });
  assert.equal((await service.findBestApproved("SpringBoot"))?.id, "s-spring");
});

test("skill: không đủ giống → null, không tạo gì, không gọi embedding/quota/prisma", async () => {
  const service = skillService(skills);
  assert.equal(await service.findBestApproved("Kubernetes"), null);
  assert.equal(await service.findBestApproved("   "), null);
});

// --- Major: fake EducationCatalogRepository ---
function majorRepo(entries: CatalogEntryRow[], aliases: Record<string, CatalogEntryRow> = {}) {
  return {
    listForMatching: async () => entries,
    findByAlias: async (key: string) => aliases[key] ?? null,
  } as unknown as EducationCatalogRepository;
}

const majors: CatalogEntryRow[] = [
  { id: "m-khmt", name: "Khoa học máy tính", status: "APPROVED" },
  { id: "m-cntt", name: "Công nghệ thông tin", status: "APPROVED" },
  { id: "m-ktpm", name: "Kỹ thuật phần mềm", status: "APPROVED" },
  { id: "m-pending", name: "Khoa học dữ liệu ứng dụng", status: "PENDING" },
];

const findMajor = (repository: EducationCatalogRepository, name: string) =>
  findApprovedCatalogEntry({ repository, normalize: normalizeMajorName }, name);

test("major: alias trỏ tới mục APPROVED → ALIAS; trỏ tới PENDING → bỏ qua", async () => {
  const repository = majorRepo(majors, {
    ktpm: majors[2]!,
    "khdl ud": majors[3]!,
  });
  assert.deepEqual(await findMajor(repository, "KTPM"), { id: "m-ktpm", name: "Kỹ thuật phần mềm", matchType: "ALIAS" });
  assert.equal(await findMajor(repository, "KHDL UD"), null);
});

test("major: trùng tên sau chuẩn hoá (bỏ 'Ngành', chú thích trong ngoặc) → EXACT", async () => {
  const repository = majorRepo(majors);
  assert.deepEqual(await findMajor(repository, "Ngành Công nghệ thông tin (CLC)"), {
    id: "m-cntt",
    name: "Công nghệ thông tin",
    matchType: "EXACT",
  });
});

test("major: mục PENDING không bao giờ được trả về", async () => {
  const repository = majorRepo(majors);
  assert.equal(await findMajor(repository, "Khoa học dữ liệu ứng dụng"), null);
});

test("major: gần giống nhưng mơ hồ giữa hai ngành → null (giữ AMBIGUITY_MARGIN)", async () => {
  // Hai ngành cùng đạt ~0.98 với tên gõ vào → không tự chọn bừa một bên.
  const repository = majorRepo([
    { id: "a", name: "Kỹ thuật điện tử - viễn thông A", status: "APPROVED" },
    { id: "b", name: "Kỹ thuật điện tử - viễn thông B", status: "APPROVED" },
  ]);
  assert.equal(await findMajor(repository, "Kỹ thuật điện tử viễn thông"), null);
  // Chỉ còn một ngành gần → chọn được.
  const single = majorRepo([{ id: "a", name: "Kỹ thuật điện tử - viễn thông A", status: "APPROVED" }]);
  assert.equal((await findMajor(single, "Kỹ thuật điện tử viễn thông"))?.matchType, "TOKEN");
});

test("major: không liên quan → null", async () => {
  const repository = majorRepo(majors);
  assert.equal(await findMajor(repository, "Quản trị kinh doanh"), null);
  assert.equal(await findMajor(repository, "  "), null);
});
