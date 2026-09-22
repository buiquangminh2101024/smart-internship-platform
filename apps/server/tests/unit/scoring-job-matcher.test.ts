// Chạy: node --import tsx --test tests/unit/scoring-job-matcher.test.ts (từ apps/server)
// Bảng T1–T13: docs/06-backend/job-matcher-phase1/PLAN.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CandidateMatchProfile, JobMatchProfile } from "../../src/shared/ports/JobMatcher";
import {
  EMBEDDING_ONLY_WEIGHTS_V1,
  HYBRID_WEIGHTS_V1,
  HYBRID_WEIGHTS_V2,
  RELATED_MAJOR_SCORE,
  RULE_WEIGHTS_V1,
  SEMANTIC_CALIBRATION,
} from "../../src/modules/job-matching/job-matching.config";
import { markSemanticPending, ScoringJobMatcher } from "../../src/modules/job-matching/scoring-job-matcher";

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
    matchText: "",
    ...overrides,
  };
}

function job(required: string[], preferred: string[] = [], minExperienceYears: number | null = null): JobMatchProfile {
  return {
    jobPostId: "j1",
    skills: [
      ...required.map((skillId) => ({ skillId, name: skillId, importance: "REQUIRED" as const, minYears: null })),
      ...preferred.map((skillId) => ({ skillId, name: skillId, importance: "PREFERRED" as const, minYears: null })),
    ],
    minExperienceYears,
    majors: [],
    matchText: "",
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

// ─── GĐ2: thành phần semantic (docs/06-backend/job-matcher-phase2/PLAN.md) ────

const CALIBRATION_EXAMPLE = { lo: 0.25, hi: 0.75 };
const hybrid = new ScoringJobMatcher(HYBRID_WEIGHTS_V1, CALIBRATION_EXAMPLE);
const embeddingOnly = new ScoringJobMatcher(EMBEDDING_ONLY_WEIGHTS_V1, CALIBRATION_EXAMPLE);
// Tin của ví dụ GĐ1 (T2): 2/3 bắt buộc, 1/1 ưu tiên, không yêu cầu năm.
const exampleCandidate = candidate(["java", "spring", "docker"]);
const exampleJob = job(["java", "spring", "postgres"], ["docker"]);

test("S1 — ví dụ tính tay hybrid-v1: cosine 0.62 ⇒ semantic 0.74 ⇒ 74", () => {
  const result = hybrid.match({ candidate: exampleCandidate, job: exampleJob, semanticSimilarity: 0.62 });
  assert.equal(result.status, "SCORED");
  assert.equal(result.weightsVersion, "hybrid-v1");
  assert.equal(result.score, 74);
  const semantic = component(result, "semantic");
  assert.equal(semantic.applicable, true);
  assert.ok(Math.abs(semantic.score! - 0.74) < 1e-9);
  // Σw áp dụng = 0.40 + 0.10 + 0.30 = 0.80 (experience, education bị chia lại).
  assert.ok(Math.abs(semantic.effectiveWeight - 0.3 / 0.8) < 1e-9);
  assert.equal(component(result, "education").applicable, false);
  assert.equal(result.semantic.enabled, true);
  assert.equal(result.semantic.available, true);
  assert.equal(result.semantic.similarity, 0.62);
  assert.ok(Math.abs(result.semantic.normalized! - 0.74) < 1e-9);
  assert.ok(result.notes.some((note) => note.includes("tương đồng nội dung") && note.includes("74/100")));
});

test("S2 — chuẩn hoá bị kẹp trong [0, 1]", () => {
  const semanticOf = (cosine: number) =>
    component(embeddingOnly.match({ candidate: exampleCandidate, job: exampleJob, semanticSimilarity: cosine }), "semantic").score;
  assert.equal(semanticOf(0.1), 0);
  assert.equal(semanticOf(0.25), 0);
  assert.equal(semanticOf(0.75), 1);
  assert.equal(semanticOf(0.95), 1);
  assert.ok(Math.abs(semanticOf(0.5)! - 0.5) < 1e-9);
});

test("S3 — EMBEDDING_ONLY: điểm = semantic × 100", () => {
  const result = embeddingOnly.match({ candidate: exampleCandidate, job: exampleJob, semanticSimilarity: 0.62 });
  assert.equal(result.score, 74);
  assert.equal(result.weightsVersion, "embedding-only-v1");
  assert.equal(component(result, "requiredSkills").applicable, false);
});

test("S4 — cosine null ⇒ semantic không áp dụng (không phải 0), trọng số chia lại", () => {
  const result = hybrid.match({ candidate: exampleCandidate, job: exampleJob, semanticSimilarity: null });
  const semantic = component(result, "semantic");
  assert.equal(semantic.applicable, false);
  assert.equal(semantic.effectiveWeight, 0);
  // (0.40×2/3 + 0.10×1) / 0.50 = 0.733 — cùng tỉ lệ bắt buộc/ưu tiên như rule-v1 (0.60/0.15).
  assert.equal(result.score, 73);
  assert.deepEqual(result.semantic, { enabled: true, available: false, similarity: null, normalized: null });
  assert.ok(result.notes.some((note) => note.includes("chưa tính được mức tương đồng")));
});

test("S5 — EMBEDDING_ONLY + cosine null ⇒ INSUFFICIENT_JOB_DATA, không phải điểm 0", () => {
  const result = embeddingOnly.match({ candidate: exampleCandidate, job: exampleJob, semanticSimilarity: null });
  assert.equal(result.status, "INSUFFICIENT_JOB_DATA");
  assert.equal(result.score, null);
  assert.deepEqual(result.notes, ["Chưa tính được mức tương đồng nội dung nên chưa tính được mức phù hợp."]);
});

test("S6 — rule-v1 bỏ qua cosine: kết quả y hệt khi không có cosine", () => {
  const withoutCosine = run(exampleCandidate, exampleJob);
  const ignored = matcher.match({ candidate: exampleCandidate, job: exampleJob, semanticSimilarity: 0.9 });
  assert.deepEqual(ignored, withoutCosine);
  assert.equal(ignored.score, 73);
});

test("S7 — hồ sơ chưa có kỹ năng vẫn INSUFFICIENT_PROFILE dù có cosine (kiểm hồ sơ trước)", () => {
  const result = hybrid.match({ candidate: candidate([]), job: exampleJob, semanticSimilarity: 0.8 });
  assert.equal(result.status, "INSUFFICIENT_PROFILE");
});

test("S8 — tin không kỹ năng, không yêu cầu năm nhưng có cosine ⇒ hybrid chấm bằng semantic", () => {
  const result = hybrid.match({ candidate: candidate(["a"]), job: job([]), semanticSimilarity: 0.5 });
  assert.equal(result.status, "SCORED");
  assert.equal(result.score, 50);
});

test("S9 — calibration mặc định là SEMANTIC_CALIBRATION; hi ≤ lo bị từ chối", () => {
  const result = new ScoringJobMatcher(HYBRID_WEIGHTS_V1).match({
    candidate: exampleCandidate,
    job: exampleJob,
    semanticSimilarity: SEMANTIC_CALIBRATION.hi,
  });
  assert.equal(component(result, "semantic").score, 1);
  assert.throws(() => new ScoringJobMatcher(HYBRID_WEIGHTS_V1, { lo: 0.5, hi: 0.5 }));
});

test("S10 — markSemanticPending: giữ điểm rule-v1, báo semantic bật nhưng chưa có", () => {
  const rule = run(exampleCandidate, exampleJob);
  const pending = markSemanticPending(rule);
  assert.equal(pending.score, rule.score);
  assert.equal(pending.weightsVersion, "rule-v1");
  assert.deepEqual(pending.semantic, { enabled: true, available: false, similarity: null, normalized: null });
  assert.equal(pending.notes.length, rule.notes.length + 1);
  // Không cộng câu semantic vào kết quả chưa chấm được.
  const insufficient = run(candidate([]), exampleJob);
  assert.deepEqual(markSemanticPending(insufficient).notes, insufficient.notes);
});

// ─── GĐ3: số năm theo kỹ năng + học vấn (docs/06-backend/job-matcher-phase3/PLAN.md) ────

function jobWith(
  skills: Array<{ id: string; minYears?: number | null; importance?: "REQUIRED" | "PREFERRED" }>,
  extra: Partial<JobMatchProfile> = {},
): JobMatchProfile {
  return {
    ...job([]),
    skills: skills.map((skill) => ({
      skillId: skill.id,
      name: skill.id,
      importance: skill.importance ?? "REQUIRED",
      minYears: skill.minYears ?? null,
    })),
    ...extra,
  };
}

function withYears(years: Record<string, number>, overrides: Partial<CandidateMatchProfile> = {}): CandidateMatchProfile {
  return candidate([], {
    skills: Object.entries(years).map(([skillId, yearsOfExperience]) => ({ skillId, name: skillId, yearsOfExperience })),
    ...overrides,
  });
}

test("E1 — ví dụ tính tay: tổng 2/1 năm (=1) + Java 1/2 năm (=0.5) ⇒ experience 0.75 ⇒ 93", () => {
  const result = run(
    withYears({ java: 1, spring: 1 }, { totalExperienceYears: 2 }),
    jobWith([{ id: "java", minYears: 2 }, { id: "spring" }], { minExperienceYears: 1 }),
  );
  assert.equal(component(result, "experience").score, 0.75);
  // (0.60×1 + 0.25×0.75) / 0.85 = 0.926
  assert.equal(result.score, 93);
  assert.equal(result.skills.find((skill) => skill.skillId === "java")!.requiredYears, 2);
  assert.equal(result.skills.find((skill) => skill.skillId === "spring")!.requiredYears, null);
  assert.ok(result.notes.some((note) => note.includes("java 1/2 năm")));
});

test("E2 — có kỹ năng nhưng chưa khai năm (D1) ⇒ phần đó bị loại khỏi trung bình, không phải 0", () => {
  const result = run(
    withYears({ java: 0 }, { totalExperienceYears: 2 }),
    jobWith([{ id: "java", minYears: 2 }], { minExperienceYears: 1 }),
  );
  assert.equal(component(result, "experience").score, 1);
  assert.equal(result.score, 100);
  assert.ok(result.notes.some((note) => note.includes("java chưa khai số năm")));
});

test("E3 — thiếu hẳn kỹ năng có số năm ⇒ chỉ bị trừ ở requiredSkills, không phạt hai lần", () => {
  const cand = withYears({ spring: 1 });
  const withMinYears = run(cand, jobWith([{ id: "java", minYears: 2 }, { id: "spring" }]));
  const without = run(cand, jobWith([{ id: "java" }, { id: "spring" }]));
  assert.equal(component(withMinYears, "experience").applicable, false);
  assert.equal(withMinYears.score, 50);
  assert.equal(withMinYears.score, without.score);
  // Kỹ năng thiếu đã có trong câu kỹ năng — không lặp lại ở câu số năm.
  assert.ok(!withMinYears.notes.some((note) => note.startsWith("Số năm theo từng kỹ năng")));
});

test("E4 — chỉ có số năm theo kỹ năng (không yêu cầu tổng) vẫn chấm experience; vượt yêu cầu kẹp ở 1", () => {
  const result = run(
    withYears({ java: 3, react: 0.5 }),
    jobWith([{ id: "java", minYears: 2 }, { id: "react", minYears: 1, importance: "PREFERRED" }]),
  );
  assert.equal(result.experience.status, "NOT_REQUIRED");
  // (min(1, 3/2) + 0.5/1) / 2 = 0.75
  assert.equal(component(result, "experience").score, 0.75);
});

test("E5 — tin cũ không có số năm riêng ⇒ experience y hệt GĐ1", () => {
  const result = run(withYears({ a: 1 }, { totalExperienceYears: 0.5 }), jobWith([{ id: "a" }], { minExperienceYears: 1 }));
  assert.equal(component(result, "experience").score, 0.5);
  assert.equal(result.score, 85);
});

const hybridV2 = new ScoringJobMatcher(HYBRID_WEIGHTS_V2);
const MAJORS: JobMatchProfile["majors"] = [
  { majorId: "m-cs", name: "Khoa học máy tính", relevance: "PRIMARY" },
  { majorId: "m-se", name: "Kỹ thuật phần mềm", relevance: "RELATED" },
];
// 1/2 kỹ năng bắt buộc; không semantic ⇒ chỉ requiredSkills (0.3429) + education (0.0429) áp dụng.
const EDU_JOB = jobWith([{ id: "a" }, { id: "b" }], { majors: MAJORS });

function studying(...majors: Array<{ majorId: string | null; majorName: string | null }>) {
  return candidate(["a"], { educations: majors.map((major) => ({ ...major, degree: "Đại học" })) });
}

function runHybrid(cand: CandidateMatchProfile, jobProfile: JobMatchProfile, scorer: ScoringJobMatcher = hybridV2) {
  return scorer.match({ candidate: cand, job: jobProfile, semanticSimilarity: null });
}

test("ED1 — ba mức ngành: đúng ngành 56 > liên quan 52 > khác ngành 44 (ví dụ tính tay)", () => {
  const primary = runHybrid(studying({ majorId: "m-cs", majorName: "Khoa học máy tính" }), EDU_JOB);
  const related = runHybrid(studying({ majorId: "m-se", majorName: "Kỹ thuật phần mềm" }), EDU_JOB);
  const none = runHybrid(studying({ majorId: "m-biz", majorName: "Quản trị kinh doanh" }), EDU_JOB);
  // (0.3429×0.5 + 0.0429×s) / 0.3858 với s = 1 / 0.65 / 0
  assert.equal(primary.score, 56);
  assert.equal(related.score, 52);
  assert.equal(none.score, 44);
  assert.equal(component(related, "education").score, RELATED_MAJOR_SCORE);
  assert.deepEqual(primary.education, {
    status: "PRIMARY",
    matchedMajorName: "Khoa học máy tính",
    requiredMajors: ["Khoa học máy tính", "Kỹ thuật phần mềm"],
  });
  assert.equal(related.education.status, "RELATED");
  assert.equal(none.education.status, "NONE");
  assert.ok(none.notes.some((note) => note.includes("chưa khớp") && note.includes("Khoa học máy tính")));
});

test("ED2 — chưa có học vấn, hoặc học vấn không gắn ngành trong danh mục ⇒ UNKNOWN, không áp dụng (không phải 0)", () => {
  for (const cand of [studying(), studying({ majorId: null, majorName: null })]) {
    const result = runHybrid(cand, EDU_JOB);
    assert.equal(result.education.status, "UNKNOWN");
    assert.equal(component(result, "education").applicable, false);
    assert.equal(result.score, 50);
  }
});

test("ED3 — xét TOÀN BỘ học vấn: có một bằng đúng ngành là đủ; PRIMARY thắng RELATED", () => {
  const result = runHybrid(
    studying(
      { majorId: "m-biz", majorName: "Quản trị kinh doanh" },
      { majorId: "m-se", majorName: "Kỹ thuật phần mềm" },
      { majorId: "m-cs", majorName: "Khoa học máy tính" },
    ),
    EDU_JOB,
  );
  assert.equal(result.education.status, "PRIMARY");
  assert.equal(result.education.matchedMajorName, "Khoa học máy tính");
});

test("ED4 — tin không nêu ngành ⇒ NOT_REQUIRED, education không áp dụng như GĐ2", () => {
  const result = runHybrid(studying({ majorId: "m-cs", majorName: "Khoa học máy tính" }), jobWith([{ id: "a" }, { id: "b" }]));
  assert.equal(result.education.status, "NOT_REQUIRED");
  assert.equal(component(result, "education").applicable, false);
  assert.equal(result.score, 50);
});

test("ED5 — rule-v1 (education = 0) không đổi điểm và không ghi chú học vấn", () => {
  const cand = studying({ majorId: "m-biz", majorName: "Quản trị kinh doanh" });
  const result = run(cand, EDU_JOB);
  assert.equal(result.score, run(cand, jobWith([{ id: "a" }, { id: "b" }])).score);
  assert.equal(result.education.status, "NONE");
  assert.ok(!result.notes.some((note) => note.includes("ngành")));
});

test("ED6 — relatedMajorScore chỉnh được cho bộ đánh giá; ngoài [0, 1] bị từ chối", () => {
  const low = new ScoringJobMatcher(HYBRID_WEIGHTS_V2, SEMANTIC_CALIBRATION, 0.3);
  const result = runHybrid(studying({ majorId: "m-se", majorName: "Kỹ thuật phần mềm" }), EDU_JOB, low);
  assert.equal(component(result, "education").score, 0.3);
  // (0.17145 + 0.0429×0.3) / 0.3858 = 0.478
  assert.equal(result.score, 48);
  assert.throws(() => new ScoringJobMatcher(HYBRID_WEIGHTS_V2, SEMANTIC_CALIBRATION, 1.5));
});

test("ED7 — tin chỉ có ngành (không kỹ năng/năm): hybrid chấm được, rule-v1 vẫn INSUFFICIENT_JOB_DATA", () => {
  const onlyMajors = jobWith([], { majors: MAJORS });
  const cand = studying({ majorId: "m-cs", majorName: "Khoa học máy tính" });
  const hybridResult = runHybrid(cand, onlyMajors);
  assert.equal(hybridResult.status, "SCORED");
  assert.equal(hybridResult.score, 100);
  assert.equal(run(cand, onlyMajors).status, "INSUFFICIENT_JOB_DATA");
});
