// Chạy: node --import tsx --test tests/unit/large-demo-generate.test.ts (từ apps/server)
// Bộ sinh dữ liệu demo lớn, phần 2a (docs/06-backend/large-demo-data/PLAN.md, bước 2):
// chạy trên thư viện thật (scripts/data/large-demo) với danh mục giả cấp id cho mọi tên.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  catalogAdditionsSchema, companiesFileSchema, jobTemplatesFileSchema, namesFileSchema, personasFileSchema,
  positionsFileSchema, showcaseFileSchema, type LargeDemoLibrary,
} from "../../scripts/lib/large-demo/library";
import {
  FULL_SCALE, LARGE_DEMO_EMAIL_DOMAIN, LARGE_DEMO_ID_PREFIX, createRng, generateLargeDemo,
  type GenerateCatalog, type GenerateOptions, type GeneratedLargeDemo,
} from "../../scripts/lib/large-demo/generate";

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

/** Danh mục giả: tên nào hỏi tới cũng có id (trừ các tên trong `missing`). */
class AutoIds extends Map<string, string> {
  constructor(private readonly kind: string, private readonly missing: ReadonlySet<string> = new Set()) {
    super();
  }
  override get(name: string): string | undefined {
    if (this.missing.has(name)) return undefined;
    if (!super.has(name)) super.set(name, `${this.kind}${super.size}`);
    return super.get(name);
  }
}

function catalog(missingSkills: string[] = []): GenerateCatalog {
  return {
    skillIds: new AutoIds("skill", new Set(missingSkills)), majorIds: new AutoIds("major"), universityIds: new AutoIds("uni"),
    cityIds: new AutoIds("city"), industryIds: new AutoIds("industry"), companyTypeIds: new AutoIds("type"),
  };
}

const NOW = new Date("2026-11-09T03:00:00Z");
const OPTIONS: GenerateOptions = {
  seed: 20261109, scale: 1, now: NOW, passwordHash: "hash", cvFileUrl: "https://example.test/cv.pdf", planId: "plan", adminUserId: "admin",
};

let fullRun: GeneratedLargeDemo | undefined;
/** Quy mô đủ dùng chung cho nhiều test (sinh một lần). */
function full(): GeneratedLargeDemo {
  fullRun ??= generateLargeDemo(LIBRARY, catalog(), OPTIONS);
  return fullRun;
}

const share = (count: number, total: number) => count / total;

test("rng: cùng seed ra cùng dãy, khác seed ra dãy khác", () => {
  const a = createRng(1);
  const b = createRng(1);
  const c = createRng(2);
  const seqA = Array.from({ length: 5 }, () => a.next());
  assert.deepEqual(seqA, Array.from({ length: 5 }, () => b.next()));
  assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => c.next()));
});

test("cùng seed + cùng giờ chạy → cùng kết quả; khác seed → khác", () => {
  const small = { ...OPTIONS, scale: 0.1 };
  const first = generateLargeDemo(LIBRARY, catalog(), small);
  const second = generateLargeDemo(LIBRARY, catalog(), small);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  const other = generateLargeDemo(LIBRARY, catalog(), { ...small, seed: 7 });
  assert.notEqual(JSON.stringify(first.candidates), JSON.stringify(other.candidates));
});

test("quy mô đủ: số công ty / tin / ứng viên đúng D1, gồm phần trưng bày", () => {
  const data = full();
  assert.equal(data.companies.length, LIBRARY.companies.companies.length);
  assert.equal(data.jobPosts.length, FULL_SCALE.generatedJobs + LIBRARY.showcase.jobs.length);
  assert.equal(data.candidates.length, FULL_SCALE.generatedCandidates + LIBRARY.showcase.candidates.length);
  assert.equal(data.employers.length, LIBRARY.companies.companies.reduce((sum, c) => sum + c.employerCount, 0));
  assert.equal(data.users.length, data.employers.length + data.candidates.length);
});

test("scale nhỏ vẫn giữ đủ công ty demo, tin chính và hồ sơ trưng bày", () => {
  const data = generateLargeDemo(LIBRARY, catalog(), { ...OPTIONS, scale: 0.1 });
  for (const employer of LIBRARY.showcase.employers) {
    assert.ok(data.users.some((u) => u.email === `${employer.key}@${LARGE_DEMO_EMAIL_DOMAIN}`), employer.key);
  }
  assert.equal(data.facts.jobs.filter((j) => j.showcaseKey).length, LIBRARY.showcase.jobs.length);
  assert.equal(data.facts.candidates.filter((c) => c.showcaseJobId).length, LIBRARY.showcase.candidates.length);
  assert.throws(() => generateLargeDemo(LIBRARY, catalog(), { ...OPTIONS, scale: 0 }));
});

test("id có tiền tố riêng, chỉ chữ thường + số, không trùng; email thuộc domain demo, không trùng", () => {
  const data = full();
  const rows = [
    ...data.users, ...data.companies, ...data.employers, ...data.subscriptions, ...data.jobPosts, ...data.moderationActions,
    ...data.dailyStats, ...data.candidates, ...data.educations, ...data.workExperiences, ...data.projects, ...data.certificates, ...data.cvs,
  ];
  const ids = rows.map((r) => r.id!);
  for (const id of ids) assert.match(id, new RegExp(`^${LARGE_DEMO_ID_PREFIX}[0-9a-z]+$`));
  assert.equal(new Set(ids).size, ids.length);
  const emails = data.users.map((u) => u.email);
  for (const email of emails) assert.ok(email.endsWith(`@${LARGE_DEMO_EMAIL_DOMAIN}`), email);
  assert.equal(new Set(emails).size, emails.length);
  const pairs = data.candidateSkills.map((s) => `${s.candidateId}/${s.skillId}`);
  assert.equal(new Set(pairs).size, pairs.length, "kỹ năng của ứng viên bị lặp");
  const jobSkills = data.jobPostSkills.map((s) => `${s.jobPostId}/${s.skillId}`);
  assert.equal(new Set(jobSkills).size, jobSkills.length, "kỹ năng của tin bị lặp");
});

test("tham chiếu thiếu trong danh mục → dừng và báo tên", () => {
  assert.throws(() => generateLargeDemo(LIBRARY, catalog(["Node.js"]), { ...OPTIONS, scale: 0.1 }), /kỹ năng: Node\.js/);
});

test("mỗi công ty: đúng 1 isCompanyAdmin, gói ACTIVE tới +90 ngày; tài khoản demo thay admin của công ty demo", () => {
  const data = full();
  for (const company of data.companies) {
    const admins = data.employers.filter((e) => e.companyId === company.id && e.isCompanyAdmin);
    assert.equal(admins.length, 1, company.name);
    const sub = data.subscriptions.find((s) => s.companyId === company.id);
    assert.equal(sub?.status, "ACTIVE");
    assert.equal(company.verificationStatus, "VERIFIED");
  }
  for (const employer of LIBRARY.showcase.employers) {
    const user = data.users.find((u) => u.email === `${employer.key}@${LARGE_DEMO_EMAIL_DOMAIN}`)!;
    assert.equal(data.employers.find((e) => e.userId === user.id)?.isCompanyAdmin, true);
  }
});

test("tin: hạn trước ngày kết thúc gói; trạng thái, ngày đăng, loại hình theo tỉ lệ PLAN", () => {
  const data = full();
  const jobs = data.facts.jobs.filter((j) => !j.showcaseKey);
  for (const job of data.facts.jobs) {
    assert.ok(!job.expiresAt || job.expiresAt <= data.subscriptionEnd, job.id);
    if (job.status === "PUBLISHED") {
      assert.ok(job.publishedAt && job.publishedAt <= NOW && NOW.getTime() - job.publishedAt.getTime() < 76 * 86_400_000, job.id);
      assert.ok(job.expiresAt && job.expiresAt > NOW, job.id);
    }
    if (job.status === "EXPIRED") assert.ok(job.expiresAt && job.expiresAt < NOW);
    if (job.status === "DRAFT" || job.status === "PENDING") assert.equal(job.publishedAt, null);
  }
  const published = jobs.filter((j) => j.status === "PUBLISHED");
  assert.ok(Math.abs(share(published.length, jobs.length) - 0.75) < 0.07, `đang hiển thị ${published.length}/${jobs.length}`);
  const recent = published.filter((j) => NOW.getTime() - j.publishedAt!.getTime() < 30 * 86_400_000);
  assert.ok(Math.abs(share(recent.length, published.length) - 0.6) < 0.1, `trong 30 ngày ${recent.length}/${published.length}`);
  const internships = jobs.filter((j) => j.jobType === "INTERNSHIP");
  assert.ok(Math.abs(share(internships.length, jobs.length) - 0.7) < 0.07);
  const negotiable = data.jobPosts.filter((j) => j.isNegotiable);
  assert.ok(Math.abs(share(negotiable.length, data.jobPosts.length) - 0.3) < 0.07);
  for (const job of data.jobPosts) {
    if (job.isNegotiable) assert.equal(job.salaryMin, null);
    else assert.ok(job.salaryMin! <= job.salaryMax!, job.id);
    assert.ok(Array.from(job.requirements!).length <= 400, `yêu cầu dài quá ngưỡng H6: ${job.id}`);
  }
});

test("tin: kiểm duyệt theo trạng thái, lượt xem = tổng theo ngày", () => {
  const data = full();
  const actionsOf = (jobId: string) => data.moderationActions.filter((m) => m.jobPostId === jobId).map((m) => m.action);
  for (const job of data.facts.jobs) {
    const actions = actionsOf(job.id);
    if (job.publishedAt) assert.deepEqual(actions, ["SUBMITTED", "APPROVED"], job.id);
    else if (job.status === "PENDING") assert.deepEqual(actions, ["SUBMITTED"], job.id);
    else if (job.status === "DRAFT") assert.ok(actions.length === 0 || actions.join() === "SUBMITTED,REJECTED", job.id);
  }
  const rejected = data.moderationActions.filter((m) => m.action === "REJECTED");
  assert.ok(rejected.length > 0 && rejected.every((m) => m.reason && m.actorId === "admin"));
  for (const post of data.jobPosts) {
    const total = data.dailyStats.filter((s) => s.jobPostId === post.id).reduce((sum, s) => sum + (s.views ?? 0), 0);
    assert.equal(post.viewCount ?? 0, total, post.id);
  }
  const statKeys = data.dailyStats.map((s) => `${s.jobPostId}/${(s.date as Date).toISOString()}`);
  assert.equal(new Set(statKeys).size, statKeys.length, "trùng (jobPostId, date)");
});

test("tin chính: đúng tin của showcase.json, đang hiển thị, đăng trong 30 ngày, đăng bởi tài khoản demo", () => {
  const data = full();
  for (const def of LIBRARY.showcase.jobs) {
    const job = data.facts.jobs.find((j) => j.showcaseKey === def.key)!;
    assert.equal(job.status, "PUBLISHED");
    assert.ok(NOW.getTime() - job.publishedAt!.getTime() < 30 * 86_400_000);
    const employerKey = LIBRARY.showcase.employers.find((e) => e.key === def.employer)!.key;
    const user = data.users.find((u) => u.id === job.employerUserId)!;
    assert.equal(user.email, `${employerKey}@${LARGE_DEMO_EMAIL_DOMAIN}`);
    for (const [name, years] of Object.entries(def.skillMinYears ?? {})) {
      assert.equal(job.skills.find((s) => s.name === name)?.minYears, years);
    }
  }
});

test("ứng viên: tỉ lệ nhóm theo PLAN; sinh viên có đúng 1 học vấn đang học, đúng khoá", () => {
  const data = full();
  const generated = data.facts.candidates.filter((c) => !c.showcaseJobId);
  const expected = { "rat-hop": 0.15, "hop-mot-phan": 0.4, "nganh-gan": 0.12, "doi-nganh": 0.08, "so-sai": 0.15, "ca-kho": 0.1 };
  for (const [tier, target] of Object.entries(expected)) {
    const actual = share(generated.filter((c) => c.tier === tier).length, generated.length);
    assert.ok(Math.abs(actual - target) < 0.04, `${tier}: ${actual.toFixed(3)}`);
  }
  const levels = new Map(LIBRARY.positions.levels.map((l) => [l.key, l]));
  for (const facts of data.facts.candidates) {
    const level = levels.get(facts.level)!;
    const edu = data.educations.filter((e) => e.candidateId === facts.id);
    const current = edu.filter((e) => e.isCurrent);
    if (level.studyYear === null) {
      assert.equal(current.length, 0, facts.id);
    } else {
      assert.equal(current.length, 1, facts.id);
      assert.equal(current[0]!.startYear, 2026 - level.studyYear + 1, facts.id); // tháng 11/2026 thuộc năm học 2026
    }
  }
  const open = generated.filter((c) => c.isOpenToOutreach);
  assert.ok(Math.abs(share(open.length, generated.length) - 0.7) < 0.05);
  const withCv = generated.filter((c) => c.cvId);
  assert.ok(Math.abs(share(withCv.length, generated.length) - 0.9) < 0.04);
});

test("ứng viên: kinh nghiệm không vượt mức cấp độ, không ở tương lai; hồ sơ sơ sài trống", () => {
  const data = full();
  const levels = new Map(LIBRARY.positions.levels.map((l) => [l.key, l]));
  for (const facts of data.facts.candidates) {
    const level = levels.get(facts.level)!;
    const experiences = data.workExperiences.filter((e) => e.candidateId === facts.id);
    let months = 0;
    for (const e of experiences) {
      const start = e.startDate as Date;
      const end = (e.endDate as Date | null) ?? NOW;
      assert.ok(start <= end && end <= NOW, `${facts.id}: ${start.toISOString()}–${end.toISOString()}`);
      months += Math.round((end.getTime() - start.getTime()) / (30.44 * 86_400_000));
    }
    assert.ok(months <= Math.round(level.experienceYears[1] * 12) + 1, `${facts.id}: ${months} tháng`);
    if (level.studyYear === 3) assert.ok(experiences.length <= 1, facts.id);
    if (facts.tier === "so-sai" && !facts.showcaseJobId) {
      const candidate = data.candidates.find((c) => c.id === facts.id)!;
      assert.equal(candidate.bio, null);
      assert.equal(experiences.length, 0);
      assert.ok(facts.skills.length >= 2 && facts.skills.length <= 3);
    }
    if (facts.hardCase === "nhoi-tu-khoa") assert.ok(facts.skills.length >= 10, facts.id);
    const candidate = data.candidates.find((c) => c.id === facts.id)!;
    assert.ok(!candidate.bio || Array.from(candidate.bio).length <= 300, `giới thiệu dài quá ngưỡng H6: ${facts.id}`);
    assert.ok(Array.from(candidate.headline!).length <= 100, facts.id);
  }
});

test("ứng viên sinh thêm: ngành học đúng nhóm (ngành chính / ngành gần / ngoài nhóm ngành của vị trí)", () => {
  const data = full();
  const positions = new Map(LIBRARY.positions.positions.map((p) => [p.key, p]));
  for (const facts of data.facts.candidates.filter((c) => !c.showcaseJobId)) {
    const { primary, related } = positions.get(facts.position)!.majors;
    for (const major of facts.majors) {
      if (facts.tier === "nganh-gan") assert.ok(related.includes(major), `${facts.id}: ${major}`);
      else if (facts.tier === "doi-nganh") assert.ok(!primary.includes(major) && !related.includes(major), `${facts.id}: ${major}`);
      else assert.ok(primary.includes(major), `${facts.id}: ${major}`);
    }
  }
});

test("hồ sơ trưng bày: bật isOpenToOutreach, có CV, giữ đúng tài khoản đăng nhập demo", () => {
  const data = full();
  const showcase = data.facts.candidates.filter((c) => c.showcaseJobId);
  assert.ok(showcase.every((c) => c.isOpenToOutreach && c.cvId));
  const logins = LIBRARY.showcase.candidates.filter((c) => c.demoLogin).map((c) => `${c.key}@${LARGE_DEMO_EMAIL_DOMAIN}`);
  assert.deepEqual(data.demoAccounts.filter((a) => a.role === "CANDIDATE").map((a) => a.email).sort(), logins.sort());
});

test("dời mốc thời gian: chạy sau một năm học thì khoá học và kinh nghiệm trưng bày dời theo", () => {
  const later = generateLargeDemo(LIBRARY, catalog(), { ...OPTIONS, scale: 0.1, now: new Date("2027-10-15T03:00:00Z") });
  const def = LIBRARY.showcase.candidates.find((c) => c.key === "uv-backend-1")!;
  const facts = later.facts.candidates.find((c) => c.email.startsWith("uv-backend-1@"))!;
  const edu = later.educations.find((e) => e.candidateId === facts.id && e.isCurrent)!;
  assert.equal(edu.startYear, def.educations[0]!.startYear + 1);
  const exp = later.workExperiences.find((e) => e.candidateId === facts.id)!;
  // Kinh nghiệm viết 2026-03 → dời 11 tháng (2026-11 → 2027-10) thành 2027-02.
  assert.equal((exp.startDate as Date).toISOString().slice(0, 7), "2027-01"); // đầu tháng giờ VN = 17:00 UTC ngày cuối tháng trước
});
