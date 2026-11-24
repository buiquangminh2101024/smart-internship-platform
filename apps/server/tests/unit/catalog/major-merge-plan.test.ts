// Chạy: node --import tsx --test tests/unit/catalog/major-merge-plan.test.ts (từ apps/server)
import { test } from "node:test";
import assert from "node:assert/strict";
import { planJobPostMajorMerge } from "../../../src/modules/education-catalog/major-merge-plan";

test("Tin chỉ có nguồn PRIMARY → tạo đích PRIMARY", () => {
  const plan = planJobPostMajorMerge([{ jobPostId: "job-1", relevance: "PRIMARY" }], []);
  assert.deepEqual(plan.creates, [{ jobPostId: "job-1", relevance: "PRIMARY" }]);
  assert.deepEqual(plan.promoteToPrimary, []);
});

test("Tin chỉ có nguồn RELATED → tạo đích RELATED", () => {
  const plan = planJobPostMajorMerge([{ jobPostId: "job-1", relevance: "RELATED" }], []);
  assert.deepEqual(plan.creates, [{ jobPostId: "job-1", relevance: "RELATED" }]);
  assert.deepEqual(plan.promoteToPrimary, []);
});

test("Nguồn PRIMARY, đích RELATED trên cùng tin → nâng đích lên PRIMARY", () => {
  const plan = planJobPostMajorMerge(
    [{ jobPostId: "job-1", relevance: "PRIMARY" }],
    [{ jobPostId: "job-1", relevance: "RELATED" }],
  );
  assert.deepEqual(plan.creates, []);
  assert.deepEqual(plan.promoteToPrimary, ["job-1"]);
});

test("Nguồn RELATED, đích PRIMARY trên cùng tin → giữ nguyên", () => {
  const plan = planJobPostMajorMerge(
    [{ jobPostId: "job-1", relevance: "RELATED" }],
    [{ jobPostId: "job-1", relevance: "PRIMARY" }],
  );
  assert.deepEqual(plan.creates, []);
  assert.deepEqual(plan.promoteToPrimary, []);
});

test("Cùng mức trên cùng tin → giữ nguyên", () => {
  const plan = planJobPostMajorMerge(
    [{ jobPostId: "job-1", relevance: "RELATED" }],
    [{ jobPostId: "job-1", relevance: "RELATED" }],
  );
  assert.deepEqual(plan.creates, []);
  assert.deepEqual(plan.promoteToPrimary, []);
});

test("Nguồn không có liên kết → không làm gì", () => {
  const plan = planJobPostMajorMerge([], [{ jobPostId: "job-1", relevance: "PRIMARY" }]);
  assert.deepEqual(plan.creates, []);
  assert.deepEqual(plan.promoteToPrimary, []);
});

test("Nhiều tin trộn lẫn → mỗi tin xử lý riêng", () => {
  const plan = planJobPostMajorMerge(
    [
      { jobPostId: "job-1", relevance: "PRIMARY" },
      { jobPostId: "job-2", relevance: "PRIMARY" },
      { jobPostId: "job-3", relevance: "RELATED" },
    ],
    [
      { jobPostId: "job-2", relevance: "RELATED" },
      { jobPostId: "job-3", relevance: "PRIMARY" },
    ],
  );
  assert.deepEqual(plan.creates, [{ jobPostId: "job-1", relevance: "PRIMARY" }]);
  assert.deepEqual(plan.promoteToPrimary, ["job-2"]);
});
