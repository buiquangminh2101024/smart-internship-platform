// Chạy: node --import tsx --test tests/unit/demo-data/large-demo-library.test.ts (từ apps/server)
// Bộ kiểm thư viện dữ liệu demo lớn (docs/06-backend/large-demo-data/PLAN.md, bước 1):
// thư viện do LLM viết, mọi tham chiếu phải khớp danh mục thật.
import { test } from "node:test";
import assert from "node:assert/strict";
import { levelConflict, mentionedNames, validateLargeDemoLibrary, type LargeDemoCatalog } from "../../../scripts/lib/large-demo/library";

const CATALOG: LargeDemoCatalog = {
  skills: ["Node.js", "JavaScript", "SQL", "Giao tiếp", "Làm việc nhóm", "Quản lý thời gian", "Docker"],
  skillAliases: new Map([["nodejs", "Node.js"]]),
  majors: ["Công nghệ thông tin", "Kỹ thuật phần mềm", "Toán tin", "Kế toán"],
  universities: ["Trường Đại học A"],
  industries: ["Công nghệ thông tin"],
  cities: ["Hà Nội"],
  companyTypes: ["Startup"],
};

const NAMES = {
  familyNames: Array.from({ length: 10 }, (_, i) => ({ name: `Họ${i}`, weight: 1 })),
  middleNames: { MALE: names("Đệm nam"), FEMALE: names("Đệm nữ") },
  givenNames: { MALE: names("Tên nam"), FEMALE: names("Tên nữ") },
};

function names(prefix: string) {
  return Array.from({ length: 10 }, (_, i) => `${prefix} ${i}`);
}

function company(index: number, overrides: Record<string, unknown> = {}) {
  return {
    key: `cong-ty-${index}`,
    name: `Công ty ${index}`,
    industry: "Công nghệ thông tin",
    companyType: "Startup",
    city: "Hà Nội",
    address: `${index} Phố Huế`,
    description: "Công ty phần mềm.",
    foundedYear: 2015,
    employerCount: 1,
    positions: ["vi-tri-0"],
    branchCities: [],
    ...(index === 0 ? { demoRole: "main" } : index <= 2 ? { demoRole: "secondary" } : {}),
    ...overrides,
  };
}

const LEVELS = [
  { key: "nam-3", label: "Năm 3", studyYear: 3, experienceYears: [0, 0.5], birthYears: [2004, 2005], jobTypes: ["INTERNSHIP"] },
  { key: "nam-cuoi", label: "Năm cuối", studyYear: 4, experienceYears: [0.5, 1], birthYears: [2003, 2004], jobTypes: ["INTERNSHIP"] },
  { key: "moi-tot-nghiep", label: "Mới tốt nghiệp", studyYear: null, experienceYears: [1, 2.5], birthYears: [2001, 2002], jobTypes: ["FULL_TIME"] },
];
const BAND = { INTERNSHIP: [3e6, 6e6], PART_TIME: [4e6, 8e6], FULL_TIME: [9e6, 18e6], CONTRACT: [8e6, 15e6] };

function position(index: number, overrides: Record<string, unknown> = {}) {
  return {
    key: `vi-tri-${index}`,
    name: `Vị trí ${index}`,
    domain: "cntt",
    industries: ["Công nghệ thông tin"],
    majors: { primary: ["Công nghệ thông tin", "Kỹ thuật phần mềm"], related: ["Toán tin"] },
    skills: { core: ["Node.js", "JavaScript", "SQL"], extra: ["REST API", "Linux", "Giao tiếp", "Làm việc nhóm"] },
    salaryBand: "it",
    adjacent: [],
    ...overrides,
  };
}

function variant(overrides: Record<string, unknown> = {}) {
  return {
    description: "Phát triển API cho hệ thống bán hàng.",
    requirements: "Biết Node.js và SQL, đã làm đồ án có cơ sở dữ liệu.",
    skills: { required: ["Node.js", "SQL"], preferred: ["JavaScript"] },
    ...overrides,
  };
}

/** Mẫu tin cho vi-tri-0; `variants[i]` ghi đè biến thể thứ i. */
function jobTemplate(overrides: Record<string, unknown> = {}, variants: Record<string, unknown>[] = []) {
  const descriptions = ["Phát triển API cho hệ thống bán hàng.", "Bảo trì hệ thống quản lý kho.", "Viết công cụ nội bộ cho đội vận hành."];
  return {
    position: "vi-tri-0",
    titles: {
      INTERNSHIP: ["Thực tập sinh Node.js", "Intern Backend Node.js"],
      PART_TIME: ["Lập trình viên Node.js (part-time)"],
      FULL_TIME: ["Lập trình viên Node.js", "Fresher Backend Node.js"],
      CONTRACT: ["Lập trình viên Node.js (hợp đồng)"],
    },
    benefits: [],
    variants: descriptions.map((description, index) => variant({ description, ...variants[index] })),
    ...overrides,
  };
}

function persona(level: string, index: number) {
  return {
    key: `vi-tri-0-${level}-${index}`,
    level,
    kind: "standard",
    headline: `${level === "moi-tot-nghiep" ? "Backend Developer" : "Sinh viên | Backend"} ${index}`,
    bio: `Mình viết API bằng Node.js và SQL, hồ sơ ${level} số ${index}.`,
    skills: ["Node.js", "JavaScript", "SQL", "REST API"],
    experiences: level === "nam-3" ? [] : [{ position: "Thực tập sinh Backend", months: [3, 6], description: "Viết API cho hệ thống bán hàng." }],
    projects: [{ name: "Đồ án quản lý thư viện", description: "API mượn trả sách." }],
  };
}

/** Nhóm chân dung của vi-tri-0: 4 bộ mỗi cấp độ, bộ cuối là đổi ngành; `overrides[key]` ghi đè từng bộ. */
function personaGroup(overrides: Record<string, Record<string, unknown>> = {}) {
  const personas: Record<string, unknown>[] = LEVELS.flatMap((level) => [0, 1, 2, 3].map((i) => persona(level.key, i)));
  personas[11] = { ...personas[11], kind: "career-switch", fromMajors: ["Kế toán"] };
  return {
    position: "vi-tri-0",
    certificates: [{ name: "Chứng chỉ Node.js", issuer: "Trung tâm đào tạo" }],
    personas: personas.map((p) => ({ ...p, ...overrides[p.key as string] })),
  };
}

function showcaseCandidate(overrides: Record<string, unknown> = {}) {
  return {
    key: "ung-vien-0",
    job: "tin-0",
    tier: "rat-hop",
    level: "nam-cuoi",
    fullName: "Họ0 Đệm nam 0 Tên nam 0",
    gender: "MALE",
    birthYear: 2003,
    city: "Hà Nội",
    educations: [{ university: "Trường Đại học A", major: "Công nghệ thông tin", startYear: 2023, endYear: 2027, isCurrent: true }],
    headline: "Sinh viên CNTT | Backend Node.js",
    bio: "Mình viết API bằng Node.js và SQL cho đồ án nhóm.",
    skills: [{ name: "Node.js", years: 1 }, { name: "SQL", years: 1 }, { name: "JavaScript", years: 1 }],
    experiences: [{ company: "Công ty cũ 0", position: "Thực tập sinh Backend", start: "2026-03", end: "2026-08", description: "Viết API cho hệ thống bán hàng." }],
    projects: [{ name: "Hệ thống quản lý thư viện", description: "API mượn trả sách." }],
    certificates: [],
    ...overrides,
  };
}

function showcaseJob(overrides: Record<string, unknown> = {}) {
  return {
    key: "tin-0",
    employer: "tuyen-dung-0",
    position: "vi-tri-0",
    jobType: "INTERNSHIP",
    title: "Thực tập sinh Node.js",
    variant: 0,
    majors: { primary: ["Công nghệ thông tin"], related: ["Toán tin"] },
    minExperienceYears: null,
    salary: [4e6, 6e6],
    publishedDaysAgo: 3,
    expiresInDays: 40,
    ...overrides,
  };
}

function library(
  options: {
    first?: Record<string, unknown>;
    firstCompany?: Record<string, unknown>;
    additions?: Partial<Record<"skills" | "industries" | "cities", string[]>>;
    template?: Record<string, unknown>;
    personas?: Record<string, unknown>;
    showcase?: Record<string, unknown>;
  } = {},
) {
  return {
    positions: {
      levels: LEVELS,
      salaryBands: { it: BAND },
      softSkills: ["Giao tiếp", "Làm việc nhóm", "Quản lý thời gian"],
      positions: Array.from({ length: 25 }, (_, index) => position(index, index === 0 ? options.first : {})),
    },
    catalogAdditions: { skills: ["REST API", "Linux"], industries: [], cities: [], ...options.additions },
    names: NAMES,
    companies: {
      employerTitles: ["Chuyên viên Tuyển dụng", "Trưởng phòng Nhân sự", "HR Business Partner", "Giám đốc"],
      companies: Array.from({ length: 30 }, (_, index) => company(index, index === 0 ? options.firstCompany : {})),
    },
    jobTemplates: {
      audiences: { student: names("Sinh viên năm 3 nhóm"), graduate: names("Đã tốt nghiệp nhóm") },
      benefits: { student: names("Phụ cấp"), graduate: names("Lương tháng 13 loại") },
      templates: [options.template ?? jobTemplate()],
    },
    personas: {
      bioTails: Array.from({ length: 30 }, (_, i) => `Câu giới thiệu riêng số ${i}.`),
      unrelatedJobs: Array.from({ length: 8 }, (_, i) => ({ position: `Việc làm thêm ${i}`, description: "Phục vụ khách theo ca." })),
      pastCompanies: { cntt: names("Công ty cũ") },
      groups: [personaGroup()],
      ...options.personas,
    },
    showcase: {
      asOf: "2026-11",
      employers: [{ key: "tuyen-dung-0", company: "cong-ty-0", title: "Chuyên viên Tuyển dụng" }],
      jobs: [showcaseJob()],
      candidates: [showcaseCandidate()],
      ...options.showcase,
    },
  };
}

test("Thư viện hợp lệ → không lỗi", () => {
  const result = validateLargeDemoLibrary(library(), CATALOG);
  assert.deepEqual(result.errors, []);
  assert.ok(result.library);
});

test("Dùng tên đã thành alias → lỗi, chỉ tên đích", () => {
  const result = validateLargeDemoLibrary(
    library({ first: { skills: { core: ["NodeJS", "JavaScript", "SQL"], extra: ["REST API", "Linux", "Giao tiếp", "Làm việc nhóm"] } } }),
    CATALOG,
  );
  assert.ok(result.errors.some((error) => error.includes(`"NodeJS" đã thành alias — dùng "Node.js"`)));
  assert.equal(result.library, null);
});

test("Kỹ năng sai hoa thường → lỗi, chỉ đúng tên", () => {
  const result = validateLargeDemoLibrary(
    library({ first: { skills: { core: ["node.js", "JavaScript", "SQL"], extra: ["REST API", "Linux", "Giao tiếp", "Làm việc nhóm"] } } }),
    CATALOG,
  );
  assert.ok(result.errors.some((error) => error.includes(`"node.js" phải viết đúng từng ký tự là "Node.js"`)));
});

test("Ngành học không có trong danh mục → lỗi", () => {
  const result = validateLargeDemoLibrary(
    library({ first: { majors: { primary: ["Công nghệ thông tin", "Kỹ thuật phần mềm"], related: ["Khoa học vũ trụ"] } } }),
    CATALOG,
  );
  assert.ok(result.errors.some((error) => error.includes(`"Khoa học vũ trụ" không có trong danh mục Major`)));
});

test("Kỹ năng thêm trùng danh mục hoặc quá giống (≥ 0,85) → lỗi", () => {
  const result = validateLargeDemoLibrary(library({ additions: { skills: ["REST API", "Linux", "sql", "Node js"] } }), CATALOG);
  assert.ok(result.errors.some((error) => error.includes(`"sql" đã có trong danh mục ("SQL")`)));
  assert.ok(result.errors.some((error) => error.includes(`"Node js" đã có trong danh mục ("Node.js")`)));
});

test("Kỹ năng thêm mà không vị trí nào dùng → cảnh báo", () => {
  const result = validateLargeDemoLibrary(library({ additions: { skills: ["REST API", "Linux", "Kubernetes"] } }), CATALOG);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((warning) => warning.includes(`"Kubernetes" chưa vị trí nào dùng`)));
});

test("adjacent trỏ vào khoá không tồn tại hoặc chính nó, salaryBand lạ → lỗi", () => {
  const result = validateLargeDemoLibrary(library({ first: { adjacent: ["vi-tri-0", "khong-co"], salaryBand: "la" } }), CATALOG);
  assert.ok(result.errors.some((error) => error.includes("adjacent trỏ vào chính nó")));
  assert.ok(result.errors.some((error) => error.includes(`adjacent "khong-co"`)));
  assert.ok(result.errors.some((error) => error.includes(`salaryBand "la"`)));
});

test("Ngành nghề thêm đã có sẵn → lỗi; ngành nghề lạ trong vị trí → lỗi", () => {
  const result = validateLargeDemoLibrary(
    library({ first: { industries: ["Hàng không"] }, additions: { industries: ["Công nghệ thông tin"] } }),
    CATALOG,
  );
  assert.ok(result.errors.some((error) => error.includes(`industries: "Công nghệ thông tin" đã có trong danh mục`)));
  assert.ok(result.errors.some((error) => error.includes(`ngành nghề "Hàng không" không có`)));
});

test("Công ty tham chiếu vị trí / thành phố / loại hình không có → lỗi", () => {
  const result = validateLargeDemoLibrary(
    library({ firstCompany: { positions: ["khong-co"], city: "Vũng Tàu", companyType: "Hợp tác xã" } }),
    CATALOG,
  );
  assert.ok(result.errors.some((error) => error.includes(`vị trí "khong-co" không có`)));
  assert.ok(result.errors.some((error) => error.includes(`thành phố "Vũng Tàu" không có`)));
  assert.ok(result.errors.some((error) => error.includes(`loại hình "Hợp tác xã" không có`)));
});

test("Thành phố thêm ở catalog-additions dùng được cho công ty", () => {
  const result = validateLargeDemoLibrary(library({ firstCompany: { city: "Huế" }, additions: { cities: ["Huế"] } }), CATALOG);
  assert.deepEqual(result.errors, []);
});

test("Mô tả công ty chứa email / số điện thoại / link → lỗi", () => {
  const result = validateLargeDemoLibrary(
    library({ firstCompany: { description: "Liên hệ hr@congty.vn hoặc 0912345678, xem https://congty.vn" } }),
    CATALOG,
  );
  assert.ok(result.errors.some((error) => error.includes("description: có vẻ chứa email")));
  assert.ok(result.errors.some((error) => error.includes("description: có vẻ chứa số điện thoại")));
  assert.ok(result.errors.some((error) => error.includes("description: có vẻ chứa đường link")));
});

test("Không có công ty main → lỗi", () => {
  const result = validateLargeDemoLibrary(library({ firstCompany: { demoRole: undefined } }), CATALOG);
  assert.ok(result.errors.some((error) => error.includes(`đúng 1 công ty demoRole "main", đang có 0`)));
});

test("Vị trí có dưới 2 công ty tuyển → cảnh báo", () => {
  const result = validateLargeDemoLibrary(library(), CATALOG);
  assert.ok(result.warnings.some((warning) => warning.includes("[vi-tri-1]: chỉ 0 công ty tuyển")));
  assert.ok(!result.warnings.some((warning) => warning.includes("positions.json [vi-tri-0]")));
});

test("mentionedNames: tên dài nuốt tên ngắn, không khớp giữa chữ", () => {
  const names = ["SQL", "MS SQL Server", ".NET", "ASP.NET Core", "Java", "Go", "Giao tiếp"];
  assert.deepEqual(mentionedNames("Đã dùng MS SQL Server và ASP.NET Core", names).sort(), ["ASP.NET Core", "MS SQL Server"]);
  assert.deepEqual(mentionedNames("Biết JavaScript, PostgreSQL; go live đúng hạn", names), []);
  assert.deepEqual(mentionedNames("Viết Go, kỹ năng giao tiếp tốt", names).sort(), ["Giao tiếp", "Go"]);
});

test("Mẫu tin hợp lệ → không lỗi, cảnh báo vị trí chưa có mẫu", () => {
  const result = validateLargeDemoLibrary(library(), CATALOG);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((warning) => warning.includes("còn 24 vị trí chưa có mẫu tin")));
});

test("Mẫu tin dùng kỹ năng ngoài vị trí / thiếu kỹ năng lõi bắt buộc / vị trí lạ → lỗi", () => {
  const outside = validateLargeDemoLibrary(
    library({ template: jobTemplate({}, [{ skills: { required: ["Node.js", "SQL"], preferred: ["Docker"] } }, { skills: { required: ["Node.js", "Giao tiếp"], preferred: ["SQL"] } }]) }),
    CATALOG,
  );
  assert.ok(outside.errors.some((error) => error.includes(`variants.0: kỹ năng "Docker" không thuộc core / extra`)));
  assert.ok(outside.errors.some((error) => error.includes("variants.1: kỹ năng bắt buộc cần ≥ 2 kỹ năng lõi (core), đang có 1")));
  const unknown = validateLargeDemoLibrary(library({ template: jobTemplate({ position: "khong-co" }) }), CATALOG);
  assert.ok(unknown.errors.some((error) => error.includes(`[khong-co]: không có vị trí này`)));
});

test("Văn bản mẫu tin nhắc kỹ năng không có trong mẫu → cảnh báo", () => {
  const result = validateLargeDemoLibrary(
    library({ template: jobTemplate({}, [{ requirements: "Biết Node.js, SQL và Linux, làm việc nhóm tốt." }]) }),
    CATALOG,
  );
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((warning) => warning.includes(`variants.0.requirements: nhắc "Linux"`)));
  assert.ok(result.warnings.some((warning) => warning.includes(`variants.0.requirements: nhắc "Làm việc nhóm"`)));
});

test("Tiêu đề nhắc kỹ năng mà một biến thể không có → lỗi", () => {
  const result = validateLargeDemoLibrary(
    library({ template: jobTemplate({}, [{}, {}, { skills: { required: ["Node.js", "SQL"], preferred: ["Linux"] } }]) }),
    CATALOG,
  );
  // Tiêu đề không nhắc JavaScript nên chỉ cần mọi biến thể có Node.js — hợp lệ.
  assert.deepEqual(result.errors, []);
  const withTitle = validateLargeDemoLibrary(
    library({
      template: jobTemplate(
        { titles: { INTERNSHIP: ["Thực tập sinh JavaScript", "Intern Node.js"], PART_TIME: ["Node.js part-time"], FULL_TIME: ["Lập trình viên Node.js", "Fresher Node.js"], CONTRACT: ["Node.js hợp đồng"] } },
        [{}, {}, { skills: { required: ["Node.js", "SQL"], preferred: ["Linux"] } }],
      ),
    }),
    CATALOG,
  );
  assert.ok(withTitle.errors.some((error) => error.includes(`tiêu đề "Thực tập sinh JavaScript" nhắc "JavaScript" nhưng variants.2`)));
});

test("Mẫu tin ghi số năm kinh nghiệm hoặc tên thành phố → lỗi", () => {
  const result = validateLargeDemoLibrary(
    library({ template: jobTemplate({}, [{ requirements: "Có 1 năm kinh nghiệm Node.js và SQL, làm tại Hà Nội." }, { requirements: "Hai năm làm Node.js với SQL." }]) }),
    CATALOG,
  );
  assert.ok(result.errors.some((error) => error.includes("variants.0.requirements: ghi số năm kinh nghiệm")));
  assert.ok(result.errors.some((error) => error.includes(`variants.0.requirements: nhắc thành phố "Hà Nội"`)));
  assert.ok(result.errors.some((error) => error.includes("variants.1.requirements: ghi số năm kinh nghiệm")));
  // "Sinh viên năm 3" là năm học, không phải số năm kinh nghiệm.
  assert.ok(!result.errors.some((error) => error.includes("audiences")));
});

test("levelConflict: văn bản nói sai cấp độ", () => {
  assert.equal(levelConflict(3, "Sinh viên năm 3 | Backend"), null);
  assert.equal(levelConflict(4, "Sinh viên năm cuối, sắp tốt nghiệp"), null);
  assert.equal(levelConflict(null, "Đã tốt nghiệp, đi làm ở công ty phần mềm"), null);
  assert.match(levelConflict(3, "Sinh viên năm cuối") ?? "", /năm cuối/);
  assert.match(levelConflict(4, "Sinh viên năm 3 CNTT") ?? "", /năm 3/);
  assert.match(levelConflict(4, "Mới tốt nghiệp") ?? "", /đã tốt nghiệp/);
  assert.match(levelConflict(null, "sinh viên năm 4 ngành CNTT") ?? "", /như sinh viên/);
});

test("Chân dung hợp lệ → không lỗi, cảnh báo vị trí chưa có chân dung", () => {
  const result = validateLargeDemoLibrary(library(), CATALOG);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((warning) => warning.includes("còn 24 vị trí chưa có chân dung")));
});

test("Chân dung nói sai cấp độ, sai số dòng / độ dài kinh nghiệm, ghi số tháng → lỗi", () => {
  const result = validateLargeDemoLibrary(
    library({
      personas: {
        groups: [personaGroup({
          "vi-tri-0-nam-3-0": { headline: "Sinh viên năm cuối | Backend", experiences: [{ position: "Cộng tác viên", months: [3, 9], description: "Viết API." }] },
          "vi-tri-0-nam-cuoi-0": { experiences: [] },
          "vi-tri-0-nam-cuoi-1": { experiences: [{ position: "Thực tập sinh", months: [3, 6], description: "Thực tập 6 tháng ở đội backend." }] },
          "vi-tri-0-moi-tot-nghiep-0": { bio: "Sinh viên năm 4, viết API bằng Node.js và SQL." },
        })],
      },
    }),
    CATALOG,
  );
  assert.ok(result.errors.some((error) => error.includes("vi-tri-0-nam-3-0.headline: ghi năm cuối nhưng cấp độ là năm 3")));
  assert.ok(result.errors.some((error) => error.includes("vi-tri-0-nam-3-0 experiences.0: tối đa 9 tháng vượt mức của cấp độ (6)")));
  assert.ok(result.errors.some((error) => error.includes(`vi-tri-0-nam-cuoi-0: cấp độ "nam-cuoi" cần ≥ 1 dòng kinh nghiệm`)));
  assert.ok(result.errors.some((error) => error.includes("vi-tri-0-nam-cuoi-1.experiences.0.description: ghi số tháng")));
  assert.ok(result.errors.some((error) => error.includes("vi-tri-0-moi-tot-nghiep-0.bio: nói như sinh viên")));
});

test("Đổi ngành từ ngành đã thuộc vị trí / người thường có fromMajors / thiếu kỹ năng lõi → lỗi", () => {
  const result = validateLargeDemoLibrary(
    library({
      personas: {
        groups: [personaGroup({
          "vi-tri-0-moi-tot-nghiep-3": { fromMajors: ["Toán tin"] },
          "vi-tri-0-nam-3-0": { fromMajors: ["Kế toán"] },
          "vi-tri-0-nam-3-1": { skills: ["Node.js", "REST API", "Linux", "Giao tiếp"] },
        })],
      },
    }),
    CATALOG,
  );
  assert.ok(result.errors.some((error) => error.includes(`"Toán tin" đã thuộc nhóm ngành của vị trí`)));
  assert.ok(result.errors.some((error) => error.includes("vi-tri-0-nam-3-0: chỉ chân dung career-switch mới có fromMajors")));
  assert.ok(result.errors.some((error) => error.includes("vi-tri-0-nam-3-1: cần ≥ 3 kỹ năng lõi (core) của vị trí, đang có 1")));
});

test("Chân dung nhắc kỹ năng không có → cảnh báo; câu riêng nhắc kỹ năng, công ty cũ trùng công ty tuyển → lỗi", () => {
  const result = validateLargeDemoLibrary(
    library({
      personas: {
        bioTails: ["Mình có kỹ năng giao tiếp tốt.", ...Array.from({ length: 29 }, (_, i) => `Câu giới thiệu riêng số ${i}.`)],
        pastCompanies: { cntt: ["Công ty 1", "Công ty cũ A", "Công ty cũ B", "Công ty cũ C", "Công ty cũ D"] },
        groups: [personaGroup({ "vi-tri-0-nam-3-2": { bio: "Mình viết API bằng Node.js, SQL và chạy trên Linux." } })],
      },
    }),
    CATALOG,
  );
  assert.ok(result.warnings.some((warning) => warning.includes(`vi-tri-0-nam-3-2.bio: nhắc "Linux"`)));
  assert.ok(result.errors.some((error) => error.includes(`bioTails.0: nhắc kỹ năng "Giao tiếp"`)));
  assert.ok(result.errors.some((error) => error.includes(`"Công ty 1" trùng tên công ty trong companies.json`)));
});

test("Sai cấu trúc (thiếu trường, khoá có dấu) → lỗi zod, không kiểm tiếp", () => {
  const raw = library({ first: { key: "Vị trí có dấu" } });
  const result = validateLargeDemoLibrary(raw, CATALOG);
  assert.equal(result.library, null);
  assert.ok(result.errors.some((error) => error.startsWith("positions.json positions.0.key")));
});

test("Hồ sơ trưng bày hợp lệ → không lỗi; cảnh báo thiếu tin chính, thiếu nhóm, thiếu tài khoản demo", () => {
  const result = validateLargeDemoLibrary(library(), CATALOG);
  assert.deepEqual(result.errors, []);
  for (const expected of ["PLAN cần 8–10", "chưa có hồ sơ nhóm hop-mot-phan", "công ty secondary \"cong-ty-1\" chưa có tài khoản demo", "0 ứng viên demoLogin"]) {
    assert.ok(result.warnings.some((warning) => warning.includes(expected)), expected);
  }
});

test("Mức hợp (tier) không khớp dữ liệu hồ sơ → lỗi", () => {
  const people = [
    showcaseCandidate({ key: "a", skills: [{ name: "Node.js", years: 1 }, { name: "JavaScript", years: 1 }], bio: "Mình viết API bằng Node.js." }),
    showcaseCandidate({ key: "b", tier: "hop-mot-phan" }),
    showcaseCandidate({ key: "c", tier: "nganh-gan" }),
    showcaseCandidate({ key: "d", tier: "doi-nganh", educations: [{ university: "Trường Đại học A", major: "Toán tin", startYear: 2023, endYear: 2027, isCurrent: true }] }),
    showcaseCandidate({ key: "e", tier: "so-sai" }),
    showcaseCandidate({ key: "f", tier: "ca-kho" }),
    showcaseCandidate({ key: "g", hardCase: "nhoi-tu-khoa" }),
  ];
  const result = validateLargeDemoLibrary(library({ showcase: { candidates: people } }), CATALOG);
  const at = (k: string, text: string) => result.errors.some((error) => error.includes(`[${k}]`) && error.includes(text));
  assert.ok(at("a", "thiếu kỹ năng bắt buộc SQL"));
  assert.ok(at("b", "đủ kỹ năng bắt buộc và đủ số năm"));
  assert.ok(at("c", "cần học ngành liên quan"));
  assert.ok(at("d", "không được học ngành chính hay ngành liên quan"));
  assert.ok(at("e", "chỉ có tiêu đề và 2–3 kỹ năng"));
  assert.ok(at("f", "cần hardCase"));
  assert.ok(at("g", "chỉ tier \"ca-kho\" mới có hardCase"));
});

test("Hồ sơ trưng bày: tên sai giới tính, sai cấp độ, trường lạ, không chung kỹ năng với tin → lỗi", () => {
  const people = [
    showcaseCandidate({ key: "a", gender: "FEMALE" }),
    showcaseCandidate({ key: "b", birthYear: 2001, educations: [{ university: "Trường Đại học A", major: "Công nghệ thông tin", startYear: 2024, endYear: 2028, isCurrent: true }] }),
    showcaseCandidate({ key: "c", educations: [{ university: "Trường Đại học Z", major: "Công nghệ thông tin", startYear: 2023, endYear: 2027, isCurrent: true }] }),
    showcaseCandidate({ key: "d", tier: "doi-nganh", skills: [{ name: "Docker", years: 1 }, { name: "Giao tiếp", years: 1 }], bio: "Mình chuyển sang làm phần mềm.",
      educations: [{ university: "Trường Đại học A", major: "Kế toán", startYear: 2023, endYear: 2027, isCurrent: true }] }),
    showcaseCandidate({ key: "e", experiences: [{ company: "Công ty 3", position: "Thực tập sinh", start: "2025-01", end: "2026-10", description: "Viết API." }] }),
    showcaseCandidate({ key: "f", bio: "Mình đã tốt nghiệp và có 2 năm làm Node.js với SQL." }),
  ];
  const result = validateLargeDemoLibrary(library({ showcase: { candidates: people } }), CATALOG);
  const at = (k: string, text: string) => result.errors.some((error) => error.includes(`[${k}]`) && error.includes(text));
  assert.ok(at("a", "không thuộc givenNames.FEMALE"));
  assert.ok(at("b", "ngoài khoảng của cấp độ nam-cuoi"));
  assert.ok(at("b", "phải nhập học năm 2023"));
  assert.ok(at("c", "trường \"Trường Đại học Z\""));
  assert.ok(at("d", "không có kỹ năng nào của tin"));
  assert.ok(at("e", "trùng tên công ty trong companies.json"));
  assert.ok(at("e", "vượt mức của cấp độ (12)"));
  assert.ok(at("f", "nói đã tốt nghiệp"));
  assert.ok(at("f", "ghi số năm"));
});

test("Tin chính: tiêu đề ngoài mẫu, biến thể không có, ngành ngoài vị trí, nhà tuyển dụng lạ → lỗi", () => {
  const jobs = [
    showcaseJob({ key: "t1", title: "Tiêu đề tự đặt" }),
    showcaseJob({ key: "t2", variant: 9 }),
    showcaseJob({ key: "t3", majors: { primary: ["Kế toán"], related: [] }, skillMinYears: { Docker: 1 } }),
    showcaseJob({ key: "t4", employer: "khong-co" }),
  ];
  const result = validateLargeDemoLibrary(library({ showcase: { jobs, candidates: [] } }), CATALOG);
  const at = (k: string, text: string) => result.errors.some((error) => error.includes(`[${k}]`) && error.includes(text));
  assert.ok(at("t1", "không thuộc titles.INTERNSHIP"));
  assert.ok(at("t2", "không có biến thể 9"));
  assert.ok(at("t3", "ngành chính \"Kế toán\""));
  assert.ok(at("t3", "skillMinYears \"Docker\""));
  assert.ok(at("t4", "nhà tuyển dụng \"khong-co\""));
});
