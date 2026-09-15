"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JobPostSearchQuery, JobPostType } from "@sip/shared-types";
import { usePublicJobPosts, type OptionalQuery } from "@/hooks/useJobPosts";
import { useCities, useIndustries, useSkills } from "@/hooks/useCatalog";
import { Badge } from "@/components/ui/Badge";
import { JOB_TYPE_LABEL, JOB_TYPE_OPTIONS, formatDeadline, formatSalary } from "@/lib/job-post-display";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { JobCard } from "@/components/ui/JobCard";
import { Select } from "@/components/ui/Select";

const SALARY_OPTIONS = [
  { value: "", label: "Mọi mức lương" },
  { value: "3000000", label: "Từ 3 triệu" },
  { value: "5000000", label: "Từ 5 triệu" },
  { value: "8000000", label: "Từ 8 triệu" },
  { value: "12000000", label: "Từ 12 triệu" },
];

/**
 * Tìm kiếm tin tuyển dụng công khai (6-FE-4, bản tối giản theo kế hoạch —
 * `docs/05-frontend/phases/phase-06-job-recruitment/PLAN.md`). Sẽ được thiết kế
 * lại chi tiết khi có mẫu UI đầy đủ.
 */
export default function PublicJobsPage() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState<OptionalQuery<JobPostSearchQuery>>({});
  const { data: cities } = useCities();
  const { data: industries } = useIndustries();
  const { data: skills } = useSkills();
  const { data, isLoading } = usePublicJobPosts(filters);

  const selectedSkillIds = filters.skillIds ?? [];

  /** Bấm một chip kỹ năng = bật/tắt nó trong bộ lọc (tin phải có ĐỦ các kỹ năng đã chọn). */
  function toggleSkill(skillId: string) {
    const next = selectedSkillIds.includes(skillId)
      ? selectedSkillIds.filter((id) => id !== skillId)
      : [...selectedSkillIds, skillId];
    patch({ skillIds: next.length > 0 ? next : undefined });
  }

  // OptionalQuery cho phép truyền `undefined` khi người dùng bỏ chọn bộ lọc
  // (tsconfig bật exactOptionalPropertyTypes).
  function patch(partial: OptionalQuery<JobPostSearchQuery>) {
    setFilters((prev) => {
      const next = { ...prev, ...partial };
      // Bỏ hẳn key rỗng để query string sạch và React Query cache đúng khóa.
      for (const key of Object.keys(next) as (keyof JobPostSearchQuery)[]) {
        if (next[key] === undefined || next[key] === "") delete next[key];
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <CandidateHomeHeader />

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-5 px-6 py-10">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold text-text-strong">Việc thực tập đang tuyển</h1>
          <p className="text-sm text-text-muted">Tin tuyển dụng từ doanh nghiệp đã được xác minh trên InternHub.</p>
        </div>

        <Card padding="sm" as="form" className="flex flex-col gap-2 md:flex-row" onSubmit={(e) => {
          e.preventDefault();
          patch({ q: keyword.trim() });
        }}>
          <Input
            icon="search"
            placeholder="Vị trí, kỹ năng hoặc công ty"
            className="flex-[1.4]"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Select
            className="flex-1"
            aria-label="Địa điểm"
            value={filters.cityId ?? ""}
            onChange={(e) => patch({ cityId: e.target.value })}
            options={[{ value: "", label: "Tất cả khu vực" }, ...(cities ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Select
            className="flex-1"
            aria-label="Ngành nghề"
            value={filters.industryId ?? ""}
            onChange={(e) => patch({ industryId: e.target.value })}
            options={[{ value: "", label: "Tất cả ngành" }, ...(industries ?? []).map((i) => ({ value: i.id, label: i.name }))]}
          />
          <Select
            className="flex-1"
            aria-label="Loại hình"
            value={filters.jobType ?? ""}
            onChange={(e) => patch({ jobType: (e.target.value || undefined) as JobPostType | undefined })}
            options={[{ value: "", label: "Mọi loại hình" }, ...JOB_TYPE_OPTIONS]}
          />
          <Select
            className="flex-1"
            aria-label="Mức lương"
            value={filters.salaryMin ? String(filters.salaryMin) : ""}
            onChange={(e) => patch({ salaryMin: e.target.value ? Number(e.target.value) : undefined })}
            options={SALARY_OPTIONS}
          />
          <Button type="submit" icon="search">
            Tìm việc
          </Button>
        </Card>

        {/* Lọc theo kỹ năng: danh sách chip thay vì multi-select — số kỹ năng
            trong danh mục còn nhỏ và chip bấm được ngay trên điện thoại. */}
        {skills && skills.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-text-muted">Kỹ năng:</span>
            {skills.map((skill) => {
              const active = selectedSkillIds.includes(skill.id);
              return (
                <button key={skill.id} type="button" onClick={() => toggleSkill(skill.id)} aria-pressed={active}>
                  <Badge tone={active ? "brand" : "neutral"}>{skill.name}</Badge>
                </button>
              );
            })}
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-text-muted">Đang tải...</p>
        ) : !data || data.items.length === 0 ? (
          <Card padding="lg" className="text-center text-sm text-text-muted">
            Chưa có tin tuyển dụng nào khớp bộ lọc của bạn.
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.items.map((job) => (
              <JobCard
                key={job.id}
                title={job.title}
                company={job.company.name}
                verified={job.company.isVerified}
                location={job.cityName ?? job.address ?? undefined}
                salary={formatSalary(job)}
                deadline={formatDeadline(job.expiresAt)}
                tags={[JOB_TYPE_LABEL[job.jobType], ...(job.industryName ? [job.industryName] : [])]}
                onClick={() => router.push(`/jobs/${job.id}`)}
              />
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
