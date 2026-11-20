// Chạy: node --import tsx --test tests/unit/job-quality.test.ts (từ apps/server)
// Bộ chấm điểm chất lượng tin (AD-29, docs/06-backend/job-quality-moderation/PLAN.md bước 2):
// từng quy tắc, ba vùng, cờ chặn, điểm sàn, lý do từ chối tự sinh, mã băm nội dung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRejectReason, contentHash, foldText, scoreJobPost, type JobQualityInput, type JobQualityResult } from "../../src/modules/job-posts/job-quality";

const NOW = new Date("2026-11-20T03:00:00Z");
const DAY = 86_400_000;

// Ví dụ trong plan: 240 ký tự mô tả, có yêu cầu, không quyền lợi, lương 3–5 triệu,
// chưa xác nhận yêu cầu bằng AI, công ty chưa có tin nào được duyệt ⇒ 91 điểm.
const DESCRIPTION_240 = "Tham gia phát triển API cho hệ thống quản lý đơn hàng bằng NodeJS và PostgreSQL. ".repeat(3).slice(0, 240);

function baseInput(overrides: Partial<JobQualityInput> = {}, signals: Partial<JobQualityInput["signals"]> = {}): JobQualityInput {
  return {
    title: "Thực tập sinh Backend NodeJS",
    description: DESCRIPTION_240,
    requirements: "Sinh viên năm 3, năm 4 ngành CNTT; biết JavaScript, hiểu cơ bản về REST API và SQL.",
    benefits: null,
    jobType: "INTERNSHIP",
    salaryMin: 3_000_000,
    salaryMax: 5_000_000,
    isNegotiable: false,
    cityId: "city-hn",
    address: "Số 1 Đại Cồ Việt, Hai Bà Trưng",
    industryId: "ind-it",
    expiresAt: new Date(NOW.getTime() + 30 * DAY),
    submittedAt: NOW,
    minExperienceYears: null,
    requirementsConfirmedAt: null,
    skills: [
      { skillId: "s-node", importance: "REQUIRED", status: "APPROVED" },
      { skillId: "s-sql", importance: "PREFERRED", status: "APPROVED" },
    ],
    majors: [{ majorId: "m-it", relevance: "PRIMARY" }],
    ...overrides,
    signals: {
      resubmittedUnchanged: false,
      rejectionCount: 0,
      companyRetractions: 0,
      companyConfirmedReports: 0,
      companyOpenReports: 0,
      companySubmitCount: 0,
      companyRejectCount: 0,
      companyApprovedCount: 0,
      ...signals,
    },
  };
}

const codes = (r: JobQualityResult) => r.criteria.flatMap((c) => c.issues.map((i) => i.code));
const criterion = (r: JobQualityResult, key: string) => r.criteria.find((c) => c.key === key)!;

test("ví dụ của plan: 91 điểm, đề xuất duyệt", () => {
  assert.equal(DESCRIPTION_240.length, 240);
  const r = scoreJobPost(baseInput(), NOW);
  assert.deepEqual(
    r.criteria.map((c) => [c.key, c.score]),
    [
      ["COMPLETENESS", 80],
      ["CONTENT", 90],
      ["TRANSPARENCY", 100],
      ["INTERNSHIP_FIT", 80],
      ["RISK", 100],
      ["COMPANY", 90],
    ],
  );
  assert.equal(r.score, 91);
  assert.equal(r.band, "SUGGEST_APPROVE");
  assert.deepEqual(r.flags, []);
  assert.equal(r.version, 1);
});

test("cùng tin có 'phí đào tạo': 76 điểm nhưng cờ chặn ⇒ đề xuất từ chối", () => {
  const r = scoreJobPost(baseInput({ description: DESCRIPTION_240 + " Ứng viên nộp phí đào tạo 500k." }), NOW);
  assert.equal(criterion(r, "RISK").score, 40);
  assert.equal(r.score, 76);
  assert.deepEqual(r.flags, ["ASKS_FOR_MONEY"]);
  assert.equal(r.band, "SUGGEST_REJECT");
  assert.match(criterion(r, "RISK").issues[0].message, /"phí đào tạo"/);
});

test("từ khoá đòi tiền khớp cả không dấu, viết hoa", () => {
  for (const text of ["phi ho so 200k", "PHÍ HỒ SƠ 200K", "Yêu cầu đặt   cọc đồng phục"]) {
    const r = scoreJobPost(baseInput({ benefits: text }), NOW);
    assert.ok(codes(r).includes("ASKS_FOR_MONEY"), text);
  }
});

test("phủ định trước từ khoá đòi tiền không bị tính: miễn phí đào tạo, không thu phí hồ sơ", () => {
  for (const text of ["Được đào tạo, miễn phí đào tạo nghiệp vụ", "Công ty không thu phí hồ sơ", "Không cần nộp tiền hay đặt cọc"]) {
    const r = scoreJobPost(baseInput({ benefits: text }), NOW);
    assert.ok(!codes(r).includes("ASKS_FOR_MONEY"), text);
  }
  // Phủ định ở vế khác không che từ khoá phía sau.
  const scam = scoreJobPost(baseInput({ benefits: "Không cần kinh nghiệm. Đặt cọc 500k để nhận việc" }), NOW);
  assert.ok(codes(scam).includes("ASKS_FOR_MONEY"));
});

test("từ khoá khớp theo ranh giới từ: 'zalora' không phải 'zalo'", () => {
  assert.ok(!codes(scoreJobPost(baseInput({ benefits: "Voucher mua sắm Zalora hằng tháng" }), NOW)).includes("OFF_PLATFORM_CONTACT"));
  assert.ok(codes(scoreJobPost(baseInput({ benefits: "Liên hệ Zalo để biết thêm" }), NOW)).includes("OFF_PLATFORM_CONTACT"));
});

test("dụ dỗ và lương thực tập bất thường", () => {
  const r = scoreJobPost(baseInput({ title: "Việc nhẹ lương cao cho sinh viên", salaryMin: 15_000_000, salaryMax: 25_000_000 }), NOW);
  assert.ok(codes(r).includes("TOO_GOOD_TO_BE_TRUE"));
  assert.ok(codes(r).includes("INTERN_SALARY_OUTLIER"));
  // Không phải tin thực tập ⇒ không xét lương bất thường.
  assert.ok(!codes(scoreJobPost(baseInput({ jobType: "FULL_TIME", salaryMax: 40_000_000 }), NOW)).includes("INTERN_SALARY_OUTLIER"));
});

test("tiêu chí 1: thiếu yêu cầu / không kỹ năng bắt buộc / không ngành", () => {
  const r = scoreJobPost(
    baseInput({ requirements: "  ", benefits: "Lương tháng 13", majors: [], skills: [{ skillId: "s1", importance: "PREFERRED", status: "APPROVED" }] }),
    NOW,
  );
  assert.deepEqual(criterion(r, "COMPLETENESS").issues.map((i) => i.code), ["NO_REQUIREMENTS", "NO_REQUIRED_SKILL", "NO_MAJOR"]);
  assert.equal(criterion(r, "COMPLETENESS").score, 30);
  // Yêu cầu trống ⇒ chỉ NO_REQUIREMENTS, không thêm REQUIREMENTS_TOO_SHORT.
  assert.ok(!codes(r).includes("REQUIREMENTS_TOO_SHORT"));
});

test("tiêu chí 2: mô tả ngắn, tiêu đề, liên hệ trong nội dung", () => {
  const r = scoreJobPost(
    baseInput({
      title: "TUYỂN GẤP THỰC TẬP SINH!!!!",
      description: "Làm backend. Gọi 0912 345 678 hoặc gửi CV về hr@congty.vn",
      requirements: "Biết code",
    }),
    NOW,
  );
  const c = criterion(r, "CONTENT");
  assert.deepEqual(c.issues.map((i) => i.code), ["DESCRIPTION_TOO_SHORT", "REQUIREMENTS_TOO_SHORT", "TITLE_SHOUTING", "SPAMMY_FORMAT", "CONTACT_IN_CONTENT"]);
  assert.equal(c.score, 5); // 100 − (35 + 15 + 15 + 10 + 20)
  assert.match(c.issues.find((i) => i.code === "CONTACT_IN_CONTENT")!.message, /số điện thoại/);
});

test("số tiền trong nội dung không bị nhầm là số điện thoại", () => {
  const description = DESCRIPTION_240 + " Thu nhập 8.000.000-10.000.000 đồng, thưởng 0.5 tháng lương, làm 08:00 - 17:00.";
  assert.ok(!codes(scoreJobPost(baseInput({ description }), NOW)).includes("CONTACT_IN_CONTENT"));
  // "ASP.NET", "Node.js" không phải đường link.
  assert.ok(!codes(scoreJobPost(baseInput({ requirements: "Biết ASP.NET Core hoặc Node.js, Vue.js; hiểu Git và SQL Server cơ bản." }), NOW)).includes("CONTACT_IN_CONTENT"));
  assert.ok(codes(scoreJobPost(baseInput({ benefits: "Xem thêm tại www.congty.com" }), NOW)).includes("CONTACT_IN_CONTENT"));
});

test("tiêu chí 3: các trường hợp lương, địa chỉ, hạn nộp", () => {
  const issuesOf = (o: Partial<JobQualityInput>) => criterion(scoreJobPost(baseInput(o), NOW), "TRANSPARENCY").issues.map((i) => i.code);
  assert.deepEqual(issuesOf({ isNegotiable: true, salaryMin: null, salaryMax: null }), ["SALARY_NEGOTIABLE"]);
  assert.deepEqual(issuesOf({ salaryMin: 3_000_000, salaryMax: null }), ["SALARY_ONE_SIDED"]);
  assert.deepEqual(issuesOf({ salaryMin: 2_000_000, salaryMax: 8_000_000 }), ["SALARY_RANGE_WIDE"]);
  assert.deepEqual(issuesOf({ salaryMin: 8_000_000, salaryMax: 5_000_000 }), ["SALARY_INVALID"]);
  assert.deepEqual(issuesOf({ address: "HN" }), ["ADDRESS_VAGUE"]);
  assert.deepEqual(issuesOf({ expiresAt: new Date(NOW.getTime() + 3 * DAY) }), ["DEADLINE_TOO_SOON"]);
  // Hạn nộp tính từ lúc gửi duyệt, không phải lúc chấm lại.
  const later = new Date(NOW.getTime() + 25 * DAY);
  assert.ok(!criterion(scoreJobPost(baseInput(), later), "TRANSPARENCY").issues.length);
});

test("tiêu chí 4: kinh nghiệm chỉ xét tin thực tập; nhiều kỹ năng bắt buộc; kỹ năng chờ duyệt", () => {
  const skills = Array.from({ length: 9 }, (_, i) => ({ skillId: `s${i}`, importance: "REQUIRED" as const, status: i === 0 ? ("PENDING" as const) : ("APPROVED" as const) }));
  const r = scoreJobPost(baseInput({ minExperienceYears: 2, skills, requirementsConfirmedAt: NOW }), NOW);
  assert.deepEqual(criterion(r, "INTERNSHIP_FIT").issues.map((i) => i.code), ["INTERN_EXPERIENCE_HIGH", "TOO_MANY_REQUIRED_SKILLS", "PENDING_SKILLS"]);
  assert.deepEqual(criterion(scoreJobPost(baseInput({ minExperienceYears: 0.5 }), NOW), "INTERNSHIP_FIT").issues.map((i) => i.code), ["INTERN_EXPERIENCE_SOME", "REQUIREMENTS_NOT_CONFIRMED"]);
  assert.ok(!codes(scoreJobPost(baseInput({ jobType: "FULL_TIME", minExperienceYears: 3 }), NOW)).some((c) => c.startsWith("INTERN_")));
});

test("tiêu chí 5: gửi lại không sửa, bị từ chối nhiều lần", () => {
  const r = scoreJobPost(baseInput({}, { resubmittedUnchanged: true, rejectionCount: 3 }), NOW);
  assert.deepEqual(criterion(r, "RISK").issues.map((i) => i.code), ["RESUBMITTED_UNCHANGED", "REJECTED_MANY_TIMES"]);
  assert.equal(criterion(r, "RISK").score, 50);
});

test("tiêu chí 6: trừ theo số lần có trần; công ty bị từ chối nhiều", () => {
  const r = scoreJobPost(baseInput({}, { companyRetractions: 4, companyOpenReports: 1, companyApprovedCount: 5, companySubmitCount: 6, companyRejectCount: 3 }), NOW);
  const c = criterion(r, "COMPANY");
  assert.deepEqual(c.issues.map((i) => [i.code, i.penalty]), [
    ["COMPANY_RETRACTIONS", 75],
    ["COMPANY_OPEN_REPORTS", 10],
    ["COMPANY_HIGH_REJECTION", 20],
  ]);
  assert.equal(c.score, 0);
  // Công ty mới (chưa có lịch sử) chỉ trừ nhẹ.
  assert.deepEqual(criterion(scoreJobPost(baseInput(), NOW), "COMPANY").issues.map((i) => i.code), ["COMPANY_NO_HISTORY"]);
});

test("điểm sàn: tổng ≥ 80 nhưng một tiêu chí < 50 ⇒ cần xem kỹ, không đề xuất duyệt", () => {
  const good = { benefits: "Phụ cấp, laptop", requirementsConfirmedAt: NOW, description: DESCRIPTION_240.repeat(2) };
  const r = scoreJobPost(baseInput(good, { companyApprovedCount: 3, companyRetractions: 3 }), NOW);
  assert.ok(r.score >= 80, `score ${r.score}`);
  assert.equal(criterion(r, "COMPANY").score, 25);
  assert.equal(r.band, "NEEDS_REVIEW");
});

test("vùng từ chối khi tổng < 50", () => {
  const r = scoreJobPost(
    baseInput(
      { title: "VIỆC NHẸ LƯƠNG CAO!!!!", description: "Inbox zalo", requirements: null, benefits: null, majors: [], isNegotiable: true, salaryMin: null, salaryMax: null, address: "HN" },
      { companyRetractions: 3, companyConfirmedReports: 2, rejectionCount: 3, resubmittedUnchanged: true },
    ),
    NOW,
  );
  assert.ok(r.score < 50, `score ${r.score}`);
  assert.equal(r.band, "SUGGEST_REJECT");
  assert.deepEqual(r.flags, []);
});

test("lý do từ chối tự sinh: đúng định dạng RejectJobModal, bỏ tiêu chí 6 và lỗi nhẹ", () => {
  const r = scoreJobPost(baseInput({ description: "Làm backend, đóng phí đào tạo trước khi nhận việc.", isNegotiable: true, salaryMin: null, salaryMax: null }), NOW);
  assert.equal(
    buildRejectReason(r),
    'Thiếu thông tin, Vi phạm chính sách. Chưa có phần quyền lợi; mô tả công việc quá ngắn (50/150 ký tự); nội dung có dấu hiệu yêu cầu ứng viên nộp tiền ("phí đào tạo").',
  );
  // Chỉ có lỗi không đưa vào lý do (thoả thuận lương, chưa xác nhận AI, công ty mới) ⇒ null.
  const clean = scoreJobPost(baseInput({ benefits: "Phụ cấp", isNegotiable: true, salaryMin: null, salaryMax: null, description: DESCRIPTION_240.repeat(2) }), NOW);
  assert.equal(buildRejectReason(clean), null);
});

test("mã băm: không đổi khi chỉ khác khoảng trắng / thứ tự kỹ năng / hạn nộp; đổi khi sửa nội dung", () => {
  const a = baseInput();
  const b = baseInput({
    title: "  Thực tập sinh   Backend NodeJS ",
    skills: [...a.skills].reverse(),
    expiresAt: new Date(NOW.getTime() + 60 * DAY),
    requirementsConfirmedAt: NOW,
  });
  assert.equal(contentHash(a), contentHash(b));
  assert.equal(scoreJobPost(a, NOW).contentHash, contentHash(a));
  assert.notEqual(contentHash(a), contentHash(baseInput({ benefits: "Phụ cấp ăn trưa" })));
  assert.notEqual(contentHash(a), contentHash(baseInput({ skills: [{ skillId: "s-node", importance: "PREFERRED", status: "APPROVED" }, a.skills[1]] })));
  assert.match(contentHash(a), /^[0-9a-f]{64}$/);
});

test("foldText bỏ dấu tiếng Việt, cả chữ đ và văn bản dạng NFD", () => {
  assert.equal(foldText("Đặt CỌC Phí Hồ Sơ"), "dat coc phi ho so");
  assert.equal(foldText("phí".normalize("NFD")), "phi");
});
