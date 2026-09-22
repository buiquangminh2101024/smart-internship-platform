// Chạy: node --import tsx --test tests/unit/confirmed-requirements.test.ts (từ apps/server)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyConfirmedRequirements,
  validateConfirmedRequirements,
  withoutPhase3Requirements,
} from "../../scripts/lib/confirmed-requirements";
import type { JobMatchProfile } from "../../src/shared/ports/JobMatcher";

const known = {
  jobs: [{ title: "Tin A", skills: ["React", "Git"] }],
  majors: ["Công nghệ thông tin", "Khoa học máy tính"],
};

function validRaw() {
  return {
    description: "demo",
    jobs: [
      {
        jobTitle: "Tin A",
        evidence: "SV CNTT hoặc ngành gần",
        majors: [
          { name: "Công nghệ thông tin", relevance: "PRIMARY" },
          { name: "Khoa học máy tính", relevance: "RELATED" },
        ],
        skillMinYears: { React: 1 },
      },
    ],
  };
}

const job: JobMatchProfile = {
  jobPostId: "job-a",
  skills: [
    { skillId: "s-react", name: "React", importance: "REQUIRED", minYears: 3 },
    { skillId: "s-git", name: "Git", importance: "PREFERRED", minYears: 2 },
  ],
  minExperienceYears: 0.5,
  majors: [{ majorId: "m-old", name: "Cũ", relevance: "PRIMARY" }],
  matchText: "text",
};

test("hợp lệ ⇒ trả dữ liệu, không lỗi", () => {
  const { data, errors } = validateConfirmedRequirements(validRaw(), known);
  assert.deepEqual(errors, []);
  assert.equal(data?.jobs.length, 1);
});

test("tham chiếu sai (tin, ngành, kỹ năng không thuộc tin, lặp) ⇒ liệt kê đủ lỗi", () => {
  const raw = validRaw();
  raw.jobs[0]!.majors.push({ name: "Ngành lạ", relevance: "RELATED" }, { name: "Khoa học máy tính", relevance: "RELATED" });
  raw.jobs[0]!.skillMinYears = { React: 1, Docker: 2 } as never;
  raw.jobs.push({ ...raw.jobs[0]!, jobTitle: "Tin không có" });
  const { data, errors } = validateConfirmedRequirements(raw, known);
  assert.equal(data, null);
  assert.ok(errors.some((e) => e.includes("Ngành lạ")));
  assert.ok(errors.some((e) => e.includes('"Khoa học máy tính" bị lặp')));
  assert.ok(errors.some((e) => e.includes('"Docker" không thuộc')));
  assert.ok(errors.some((e) => e.includes("Tin không có")));
});

test("sai cú pháp (relevance lạ, số năm ≤ 0) ⇒ lỗi schema", () => {
  const raw = validRaw() as { jobs: { majors: { relevance: string }[]; skillMinYears: Record<string, number> }[] };
  raw.jobs[0]!.majors[0]!.relevance = "MAIN";
  raw.jobs[0]!.skillMinYears = { React: 0 };
  const { data, errors } = validateConfirmedRequirements(raw, known);
  assert.equal(data, null);
  assert.ok(errors.length >= 2);
});

test("withoutPhase3Requirements bỏ ngành và số năm, giữ phần còn lại", () => {
  const stripped = withoutPhase3Requirements(job);
  assert.deepEqual(stripped.majors, []);
  assert.deepEqual(stripped.skills.map((s) => s.minYears), [null, null]);
  assert.equal(stripped.minExperienceYears, 0.5);
  assert.equal(job.majors.length, 1, "không sửa đối tượng gốc");
});

test("applyConfirmedRequirements thay toàn bộ tập ngành + số năm; tin không có trong danh sách ⇒ dạng GĐ2", () => {
  const { data } = validateConfirmedRequirements(validRaw(), known);
  const ids = new Map([
    ["Công nghệ thông tin", "m-cntt"],
    ["Khoa học máy tính", "m-khmt"],
  ]);
  const applied = applyConfirmedRequirements(job, data!.jobs[0], ids);
  assert.deepEqual(applied.majors, [
    { majorId: "m-cntt", name: "Công nghệ thông tin", relevance: "PRIMARY" },
    { majorId: "m-khmt", name: "Khoa học máy tính", relevance: "RELATED" },
  ]);
  assert.deepEqual(applied.skills.map((s) => s.minYears), [1, null]);

  const untouched = applyConfirmedRequirements(job, undefined, ids);
  assert.deepEqual(untouched.majors, []);
  assert.deepEqual(untouched.skills.map((s) => s.minYears), [null, null]);
});
