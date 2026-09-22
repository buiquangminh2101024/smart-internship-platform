// Chạy: node --import tsx --test tests/unit/match-demo-fixture.test.ts (từ apps/server)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseYearMonth,
  splitOfPair,
  validateMatchDemoFixture,
  type DemoCatalog,
  type MatchDemoFixture,
} from "../../scripts/lib/match-demo-fixture";

const catalog: DemoCatalog = {
  skills: ["React", "Node.js", "SQL", "Figma", "Giao tiếp"],
  majors: ["Công nghệ thông tin", "Marketing", "Kế toán"],
};

/** Fixture hợp lệ tối thiểu: 12 hồ sơ, 6 tin, 30 cặp (mỗi tin 5), ba kiểu ca khó ở hồ sơ + một ở tin. */
function validFixture(): MatchDemoFixture {
  const hard = ["irrelevant-experience", "adjacent-field", "synonym-skill"] as const;
  const candidates = Array.from({ length: 12 }, (_, i) => ({
    ref: `cand-${i}`,
    headline: `Sinh viên ${i}`,
    bio: "Sinh viên năm cuối, muốn thực tập.",
    ...(i < 3 ? { hardCase: hard[i] } : {}),
    skills: [{ name: "React", yearsOfExperience: 1 }],
    educations: [{ majorName: "Công nghệ thông tin", degree: "Đại học", startYear: 2022, endYear: 2026, isCurrent: true }],
    workExperiences: [{ company: "Công ty A", position: "Thực tập sinh", start: "2025-06", end: null, isCurrent: true, description: "Làm giao diện." }],
    projects: [{ name: "Web bán hàng", description: "Đồ án môn học.", start: "2025-01", end: "2025-05" }],
  }));
  const jobs = Array.from({ length: 6 }, (_, i) => ({
    title: `Thực tập sinh ${i}`,
    description: "Tham gia phát triển sản phẩm.",
    requirements: "Sinh viên năm 3, 4.",
    minExperienceYears: null,
    ...(i === 0 ? { hardCase: "abbreviated-jd" as const } : {}),
    split: i < 4 ? ("dev" as const) : ("test" as const),
    skills: [{ name: "React", importance: "REQUIRED" as const }],
  }));
  const pairsToLabel = jobs.flatMap((job, j) =>
    Array.from({ length: 5 }, (_, k) => ({
      candidateRef: `cand-${(j * 2 + k) % 12}`,
      jobTitle: job.title,
      category: "same-domain" as const,
    })),
  );
  return { extraSkills: ["Vue.js"], jobs, candidates, pairsToLabel };
}

const check = (fixture: unknown) => validateMatchDemoFixture(fixture, catalog);
const errorsOf = (fixture: unknown) => check(fixture).errors.join("\n");

test("Fixture hợp lệ: không lỗi, trả lại fixture", () => {
  const result = check(validFixture());
  assert.deepEqual(result.errors, []);
  assert.notEqual(result.fixture, null);
});

test("Sai hình dạng (thiếu trường, trường lạ) bị từ chối, nêu đường dẫn", () => {
  const missing = validFixture() as unknown as Record<string, unknown>;
  delete missing.jobs;
  assert.match(errorsOf(missing), /jobs/);

  const extra = validFixture();
  (extra.candidates[0] as unknown as Record<string, unknown>).phone = "0900000000";
  assert.equal(check(extra).fixture, null);
});

test("Kỹ năng lạ hoặc sai một ký tự so với catalog bị chỉ đích danh", () => {
  const fixture = validFixture();
  fixture.candidates[0]!.skills = [{ name: "Kế toán tổng hợp", yearsOfExperience: 1 }];
  fixture.jobs[0]!.skills = [{ name: "react", importance: "REQUIRED" }];
  const errors = errorsOf(fixture);
  assert.match(errors, /"Kế toán tổng hợp" không có trong catalog hoặc extraSkills/);
  assert.match(errors, /"react" gần giống "React"/);
});

test("Kỹ năng trong extraSkills dùng được; extraSkills trùng catalog hoặc lặp bị từ chối", () => {
  const ok = validFixture();
  ok.candidates[0]!.skills.push({ name: "Vue.js", yearsOfExperience: 0.5 });
  assert.deepEqual(check(ok).errors, []);

  const dup = validFixture();
  dup.extraSkills = ["react", "Vue.js", "vue.js"];
  const errors = errorsOf(dup);
  assert.match(errors, /"react" trùng kỹ năng đã có trong catalog/);
  assert.match(errors, /"vue\.js" bị lặp/);
});

test("Ngành học phải đúng tên catalog Major", () => {
  const fixture = validFixture();
  fixture.candidates[0]!.educations[0]!.majorName = "CNTT";
  assert.match(errorsOf(fixture), /ngành "CNTT" không có trong catalog Major/);
});

test("Hồ sơ không kỹ năng, tin không có kỹ năng REQUIRED, ref/tiêu đề lặp", () => {
  const fixture = validFixture();
  fixture.candidates[0]!.skills = [];
  fixture.jobs[1]!.skills = [{ name: "SQL", importance: "PREFERRED" }];
  fixture.candidates[2]!.ref = fixture.candidates[1]!.ref;
  fixture.jobs[3]!.title = fixture.jobs[2]!.title;
  const errors = errorsOf(fixture);
  assert.match(errors, /cand-0\]: phải có ít nhất 1 kỹ năng/);
  assert.match(errors, /Thực tập sinh 1\]: phải có ít nhất 1 kỹ năng REQUIRED/);
  assert.match(errors, /ref "cand-1" bị lặp/);
  assert.match(errors, /tiêu đề "Thực tập sinh 2" bị lặp/);
});

test("Ngày tháng mâu thuẫn bị bắt", () => {
  const fixture = validFixture();
  const experience = fixture.candidates[0]!.workExperiences[0]!;
  experience.isCurrent = true;
  experience.end = "2025-08";
  fixture.candidates[1]!.workExperiences[0]!.isCurrent = false; // đã kết thúc mà end null
  fixture.candidates[2]!.projects[0]!.end = "2024-01"; // end < start
  fixture.candidates[3]!.educations[0]!.endYear = 2020; // endYear < startYear
  const errors = errorsOf(fixture);
  assert.match(errors, /isCurrent=true thì end phải null/);
  assert.match(errors, /đã kết thúc nhưng end là null/);
  assert.match(errors, /dự án "Web bán hàng" có end < start/);
  assert.match(errors, /endYear < startYear/);
});

test("Không được chứa email hoặc số điện thoại thật trong văn bản tự do", () => {
  const fixture = validFixture();
  fixture.candidates[0]!.bio = "Liên hệ: ban.a@gmail.com";
  fixture.candidates[1]!.workExperiences[0]!.description = "Gọi 0912345678 để hỏi.";
  fixture.jobs[0]!.description = "Hotline 090 123 4567.";
  const errors = errorsOf(fixture);
  assert.match(errors, /cand-0\]\.bio: có vẻ chứa địa chỉ email/);
  assert.match(errors, /cand-1\]\.work: có vẻ chứa số điện thoại/);
  assert.match(errors, /jobs\[Thực tập sinh 0\]: có vẻ chứa số điện thoại/);
  // Năm và khoảng thời gian thông thường không bị nhầm là số điện thoại.
  const clean = validFixture();
  clean.candidates[0]!.bio = "Học 2022-2026, làm 06/2025 - 09/2025, GPA 3.5.";
  assert.deepEqual(check(clean).errors, []);
});

test("Quy mô: quá ít hồ sơ/tin/cặp; mỗi tin cần đủ cặp", () => {
  const small = validFixture();
  small.candidates = small.candidates.slice(0, 5);
  small.pairsToLabel = small.pairsToLabel.filter((p) => small.candidates.some((c) => c.ref === p.candidateRef));
  const errors = errorsOf(small);
  assert.match(errors, /Số hồ sơ 5 ngoài khoảng/);
  assert.match(errors, /Số cặp cần gán nhãn \d+ ngoài khoảng/);

  const thin = validFixture();
  thin.pairsToLabel = thin.pairsToLabel.filter((p) => p.jobTitle !== "Thực tập sinh 2" || p.candidateRef === "cand-4");
  assert.match(errorsOf(thin), /jobs\[Thực tập sinh 2\]: chỉ 1 cặp, cần ≥ 4/);
});

test("Số cặp: 30–80 hợp lệ, vượt 80 bị từ chối", () => {
  // 12 hồ sơ × 6 tin = 72 cặp khác nhau (đủ để thử trên 50 mà không phải lặp cặp).
  const many = validFixture();
  const all = many.jobs.flatMap((job) => many.candidates.map((c) => ({ candidateRef: c.ref, jobTitle: job.title, category: "same-domain" as const })));
  many.pairsToLabel = many.jobs.flatMap((job) => all.filter((pair) => pair.jobTitle === job.title).slice(0, 10)); // 6 × 10
  assert.equal(many.pairsToLabel.length, 60);
  assert.deepEqual(check(many).errors, []);

  many.pairsToLabel = all; // 72
  assert.deepEqual(check(many).errors, []);

  const tooMany = validFixture();
  tooMany.pairsToLabel = [...all, ...all.slice(0, 9)]; // 81, trong đó 9 cặp lặp
  assert.match(errorsOf(tooMany), /Số cặp cần gán nhãn 81 ngoài khoảng 30–80/);
});

test("Cặp tham chiếu hồ sơ/tin không tồn tại hoặc lặp bị bắt", () => {
  const fixture = validFixture();
  fixture.pairsToLabel[0] = { candidateRef: "ma", jobTitle: "Thực tập sinh 0", category: "same-domain" };
  fixture.pairsToLabel[1] = { candidateRef: "cand-0", jobTitle: "Tin không có", category: "adjacent" };
  fixture.pairsToLabel[3] = { ...fixture.pairsToLabel[2]! };
  const errors = errorsOf(fixture);
  assert.match(errors, /candidateRef "ma" không có/);
  assert.match(errors, /jobTitle "Tin không có" không có/);
  assert.match(errors, /bị lặp/);
});

test("Thiếu ca khó bắt buộc hoặc thiếu một tập dev/test bị bắt", () => {
  const fixture = validFixture();
  delete fixture.candidates[2]!.hardCase; // synonym-skill
  for (const job of fixture.jobs) job.split = "dev";
  const errors = errorsOf(fixture);
  assert.match(errors, /Thiếu ca khó bắt buộc "synonym-skill"/);
  assert.match(errors, /Tập test chỉ có 0 tin/);
});

test("Cảnh báo (không phải lỗi) khi văn bản dài hơn ngưỡng cắt của builder", () => {
  const fixture = validFixture();
  fixture.candidates[0]!.bio = "a".repeat(301);
  fixture.jobs[0]!.requirements = "r".repeat(401);
  fixture.jobs[0]!.description = "d".repeat(301);
  const result = check(fixture);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 3);
});

test("parseYearMonth và splitOfPair", () => {
  assert.equal(parseYearMonth("2024-06").toISOString(), "2024-06-01T00:00:00.000Z");
  const fixture = validFixture();
  assert.equal(splitOfPair(fixture, "Thực tập sinh 0"), "dev");
  assert.equal(splitOfPair(fixture, "Thực tập sinh 5"), "test");
  assert.throws(() => splitOfPair(fixture, "không có"), /Không thấy tin/);
});
