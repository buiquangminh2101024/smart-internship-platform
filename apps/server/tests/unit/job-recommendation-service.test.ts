// Chạy: node --import tsx --test tests/unit/job-recommendation-service.test.ts (từ apps/server)
// "Việc làm phù hợp" đọc bảng điểm, phân trang, đường LIVE dự phòng (AD-26,
// docs/06-backend/job-discovery/PLAN.md bước 2). Repository, loader và
// MatchEmbeddingService là bản giả — câu SQL kiểm trên Neon ở bước 8.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import type { JobPost } from "@sip/shared-types";
import { AppError } from "../../src/shared/errors/AppError";
import type { CandidateMatchProfile, JobMatchProfile } from "../../src/shared/ports/JobMatcher";
import { HYBRID_WEIGHTS_V2, RULE_WEIGHTS_V1 } from "../../src/modules/job-matching/job-matching.config";
import type { JobMatcherMode } from "../../src/modules/job-matching/job-matching.service";
import {
  JobRecommendationService,
  parseRecommendationCursor,
} from "../../src/modules/job-matching/job-recommendation.service";
import type {
  JobRecommendationRepository,
  ScoredJobRow,
} from "../../src/modules/job-matching/job-recommendation.repository";
import { ScoringJobMatcher } from "../../src/modules/job-matching/scoring-job-matcher";
import type { CandidateMatchProfileLoader } from "../../src/modules/job-matching/candidate-match-profile.loader";
import type { JobMatchProfileLoader } from "../../src/modules/job-matching/job-match-profile.loader";
import type { EmbeddingTarget, MatchEmbeddingService } from "../../src/modules/job-matching/match-embedding.service";

const FULL = { hasSkills: true, hasWorkExperience: true, hasEducation: true, hasHeadlineOrBio: true };

function candidate(candidateId: string, skillIds: string[]): CandidateMatchProfile {
  return {
    candidateId,
    skills: skillIds.map((skillId) => ({ skillId, name: skillId, yearsOfExperience: 1 })),
    totalExperienceYears: null,
    educations: [],
    completeness: FULL,
    matchText: `Chức danh: ${candidateId}`,
  };
}

function job(jobPostId: string, required: string[]): JobMatchProfile {
  return {
    jobPostId,
    skills: [
      ...required.map((skillId) => ({ skillId, name: skillId, importance: "REQUIRED" as const, minYears: null })),
      // Mọi tin cùng ưu tiên "docker" mà hồ sơ không có ⇒ đủ 3 tin thì sinh SKILL_GAP.
      { skillId: "docker", name: "Docker", importance: "PREFERRED" as const, minYears: null },
    ],
    minExperienceYears: null,
    majors: [],
    matchText: `Vị trí: ${jobPostId}`,
  };
}

// Hồ sơ có java + spring. Điểm rule: A (1/1 bắt buộc) > B (2/3) > C (0/1).
const JOBS = new Map([
  ["job-a", job("job-a", ["java"])],
  ["job-b", job("job-b", ["java", "spring", "postgres"])],
  ["job-c", job("job-c", ["golang"])],
]);
const PROFILES = new Map([
  ["c1", candidate("c1", ["java", "spring"])],
  ["c-empty", candidate("c-empty", [])],
]);

class FakeRepository {
  page: { rows: ScoredJobRow[]; total: number } = { rows: [], total: 0 };
  hasScored = true;
  pool: string[] = [];
  pageCalls: Array<{ candidateId: string; options: { minScore: number; offset: number; take: number } }> = [];
  poolCalls: unknown[] = [];

  async findScoredPage(candidateId: string, options: { minScore: number; offset: number; take: number }) {
    this.pageCalls.push({ candidateId, options });
    return this.page;
  }

  async hasScoredVisibleJob() {
    return this.hasScored;
  }

  async findCandidatePool(options: unknown) {
    this.poolCalls.push(options);
    return this.pool;
  }

  async findPublicByIds(ids: string[]) {
    return ids.map((id) => ({ id, title: id, company: { name: "Cty" } }) as unknown as JobPost);
  }
}

class FakeEmbeddings {
  cosines = new Map<string, number>();
  async similarityForJobs(_candidate: EmbeddingTarget, jobs: EmbeddingTarget[]) {
    return new Map(jobs.map((target) => [target.id, this.cosines.get(target.id) ?? null]));
  }
}

function setup(mode: JobMatcherMode = "rule") {
  const repository = new FakeRepository();
  const embeddings = new FakeEmbeddings();
  const service = new JobRecommendationService({
    prisma: { candidate: { findUnique: async () => ({ id: "c1" }) } } as unknown as PrismaClient,
    ruleJobMatcher: new ScoringJobMatcher(RULE_WEIGHTS_V1),
    hybridJobMatcher: new ScoringJobMatcher(HYBRID_WEIGHTS_V2),
    matchEmbeddingService: embeddings as unknown as MatchEmbeddingService,
    candidateMatchProfileLoader: {
      load: async (id: string) => PROFILES.get(id) ?? null,
    } as unknown as CandidateMatchProfileLoader,
    jobMatchProfileLoader: {
      loadMany: async (ids: string[]) =>
        new Map(ids.filter((id) => JOBS.has(id)).map((id) => [id, JOBS.get(id)!])),
    } as unknown as JobMatchProfileLoader,
    jobRecommendationRepository: repository as unknown as JobRecommendationRepository,
    config: { JOB_MATCHER_MODE: mode },
  });
  return { service, repository, embeddings };
}

const rows = (...ids: string[]): ScoredJobRow[] => ids.map((jobPostId) => ({ jobPostId, score: 50 }));
const ids = (list: { items: Array<{ jobPost: JobPost }> }) => list.items.map((item) => item.jobPost.id);

test("TABLE: trang đầu đọc bảng điểm, chấm lại và sắp lại trong trang", async () => {
  const { service, repository } = setup();
  // Bảng (điểm lưu cũ) xếp C, B, A; chấm lại ⇒ A > B > C.
  repository.page = { rows: rows("job-c", "job-b", "job-a"), total: 25 };

  const result = await service.listForCandidate("c1");

  assert.deepEqual(repository.pageCalls, [{ candidateId: "c1", options: { minScore: 20, offset: 0, take: 10 } }]);
  assert.equal(result.status, "OK");
  assert.equal(result.source, "TABLE");
  assert.deepEqual(ids(result), ["job-a", "job-b", "job-c"]);
  assert.equal(result.total, 25);
  assert.equal(result.nextCursor, "3");
  const scores = result.items.map((item) => item.match.score ?? 0);
  assert.deepEqual(scores, [...scores].sort((left, right) => right - left));
  // 3 tin cùng thiếu Docker ⇒ gợi ý ở trang đầu.
  assert.deepEqual(
    result.suggestions.map((suggestion) => suggestion.kind),
    ["SKILL_GAP"],
  );
  assert.equal(repository.poolCalls.length, 0);
});

test("TABLE: trang sau dùng offset của cursor, không có gợi ý; trang cuối nextCursor null", async () => {
  const { service, repository } = setup();
  repository.page = { rows: rows("job-a", "job-b", "job-c"), total: 13 };

  const result = await service.listForCandidate("c1", { cursor: "10" });

  assert.equal(repository.pageCalls[0]!.options.offset, 10);
  assert.deepEqual(result.suggestions, []);
  assert.equal(result.nextCursor, null);
  assert.equal(result.total, 13);
});

test("TABLE: tin đã bị xoá khỏi loader thì bỏ qua", async () => {
  const { service, repository } = setup();
  repository.page = { rows: rows("job-gone", "job-a"), total: 2 };

  const result = await service.listForCandidate("c1");

  assert.deepEqual(ids(result), ["job-a"]);
  assert.equal(result.nextCursor, null);
});

test("TABLE: có dòng điểm nhưng không tin nào qua lọc ⇒ danh sách rỗng, không chạy LIVE", async () => {
  const { service, repository } = setup();
  repository.page = { rows: [], total: 0 };
  repository.hasScored = true;

  const result = await service.listForCandidate("c1");

  assert.equal(result.source, "TABLE");
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
  assert.equal(repository.poolCalls.length, 0);
});

test("LIVE: chưa có dòng điểm ⇒ chấm trực tiếp một trang, không giới hạn 30 ngày", async () => {
  const { service, repository } = setup();
  repository.hasScored = false;
  repository.pool = ["job-c", "job-b", "job-a"];

  const result = await service.listForCandidate("c1");

  assert.equal(result.source, "LIVE");
  assert.deepEqual(repository.poolCalls, [
    { candidateId: "c1", skillIds: ["java", "spring"], poolSize: 50, minPool: 10 },
  ]);
  // C (0/1 bắt buộc) dưới ngưỡng 20 ⇒ bị loại.
  assert.deepEqual(ids(result), ["job-a", "job-b"]);
  assert.equal(result.total, 2);
  assert.equal(result.nextCursor, null);
});

test("LIVE: trang sau luôn rỗng, không lọc lại", async () => {
  const { service, repository } = setup();
  repository.hasScored = false;
  repository.pool = ["job-a"];

  const result = await service.listForCandidate("c1", { cursor: "10" });

  assert.equal(result.source, "LIVE");
  assert.deepEqual(result.items, []);
  assert.equal(result.nextCursor, null);
  assert.equal(repository.poolCalls.length, 0);
});

test("chưa có kỹ năng ⇒ INSUFFICIENT_PROFILE, không chạy đường LIVE", async () => {
  const { service, repository } = setup();
  repository.hasScored = false;

  const result = await service.listForCandidate("c-empty");

  assert.equal(result.status, "INSUFFICIENT_PROFILE");
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
  assert.equal(repository.poolCalls.length, 0);
});

test("không có hồ sơ ứng viên ⇒ 404", async () => {
  const { service } = setup();
  await assert.rejects(
    () => service.listForCandidate("c-missing"),
    (error: unknown) => error instanceof AppError && error.statusCode === 404,
  );
});

test("getTopMatches = trang đầu với limit / minScore riêng", async () => {
  const { service, repository } = setup();
  repository.page = { rows: rows("job-a"), total: 1 };

  const result = await service.getTopMatches("c1", { limit: 5, minScore: 30 });

  assert.deepEqual(repository.pageCalls[0]!.options, { minScore: 30, offset: 0, take: 5 });
  assert.deepEqual(ids(result), ["job-a"]);
});

test("getTopMatchResults: cùng tập tin trang đầu, chấm rule kể cả khi bật hybrid, không nạp tin công khai", async () => {
  const { service, repository, embeddings } = setup("hybrid");
  repository.page = { rows: rows("job-c", "job-gone", "job-a"), total: 3 };
  embeddings.cosines.set("job-a", 0.7);
  let publicLoads = 0;
  repository.findPublicByIds = async () => {
    publicLoads++;
    return [];
  };

  const results = await service.getTopMatchResults("c1", { limit: 10, minScore: 20 });

  assert.deepEqual(repository.pageCalls[0]!.options, { minScore: 20, offset: 0, take: 10 });
  assert.equal(results.length, 2);
  assert.ok(results.every((match) => match.weightsVersion === "rule-v1"));
  assert.equal(publicLoads, 0);
});

test("getTopMatchResults: chưa có kỹ năng ⇒ rỗng", async () => {
  const { service } = setup();
  assert.deepEqual(await service.getTopMatchResults("c-empty"), []);
});

test("hybrid: tin có cosine chấm hybrid-v2, tin chưa có vector giữ rule kèm semantic PENDING", async () => {
  const { service, repository, embeddings } = setup("hybrid");
  repository.page = { rows: rows("job-a", "job-b"), total: 2 };
  embeddings.cosines.set("job-a", 0.7);

  const result = await service.listForCandidate("c1");
  const byId = new Map(result.items.map((item) => [item.jobPost.id, item.match]));

  assert.equal(byId.get("job-a")!.weightsVersion, "hybrid-v2");
  assert.equal(byId.get("job-a")!.semantic.available, true);
  assert.equal(byId.get("job-b")!.weightsVersion, "rule-v1");
  assert.equal(byId.get("job-b")!.semantic.available, false);
});

test("parseRecommendationCursor: rỗng ⇒ 0; sai định dạng hoặc quá lớn ⇒ 400", () => {
  assert.equal(parseRecommendationCursor(undefined), 0);
  assert.equal(parseRecommendationCursor(""), 0);
  assert.equal(parseRecommendationCursor("20"), 20);
  for (const bad of ["abc", "-1", "1.5", "10001", "123456", "cjld2cjxh0000qzrmn831i7rn"]) {
    assert.throws(
      () => parseRecommendationCursor(bad),
      (error: unknown) => error instanceof AppError && error.statusCode === 400 && error.code === "INVALID_CURSOR",
      bad,
    );
  }
});
