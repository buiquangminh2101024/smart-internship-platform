// Chạy: node --import tsx --test tests/unit/scoring-job-matcher.test.ts (từ apps/server)
// Bảng T1–T13: docs/06-backend/job-matcher-phase1/PLAN.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CandidateMatchProfile, JobMatchProfile } from "../../src/shared/ports/JobMatcher";
import { RULE_WEIGHTS_V1 } from "../../src/modules/job-matching/job-matching.config";
import { ScoringJobMatcher } from "../../src/modules/job-matching/scoring-job-matcher";

const matcher = new ScoringJobMatcher(RULE_WEIGHTS_V1);

const FULL = { hasSkills: true, hasWorkExperience: true, hasEducation: true, hasHeadlineOrBio: true };

function candidate(
  skillIds: string[],
  overrides: Partial<CandidateMatchProfile> = {},
): CandidateMatchProfile {
  return {
    candidateId: "c1",
    skills: skillIds.map((skillId) => ({ skillId, name: skillId, yearsOfExperience: 1 })),
    totalExperienceYears: null,
    educations: [],
    completeness: FULL,
    ...overrides,
  };
}

function job(required: string[], preferred: string[] = [], minExperienceYears: number | null = null): JobMatchProfile {
  return {
    jobPostId: "j1",
    skills: [
      ...required.map((skillId) => ({ skillId, name: skillId, importance: "REQUIRED" as const })),
      ...preferred.map((skillId) => ({ skillId, name: skillId, importance: "PREFERRED" as const })),
    ],
    minExperienceYears,
  };
}

function run(cand: CandidateMatchProfile, jobProfile: JobMatchProfile) {
  return matcher.match({ candidate: cand, job: jobProfile, semanticSimilarity: null });
}

function component(result: ReturnType<typeof run>, key: string) {
  return result.components.find((item) => item.key === key)!;
}

test("T1 — đủ mọi kỹ năng bắt buộc và ưu tiên → 100", () => {
  const result = run(candidate(["java", "spring", "docker"]), job(["java", "spring"], ["docker"]));
  assert.equal(result.status, "SCORED");
  assert.equal(result.score, 100);
});

test("T2 — thiếu 1/3 bắt buộc, có 1/1 ưu tiên, không yêu cầu năm → 73 (chia lại trọng số)", () => {
  const result = run(candidate(["java", "spring", "docker"]), job(["java", "spring", "postgres"], ["docker"]));
  assert.equal(result.score, 73);
  assert.deepEqual(
    result.skills.filter((skill) => skill.status === "MISSING").map((skill) => skill.skillId),
    ["postgres"],
  );
});

test("T3 — thiếu kỹ năng ưu tiên bị trừ ít hơn nhiều so với thiếu kỹ năng bắt buộc", () => {
  const jobProfile = job(["a", "b"], ["c", "d"]);
  const missingPreferred = run(candidate(["a", "b"]), jobProfile).score!;
  const missingRequired = run(candidate(["a", "c", "d"]), jobProfile).score!;
  assert.equal(missingPreferred, 80);
  assert.equal(missingRequired, 60);
  assert.ok(100 - missingPreferred < 100 - missingRequired);
});

test("T4 — tin yêu cầu 1 năm, ứng viên 2 năm → MATCH, thành phần = 1", () => {
  const result = run(candidate(["a"], { totalExperienceYears: 2 }), job(["a"], [], 1));
  assert.equal(result.experience.status, "MATCH");
  assert.equal(component(result, "experience").score, 1);
  assert.equal(result.score, 100);
});

test("T5 — tin yêu cầu 1 năm, ứng viên 0.5 năm → PARTIAL, thành phần = 0.5", () => {
  const result = run(candidate(["a"], { totalExperienceYears: 0.5 }), job(["a"], [], 1));
  assert.equal(result.experience.status, "PARTIAL");
  assert.equal(component(result, "experience").score, 0.5);
  // (0.60×1 + 0.25×0.5) / 0.85 = 0.853
  assert.equal(result.score, 85);
});

test("BELOW — ứng viên dưới 50% số năm yêu cầu", () => {
  const result = run(candidate(["a"], { totalExperienceYears: 0.4 }), job(["a"], [], 1));
  assert.equal(result.experience.status, "BELOW");
});

test("T6 — tin yêu cầu năm, ứng viên không xác định được → UNKNOWN, không áp dụng (không phải 0)", () => {
  const result = run(candidate(["a"], { totalExperienceYears: null }), job(["a"], [], 1));
  assert.equal(result.experience.status, "UNKNOWN");
  const experience = component(result, "experience");
  assert.equal(experience.applicable, false);
  assert.equal(experience.effectiveWeight, 0);
  assert.equal(result.score, 100);
});

test("T7 — tin không yêu cầu năm → NOT_REQUIRED, trọng số chia lại như T2", () => {
  const result = run(candidate(["a"], { totalExperienceYears: 3 }), job(["a", "b"], ["c"]));
  assert.equal(result.experience.status, "NOT_REQUIRED");
  assert.equal(component(result, "experience").applicable, false);
  assert.equal(component(result, "requiredSkills").effectiveWeight, 0.6 / 0.75);
  assert.equal(component(result, "preferredSkills").effectiveWeight, 0.15 / 0.75);
});

test("T8 — ứng viên chưa có kỹ năng → INSUFFICIENT_PROFILE, score = null", () => {
  const result = run(candidate([], { totalExperienceYears: 2 }), job(["a"], [], 1));
  assert.equal(result.status, "INSUFFICIENT_PROFILE");
  assert.equal(result.score, null);
});

test("T8b — hồ sơ trống VÀ tin trống → INSUFFICIENT_PROFILE được kiểm trước", () => {
  const result = run(candidate([]), job([]));
  assert.equal(result.status, "INSUFFICIENT_PROFILE");
});

test("T9 — tin không có kỹ năng và không yêu cầu năm → INSUFFICIENT_JOB_DATA", () => {
  const result = run(candidate(["a"], { totalExperienceYears: 2 }), job([]));
  assert.equal(result.status, "INSUFFICIENT_JOB_DATA");
  assert.equal(result.score, null);
});

test("T10 — tin chỉ có kỹ năng ưu tiên → vẫn chấm, requiredSkills không áp dụng", () => {
  const result = run(candidate(["a"]), job([], ["a", "b"]));
  assert.equal(result.status, "SCORED");
  assert.equal(component(result, "requiredSkills").applicable, false);
  assert.equal(result.score, 50);
});

test("T11 — kỹ năng khớp có yearsOfExperience = 0 → candidateYears = null (chưa khai)", () => {
  const cand = candidate([], {
    skills: [
      { skillId: "a", name: "a", yearsOfExperience: 0 },
      { skillId: "b", name: "b", yearsOfExperience: 2 },
    ],
  });
  const result = run(cand, job(["a", "b"]));
  assert.equal(result.skills.find((skill) => skill.skillId === "a")!.candidateYears, null);
  assert.equal(result.skills.find((skill) => skill.skillId === "b")!.candidateYears, 2);
});

test("T12 — độ tin cậy theo số mục hồ sơ đã điền: 4/2/0 → HIGH/MEDIUM/LOW", () => {
  const jobProfile = job(["a"]);
  assert.equal(run(candidate(["a"]), jobProfile).confidence, "HIGH");
  const two = { hasSkills: true, hasWorkExperience: false, hasEducation: true, hasHeadlineOrBio: false };
  assert.equal(run(candidate(["a"], { completeness: two }), jobProfile).confidence, "MEDIUM");
  const none = { hasSkills: false, hasWorkExperience: false, hasEducation: false, hasHeadlineOrBio: false };
  const low = run(candidate(["a"], { completeness: none }), jobProfile);
  assert.equal(low.confidence, "LOW");
  // Thiếu dữ liệu giảm độ tin cậy, không trừ điểm.
  assert.equal(low.score, 100);
});

test("T13 — HẠN CHẾ D2 CÓ CHỦ ĐÍCH: kinh nghiệm không liên quan nhưng đủ năm vẫn MATCH", () => {
  // Ứng viên 3 năm làm phục vụ nhà hàng, tin Backend yêu cầu 2 năm. GĐ1 chỉ
  // cộng tổng thời gian làm việc, không biết công việc có liên quan hay không —
  // đây KHÔNG phải bug; GĐ3 sửa bằng số năm theo từng kỹ năng.
  const result = run(candidate(["java"], { totalExperienceYears: 3 }), job(["java"], [], 2));
  assert.equal(result.experience.status, "MATCH");
  assert.ok(result.notes.some((note) => note.includes("chưa xét mức liên quan")));
});

test("GĐ1 — semantic luôn tắt và chưa có", () => {
  const result = run(candidate(["a"]), job(["a"]));
  assert.deepEqual(result.semantic, { enabled: false, available: false, similarity: null, normalized: null });
  assert.equal(result.weightsVersion, "rule-v1");
});
