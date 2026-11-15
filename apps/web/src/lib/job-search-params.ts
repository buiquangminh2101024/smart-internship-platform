import type {
  CatalogItem,
  JobPostExperienceFilter,
  JobPostSalaryKind,
  JobPostSearchQuery,
  JobPostSkillMode,
  JobPostSort,
  JobPostType,
} from "@sip/shared-types";
import { JOB_TYPE_LABEL } from "@/lib/job-post-display";

// Bộ lọc của /jobs nằm trên URL (AD-26, docs/05-frontend/phases/job-discovery/PLAN.md bước F2):
// tên tham số trùng tên tham số GET /job-posts, để link chia sẻ và nút Back mở đúng cảnh đang xem.

export interface JobSearchFilters {
  q: string;
  cityId: string;
  industryId: string;
  jobType: JobPostType | "";
  salaryMin: number | null;
  salaryKind: JobPostSalaryKind | "";
  experience: JobPostExperienceFilter | "";
  skillIds: string[];
  skillMode: JobPostSkillMode;
  sort: JobPostSort;
  /** "Chỉ tin phù hợp với tôi (≥ 70%)" — chỉ có tác dụng với ứng viên đăng nhập. */
  minMatch: boolean;
}

/** Cùng trần với `skillIds` của `jobPostSearchQuerySchema` ở server. */
export const MAX_FILTER_SKILLS = 10;

export const EMPTY_JOB_FILTERS: JobSearchFilters = {
  q: "",
  cityId: "",
  industryId: "",
  jobType: "",
  salaryMin: null,
  salaryKind: "",
  experience: "",
  skillIds: [],
  skillMode: "any",
  sort: "newest",
  minMatch: false,
};

export const EXPERIENCE_LABEL: Record<JobPostExperienceFilter, string> = {
  none: "Không yêu cầu kinh nghiệm",
  lt1: "Dưới 1 năm kinh nghiệm",
  "1to2": "1 – 2 năm kinh nghiệm",
  gt2: "Trên 2 năm kinh nghiệm",
};

export const EXPERIENCE_OPTIONS = [
  { value: "", label: "Mọi kinh nghiệm" },
  { value: "none", label: "Không yêu cầu" },
  { value: "lt1", label: "Dưới 1 năm" },
  { value: "1to2", label: "1 – 2 năm" },
  { value: "gt2", label: "Trên 2 năm" },
];

const SALARY_STEPS = [3_000_000, 5_000_000, 8_000_000, 12_000_000];

function salaryStepLabel(amount: number): string {
  return `Từ ${(amount / 1_000_000).toLocaleString("vi-VN")} triệu`;
}

/**
 * Một ô "Lương" gộp hai tham số: `salaryKind` (có ghi mức lương / thoả thuận) và `salaryMin`
 * (từ x triệu). Hai tham số không đi cùng nhau trên giao diện — "từ x triệu" đã ngầm là có ghi lương.
 */
export function salarySelectValue(filters: JobSearchFilters): string {
  if (filters.salaryMin !== null) return String(filters.salaryMin);
  return filters.salaryKind;
}

export function salaryOptions(filters: JobSearchFilters): Array<{ value: string; label: string }> {
  const options = [
    { value: "", label: "Mọi mức lương" },
    { value: "disclosed", label: "Có ghi mức lương" },
    { value: "negotiable", label: "Thoả thuận" },
    ...SALARY_STEPS.map((step) => ({ value: String(step), label: salaryStepLabel(step) })),
  ];
  // Link cũ / gõ tay có thể mang mức khác các bước có sẵn — vẫn hiện đúng trong ô.
  if (filters.salaryMin !== null && !SALARY_STEPS.includes(filters.salaryMin)) {
    options.push({ value: String(filters.salaryMin), label: salaryStepLabel(filters.salaryMin) });
  }
  return options;
}

export function applySalaryValue(filters: JobSearchFilters, value: string): JobSearchFilters {
  if (value === "disclosed" || value === "negotiable") return { ...filters, salaryKind: value, salaryMin: null };
  const amount = Number(value);
  if (value && Number.isInteger(amount) && amount > 0) return { ...filters, salaryMin: amount, salaryKind: "" };
  return { ...filters, salaryMin: null, salaryKind: "" };
}

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | "" {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

export function parseJobSearchParams(params: URLSearchParams): JobSearchFilters {
  const salaryMin = Number(params.get("salaryMin"));
  const skillIds = (params.get("skillIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return {
    q: (params.get("q") ?? "").trim(),
    cityId: params.get("cityId") ?? "",
    industryId: params.get("industryId") ?? "",
    jobType: oneOf(params.get("jobType"), Object.keys(JOB_TYPE_LABEL) as JobPostType[]),
    salaryMin: Number.isInteger(salaryMin) && salaryMin > 0 ? salaryMin : null,
    salaryKind: oneOf(params.get("salaryKind"), ["disclosed", "negotiable"] as const),
    experience: oneOf(params.get("experience"), ["none", "lt1", "1to2", "gt2"] as const),
    skillIds: [...new Set(skillIds)].slice(0, MAX_FILTER_SKILLS),
    skillMode: params.get("skillMode") === "all" ? "all" : "any",
    sort: params.get("sort") === "match" ? "match" : "newest",
    minMatch: params.get("minMatch") === "70",
  };
}

/** Chỉ ghi tham số khác mặc định, để URL gọn. */
export function toJobSearchParams(filters: JobSearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.cityId) params.set("cityId", filters.cityId);
  if (filters.industryId) params.set("industryId", filters.industryId);
  if (filters.jobType) params.set("jobType", filters.jobType);
  if (filters.salaryMin !== null) params.set("salaryMin", String(filters.salaryMin));
  else if (filters.salaryKind) params.set("salaryKind", filters.salaryKind);
  if (filters.experience) params.set("experience", filters.experience);
  if (filters.skillIds.length > 0) params.set("skillIds", filters.skillIds.join(","));
  if (filters.skillIds.length > 1 && filters.skillMode === "all") params.set("skillMode", "all");
  if (filters.sort === "match") params.set("sort", "match");
  if (filters.minMatch) params.set("minMatch", "70");
  return params;
}

/**
 * Tham số gửi GET /job-posts. Khách không gửi `sort=match` / `minMatch` (server cũng bỏ qua),
 * để khoá cache của khách không tách ra theo tham số vô tác dụng.
 */
export function toJobSearchQuery(filters: JobSearchFilters, isCandidate: boolean): JobPostSearchQuery {
  const query: JobPostSearchQuery = {};
  if (filters.q) query.q = filters.q;
  if (filters.cityId) query.cityId = filters.cityId;
  if (filters.industryId) query.industryId = filters.industryId;
  if (filters.jobType) query.jobType = filters.jobType;
  if (filters.salaryMin !== null) query.salaryMin = filters.salaryMin;
  else if (filters.salaryKind) query.salaryKind = filters.salaryKind;
  if (filters.experience) query.experience = filters.experience;
  if (filters.skillIds.length > 0) {
    query.skillIds = filters.skillIds;
    if (filters.skillIds.length > 1 && filters.skillMode === "all") query.skillMode = "all";
  }
  if (isCandidate && filters.sort === "match") query.sort = "match";
  if (isCandidate && filters.minMatch) query.minMatch = 70;
  return query;
}

export interface ActiveFilterChip {
  key: string;
  label: string;
  /** Bộ lọc sau khi bỏ chip này. */
  without: JobSearchFilters;
}

interface ChipCatalogs {
  cities: CatalogItem[] | undefined;
  industries: CatalogItem[] | undefined;
  skills: CatalogItem[] | undefined;
}

function nameOf(list: CatalogItem[] | undefined, id: string): string {
  return list?.find((item) => item.id === id)?.name ?? "…";
}

/** Chip "Đang lọc" — không gồm cách sắp xếp. */
export function activeFilterChips(
  filters: JobSearchFilters,
  catalogs: ChipCatalogs,
  isCandidate: boolean,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.q) chips.push({ key: "q", label: `Từ khoá: ${filters.q}`, without: { ...filters, q: "" } });
  if (filters.cityId) {
    chips.push({ key: "city", label: nameOf(catalogs.cities, filters.cityId), without: { ...filters, cityId: "" } });
  }
  if (filters.industryId) {
    chips.push({
      key: "industry",
      label: nameOf(catalogs.industries, filters.industryId),
      without: { ...filters, industryId: "" },
    });
  }
  if (filters.jobType) {
    chips.push({ key: "jobType", label: JOB_TYPE_LABEL[filters.jobType], without: { ...filters, jobType: "" } });
  }
  const salaryValue = salarySelectValue(filters);
  if (salaryValue) {
    chips.push({
      key: "salary",
      label: salaryOptions(filters).find((option) => option.value === salaryValue)?.label ?? salaryValue,
      without: applySalaryValue(filters, ""),
    });
  }
  if (filters.experience) {
    chips.push({ key: "experience", label: EXPERIENCE_LABEL[filters.experience], without: { ...filters, experience: "" } });
  }
  for (const skillId of filters.skillIds) {
    const rest = filters.skillIds.filter((id) => id !== skillId);
    chips.push({
      key: `skill-${skillId}`,
      label: nameOf(catalogs.skills, skillId),
      without: { ...filters, skillIds: rest, skillMode: rest.length > 1 ? filters.skillMode : "any" },
    });
  }
  if (filters.skillIds.length > 1 && filters.skillMode === "all") {
    chips.push({ key: "skillMode", label: "Có đủ tất cả kỹ năng đã chọn", without: { ...filters, skillMode: "any" } });
  }
  if (isCandidate && filters.minMatch) {
    chips.push({ key: "minMatch", label: "Phù hợp từ 70%", without: { ...filters, minMatch: false } });
  }
  return chips;
}

/** "Xoá tất cả" giữ cách sắp xếp đang chọn. */
export function clearedJobFilters(filters: JobSearchFilters): JobSearchFilters {
  return { ...EMPTY_JOB_FILTERS, sort: filters.sort };
}
