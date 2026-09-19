import type { CvExtractionResult } from "../shared/ports/CvExtractor";

// Prompt + schema + bước làm sạch dùng chung cho mọi adapter CvExtractor
// (Gemini, OpenRouter) — hai model phải trả về cùng một hình dạng dữ liệu.

export const CV_EXTRACTION_INSTRUCTIONS = [
  "Bạn là bộ đọc CV cho một nền tảng tuyển dụng thực tập sinh Việt Nam.",
  "Nhiệm vụ: đọc tài liệu đính kèm (hoặc văn bản bên dưới) và trích thông tin ra đúng JSON schema được yêu cầu.",
  "",
  "Quy tắc bắt buộc:",
  "1. Trước hết xác định tài liệu có phải CV/sơ yếu lý lịch của một người không. Nếu KHÔNG (ảnh phong cảnh, hoá đơn, bài báo, ảnh quá mờ không đọc được...) thì trả isValidCv=false, invalidReason là 1 câu tiếng Việt giải thích ngắn, mọi danh sách để rỗng, mọi field trong candidate để null.",
  "2. KHÔNG bịa dữ liệu. Thông tin nào không có trong tài liệu thì để null (hoặc danh sách rỗng). Không suy đoán giới tính, ngày sinh, số điện thoại.",
  "3. Giữ nguyên ngôn ngữ gốc của nội dung, không dịch.",
  "4. Ngày tháng: 'YYYY-MM-DD' nếu biết ngày, 'YYYY-MM' nếu chỉ biết tháng, 'YYYY' nếu chỉ biết năm. Mục đang diễn ra ('hiện tại', 'present', 'nay') thì endDate=null và isCurrent/isWorkingOn=true.",
  "   CV Việt Nam ghi ngày theo thứ tự NGÀY/THÁNG/NĂM (vd. '12/03/2026' là ngày 12 tháng 3). Nếu đọc ra ngày kết thúc sớm hơn ngày bắt đầu thì gần như chắc chắn đã đảo ngày/tháng — đọc lại.",
  "5. headline: chức danh/vị trí mong muốn ngắn gọn (vd. 'Frontend Developer Intern'). bio: đoạn mục tiêu nghề nghiệp / giới thiệu bản thân.",
  "6. gender chỉ điền khi CV ghi rõ (Nam → MALE, Nữ → FEMALE, khác → OTHER).",
  "7. educations: universityName là tên trường, majorName là tên ngành/chuyên ngành, degree là bậc học (Cử nhân, Kỹ sư, ...). startYear/endYear là số năm (vd. 2021).",
  "8. skills: mỗi phần tử là MỘT kỹ năng ngắn gọn (vd. 'ReactJS', 'SQL', 'Giao tiếp'), không trùng lặp, không ghép nhiều kỹ năng vào một chuỗi.",
  "9. extractionConfidence='low' nếu tài liệu khó đọc (mờ, bị cắt, lẫn lộn) khiến kết quả có thể thiếu/sai; ngược lại 'high'.",
].join("\n");

const nullableString = { type: "string", nullable: true } as const;

// Định dạng OpenAPI-subset mà Gemini responseSchema nhận. OpenRouter không
// ép schema được với mọi model nên nhận bản mô tả này qua prompt.
export const CV_EXTRACTION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    isValidCv: { type: "boolean" },
    invalidReason: nullableString,
    extractionConfidence: { type: "string", enum: ["high", "low"] },
    candidate: {
      type: "object",
      properties: {
        fullName: nullableString,
        headline: nullableString,
        bio: nullableString,
        phone: nullableString,
        dateOfBirth: nullableString,
        gender: { type: "string", enum: ["MALE", "FEMALE", "OTHER"], nullable: true },
      },
    },
    educations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          universityName: nullableString,
          majorName: nullableString,
          degree: nullableString,
          startYear: { type: "integer", nullable: true },
          endYear: { type: "integer", nullable: true },
          isCurrent: { type: "boolean" },
          description: nullableString,
        },
      },
    },
    workExperiences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          position: { type: "string" },
          startDate: nullableString,
          endDate: nullableString,
          isCurrent: { type: "boolean" },
          description: nullableString,
        },
        required: ["company", "position"],
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: nullableString,
          url: nullableString,
          isWorkingOn: { type: "boolean" },
          startDate: nullableString,
          endDate: nullableString,
        },
        required: ["name"],
      },
    },
    certificates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          issuer: nullableString,
          issueDate: nullableString,
          credentialUrl: nullableString,
          description: nullableString,
        },
        required: ["name"],
      },
    },
    awards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          issuer: nullableString,
          date: nullableString,
          description: nullableString,
        },
        required: ["name"],
      },
    },
    skills: { type: "array", items: { type: "string" } },
  },
  required: [
    "isValidCv",
    "extractionConfidence",
    "candidate",
    "educations",
    "workExperiences",
    "projects",
    "certificates",
    "awards",
    "skills",
  ],
} as const;

/**
 * Model nhỏ (nhất là tầng free của OpenRouter) hay trả thiếu field, sai kiểu,
 * hoặc bọc JSON trong ```json ... ```. Không tin output: ép từng field về đúng
 * kiểu, bỏ phần tử rác, thay vì để dữ liệu méo lọt vào DB rồi Phase 2 vấp.
 * Ném lỗi chỉ khi hoàn toàn không đọc được JSON — để tầng dự phòng thử tiếp.
 */
export function parseCvExtraction(text: string | undefined | null): CvExtractionResult {
  if (!text) throw new Error("Empty CV extraction response");

  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let payload: unknown;
  try {
    payload = JSON.parse(cleaned);
  } catch {
    throw new Error("CV extraction response is not valid JSON");
  }
  if (!isRecord(payload)) throw new Error("CV extraction response is not a JSON object");

  const isValidCv = payload.isValidCv !== false;
  const candidate = isRecord(payload.candidate) ? payload.candidate : {};

  const result: CvExtractionResult = {
    isValidCv,
    invalidReason: isValidCv ? null : (str(payload.invalidReason) ?? "Tài liệu không phải CV"),
    extractionConfidence: payload.extractionConfidence === "low" ? "low" : "high",
    rawOcrText: null,
    candidate: {
      fullName: str(candidate.fullName),
      headline: str(candidate.headline),
      bio: str(candidate.bio),
      phone: str(candidate.phone),
      dateOfBirth: str(candidate.dateOfBirth),
      gender: oneOf(candidate.gender, ["MALE", "FEMALE", "OTHER"] as const),
    },
    educations: list(payload.educations)
      .map((item) => ({
        universityName: str(item.universityName),
        majorName: str(item.majorName),
        degree: str(item.degree),
        startYear: year(item.startYear),
        endYear: year(item.endYear),
        isCurrent: item.isCurrent === true,
        description: str(item.description),
      }))
      .filter((item) => item.universityName || item.majorName),
    workExperiences: list(payload.workExperiences).flatMap((item) => {
      const company = str(item.company);
      const position = str(item.position);
      if (!company && !position) return [];
      return [
        {
          company: company ?? "",
          position: position ?? "",
          startDate: str(item.startDate),
          endDate: str(item.endDate),
          isCurrent: item.isCurrent === true,
          description: str(item.description),
        },
      ];
    }),
    projects: list(payload.projects).flatMap((item) => {
      const name = str(item.name);
      if (!name) return [];
      return [
        {
          name,
          description: str(item.description),
          url: str(item.url),
          isWorkingOn: item.isWorkingOn === true,
          startDate: str(item.startDate),
          endDate: str(item.endDate),
        },
      ];
    }),
    certificates: list(payload.certificates).flatMap((item) => {
      const name = str(item.name);
      if (!name) return [];
      return [
        {
          name,
          issuer: str(item.issuer),
          issueDate: str(item.issueDate),
          credentialUrl: str(item.credentialUrl),
          description: str(item.description),
        },
      ];
    }),
    awards: list(payload.awards).flatMap((item) => {
      const name = str(item.name);
      if (!name) return [];
      return [{ name, issuer: str(item.issuer), date: str(item.date), description: str(item.description) }];
    }),
    skills: uniqueSkills(payload.skills),
  };

  // Model đôi khi vừa nói "không phải CV" vừa trả dữ liệu — bỏ dữ liệu, đúng
  // quy tắc "không bịa" trong prompt.
  return result.isValidCv ? result : emptyExtraction({ isValidCv: false, invalidReason: result.invalidReason });
}

export function emptyExtraction(overrides: Partial<CvExtractionResult> = {}): CvExtractionResult {
  return {
    isValidCv: true,
    invalidReason: null,
    extractionConfidence: "high",
    rawOcrText: null,
    candidate: { fullName: null, headline: null, bio: null, phone: null, dateOfBirth: null, gender: null },
    educations: [],
    workExperiences: [],
    projects: [],
    certificates: [],
    awards: [],
    skills: [],
    ...overrides,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function str(value: unknown): string | null {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

function year(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed)) return null;
  return parsed >= 1950 && parsed <= 2100 ? parsed : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function uniqueSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const item of value) {
    const name = str(item);
    if (!name || name.length > 100) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push(name);
  }
  return skills;
}
