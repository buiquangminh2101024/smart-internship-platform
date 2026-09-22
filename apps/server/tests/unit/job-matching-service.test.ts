// Chạy: node --import tsx --test tests/unit/job-matching-service.test.ts (từ apps/server)
// Chọn cấu hình theo JOB_MATCHER_MODE (PLAN GĐ2 quyết định #5, #6). DB, loader và
// MatchEmbeddingService đều là bản giả — phần SQL/hash đã có test riêng.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import type { CandidateMatchProfile, JobMatchProfile } from "../../src/shared/ports/JobMatcher";
import {
  HYBRID_WEIGHTS_V1,
  MAX_NEW_EMBEDDINGS_PER_REQUEST,
  RULE_WEIGHTS_V1,
} from "../../src/modules/job-matching/job-matching.config";
import { JobMatchingService, type JobMatcherMode } from "../../src/modules/job-matching/job-matching.service";
import { ScoringJobMatcher } from "../../src/modules/job-matching/scoring-job-matcher";
import type { CandidateMatchProfileLoader } from "../../src/modules/job-matching/candidate-match-profile.loader";
import type { JobMatchProfileLoader } from "../../src/modules/job-matching/job-match-profile.loader";
import type { EmbeddingTarget, MatchEmbeddingService } from "../../src/modules/job-matching/match-embedding.service";

const FULL = { hasSkills: true, hasWorkExperience: true, hasEducation: true, hasHeadlineOrBio: true };

function profile(candidateId: string, skillIds: string[]): CandidateMatchProfile {
  return {
    candidateId,
    skills: skillIds.map((skillId) => ({ skillId, name: skillId, yearsOfExperience: 1 })),
    totalExperienceYears: null,
    educations: [],
    completeness: FULL,
    matchText: `Chức danh: ${candidateId}`,
  };
}

// 2/3 bắt buộc, 1/1 ưu tiên ⇒ rule-v1 = 73.
const JOB: JobMatchProfile = {
  jobPostId: "job-1",
  skills: [
    { skillId: "java", name: "java", importance: "REQUIRED" },
    { skillId: "spring", name: "spring", importance: "REQUIRED" },
    { skillId: "postgres", name: "postgres", importance: "REQUIRED" },
    { skillId: "docker", name: "docker", importance: "PREFERRED" },
  ],
  minExperienceYears: null,
  matchText: "Vị trí: Backend",
};

const PROFILES = new Map([
  ["c1", profile("c1", ["java", "spring", "docker"])],
  ["c2", profile("c2", ["java", "spring", "docker"])],
  ["c3", profile("c3", [])], // chưa có kỹ năng
]);

// Chỉ những truy vấn service thật sự gọi.
const fakePrisma = {
  candidate: { findUnique: async () => ({ id: "c1" }) },
  jobPost: {
    findUnique: async () => ({ status: "PUBLISHED" }),
    findFirst: async () => ({ id: JOB.jobPostId }),
  },
  employer: { findUnique: async () => ({ companyId: "co-1" }) },
  application: {
    findMany: async () => [...PROFILES.keys()].map((candidateId) => ({ id: `app-${candidateId}`, candidateId })),
    findFirst: async () => ({ candidateId: "c1", jobPostId: JOB.jobPostId }),
  },
} as unknown as PrismaClient;

const fakeCandidateLoader = {
  load: async (candidateId: string) => PROFILES.get(candidateId) ?? null,
  loadMany: async (candidateIds: string[]) =>
    new Map(candidateIds.filter((id) => PROFILES.has(id)).map((id) => [id, PROFILES.get(id)!])),
} as unknown as CandidateMatchProfileLoader;

const fakeJobLoader = { load: async () => JOB } as unknown as JobMatchProfileLoader;

class FakeEmbeddings {
  /** Cosine theo candidateId; thiếu ⇒ null (model lỗi / vượt hạn mức). */
  cosines = new Map<string, number>();
  singleCalls: EmbeddingTarget[] = [];
  listCalls: { job: EmbeddingTarget; candidates: EmbeddingTarget[]; maxNew: number }[] = [];

  async similarity(candidate: EmbeddingTarget, job: EmbeddingTarget) {
    this.singleCalls.push(candidate);
    assert.equal(job.text, JOB.matchText);
    return this.cosines.get(candidate.id) ?? null;
  }

  async similarityForCandidates(job: EmbeddingTarget, candidates: EmbeddingTarget[], maxNew: number) {
    this.listCalls.push({ job, candidates, maxNew });
    return new Map(candidates.map((candidate) => [candidate.id, this.cosines.get(candidate.id) ?? null]));
  }
}

function setup(mode: JobMatcherMode) {
  const embeddings = new FakeEmbeddings();
  const service = new JobMatchingService({
    prisma: fakePrisma,
    // Calibration của ví dụ PLAN (lo 0.25, hi 0.75) để số dễ kiểm tay.
    ruleJobMatcher: new ScoringJobMatcher(RULE_WEIGHTS_V1),
    hybridJobMatcher: new ScoringJobMatcher(HYBRID_WEIGHTS_V1, { lo: 0.25, hi: 0.75 }),
    matchEmbeddingService: embeddings as unknown as MatchEmbeddingService,
    candidateMatchProfileLoader: fakeCandidateLoader,
    jobMatchProfileLoader: fakeJobLoader,
    config: { JOB_MATCHER_MODE: mode },
  });
  return { service, embeddings };
}

test("rule: y hệt GĐ1, không chạm embedding", async () => {
  const { service, embeddings } = setup("rule");
  embeddings.cosines.set("c1", 0.62);

  const result = await service.matchForCandidate("user-1", JOB.jobPostId);

  assert.deepEqual(result, new ScoringJobMatcher(RULE_WEIGHTS_V1).match({ candidate: PROFILES.get("c1")!, job: JOB, semanticSimilarity: null }));
  assert.equal(result.score, 73);
  assert.equal(result.semantic.enabled, false);
  assert.equal(embeddings.singleCalls.length + embeddings.listCalls.length, 0);
});

test("rule: danh sách đơn có semanticStatus OFF", async () => {
  const { service, embeddings } = setup("rule");
  const list = await service.listApplicationMatches("user-2", JOB.jobPostId);
  assert.deepEqual(
    list.map((item) => item.semanticStatus),
    ["OFF", "OFF", "OFF"],
  );
  assert.equal(embeddings.listCalls.length, 0);
});

test("hybrid + có cosine ⇒ hybrid-v1, semantic.available", async () => {
  const { service, embeddings } = setup("hybrid");
  embeddings.cosines.set("c1", 0.62);

  const result = await service.matchForCandidate("user-1", JOB.jobPostId);

  assert.equal(result.weightsVersion, "hybrid-v1");
  assert.equal(result.score, 74); // ví dụ tính tay của PLAN
  assert.equal(result.semantic.available, true);
  assert.deepEqual(embeddings.singleCalls, [{ id: "c1", text: "Chức danh: c1" }]);
});

test("hybrid + model lỗi (cosine null) ⇒ rơi về rule-v1, không lỗi, báo semantic chưa có", async () => {
  const { service } = setup("hybrid");

  const result = await service.matchForApplication("user-2", "app-c1");

  assert.equal(result.weightsVersion, "rule-v1");
  assert.equal(result.score, 73);
  assert.deepEqual(result.semantic, { enabled: true, available: false, similarity: null, normalized: null });
});

test("hybrid: hồ sơ chưa có kỹ năng không tốn lượt embed", async () => {
  const { service, embeddings } = setup("hybrid");
  const original = PROFILES.get("c1")!;
  PROFILES.set("c1", profile("c1", []));
  try {
    const result = await service.matchForCandidate("user-1", JOB.jobPostId);
    assert.equal(result.status, "INSUFFICIENT_PROFILE");
    assert.equal(embeddings.singleCalls.length, 0);
  } finally {
    PROFILES.set("c1", original);
  }
});

test("hybrid: danh sách — một lượt gọi, đúng hạn mức, AVAILABLE/PENDING theo từng đơn", async () => {
  const { service, embeddings } = setup("hybrid");
  embeddings.cosines.set("c1", 0.62); // c2 vượt hạn mức ⇒ null

  const list = await service.listApplicationMatches("user-2", JOB.jobPostId);

  assert.equal(embeddings.listCalls.length, 1);
  const call = embeddings.listCalls[0]!;
  assert.equal(call.maxNew, MAX_NEW_EMBEDDINGS_PER_REQUEST);
  assert.deepEqual(call.job, { id: JOB.jobPostId, text: JOB.matchText });
  assert.deepEqual(
    call.candidates.map((candidate) => candidate.id),
    ["c1", "c2"], // c3 chưa có kỹ năng ⇒ không gửi đi embed
  );

  const byCandidate = new Map(list.map((item) => [item.candidateId, item]));
  assert.deepEqual(
    { score: byCandidate.get("c1")!.score, semanticStatus: byCandidate.get("c1")!.semanticStatus },
    { score: 74, semanticStatus: "AVAILABLE" },
  );
  assert.deepEqual(
    { score: byCandidate.get("c2")!.score, semanticStatus: byCandidate.get("c2")!.semanticStatus },
    { score: 73, semanticStatus: "PENDING" },
  );
  assert.equal(byCandidate.get("c3")!.status, "INSUFFICIENT_PROFILE");
});
