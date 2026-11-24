// Chạy: node --import tsx --test tests/unit/job-posts/job-quality.test.ts (từ apps/server)
// Bộ chấm điểm chất lượng tin (AD-29, docs/06-backend/job-quality-moderation/PLAN.md bước 2):
// từng quy tắc, ba vùng, cờ chặn, điểm sàn, lý do từ chối tự sinh, mã băm nội dung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRejectReason, contentHash, foldText, scoreJobPost, type JobQualityInput, type JobQualityResult } from "../../../src/modules/job-posts/job-quality";
import type { JobQualityIssueCode } from "../../../src/modules/job-posts/job-quality.config";

const NOW = new Date("2026-11-20T03:00:00Z");
const DAY = 86_400_000;

// Ví dụ trong plan: 240 ký tự mô tả, có yêu cầu, không quyền lợi, lương 3–5 triệu,
// công ty chưa có tin nào được duyệt ⇒ 93 điểm.
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

test("ví dụ của plan: 93 điểm, đề xuất duyệt", () => {
  assert.equal(DESCRIPTION_240.length, 240);
  const r = scoreJobPost(baseInput(), NOW);
  assert.deepEqual(
    r.criteria.map((c) => [c.key, c.score]),
    [
      ["COMPLETENESS", 80],
      ["CONTENT", 90],
      ["TRANSPARENCY", 100],
      ["INTERNSHIP_FIT", 100],
      ["RISK", 100],
      ["COMPANY", 90],
    ],
  );
  assert.equal(r.score, 93);
  assert.equal(r.band, "SUGGEST_APPROVE");
  assert.deepEqual(r.flags, []);
  assert.equal(r.version, 1);
});

test("cùng tin có 'phí đào tạo': 78 điểm nhưng cờ chặn ⇒ đề xuất từ chối", () => {
  const r = scoreJobPost(baseInput({ description: DESCRIPTION_240 + " Ứng viên nộp phí đào tạo 500k." }), NOW);
  assert.equal(criterion(r, "RISK").score, 40);
  assert.equal(r.score, 78);
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
  const r = scoreJobPost(baseInput({ minExperienceYears: 2, skills }), NOW);
  assert.deepEqual(criterion(r, "INTERNSHIP_FIT").issues.map((i) => i.code), ["INTERN_EXPERIENCE_HIGH", "TOO_MANY_REQUIRED_SKILLS", "PENDING_SKILLS"]);
  assert.deepEqual(criterion(scoreJobPost(baseInput({ minExperienceYears: 0.5 }), NOW), "INTERNSHIP_FIT").issues.map((i) => i.code), ["INTERN_EXPERIENCE_SOME"]);
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
  const good = { benefits: "Phụ cấp, laptop", description: DESCRIPTION_240.repeat(2) };
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

// Bước 3 — tin mẫu cố ý xấu (chỉ trong test, không ghi DB): mỗi tin phải rơi đúng vùng.
// Tin nền là một tin tốt, công ty đã có lịch sử duyệt sạch.
const GOOD_SAMPLE = baseInput(
  {
    title: "Thực tập sinh Kinh doanh",
    description:
      "Hỗ trợ đội kinh doanh tìm kiếm khách hàng doanh nghiệp, chuẩn bị báo giá, cập nhật thông tin khách hàng trên CRM và tham gia các buổi gặp khách hàng cùng trưởng nhóm. Được hướng dẫn quy trình bán hàng B2B từ đầu, báo cáo tiến độ hằng tuần với người hướng dẫn.",
    requirements: "Sinh viên năm 3, năm 4 khối kinh tế; giao tiếp tốt, chủ động, sử dụng thành thạo Excel.",
    benefits: "Phụ cấp hằng tháng, có dấu thực tập, cơ hội lên nhân viên chính thức.",
    salaryMin: 3_000_000,
    salaryMax: 4_000_000,
    address: "Tầng 5, 12 Nguyễn Huệ, Quận 1",
  },
  { companySubmitCount: 3, companyApprovedCount: 3 },
);

test("tin mẫu: tin tốt ⇒ đề xuất duyệt", () => {
  const r = scoreJobPost(GOOD_SAMPLE, NOW);
  assert.equal(r.band, "SUGGEST_APPROVE");
  assert.ok(r.score >= 95, `score ${r.score}`);
});

test("tin mẫu: đòi phí hồ sơ ⇒ đề xuất từ chối dù tổng điểm còn cao", () => {
  const r = scoreJobPost({ ...GOOD_SAMPLE, description: GOOD_SAMPLE.description + " Ứng viên trúng tuyển đóng phí hồ sơ 200.000đ trước khi nhận việc." }, NOW);
  assert.ok(r.score >= 80, `score ${r.score}`);
  assert.deepEqual(r.flags, ["ASKS_FOR_MONEY"]);
  assert.equal(r.band, "SUGGEST_REJECT");
});

test("tin mẫu: lương thực tập 30 triệu + 'việc nhẹ lương cao' ⇒ không được đề xuất duyệt", () => {
  const r = scoreJobPost(
    { ...GOOD_SAMPLE, description: GOOD_SAMPLE.description + " Việc nhẹ lương cao, không cần kinh nghiệm.", salaryMin: 30_000_000, salaryMax: 35_000_000 },
    NOW,
  );
  assert.ok(codes(r).includes("INTERN_SALARY_OUTLIER") && codes(r).includes("TOO_GOOD_TO_BE_TRUE"));
  assert.notEqual(r.band, "SUGGEST_APPROVE");
});

test("tin mẫu: chỉ lương thực tập trên 20 triệu ⇒ cần xem kỹ (rủi ro 45 dưới sàn)", () => {
  const r = scoreJobPost({ ...GOOD_SAMPLE, salaryMin: 25_000_000, salaryMax: 30_000_000 }, NOW);
  assert.equal(criterion(r, "RISK").score, 45);
  assert.ok(r.score >= 80, `score ${r.score}`);
  assert.equal(r.band, "NEEDS_REVIEW");
});

test("tin mẫu: mời kết bạn Zalo + số điện thoại ⇒ cần xem kỹ (rủi ro dưới sàn), không đề xuất duyệt", () => {
  const r = scoreJobPost(
    { ...GOOD_SAMPLE, description: GOOD_SAMPLE.description + " Ứng viên quan tâm kết bạn Zalo 0912 345 678 để được phỏng vấn nhanh." },
    NOW,
  );
  assert.equal(criterion(r, "RISK").score, 45);
  assert.ok(r.score >= 80, `score ${r.score}`);
  assert.equal(r.band, "NEEDS_REVIEW");
});

test("tin mẫu: mô tả 1 dòng, thiếu hết các mục ⇒ đề xuất từ chối do điểm sàn cứng, lý do 'Thiếu thông tin'", () => {
  const r = scoreJobPost(
    {
      ...GOOD_SAMPLE,
      title: "Tuyển gấp thực tập",
      description: "Tuyển thực tập sinh làm việc văn phòng, lương cao, đi làm ngay.",
      requirements: null,
      benefits: null,
      skills: [],
      majors: [],
      address: null,
      salaryMin: null,
      salaryMax: null,
      isNegotiable: true,
    },
    NOW,
  );
  assert.ok(r.score >= 50, `score ${r.score}`);
  assert.ok(criterion(r, "COMPLETENESS").score < 40);
  assert.deepEqual(r.flags, []);
  assert.equal(r.band, "SUGGEST_REJECT");
  assert.match(buildRejectReason(r) ?? "", /^Thiếu thông tin/);
});

test("điểm sàn cứng không xét tiêu chí uy tín công ty", () => {
  const r = scoreJobPost({ ...GOOD_SAMPLE, signals: { ...GOOD_SAMPLE.signals, companyRetractions: 3 } }, NOW);
  assert.equal(criterion(r, "COMPANY").score, 25);
  assert.notEqual(r.band, "SUGGEST_REJECT");
});

test("tin mẫu: gộp nhiều dấu hiệu xấu (viết hoa, Zalo, đặt cọc, thiếu nội dung) ⇒ đề xuất từ chối, tổng < 50", () => {
  const r = scoreJobPost(
    {
      ...GOOD_SAMPLE,
      title: "TUYỂN GẤP!!!! VIỆC NHẸ LƯƠNG CAO",
      description: "Việc nhẹ lương cao, inbox Zalo 0912345678, đặt cọc 500k giữ chỗ.",
      requirements: null,
      benefits: null,
      skills: [],
      majors: [],
      salaryMin: 30_000_000,
      salaryMax: null,
    },
    NOW,
  );
  assert.ok(r.score < 50, `score ${r.score}`);
  assert.equal(r.band, "SUGGEST_REJECT");
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

// ─── Bước 10 — sát ngưỡng, trần, làm tròn, mép vùng ──────────────────────

/** Chuỗi chữ thường không dấu cách, không lặp ký tự: chỉ độ dài là đáng kể. */
const letters = (n: number) => Array.from({ length: n }, (_, i) => "abcdefghij"[i % 10]).join("");

/** Tin không lỗi nào: 100 điểm ở mọi tiêu chí. */
const CLEAN = baseInput({ description: letters(300), benefits: "Phụ cấp, laptop" }, { companySubmitCount: 3, companyApprovedCount: 3 });
const fromClean = (overrides: Partial<JobQualityInput> = {}, signals: Partial<JobQualityInput["signals"]> = {}): JobQualityInput => ({
  ...CLEAN,
  ...overrides,
  signals: { ...CLEAN.signals, ...signals },
});
const has = (code: JobQualityIssueCode, overrides: Partial<JobQualityInput> = {}, signals: Partial<JobQualityInput["signals"]> = {}) =>
  codes(scoreJobPost(fromClean(overrides, signals), NOW)).includes(code);

test("tin sạch dùng cho các case sát ngưỡng: 100 điểm, không lỗi", () => {
  const r = scoreJobPost(CLEAN, NOW);
  assert.equal(r.score, 100);
  assert.deepEqual(codes(r), []);
});

test("sát ngưỡng thì không trừ, vượt một đơn vị thì trừ: nội dung", () => {
  assert.ok(has("DESCRIPTION_TOO_SHORT", { description: letters(149) }));
  assert.ok(!has("DESCRIPTION_TOO_SHORT", { description: letters(150) }));
  assert.ok(has("DESCRIPTION_SHORT", { description: letters(150) }));
  assert.ok(has("DESCRIPTION_SHORT", { description: letters(299) }));
  assert.ok(!has("DESCRIPTION_SHORT", { description: letters(300) }));

  assert.ok(has("REQUIREMENTS_TOO_SHORT", { requirements: letters(49) }));
  assert.ok(!has("REQUIREMENTS_TOO_SHORT", { requirements: letters(50) }));

  assert.ok(has("TITLE_LENGTH", { title: letters(9) }));
  assert.ok(!has("TITLE_LENGTH", { title: letters(10) }));
  assert.ok(!has("TITLE_LENGTH", { title: letters(100) }));
  assert.ok(has("TITLE_LENGTH", { title: letters(101) }));

  // Viết hoa: tỉ lệ đúng 0,7 ⇒ trừ, 0,6 ⇒ không; dưới 10 chữ cái thì không xét.
  assert.ok(has("TITLE_SHOUTING", { title: "ABCDEFGhij" }));
  assert.ok(!has("TITLE_SHOUTING", { title: "ABCDEFghij" }));
  assert.ok(!has("TITLE_SHOUTING", { title: "ABCDEFGHI" }));

  // Lặp 3 ký tự hoặc 3 biểu tượng cảm xúc ⇒ không; 4 ⇒ trừ. Chữ số lặp không tính.
  assert.ok(!has("SPAMMY_FORMAT", { title: "Thực tập sinh!!!" }));
  assert.ok(has("SPAMMY_FORMAT", { title: "Thực tập sinh!!!!" }));
  assert.ok(!has("SPAMMY_FORMAT", { title: "Thực tập sinh 2000000" }));
  assert.ok(!has("SPAMMY_FORMAT", { title: "Thực tập sinh \u{1F525}⭐\u{1F389}" }));
  const emoji = scoreJobPost(fromClean({ title: "Thực tập sinh \u{1F525}⭐\u{1F389}\u{1F4BC}" }), NOW);
  assert.match(criterion(emoji, "CONTENT").issues.find((i) => i.code === "SPAMMY_FORMAT")!.message, /biểu tượng cảm xúc \(4\)/);

  const email = scoreJobPost(fromClean({ benefits: "Gửi CV về tuyen.dung@congty.vn" }), NOW);
  assert.match(criterion(email, "CONTENT").issues.find((i) => i.code === "CONTACT_IN_CONTENT")!.message, /email/);
});

test("sát ngưỡng thì không trừ, vượt một đơn vị thì trừ: minh bạch, thực tập, rủi ro, công ty", () => {
  // Khoảng lương gấp đúng 3 lần ⇒ không trừ.
  assert.ok(!has("SALARY_RANGE_WIDE", { salaryMin: 2_000_000, salaryMax: 6_000_000 }));
  assert.ok(has("SALARY_RANGE_WIDE", { salaryMin: 2_000_000, salaryMax: 6_000_001 }));

  assert.ok(!has("ADDRESS_VAGUE", { address: "12A Lê Lợi" })); // 10 ký tự
  assert.ok(has("ADDRESS_VAGUE", { address: "12 Lê Lợi" })); // 9 ký tự

  assert.ok(!has("DEADLINE_TOO_SOON", { expiresAt: new Date(NOW.getTime() + 7 * DAY) }));
  assert.ok(has("DEADLINE_TOO_SOON", { expiresAt: new Date(NOW.getTime() + 7 * DAY - 1) }));

  assert.ok(has("INTERN_EXPERIENCE_HIGH", { minExperienceYears: 1 }));
  assert.ok(!has("INTERN_EXPERIENCE_HIGH", { minExperienceYears: 0.9 }));
  assert.ok(has("INTERN_EXPERIENCE_SOME", { minExperienceYears: 0.9 }));

  const required = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ skillId: `s${i}`, importance: "REQUIRED" as const, status: "APPROVED" as const }));
  assert.ok(!has("TOO_MANY_REQUIRED_SKILLS", { skills: required(8) }));
  assert.ok(has("TOO_MANY_REQUIRED_SKILLS", { skills: required(9) }));

  // Lương thực tập đúng 20 triệu ⇒ không trừ.
  assert.ok(!has("INTERN_SALARY_OUTLIER", { salaryMin: 15_000_000, salaryMax: 20_000_000 }));
  assert.ok(has("INTERN_SALARY_OUTLIER", { salaryMin: 15_000_000, salaryMax: 20_000_001 }));

  assert.ok(!has("REJECTED_MANY_TIMES", {}, { rejectionCount: 2 }));
  assert.ok(has("REJECTED_MANY_TIMES", {}, { rejectionCount: 3 }));

  // Từ chối nhiều: cần từ 4 lần gửi và tỉ lệ từ 0,5.
  assert.ok(!has("COMPANY_HIGH_REJECTION", {}, { companySubmitCount: 3, companyRejectCount: 3 }));
  assert.ok(has("COMPANY_HIGH_REJECTION", {}, { companySubmitCount: 4, companyRejectCount: 2 }));
  assert.ok(!has("COMPANY_HIGH_REJECTION", {}, { companySubmitCount: 5, companyRejectCount: 2 }));

  assert.ok(!has("COMPANY_NO_HISTORY", {}, { companyApprovedCount: 1 }));
  assert.ok(has("COMPANY_NO_HISTORY", {}, { companyApprovedCount: 0 }));
});

test("lỗi tính theo số lần có trần: báo cáo đã xác nhận tối đa 50, đang chờ tối đa 30", () => {
  const penaltyOf = (signals: Partial<JobQualityInput["signals"]>) =>
    criterion(scoreJobPost(fromClean({}, signals), NOW), "COMPANY").issues.map((i) => [i.code, i.penalty]);
  assert.deepEqual(penaltyOf({ companyConfirmedReports: 1 }), [["COMPANY_CONFIRMED_REPORTS", 25]]);
  assert.deepEqual(penaltyOf({ companyConfirmedReports: 3 }), [["COMPANY_CONFIRMED_REPORTS", 50]]);
  assert.deepEqual(penaltyOf({ companyOpenReports: 2 }), [["COMPANY_OPEN_REPORTS", 20]]);
  assert.deepEqual(penaltyOf({ companyOpenReports: 5 }), [["COMPANY_OPEN_REPORTS", 30]]);
});

test("mỗi nhóm từ khoá trừ một lần dù khớp nhiều từ; điểm tiêu chí không âm", () => {
  const r = scoreJobPost(fromClean({ benefits: "Đóng phí đào tạo, phí hồ sơ và đặt cọc 500k; kết bạn Zalo hoặc Telegram" }), NOW);
  const risk = criterion(r, "RISK");
  assert.deepEqual(risk.issues.map((i) => [i.code, i.penalty]), [
    ["ASKS_FOR_MONEY", 60],
    ["OFF_PLATFORM_CONTACT", 55],
  ]);
  assert.equal(risk.score, 0); // 100 − 115, không xuống âm
  assert.deepEqual(r.flags, ["ASKS_FOR_MONEY"]);

  const content = criterion(
    scoreJobPost(fromClean({ title: "VIỆC LÀM ".repeat(12) + "!!!!", description: "Gọi 0912345678", requirements: "Biết code" }), NOW),
    "CONTENT",
  );
  assert.equal(content.issues.reduce((sum, i) => sum + i.penalty, 0), 110);
  assert.equal(content.score, 0);
});

test("tổng điểm làm tròn tới số nguyên gần nhất", () => {
  // 100 − 15% × 10 = 98,5 ⇒ 99.
  const up = scoreJobPost(fromClean({ address: "HN" }), NOW);
  assert.equal(criterion(up, "TRANSPARENCY").score, 90);
  assert.equal(up.score, 99);
  // 100 − 25% × 55 = 86,25 ⇒ 86.
  const down = scoreJobPost(fromClean({ benefits: "Liên hệ qua Telegram" }), NOW);
  assert.equal(criterion(down, "RISK").score, 45);
  assert.equal(down.score, 86);
});

test("mép vùng duyệt: tổng đúng 80, hai tiêu chí đúng 50 ⇒ đề xuất duyệt; tụt 1 điểm ⇒ cần xem kỹ", () => {
  const edge = { requirements: null, benefits: null, description: letters(149), title: "Thực tập" };
  const r = scoreJobPost(fromClean(edge), NOW);
  assert.equal(criterion(r, "COMPLETENESS").score, 50);
  assert.equal(criterion(r, "CONTENT").score, 50);
  assert.equal(r.score, 80);
  assert.equal(r.band, "SUGGEST_APPROVE");

  const below = scoreJobPost(fromClean(edge, { companyOpenReports: 1 }), NOW);
  assert.equal(below.score, 79);
  assert.equal(below.band, "NEEDS_REVIEW");
});

test("mép vùng từ chối: tiêu chí đúng 40 không dính điểm sàn cứng; tổng đúng 50 ⇒ cần xem kỹ, 49 ⇒ đề xuất từ chối", () => {
  const c40 = scoreJobPost(fromClean({ skills: [{ skillId: "s1", importance: "PREFERRED", status: "APPROVED" }], benefits: null, majors: [] }), NOW);
  assert.equal(criterion(c40, "COMPLETENESS").score, 40);
  assert.equal(c40.band, "NEEDS_REVIEW");

  const weak = (overrides: Partial<JobQualityInput> = {}) =>
    fromClean(
      {
        skills: [{ skillId: "s1", importance: "PREFERRED", status: "PENDING" }],
        benefits: null,
        majors: [],
        description: letters(149),
        title: "Tuyển!!!!",
        minExperienceYears: 2,
        salaryMin: 8_000_000,
        salaryMax: 5_000_000,
        address: "HN",
        ...overrides,
      },
      { companyRetractions: 4, companyOpenReports: 3, rejectionCount: 3 },
    );
  const at50 = scoreJobPost(weak(), NOW);
  // Tiêu chí 1–5 đều ≥ 40; tiêu chí 6 về 0 nhưng không xét điểm sàn cứng.
  assert.deepEqual(at50.criteria.map((c) => c.score), [40, 40, 60, 50, 80, 0]);
  assert.equal(at50.score, 50);
  assert.equal(at50.band, "NEEDS_REVIEW");

  const at49 = scoreJobPost(weak({ expiresAt: new Date(NOW.getTime() + 3 * DAY) }), NOW);
  assert.equal(at49.score, 49);
  assert.equal(at49.band, "SUGGEST_REJECT");
});

test("lý do từ chối tự sinh không lấy lỗi của tiêu chí 6 dù công ty bị trừ nặng", () => {
  const r = scoreJobPost(fromClean({ description: letters(149) }, { companyRetractions: 3, companyConfirmedReports: 2, companyOpenReports: 1 }), NOW);
  assert.equal(criterion(r, "COMPANY").score, 0);
  assert.equal(buildRejectReason(r), "Thiếu thông tin. Mô tả công việc quá ngắn (149/150 ký tự).");
  assert.equal(buildRejectReason(scoreJobPost(fromClean({}, { companyRetractions: 3 }), NOW)), null);
});
