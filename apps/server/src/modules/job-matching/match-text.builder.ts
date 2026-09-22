// Dựng văn bản đưa vào model embedding (Job Matcher GĐ2, mẫu `templateVersion = 1` —
// docs/06-backend/job-matcher-phase2/PLAN.md, mục "Dựng văn bản để embed").
// Hai hàm thuần: cùng đầu vào ⇒ cùng văn bản byte-for-byte, vì văn bản đi vào
// contentHash (thứ tự khoá, khoảng trắng, Unicode đều phải ổn định).
//
// KHÔNG đưa vào văn bản: giới tính, ngày sinh, thành phố, số điện thoại, họ tên,
// tên trường đại học, tên công ty cũ (quyết định #8). Các kiểu nguồn bên dưới cố ý
// không có những trường đó — thiếu trường ở kiểu là lớp chặn đầu tiên.

export interface CandidateTextSource {
  headline: string | null;
  bio: string | null;
  skills: { name: string; yearsOfExperience: number }[];
  educations: {
    majorName: string | null;
    degree: string | null;
    startYear: number | null;
    endYear: number | null;
    isCurrent: boolean;
  }[];
  workExperiences: { position: string; startDate: Date | null }[];
  projects: { name: string; startDate: Date | null }[];
}

export interface JobTextSource {
  title: string;
  requirements: string | null;
  description: string | null;
  /** Chỉ skill APPROVED (giống JobMatchProfile). */
  skills: { name: string; importance: "REQUIRED" | "PREFERRED" }[];
}

const MAX_SKILLS = 15;
const MAX_POSITIONS = 3;
const MAX_PROJECTS = 2;
const MAX_BIO_CHARS = 300;
const MAX_REQUIREMENTS_CHARS = 400;
const MAX_DESCRIPTION_CHARS = 300;

export function buildCandidateMatchText(source: CandidateTextSource): string {
  const skills = [...source.skills]
    .sort((a, b) => descending(a.yearsOfExperience, b.yearsOfExperience) || compareText(a.name, b.name))
    .slice(0, MAX_SKILLS)
    .map((skill) => skill.name);

  const education = [...source.educations].sort(compareEducationRecency)[0];
  const educationText = education ? joinParts([education.majorName, education.degree], "; ") : "";

  const positions = [...source.workExperiences]
    .sort((a, b) => descending(timeOf(a.startDate), timeOf(b.startDate)) || compareText(a.position, b.position))
    .slice(0, MAX_POSITIONS)
    .map((experience) => experience.position);

  const projects = [...source.projects]
    .sort((a, b) => descending(timeOf(a.startDate), timeOf(b.startDate)) || compareText(a.name, b.name))
    .slice(0, MAX_PROJECTS)
    .map((project) => project.name);

  return toLines([
    ["Chức danh", source.headline],
    ["Ngành học", educationText],
    ["Kỹ năng", joinParts(skills, ", ")],
    ["Kinh nghiệm", joinParts(positions, ", ")],
    ["Dự án", joinParts(projects, ", ")],
    ["Giới thiệu", truncate(source.bio, MAX_BIO_CHARS)],
  ]);
}

export function buildJobMatchText(source: JobTextSource): string {
  const names = (importance: "REQUIRED" | "PREFERRED") =>
    source.skills
      .filter((skill) => skill.importance === importance)
      .map((skill) => skill.name)
      .sort(compareText);

  return toLines([
    ["Vị trí", source.title],
    ["Kỹ năng bắt buộc", joinParts(names("REQUIRED"), ", ")],
    ["Kỹ năng ưu tiên", joinParts(names("PREFERRED"), ", ")],
    ["Yêu cầu", truncate(source.requirements, MAX_REQUIREMENTS_CHARS)],
    ["Mô tả", truncate(source.description, MAX_DESCRIPTION_CHARS)],
  ]);
}

/** NFC + gom khoảng trắng: cùng chữ tiếng Việt viết dạng dựng sẵn hay tổ hợp phải ra cùng hash. */
function clean(value: string | null | undefined): string {
  return (value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

function truncate(value: string | null | undefined, maxChars: number): string {
  // Array.from: cắt theo ký tự Unicode, không chẻ đôi cặp surrogate (emoji).
  return Array.from(clean(value)).slice(0, maxChars).join("").trim();
}

function joinParts(parts: (string | null | undefined)[], separator: string): string {
  return parts.map(clean).filter(Boolean).join(separator);
}

/** Dòng rỗng bị bỏ hẳn — không để lại "Chức danh: ". */
function toLines(entries: [label: string, value: string | null | undefined][]): string {
  return entries
    .map(([label, value]) => [label, clean(value)] as const)
    .filter(([, value]) => value !== "")
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

// So sánh theo mã ký tự (không localeCompare): kết quả không phụ thuộc ICU/locale của máy.
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function timeOf(date: Date | null): number {
  return date ? date.getTime() : Number.NEGATIVE_INFINITY;
}

// Đang học được coi là mới nhất; sau đó endYear rồi startYear giảm dần; hoà thì theo chữ.
type EducationSource = CandidateTextSource["educations"][number];

function compareEducationRecency(a: EducationSource, b: EducationSource): number {
  const endOf = (education: EducationSource) =>
    education.isCurrent ? Number.POSITIVE_INFINITY : (education.endYear ?? Number.NEGATIVE_INFINITY);
  const startOf = (education: EducationSource) => education.startYear ?? Number.NEGATIVE_INFINITY;
  return (
    descending(endOf(a), endOf(b)) ||
    descending(startOf(a), startOf(b)) ||
    compareText(clean(a.majorName), clean(b.majorName)) ||
    compareText(clean(a.degree), clean(b.degree))
  );
}

/** Thứ tự giảm dần; không trừ nhau vì ±Infinity − ±Infinity ra NaN. */
function descending(a: number, b: number): number {
  return a === b ? 0 : b > a ? 1 : -1;
}
