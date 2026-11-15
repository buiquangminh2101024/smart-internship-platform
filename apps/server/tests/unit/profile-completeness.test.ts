// Chạy: node --import tsx --test tests/unit/profile-completeness.test.ts (từ apps/server)
// Độ hoàn thiện hồ sơ (AD-26 mục 8, docs/06-backend/job-discovery/PLAN.md bước 3):
// tám mục, điểm, "Nên làm trước". Repository và JobRecommendationService là bản giả.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MatchEducationStatus, MatchExperienceStatus, MatchResult } from "@sip/shared-types";
import { AppError } from "../../src/shared/errors/AppError";
import type { Logger } from "../../src/shared/logger";
import type { ProfileInsightGenerator } from "../../src/shared/ports/ProfileInsightGenerator";
import { PROFILE_COMPLETENESS_ITEMS } from "../../src/modules/candidate-insights/candidate-insights.config";
import type { CandidateInsightsRepository } from "../../src/modules/candidate-insights/candidate-insights.repository";
import { CandidateInsightsService } from "../../src/modules/candidate-insights/candidate-insights.service";
import type { CandidateInsightRateLimitService } from "../../src/modules/candidate-insights/candidate-insight-rate-limit.service";
import {
  buildCompletenessItems,
  computeCompletenessScore,
  needsTopMatchesForNextStep,
  pickNextStep,
  type ProfileCompletenessFacts,
} from "../../src/modules/candidate-insights/profile-completeness.util";
import type { JobRecommendationService } from "../../src/modules/job-matching/job-recommendation.service";

const FULL: ProfileCompletenessFacts = {
  skills: true,
  cv: true,
  outreach: true,
  experience: true,
  projects: true,
  headlineOrBio: true,
  educationMajor: true,
  city: true,
};

const facts = (missing: Array<keyof ProfileCompletenessFacts>): ProfileCompletenessFacts => ({
  ...FULL,
  ...Object.fromEntries(missing.map((key) => [key, false])),
});

/** Chỉ hai trường "Nên làm trước" đọc; phần còn lại của MatchResult không cần. */
function match(experience: MatchExperienceStatus, education: MatchEducationStatus): MatchResult {
  return { experience: { status: experience }, education: { status: education } } as MatchResult;
}

/** `n` tin cần kinh nghiệm mà hồ sơ chưa có, `m` tin ghi ngành mà hồ sơ chưa chọn ngành, đủ 10 tin. */
function topTen(experienceUnknown: number, educationUnknown: number): MatchResult[] {
  return Array.from({ length: 10 }, (_, index) =>
    match(index < experienceUnknown ? "UNKNOWN" : "NOT_REQUIRED", index < educationUnknown ? "UNKNOWN" : "NOT_REQUIRED"),
  );
}

test("trọng số theo Q2/Q6: tám mục, tổng 100, thứ tự GATE → MATCH → FILTER", () => {
  assert.deepEqual(
    PROFILE_COMPLETENESS_ITEMS.map((item) => [item.key, item.weight, item.group]),
    [
      ["skills", 30, "GATE"],
      ["cv", 15, "GATE"],
      ["outreach", 10, "GATE"],
      ["experience", 15, "MATCH"],
      ["projects", 10, "MATCH"],
      ["headlineOrBio", 5, "MATCH"],
      ["educationMajor", 10, "MATCH"],
      ["city", 5, "FILTER"],
    ],
  );
  assert.equal(computeCompletenessScore(FULL), 100);
});

test("điểm = tổng trọng số mục đã có; items giữ đủ tám mục kèm done", () => {
  // Hồ sơ Q7 (ung-vien-0248): đủ mọi mục trừ kinh nghiệm ⇒ 85.
  assert.equal(computeCompletenessScore(facts(["experience"])), 85);
  assert.equal(computeCompletenessScore(facts(Object.keys(FULL) as Array<keyof ProfileCompletenessFacts>)), 0);
  const items = buildCompletenessItems(facts(["cv", "city"]));
  assert.equal(items.length, 8);
  assert.deepEqual(
    items.filter((item) => !item.done).map((item) => item.key),
    ["cv", "city"],
  );
});

test("nextStep: thiếu kỹ năng ⇒ luôn là kỹ năng, không bằng chứng", () => {
  assert.deepEqual(pickNextStep(facts(["skills", "experience"]), topTen(10, 10)), { key: "skills", evidence: null });
});

test("nextStep: ≥ 3/10 tin cần kinh nghiệm ⇒ kinh nghiệm kèm số tin, dù CV nặng hơn", () => {
  assert.deepEqual(pickNextStep(facts(["cv", "experience"]), topTen(4, 0)), {
    key: "experience",
    evidence: { jobCount: 4, ofJobs: 10 },
  });
});

test("nextStep: cả hai có bằng chứng ⇒ mục nhiều tin hơn; hoà ⇒ theo thứ tự (kinh nghiệm trước)", () => {
  assert.deepEqual(pickNextStep(facts(["experience", "educationMajor"]), topTen(3, 5)), {
    key: "educationMajor",
    evidence: { jobCount: 5, ofJobs: 10 },
  });
  assert.deepEqual(pickNextStep(facts(["experience", "educationMajor"]), topTen(4, 4)), {
    key: "experience",
    evidence: { jobCount: 4, ofJobs: 10 },
  });
});

test("nextStep: dưới 3 tin ⇒ không dùng bằng chứng, chọn mục thiếu nặng nhất (hoà theo thứ tự)", () => {
  assert.deepEqual(pickNextStep(facts(["cv", "experience"]), topTen(2, 0)), { key: "cv", evidence: null });
  // CV 15 và kinh nghiệm 15 hoà ⇒ CV đứng trước trong bảng.
  assert.deepEqual(pickNextStep(facts(["experience", "cv"]), []), { key: "cv", evidence: null });
  assert.deepEqual(pickNextStep(facts(["city", "headlineOrBio"]), []), { key: "headlineOrBio", evidence: null });
});

test("nextStep: UNKNOWN chỉ tính cho mục còn thiếu", () => {
  // Đã có kinh nghiệm (không ghi ngày ⇒ matcher vẫn UNKNOWN) ⇒ không chọn kinh nghiệm.
  assert.deepEqual(pickNextStep(facts(["projects"]), topTen(8, 0)), { key: "projects", evidence: null });
});

test("nextStep: đủ tám mục ⇒ null", () => {
  assert.equal(pickNextStep(FULL, topTen(10, 10)), null);
});

test("needsTopMatchesForNextStep: chỉ khi có kỹ năng và thiếu kinh nghiệm hoặc ngành", () => {
  assert.equal(needsTopMatchesForNextStep(facts(["experience"])), true);
  assert.equal(needsTopMatchesForNextStep(facts(["educationMajor"])), true);
  assert.equal(needsTopMatchesForNextStep(facts(["skills", "experience"])), false);
  assert.equal(needsTopMatchesForNextStep(facts(["cv", "city"])), false);
  assert.equal(needsTopMatchesForNextStep(FULL), false);
});

function setupService(found: ProfileCompletenessFacts | null, topMatches: MatchResult[] = []) {
  const topMatchCalls: unknown[] = [];
  const service = new CandidateInsightsService({
    candidateInsightsRepository: {
      findCandidateIdByUserId: async (userId: string) => (userId === "u1" ? "c1" : null),
      loadCompletenessFacts: async () => found,
    } as unknown as CandidateInsightsRepository,
    candidateInsightRateLimitService: {} as CandidateInsightRateLimitService,
    jobRecommendationService: {
      getTopMatchResults: async (candidateId: string, options: unknown) => {
        topMatchCalls.push({ candidateId, options });
        return topMatches;
      },
    } as unknown as JobRecommendationService,
    profileInsightGenerator: {} as ProfileInsightGenerator,
    logger: {} as Logger,
  });
  return { service, topMatchCalls };
}

test("service: thiếu kinh nghiệm ⇒ đọc trang đầu (10 tin, ≥ 20) để lấy bằng chứng", async () => {
  const { service, topMatchCalls } = setupService(facts(["experience"]), topTen(4, 0));
  const result = await service.completenessForUser("u1");
  assert.equal(result.score, 85);
  assert.deepEqual(result.nextStep, { key: "experience", evidence: { jobCount: 4, ofJobs: 10 } });
  assert.deepEqual(topMatchCalls, [{ candidateId: "c1", options: { limit: 10, minScore: 20 } }]);
});

test("service: không cần bằng chứng ⇒ không chấm trang đầu", async () => {
  const { service, topMatchCalls } = setupService(facts(["skills", "cv"]));
  const result = await service.completenessForUser("u1");
  assert.equal(result.score, 55);
  assert.deepEqual(result.nextStep, { key: "skills", evidence: null });
  assert.equal(topMatchCalls.length, 0);
});

test("service: không có hồ sơ ứng viên ⇒ 404", async () => {
  const { service } = setupService(null);
  for (const userId of ["u1", "u-missing"]) {
    await assert.rejects(
      () => service.completenessForUser(userId),
      (error: unknown) => error instanceof AppError && error.statusCode === 404,
    );
  }
});
