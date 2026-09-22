import type { Prisma } from "@prisma/client";
import type { JobPost as JobPostDto, JobPostModerationActionDto } from "@sip/shared-types";
import type { JobPostWithRelations } from "./job-post.repository";

type ModerationActionWithActor = JobPostWithRelations["moderationActions"][number];

// Cột JSON không có ràng buộc kiểu ở DB — đọc phòng thủ, sai hình dạng thì coi như chưa có.
function toRequirementsExtra(value: Prisma.JsonValue | null): JobPostDto["requirementsExtra"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const languages = Array.isArray(value.languages) ? value.languages : [];
  const other = Array.isArray(value.other) ? value.other : [];
  return {
    languages: languages.flatMap((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item) || typeof item.language !== "string") return [];
      return [
        {
          language: item.language,
          level: typeof item.level === "string" ? item.level : null,
          importance: item.importance === "PREFERRED" ? "PREFERRED" : "REQUIRED",
        },
      ];
    }),
    other: other.filter((item): item is string => typeof item === "string"),
  };
}

function toModerationActionDto(action: ModerationActionWithActor): JobPostModerationActionDto {
  return {
    id: action.id,
    action: action.action,
    // Chưa có bảng profile chung cho Admin — dùng email làm tên hiển thị,
    // null khi hệ thống tự hành động (requiresApproval=false, cron hết hạn).
    actorName: action.actor?.email ?? null,
    reason: action.reason,
    createdAt: action.createdAt.toISOString(),
  };
}

/**
 * `publicOnly` lọc bỏ skill còn PENDING: trang công khai chỉ được thấy skill đã
 * duyệt, trong khi form sửa tin của chính Employer phải thấy đủ cả skill họ vừa
 * tự đề xuất (nếu không, lần lưu sau sẽ vô tình xoá mất).
 */
export function toJobPostDto(jobPost: JobPostWithRelations, options?: { publicOnly?: boolean }): JobPostDto {
  const latest = jobPost.moderationActions[0];
  const skills = jobPost.skills
    .filter((link) => !options?.publicOnly || link.skill.status === "APPROVED")
    .map((link) => ({
      id: link.skill.id,
      name: link.skill.name,
      status: link.skill.status,
      importance: link.importance,
      minYears: link.minYears,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const majors = jobPost.majors
    .map((link) => ({ majorId: link.major.id, name: link.major.name, relevance: link.relevance }))
    .sort((left, right) =>
      left.relevance === right.relevance ? left.name.localeCompare(right.name) : left.relevance === "PRIMARY" ? -1 : 1,
    );

  return {
    id: jobPost.id,
    companyId: jobPost.companyId,
    company: {
      id: jobPost.company.id,
      name: jobPost.company.name,
      logoUrl: jobPost.company.logoUrl,
      website: jobPost.company.website,
      isVerified: jobPost.company.isVerified,
      industryId: jobPost.company.industryId,
      cityId: jobPost.company.cityId,
      address: jobPost.company.address,
      taxCode: jobPost.company.taxCode,
      description: jobPost.company.description,
    },
    title: jobPost.title,
    description: jobPost.description,
    jobType: jobPost.jobType,
    status: jobPost.status,
    salaryMin: jobPost.salaryMin,
    salaryMax: jobPost.salaryMax,
    isNegotiable: jobPost.isNegotiable,
    requirements: jobPost.requirements,
    benefits: jobPost.benefits,
    cityId: jobPost.cityId,
    cityName: jobPost.city?.name ?? null,
    address: jobPost.address,
    industryId: jobPost.industryId,
    industryName: jobPost.industry?.name ?? null,
    publishedAt: jobPost.publishedAt?.toISOString() ?? null,
    expiresAt: jobPost.expiresAt?.toISOString() ?? null,
    closedAt: jobPost.closedAt?.toISOString() ?? null,
    viewCount: jobPost.viewCount,
    minExperienceYears: jobPost.minExperienceYears,
    skills,
    majors,
    requirementsExtra: toRequirementsExtra(jobPost.requirementsExtra),
    requirementsConfirmedAt: jobPost.requirementsConfirmedAt?.toISOString() ?? null,
    applicationCount: jobPost._count?.applications ?? 0,
    latestModerationAction: latest ? toModerationActionDto(latest) : null,
    createdAt: jobPost.createdAt.toISOString(),
    updatedAt: jobPost.updatedAt.toISOString(),
  };
}
