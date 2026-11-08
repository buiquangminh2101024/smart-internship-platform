// Chạy: node --import tsx --test tests/unit/skill-merge-plan.test.ts (từ apps/server)
// Gộp kỹ năng không được làm mất mức yêu cầu / số năm của tin và hồ sơ
// (docs/06-backend/large-demo-data/PLAN.md, "Gộp kỹ năng trùng").
import { test } from "node:test";
import assert from "node:assert/strict";
import { planSkillMerge, type CandidateSkillLink, type JobPostSkillLink } from "../../src/modules/skills/skill-merge-plan";

function jobs(source: JobPostSkillLink[], target: JobPostSkillLink[] = []) {
  return planSkillMerge({ jobPosts: source, candidates: [] }, { jobPosts: target, candidates: [] });
}

function candidates(source: CandidateSkillLink[], target: CandidateSkillLink[] = []) {
  return planSkillMerge({ jobPosts: [], candidates: source }, { jobPosts: [], candidates: target });
}

test("Tin chỉ có nguồn PREFERRED, có số năm → tạo đích giữ nguyên PREFERRED và số năm", () => {
  const plan = jobs([{ jobPostId: "job-1", importance: "PREFERRED", minYears: 2 }]);
  assert.deepEqual(plan.jobPostCreates, [{ jobPostId: "job-1", importance: "PREFERRED", minYears: 2 }]);
  assert.deepEqual(plan.jobPostUpdates, []);
});

test("Tin chỉ có nguồn REQUIRED, không số năm → tạo đích REQUIRED, minYears null", () => {
  const plan = jobs([{ jobPostId: "job-1", importance: "REQUIRED", minYears: null }]);
  assert.deepEqual(plan.jobPostCreates, [{ jobPostId: "job-1", importance: "REQUIRED", minYears: null }]);
});

test("Nguồn REQUIRED, đích PREFERRED trên cùng tin → nâng đích lên REQUIRED", () => {
  const plan = jobs(
    [{ jobPostId: "job-1", importance: "REQUIRED", minYears: null }],
    [{ jobPostId: "job-1", importance: "PREFERRED", minYears: null }],
  );
  assert.deepEqual(plan.jobPostCreates, []);
  assert.deepEqual(plan.jobPostUpdates, [{ jobPostId: "job-1", importance: "REQUIRED", minYears: null }]);
});

test("Nguồn PREFERRED, đích REQUIRED trên cùng tin → giữ nguyên", () => {
  const plan = jobs(
    [{ jobPostId: "job-1", importance: "PREFERRED", minYears: null }],
    [{ jobPostId: "job-1", importance: "REQUIRED", minYears: null }],
  );
  assert.deepEqual(plan.jobPostUpdates, []);
});

test("Đích chưa có số năm, nguồn có → lấy số năm của nguồn", () => {
  const plan = jobs(
    [{ jobPostId: "job-1", importance: "PREFERRED", minYears: 1.5 }],
    [{ jobPostId: "job-1", importance: "REQUIRED", minYears: null }],
  );
  assert.deepEqual(plan.jobPostUpdates, [{ jobPostId: "job-1", importance: "REQUIRED", minYears: 1.5 }]);
});

test("Đích đã có số năm → giữ số năm của đích dù nguồn khác", () => {
  const plan = jobs(
    [{ jobPostId: "job-1", importance: "REQUIRED", minYears: 3 }],
    [{ jobPostId: "job-1", importance: "REQUIRED", minYears: 1 }],
  );
  assert.deepEqual(plan.jobPostUpdates, []);
});

test("Nhiều tin trộn lẫn → mỗi tin xử lý riêng", () => {
  const plan = jobs(
    [
      { jobPostId: "job-1", importance: "PREFERRED", minYears: null },
      { jobPostId: "job-2", importance: "REQUIRED", minYears: 2 },
      { jobPostId: "job-3", importance: "PREFERRED", minYears: null },
    ],
    [
      { jobPostId: "job-2", importance: "PREFERRED", minYears: null },
      { jobPostId: "job-3", importance: "REQUIRED", minYears: 1 },
    ],
  );
  assert.deepEqual(plan.jobPostCreates, [{ jobPostId: "job-1", importance: "PREFERRED", minYears: null }]);
  assert.deepEqual(plan.jobPostUpdates, [{ jobPostId: "job-2", importance: "REQUIRED", minYears: 2 }]);
});

test("Hồ sơ chỉ có nguồn → tạo đích với cùng số năm", () => {
  const plan = candidates([{ candidateId: "c-1", yearsOfExperience: 2 }]);
  assert.deepEqual(plan.candidateCreates, [{ candidateId: "c-1", yearsOfExperience: 2 }]);
  assert.deepEqual(plan.candidateUpdates, []);
});

test("Hồ sơ có cả hai, nguồn nhiều năm hơn → nâng số năm của đích", () => {
  const plan = candidates([{ candidateId: "c-1", yearsOfExperience: 3 }], [{ candidateId: "c-1", yearsOfExperience: 1 }]);
  assert.deepEqual(plan.candidateCreates, []);
  assert.deepEqual(plan.candidateUpdates, [{ candidateId: "c-1", yearsOfExperience: 3 }]);
});

test("Hồ sơ có cả hai, đích nhiều năm hơn hoặc bằng → giữ nguyên", () => {
  const plan = candidates(
    [
      { candidateId: "c-1", yearsOfExperience: 1 },
      { candidateId: "c-2", yearsOfExperience: 2 },
    ],
    [
      { candidateId: "c-1", yearsOfExperience: 3 },
      { candidateId: "c-2", yearsOfExperience: 2 },
    ],
  );
  assert.deepEqual(plan.candidateCreates, []);
  assert.deepEqual(plan.candidateUpdates, []);
});

test("Nguồn không có liên kết → không làm gì", () => {
  const plan = planSkillMerge(
    { jobPosts: [], candidates: [] },
    { jobPosts: [{ jobPostId: "job-1", importance: "REQUIRED", minYears: null }], candidates: [{ candidateId: "c-1", yearsOfExperience: 1 }] },
  );
  assert.deepEqual(plan, { jobPostCreates: [], jobPostUpdates: [], candidateCreates: [], candidateUpdates: [] });
});
