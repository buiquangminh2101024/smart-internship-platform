// Chạy: node --import tsx --test tests/unit/match-text-builder.test.ts (từ apps/server)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCandidateMatchText,
  buildJobMatchText,
  type CandidateTextSource,
  type JobTextSource,
} from "../../src/modules/job-matching/match-text.builder";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

function candidate(overrides: Partial<CandidateTextSource> = {}): CandidateTextSource {
  return {
    headline: null,
    bio: null,
    skills: [],
    educations: [],
    workExperiences: [],
    projects: [],
    ...overrides,
  };
}

function job(overrides: Partial<JobTextSource> = {}): JobTextSource {
  return { title: "Thực tập sinh Frontend", requirements: null, description: null, skills: [], ...overrides };
}

test("Hồ sơ đầy đủ: đúng mẫu v1, đúng thứ tự dòng", () => {
  const text = buildCandidateMatchText(
    candidate({
      headline: "Sinh viên thực tập Frontend",
      bio: "Sinh viên năm cuối.",
      skills: [
        { name: "TypeScript", yearsOfExperience: 1 },
        { name: "React", yearsOfExperience: 2 },
      ],
      educations: [{ majorName: "Công nghệ thông tin", degree: "Đại học", startYear: 2021, endYear: 2025, isCurrent: false }],
      workExperiences: [{ position: "Thực tập sinh Frontend", startDate: d("2024-06-01") }],
      projects: [{ name: "Website bán hàng", startDate: d("2024-01-01") }],
    }),
  );
  assert.equal(
    text,
    [
      "Chức danh: Sinh viên thực tập Frontend",
      "Ngành học: Công nghệ thông tin; Đại học",
      "Kỹ năng: React, TypeScript",
      "Kinh nghiệm: Thực tập sinh Frontend",
      "Dự án: Website bán hàng",
      "Giới thiệu: Sinh viên năm cuối.",
    ].join("\n"),
  );
});

test("Dòng không có dữ liệu bị bỏ hẳn; hồ sơ trống ra chuỗi rỗng", () => {
  assert.equal(buildCandidateMatchText(candidate({ headline: "  Dev  " })), "Chức danh: Dev");
  assert.equal(buildCandidateMatchText(candidate()), "");
  assert.equal(buildCandidateMatchText(candidate({ headline: "   ", bio: "\n\t" })), "");
});

test("Ngành học chỉ có một nửa thông tin vẫn dựng được, không thừa dấu phân cách", () => {
  const only = (majorName: string | null, degree: string | null) =>
    buildCandidateMatchText(candidate({ educations: [{ majorName, degree, startYear: null, endYear: null, isCurrent: false }] }));
  assert.equal(only("Kế toán", null), "Ngành học: Kế toán");
  assert.equal(only(null, "Cao đẳng"), "Ngành học: Cao đẳng");
  assert.equal(only(null, null), "");
});

test("Kỹ năng: năm giảm dần, hoà thì theo tên, tối đa 15", () => {
  const skills = Array.from({ length: 20 }, (_, index) => ({ name: `Skill${String(index).padStart(2, "0")}`, yearsOfExperience: 0 }));
  skills.push({ name: "Zeta", yearsOfExperience: 3 });
  const line = buildCandidateMatchText(candidate({ skills })).split(": ")[1]!.split(", ");
  assert.equal(line.length, 15);
  assert.equal(line[0], "Zeta");
  assert.equal(line[1], "Skill00");
  assert.equal(line[14], "Skill13");
});

test("Học vấn gần nhất: đang học thắng; sau đó endYear rồi startYear", () => {
  const edu = (majorName: string, endYear: number | null, startYear: number | null, isCurrent = false) => ({
    majorName,
    degree: null,
    startYear,
    endYear,
    isCurrent,
  });
  const pick = (educations: ReturnType<typeof edu>[]) => buildCandidateMatchText(candidate({ educations }));
  assert.equal(pick([edu("A", 2020, 2016), edu("B", 2024, 2020)]), "Ngành học: B");
  assert.equal(pick([edu("A", 2024, 2019), edu("B", 2024, 2021)]), "Ngành học: B");
  assert.equal(pick([edu("A", 2030, 2026), edu("B", null, 2025, true)]), "Ngành học: B");
});

test("Kinh nghiệm: 3 vị trí gần nhất theo startDate, dòng thiếu ngày xếp cuối", () => {
  const text = buildCandidateMatchText(
    candidate({
      workExperiences: [
        { position: "Cũ nhất", startDate: d("2019-01-01") },
        { position: "Không ngày", startDate: null },
        { position: "Mới nhất", startDate: d("2024-01-01") },
        { position: "Giữa", startDate: d("2022-01-01") },
      ],
    }),
  );
  assert.equal(text, "Kinh nghiệm: Mới nhất, Giữa, Cũ nhất");
});

test("Dự án: tối đa 2, mới nhất trước", () => {
  const text = buildCandidateMatchText(
    candidate({
      projects: [
        { name: "P-cũ", startDate: d("2020-01-01") },
        { name: "P-mới", startDate: d("2024-01-01") },
        { name: "P-giữa", startDate: d("2022-01-01") },
      ],
    }),
  );
  assert.equal(text, "Dự án: P-mới, P-giữa");
});

test("Giới thiệu bị cắt ở 300 ký tự và khoảng trắng được gom", () => {
  const text = buildCandidateMatchText(candidate({ bio: `${"a  b\n".repeat(200)}` }));
  const bio = text.replace("Giới thiệu: ", "");
  assert.equal(Array.from(bio).length <= 300, true);
  assert.equal(/\s{2,}|\n/.test(bio), false);
});

test("Cắt theo ký tự Unicode: không chẻ đôi emoji", () => {
  const text = buildCandidateMatchText(candidate({ bio: "😀".repeat(400) }));
  const bio = text.replace("Giới thiệu: ", "");
  assert.equal(Array.from(bio).length, 300);
  assert.equal(bio, "😀".repeat(300));
});

test("Chữ tiếng Việt dựng sẵn và tổ hợp (NFC/NFD) ra cùng văn bản", () => {
  const nfc = "Kế toán".normalize("NFC");
  const nfd = "Kế toán".normalize("NFD");
  assert.notEqual(nfc, nfd);
  assert.equal(buildCandidateMatchText(candidate({ headline: nfc })), buildCandidateMatchText(candidate({ headline: nfd })));
});

test("Ổn định: đảo thứ tự đầu vào không đổi văn bản (hash không dao động)", () => {
  const base = candidate({
    skills: [
      { name: "B", yearsOfExperience: 1 },
      { name: "A", yearsOfExperience: 1 },
      { name: "C", yearsOfExperience: 2 },
    ],
    workExperiences: [
      { position: "X", startDate: d("2020-01-01") },
      { position: "Y", startDate: d("2023-01-01") },
    ],
    educations: [
      { majorName: "M1", degree: null, startYear: 2016, endYear: 2020, isCurrent: false },
      { majorName: "M2", degree: null, startYear: 2020, endYear: 2024, isCurrent: false },
    ],
    projects: [
      { name: "P1", startDate: d("2021-01-01") },
      { name: "P2", startDate: d("2022-01-01") },
    ],
  });
  const reversed: CandidateTextSource = {
    ...base,
    skills: [...base.skills].reverse(),
    workExperiences: [...base.workExperiences].reverse(),
    educations: [...base.educations].reverse(),
    projects: [...base.projects].reverse(),
  };
  assert.equal(buildCandidateMatchText(base), buildCandidateMatchText(reversed));
});

test("Không rò thông tin nhạy cảm: họ tên, trường, công ty, thành phố, SĐT, giới tính, ngày sinh", () => {
  // Kiểu nguồn không có các trường này; ép thêm vào để chắc chắn builder không
  // "vô tình" đọc chúng nếu ai đó thêm sau này.
  const leaky = {
    ...candidate({
      headline: "Dev",
      educations: [{ majorName: "CNTT", degree: "Đại học", startYear: 2020, endYear: 2024, isCurrent: false }],
      workExperiences: [{ position: "Intern", startDate: d("2024-01-01") }],
    }),
    fullName: "Nguyễn Văn Bí Mật",
    universityName: "Đại học Bí Mật",
    company: "Công ty Bí Mật",
    cityName: "Thành phố Bí Mật",
    phone: "0900000000",
    gender: "FEMALE",
    dateOfBirth: d("2000-01-01"),
  } as CandidateTextSource;
  const text = buildCandidateMatchText(leaky);
  for (const secret of ["Bí Mật", "0900000000", "FEMALE", "2000"]) {
    assert.equal(text.includes(secret), false, `không được chứa "${secret}"`);
  }
});

test("Tin đầy đủ: đúng mẫu v1", () => {
  const text = buildJobMatchText(
    job({
      requirements: "Sinh viên năm 3, 4.",
      description: "Tham gia phát triển giao diện.",
      skills: [
        { name: "TypeScript", importance: "PREFERRED" },
        { name: "React", importance: "REQUIRED" },
        { name: "CSS", importance: "REQUIRED" },
      ],
    }),
  );
  assert.equal(
    text,
    [
      "Vị trí: Thực tập sinh Frontend",
      "Kỹ năng bắt buộc: CSS, React",
      "Kỹ năng ưu tiên: TypeScript",
      "Yêu cầu: Sinh viên năm 3, 4.",
      "Mô tả: Tham gia phát triển giao diện.",
    ].join("\n"),
  );
});

test("Tin: bỏ dòng trống, cắt requirements 400 và description 300", () => {
  assert.equal(buildJobMatchText(job()), "Vị trí: Thực tập sinh Frontend");
  const text = buildJobMatchText(job({ requirements: "r".repeat(1000), description: "d".repeat(1000) }));
  const lines = Object.fromEntries(text.split("\n").map((line) => line.split(": ") as [string, string]));
  assert.equal(lines["Yêu cầu"]!.length, 400);
  assert.equal(lines["Mô tả"]!.length, 300);
});

test("Tin: thứ tự skill đầu vào không ảnh hưởng văn bản", () => {
  const skills = [
    { name: "B", importance: "REQUIRED" as const },
    { name: "A", importance: "REQUIRED" as const },
    { name: "D", importance: "PREFERRED" as const },
    { name: "C", importance: "PREFERRED" as const },
  ];
  assert.equal(buildJobMatchText(job({ skills })), buildJobMatchText(job({ skills: [...skills].reverse() })));
});
