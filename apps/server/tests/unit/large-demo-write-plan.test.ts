// Chạy: node --import tsx --test tests/unit/large-demo-write-plan.test.ts (từ apps/server)
// Phần thuần của script ghi dữ liệu demo lớn (docs/06-backend/large-demo-data/PLAN.md, bước 3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  catalogAdditionsSchema, companiesFileSchema, jobTemplatesFileSchema, namesFileSchema, personasFileSchema,
  positionsFileSchema, showcaseFileSchema, type LargeDemoLibrary,
} from "../../scripts/lib/large-demo/library";
import { LARGE_DEMO_ID_PREFIX, generateLargeDemo, type GenerateCatalog, type GeneratedLargeDemo } from "../../scripts/lib/large-demo/generate";
import { generateLargeDemoHistory, type GeneratedHistory } from "../../scripts/lib/large-demo/history";
import {
  catalogAdditionId, catalogAdditionIds, chunk, estimateBytes, preflightIssues, remainingSeconds, staleTargets, writeGroups,
} from "../../scripts/lib/large-demo/write-plan";

const DATA_DIR = path.join(__dirname, "..", "..", "scripts", "data", "large-demo");
const read = (file: string): unknown => JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf8"));
const LIBRARY: LargeDemoLibrary = {
  positions: positionsFileSchema.parse(read("positions.json")),
  catalogAdditions: catalogAdditionsSchema.parse(read("catalog-additions.json")),
  names: namesFileSchema.parse(read("names.json")),
  companies: companiesFileSchema.parse(read("companies.json")),
  jobTemplates: jobTemplatesFileSchema.parse(read("job-templates.json")),
  personas: personasFileSchema.parse(read("personas.json")),
  showcase: showcaseFileSchema.parse(read("showcase.json")),
};

class AutoIds extends Map<string, string> {
  constructor(private readonly kind: string) {
    super();
  }
  override get(name: string): string | undefined {
    if (!super.has(name)) super.set(name, `${this.kind}${super.size}`);
    return super.get(name);
  }
}
const NOW = new Date("2026-11-09T03:00:00Z");

let smallRun: { demo: GeneratedLargeDemo; history: GeneratedHistory } | undefined;
function small() {
  if (!smallRun) {
    const catalog: GenerateCatalog = {
      skillIds: new AutoIds("skill"), majorIds: new AutoIds("major"), universityIds: new AutoIds("uni"),
      cityIds: new AutoIds("city"), industryIds: new AutoIds("industry"), companyTypeIds: new AutoIds("type"),
    };
    const demo = generateLargeDemo(LIBRARY, catalog, {
      seed: 7, scale: 0.1, now: NOW, passwordHash: "hash", cvFileUrl: "https://example.test/cv.pdf", planId: "plan", adminUserId: "admin",
    });
    smallRun = { demo, history: generateLargeDemoHistory(demo, { seed: 7, now: NOW }) };
  }
  return smallRun;
}

test("id mục danh mục thêm: có tiền tố, chỉ chữ thường + số, cố định theo tên, không trùng trong thư viện", () => {
  const { skills, industries, cities } = LIBRARY.catalogAdditions;
  for (const [kind, names] of [["skill", skills], ["industry", industries], ["city", cities]] as const) {
    const ids = catalogAdditionIds(kind, names);
    assert.equal(new Set(ids.values()).size, names.length, `${kind}: id bị trùng`);
    for (const [name, id] of ids) {
      assert.match(id, /^clargedemo[0-9a-z]+$/);
      assert.equal(catalogAdditionId(kind, name), id);
    }
  }
  assert.notEqual(catalogAdditionId("skill", "Huế"), catalogAdditionId("city", "Huế"));
  // Cùng chữ, khác dạng Unicode (dựng sẵn / tổ hợp) → cùng id.
  assert.equal(catalogAdditionId("city", "Huế"), catalogAdditionId("city", "Huế".normalize("NFD")));
});

test("chunk: chia đủ, giữ thứ tự, lô cuối ngắn hơn", () => {
  const rows = Array.from({ length: 1201 }, (_, i) => i);
  const batches = chunk(rows);
  assert.deepEqual(batches.map((b) => b.length), [500, 500, 201]);
  assert.deepEqual(batches.flat(), rows);
  assert.deepEqual(chunk([]), []);
  assert.throws(() => chunk(rows, 0));
});

test("writeGroups: ghi mọi mảng bản ghi của bộ sinh, đúng một lần", () => {
  const { demo, history } = small();
  const groups = writeGroups(demo, history);
  const written = groups.flatMap((g) => g.tables.map((t) => t.rows.length)).reduce((a, b) => a + b, 0);
  const arrays = [
    ...Object.entries(demo).filter(([key, value]) => Array.isArray(value) && key !== "demoAccounts").map(([, value]) => value as unknown[]),
    ...Object.values(history),
  ];
  assert.equal(written, arrays.reduce((sum, rows) => sum + rows.length, 0));
  assert.equal(new Set(groups.flatMap((g) => g.tables.map((t) => t.key))).size, groups.flatMap((g) => g.tables).length);
  // Người dùng trước công ty / nhà tuyển dụng; tin trước đơn; ứng viên trước CV.
  const order = groups.flatMap((g) => g.tables.map((t) => t.key));
  for (const [before, after] of [["user", "employer"], ["company", "employer"], ["jobPost", "application"], ["cv", "application"], ["conversation", "message"]]) {
    assert.ok(order.indexOf(before!) < order.indexOf(after!), `${before} phải ghi trước ${after}`);
  }
});

test("preflightIssues: dữ liệu thật của bộ sinh sạch; bắt được id lạ, id trùng, email lạ, tin hết hạn sau gói", () => {
  const { demo, history } = small();
  assert.deepEqual(preflightIssues(demo, history), []);
  assert.ok(estimateBytes(writeGroups(demo, history)) > 0);

  const broken: GeneratedLargeDemo = {
    ...demo,
    users: [...demo.users, { ...demo.users[0]!, id: "cnotdemo1", email: "ai-do@gmail.com" }],
    companies: [...demo.companies, demo.companies[0]!],
    jobPosts: demo.jobPosts.map((job, i) => (i === 0 ? { ...job, expiresAt: demo.subscriptionEnd } : job)),
  };
  const issues = preflightIssues(broken, history);
  assert.ok(issues.some((m) => m.includes("tài khoản") && m.includes(LARGE_DEMO_ID_PREFIX)), issues.join("; "));
  assert.ok(issues.some((m) => m.includes("công ty") && m.includes("trùng")));
  assert.ok(issues.some((m) => m.includes("email ngoài")));
  assert.ok(issues.some((m) => m.includes("hết hạn sau")));
});

test("staleTargets: chỉ lấy target thiếu vector hoặc lệch hash, bỏ văn bản rỗng và id trùng", () => {
  const hashOf = (text: string) => `h:${text}`;
  const stored = new Map([["a", "h:giữ nguyên"], ["b", "h:bản cũ"]]);
  const stale = staleTargets(
    [
      { id: "a", text: "giữ nguyên" },
      { id: "b", text: "bản mới" },
      { id: "c", text: "chưa có vector" },
      { id: "d", text: "   " },
      { id: "c", text: "trùng id" },
    ],
    stored,
    hashOf,
  );
  assert.deepEqual(stale.map((s) => [s.target.id, s.contentHash]), [["b", "h:bản mới"], ["c", "h:chưa có vector"]]);
  assert.deepEqual(staleTargets([{ id: "a", text: "giữ nguyên" }], stored, hashOf), []);
});

test("remainingSeconds: ước theo tốc độ đã chạy; null khi chưa chạy hoặc đã xong", () => {
  assert.equal(remainingSeconds(10, 40, 5_000), 15);
  assert.equal(remainingSeconds(0, 40, 0), null);
  assert.equal(remainingSeconds(40, 40, 20_000), null);
});
