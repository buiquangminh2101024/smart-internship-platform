// Chạy: node --import tsx --test tests/unit/job-post-requirements.test.ts (từ apps/server)
// Luồng "Phân tích yêu cầu bằng AI" / "Áp dụng" (docs/06-backend/job-matcher-phase3/PLAN.md
// mục API). Redis, DB, model và catalog đều là bản giả.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ConfirmRequirementsRequest } from "@sip/shared-types";
import { AppError } from "../../src/shared/errors/AppError";
import type { RawJobRequirements, RequirementExtractor } from "../../src/shared/ports/RequirementExtractor";
import { JobPostRequirementsService } from "../../src/modules/job-posts/job-post-requirements.service";
import { RequirementExtractionRateLimitService } from "../../src/modules/job-posts/requirement-extraction-rate-limit.service";

class FakeRedis {
  readonly store = new Map<string, string>();

  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string, ...args: unknown[]) {
    if (args.includes("NX") && this.store.has(key)) return null;
    this.store.set(key, value);
    return "OK";
  }
  async del(key: string) {
    this.store.delete(key);
    return 1;
  }
  async incr(key: string) {
    const next = Number(this.store.get(key) ?? 0) + 1;
    this.store.set(key, String(next));
    return next;
  }
  async expire() {
    return 1;
  }
  keys(prefix: string) {
    return [...this.store.keys()].filter((key) => key.startsWith(prefix));
  }
}

const RAW: RawJobRequirements = {
  skills: [
    { rawName: "ReactJS", importance: "PREFERRED", minYears: null, evidence: "ưu tiên ReactJS", confidence: "HIGH" },
    { rawName: "React.js", importance: "REQUIRED", minYears: 1, evidence: "1 năm React.js", confidence: "HIGH" },
    { rawName: "REST API", importance: "REQUIRED", minYears: null, evidence: "REST API", confidence: "MEDIUM" },
  ],
  overallMinExperienceYears: null,
  majors: [{ rawName: "CNTT", relevance: "PRIMARY", evidence: "ngành CNTT", confidence: "HIGH" }],
  languages: [],
  other: [],
  confidence: "HIGH",
};

const DRAFT = { id: "job-1", companyId: "co-1", status: "DRAFT", title: "Frontend", description: "Mô tả", requirements: "Yêu cầu" };

function setup(options: { jobPost?: Record<string, unknown> | null; extract?: () => Promise<RawJobRequirements>; perUserLimit?: number } = {}) {
  const redis = new FakeRedis();
  const calls = { extract: 0, setSkills: [] as unknown[], setMajors: [] as unknown[], update: [] as unknown[] };
  const jobPost = options.jobPost === undefined ? DRAFT : options.jobPost;
  const extractor: RequirementExtractor = {
    extract: async () => {
      calls.extract += 1;
      return options.extract ? options.extract() : RAW;
    },
  };
  const service = new JobPostRequirementsService({
    prisma: { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn("tx") } as never,
    redis: redis as never,
    logger: { error: () => {} } as never,
    jobPostRepository: {
      findById: async () =>
        jobPost
          ? { ...jobPost, skills: [], majors: [], moderationActions: [], company: {}, createdAt: new Date(), updatedAt: new Date() }
          : null,
      findExistingSkillIds: async (ids: string[]) => new Set(ids.filter((id) => id !== "ghost")),
      findExistingMajorIds: async (ids: string[]) => new Set(ids),
      setSkills: async (...args: unknown[]) => void calls.setSkills.push(args),
      setMajors: async (...args: unknown[]) => void calls.setMajors.push(args),
      update: async (...args: unknown[]) => void calls.update.push(args),
    } as never,
    employerRepository: { findByUserId: async () => ({ companyId: "co-1" }) } as never,
    requirementExtractor: extractor,
    requirementExtractionRateLimitService: new RequirementExtractionRateLimitService({
      redis: redis as never,
      config: {
        REQUIREMENT_EXTRACTION_DAILY_LIMIT_PER_USER: options.perUserLimit ?? 20,
        REQUIREMENT_EXTRACTION_DAILY_LIMIT_GLOBAL: 200,
      },
    }),
    skillDedupeService: {
      findBestApproved: async (name: string) =>
        /^react/i.test(name) ? { id: "s-react", name: "ReactJS", matchType: name === "ReactJS" ? "EXACT" : "TOKEN" } : null,
    } as never,
    majorDedupeService: {
      findBestApproved: async (name: string) =>
        name === "CNTT" ? { id: "m-cntt", name: "Công nghệ thông tin", matchType: "ALIAS" } : null,
    } as never,
  });
  return { service, redis, calls };
}

async function rejectsWith(promise: Promise<unknown>, status: number) {
  await assert.rejects(promise, (error) => error instanceof AppError && error.statusCode === status);
}

test("extract: khớp catalog, gộp hai tên cùng một kỹ năng (REQUIRED thắng, lấy số năm lớn hơn)", async () => {
  const { service } = setup();
  const result = await service.extract("u1", "job-1");
  assert.equal(result.skills.length, 2);
  assert.deepEqual(result.skills[0], {
    rawName: "ReactJS",
    importance: "REQUIRED",
    minYears: 1,
    evidence: "ưu tiên ReactJS",
    confidence: "HIGH",
    resolved: { skillId: "s-react", name: "ReactJS", matchType: "EXACT" },
  });
  // Không có trong danh mục ⇒ resolved null, KHÔNG tạo mới.
  assert.equal(result.skills[1]!.resolved, null);
  assert.deepEqual(result.majors[0]!.resolved, { majorId: "m-cntt", name: "Công nghệ thông tin", matchType: "ALIAS" });
});

test("extract: lần hai cùng nội dung lấy từ cache — không gọi model, không trừ lượt", async () => {
  const { service, redis, calls } = setup();
  await service.extract("u1", "job-1");
  await service.extract("u1", "job-1");
  assert.equal(calls.extract, 1);
  const [userKey] = redis.keys("requirement-extract-quota:user:u1");
  assert.equal(redis.store.get(userKey!), "1");
  // Khoá chống bấm đúp đã được nhả.
  assert.deepEqual(redis.keys("requirement-extract:lock:"), []);
});

test("extract: đang có lượt khác chạy (khoá Redis) ⇒ 409, không gọi model, không trừ lượt", async () => {
  const { service, redis, calls } = setup();
  await redis.set("requirement-extract:lock:job-1", "1");
  await rejectsWith(service.extract("u1", "job-1"), 409);
  assert.equal(calls.extract, 0);
  assert.deepEqual(redis.keys("requirement-extract-quota:"), []);
});

test("extract: mọi tầng model lỗi ⇒ 502, nhả khoá, không ghi cache", async () => {
  const { service, redis } = setup({ extract: async () => Promise.reject(new Error("503")) });
  await rejectsWith(service.extract("u1", "job-1"), 502);
  assert.deepEqual(redis.keys("requirement-extract:lock:"), []);
  assert.deepEqual(redis.keys("requirement-extract:cache:"), []);
});

test("extract: hết lượt trong ngày ⇒ 429 trước khi gọi model", async () => {
  const { service, calls } = setup({ perUserLimit: 0 });
  await rejectsWith(service.extract("u1", "job-1"), 429);
  assert.equal(calls.extract, 0);
});

test("extract/confirm: chỉ tin DRAFT của công ty mình", async () => {
  await rejectsWith(setup({ jobPost: { ...DRAFT, status: "PENDING" } }).service.extract("u1", "job-1"), 409);
  await rejectsWith(setup({ jobPost: { ...DRAFT, companyId: "co-2" } }).service.extract("u1", "job-1"), 404);
  await rejectsWith(setup({ jobPost: null }).service.confirm("u1", "job-1", confirmBody()), 404);
});

function confirmBody(overrides: Partial<ConfirmRequirementsRequest> = {}): ConfirmRequirementsRequest {
  return {
    skills: [
      { skillId: "s-react", importance: "REQUIRED", minYears: 1 },
      { skillId: "s-css", importance: "PREFERRED", minYears: 0 },
    ],
    minExperienceYears: 0,
    majors: [{ majorId: "m-cntt", relevance: "PRIMARY" }],
    languages: [{ language: "Tiếng Anh", level: "", importance: "PREFERRED" }],
    other: ["Có laptop cá nhân"],
    ...overrides,
  };
}

test("confirm: ghi kỹ năng + số năm, ngành, requirementsExtra, requirementsConfirmedAt; 0 quy về null", async () => {
  const { service, calls } = setup();
  await service.confirm("u1", "job-1", confirmBody());
  assert.deepEqual(calls.setSkills[0], [
    "job-1",
    [
      { skillId: "s-react", importance: "REQUIRED", minYears: 1 },
      { skillId: "s-css", importance: "PREFERRED", minYears: null },
    ],
    "tx",
  ]);
  assert.deepEqual(calls.setMajors[0], ["job-1", [{ majorId: "m-cntt", relevance: "PRIMARY" }], "tx"]);
  const [id, data, tx] = calls.update[0] as [string, Record<string, unknown>, string];
  assert.equal(id, "job-1");
  assert.equal(tx, "tx");
  assert.equal(data.minExperienceYears, null);
  assert.deepEqual(data.requirementsExtra, {
    languages: [{ language: "Tiếng Anh", level: null, importance: "PREFERRED" }],
    other: ["Có laptop cá nhân"],
  });
  assert.ok(data.requirementsConfirmedAt instanceof Date);
});

test("confirm: skillId không tồn tại ⇒ 400, không ghi gì", async () => {
  const { service, calls } = setup();
  await rejectsWith(
    service.confirm("u1", "job-1", confirmBody({ skills: [{ skillId: "ghost", importance: "REQUIRED", minYears: null }] })),
    400,
  );
  assert.equal(calls.setSkills.length, 0);
  assert.equal(calls.update.length, 0);
});
