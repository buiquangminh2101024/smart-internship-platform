import type { ProfileCompletenessGroup, ProfileCompletenessKey, ProfileCompletenessNextStep } from "@sip/shared-types";

// Độ hoàn thiện hồ sơ (AD-26 mục 8) — docs/05-frontend/phases/job-discovery/PLAN.md bước F1, F3.
// API chỉ trả `key`; nhãn, lợi ích và nơi sửa nằm ở web.
// Không ghi kiểu "tăng x% điểm": điền thêm có thể làm điểm giảm nếu không khớp yêu cầu của tin.

/** Neo các phần trên trang /profile (CandidateProfileClient đặt `id` tương ứng). */
export const PROFILE_SECTION_ID = {
  completeness: "ho-so-hoan-thien",
  outreach: "ho-so-cho-phep-lien-he",
  personal: "ho-so-thong-tin",
  education: "ho-so-hoc-van",
  skills: "ho-so-ky-nang",
  experience: "ho-so-kinh-nghiem",
  projects: "ho-so-du-an",
} as const;

export interface ProfileCompletenessMeta {
  /** Tên mục trong danh sách tám mục. */
  label: string;
  /** Việc cần làm, viết thường, dùng sau "Nên làm trước:". */
  action: string;
  /** Nhãn nút / link tới chỗ sửa. */
  cta: string;
  benefit: string;
  href: string;
}

export const PROFILE_COMPLETENESS_META: Record<ProfileCompletenessKey, ProfileCompletenessMeta> = {
  skills: {
    label: "Kỹ năng",
    action: "thêm kỹ năng",
    cta: "Thêm kỹ năng",
    benefit: "Cần có để hệ thống gợi ý việc làm, báo tin mới và để nhà tuyển dụng tìm thấy bạn.",
    href: `/profile#${PROFILE_SECTION_ID.skills}`,
  },
  cv: {
    label: "CV",
    action: "tải lên hoặc tạo CV",
    cta: "Quản lý CV",
    benefit: "Cần có để ứng tuyển.",
    href: "/cv",
  },
  outreach: {
    label: "Cho phép nhà tuyển dụng tìm thấy",
    action: "bật cho phép nhà tuyển dụng tìm thấy",
    cta: "Bật cho phép liên hệ",
    benefit: "Để nhà tuyển dụng và hệ thống tự gửi lời mời cho bạn.",
    href: `/profile#${PROFILE_SECTION_ID.outreach}`,
  },
  experience: {
    label: "Kinh nghiệm làm việc",
    action: "thêm kinh nghiệm",
    cta: "Thêm kinh nghiệm",
    benefit: "Nhiều tin yêu cầu kinh nghiệm; có thông tin này thì điểm phù hợp chính xác hơn.",
    href: `/profile#${PROFILE_SECTION_ID.experience}`,
  },
  projects: {
    label: "Dự án",
    action: "thêm dự án",
    cta: "Thêm dự án",
    benefit: "Chưa đi làm thì dự án là thứ thể hiện bạn làm được gì.",
    href: `/profile#${PROFILE_SECTION_ID.projects}`,
  },
  headlineOrBio: {
    label: "Tiêu đề hoặc giới thiệu bản thân",
    action: "viết tiêu đề hoặc giới thiệu bản thân",
    cta: "Viết giới thiệu",
    benefit: "Nhà tuyển dụng đọc phần này đầu tiên; hệ thống cũng dùng nó để so nội dung hồ sơ với tin.",
    href: `/profile#${PROFILE_SECTION_ID.personal}`,
  },
  educationMajor: {
    label: "Học vấn có chọn ngành",
    action: "chọn ngành học",
    cta: "Chọn ngành học",
    benefit: "Chọn ngành trong danh sách thì hệ thống mới so được với ngành tin yêu cầu.",
    href: `/profile#${PROFILE_SECTION_ID.education}`,
  },
  city: {
    label: "Thành phố",
    action: "chọn thành phố",
    cta: "Chọn thành phố",
    benefit: "Cần để lọc việc gần bạn và nhận báo tin cùng thành phố.",
    href: `/profile#${PROFILE_SECTION_ID.personal}`,
  },
};

export const PROFILE_COMPLETENESS_GROUPS: Array<{ group: ProfileCompletenessGroup; title: string }> = [
  { group: "GATE", title: "Cần có để dùng các tính năng" },
  { group: "MATCH", title: "Giúp điểm phù hợp chính xác hơn" },
  { group: "FILTER", title: "Giúp lọc việc" },
];

/** Vế sau của "Nên làm trước": bằng chứng số tin nếu có, không thì lợi ích của mục. */
export function describeNextStep(step: ProfileCompletenessNextStep): string {
  const meta = PROFILE_COMPLETENESS_META[step.key];
  if (!step.evidence) return meta.benefit;
  const { jobCount, ofJobs } = step.evidence;
  const need = step.key === "educationMajor" ? "ghi ngành học cần có" : "yêu cầu kinh nghiệm";
  return `${jobCount}/${ofJobs} tin phù hợp nhất với bạn ${need}.`;
}
