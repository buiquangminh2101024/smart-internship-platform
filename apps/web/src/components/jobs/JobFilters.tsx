"use client";

import { useState } from "react";
import type { CatalogItem, JobPostExperienceFilter, JobPostType } from "@sip/shared-types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SkillFilter } from "@/components/jobs/SkillFilter";
import { JOB_TYPE_OPTIONS } from "@/lib/job-post-display";
import {
  EXPERIENCE_OPTIONS,
  MAX_FILTER_SKILLS,
  applySalaryValue,
  clearedJobFilters,
  salaryOptions,
  salarySelectValue,
  type JobSearchFilters,
} from "@/lib/job-search-params";

// Thanh lọc /jobs (AD-26, plan FE job-discovery bước F2). Từ md: ô từ khoá + hàng ô chọn + kỹ năng.
// Dưới md: chỉ ô từ khoá và nút "Bộ lọc (n)" mở ngăn kéo chứa các bộ lọc còn lại.
// Mọi ô chọn áp dụng ngay (ghi lên URL); từ khoá áp dụng khi bấm "Tìm việc" / Enter.

export interface JobFilterCatalogs {
  cities: CatalogItem[] | undefined;
  industries: CatalogItem[] | undefined;
  skills: CatalogItem[] | undefined;
}

interface FieldsProps {
  filters: JobSearchFilters;
  /** Nhận hàm cập nhật: hai thao tác liền nhau (URL chưa kịp đổi) vẫn cộng dồn đúng. */
  onChange: (change: (prev: JobSearchFilters) => JobSearchFilters) => void;
  catalogs: JobFilterCatalogs;
  isCandidate: boolean;
  /** `bar` = hàng ngang (nhãn ẩn), `stack` = cột trong ngăn kéo (có nhãn). */
  layout: "bar" | "stack";
}

function FilterFields({ filters, onChange, catalogs, isCandidate, layout }: FieldsProps) {
  const stacked = layout === "stack";
  const labelOf = (text: string) => (stacked ? { label: text } : { "aria-label": text });
  const idOf = (name: string) => `job-filter-${layout}-${name}`;

  const selects = (
    <>
      <Select
        id={idOf("city")}
        {...labelOf("Địa điểm")}
        value={filters.cityId}
        onChange={(event) => onChange((prev) => ({ ...prev, cityId: event.target.value }))}
        options={[{ value: "", label: "Tất cả khu vực" }, ...(catalogs.cities ?? []).map((city) => ({ value: city.id, label: city.name }))]}
      />
      <Select
        id={idOf("industry")}
        {...labelOf("Ngành nghề")}
        value={filters.industryId}
        onChange={(event) => onChange((prev) => ({ ...prev, industryId: event.target.value }))}
        options={[
          { value: "", label: "Tất cả ngành" },
          ...(catalogs.industries ?? []).map((industry) => ({ value: industry.id, label: industry.name })),
        ]}
      />
      <Select
        id={idOf("job-type")}
        {...labelOf("Loại hình")}
        value={filters.jobType}
        onChange={(event) => onChange((prev) => ({ ...prev, jobType: event.target.value as JobPostType | "" }))}
        options={[{ value: "", label: "Mọi loại hình" }, ...JOB_TYPE_OPTIONS]}
      />
      <Select
        id={idOf("salary")}
        {...labelOf("Mức lương")}
        value={salarySelectValue(filters)}
        onChange={(event) => onChange((prev) => applySalaryValue(prev, event.target.value))}
        options={salaryOptions(filters)}
      />
      <Select
        id={idOf("experience")}
        {...labelOf("Kinh nghiệm")}
        value={filters.experience}
        onChange={(event) => onChange((prev) => ({ ...prev, experience: event.target.value as JobPostExperienceFilter | "" }))}
        options={EXPERIENCE_OPTIONS}
      />
    </>
  );

  const skillFilter = (
    <SkillFilter
      catalog={catalogs.skills ?? []}
      selectedIds={filters.skillIds}
      mode={filters.skillMode}
      showSelected={stacked}
      {...(stacked ? { label: "Kỹ năng" } : {})}
      onAdd={(skillId) => 
        onChange((prev) =>
          prev.skillIds.includes(skillId) || prev.skillIds.length >= MAX_FILTER_SKILLS
            ? prev
            : { ...prev, skillIds: [...prev.skillIds, skillId] },
        )
      }
      onRemove={(skillId) =>
        onChange((prev) => {
          const rest = prev.skillIds.filter((id) => id !== skillId);
          return { ...prev, skillIds: rest, skillMode: rest.length > 1 ? prev.skillMode : "any" };
        })
      }
      onModeChange={(skillMode) => onChange((prev) => ({ ...prev, skillMode }))}
    />
  );

  const matchSwitch = isCandidate ? (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm text-text-body">
      <button
        type="button"
        role="switch"
        aria-checked={filters.minMatch}
        onClick={() => onChange((prev) => ({ ...prev, minMatch: !prev.minMatch }))}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-200 ${
          filters.minMatch ? "bg-brand-600" : "bg-text-subtle"
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            filters.minMatch ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
      <span>
        Chỉ tin phù hợp với tôi <span className="font-num tabular-nums">(≥ 70%)</span>
      </span>
    </label>
  ) : null;

  if (stacked) {
    return (
      <div className="grid gap-4">
        {selects}
        {skillFilter}
        {matchSwitch}
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-5">{selects}</div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="w-full max-w-md">{skillFilter}</div>
        {matchSwitch}
      </div>
    </div>
  );
}

export interface JobFiltersProps {
  filters: JobSearchFilters;
  /** Nhận hàm cập nhật: hai thao tác liền nhau (URL chưa kịp đổi) vẫn cộng dồn đúng. */
  onChange: (change: (prev: JobSearchFilters) => JobSearchFilters) => void;
  catalogs: JobFilterCatalogs;
  isCandidate: boolean;
  /** Số bộ lọc đang bật ngoài từ khoá — hiện trên nút "Bộ lọc (n)". */
  activeCount: number;
  /** Tổng số tin theo bộ lọc hiện tại, cho nút cuối ngăn kéo; chưa biết thì null. */
  total: number | null;
}

export function JobFilters({ filters, onChange, catalogs, isCandidate, activeCount, total }: JobFiltersProps) {
  const [keyword, setKeyword] = useState(filters.q);
  // Từ khoá trên URL đổi từ nơi khác (bỏ chip, "Xoá tất cả", Back) ⇒ ô nhập theo URL.
  const [syncedQ, setSyncedQ] = useState(filters.q);
  if (syncedQ !== filters.q) {
    setSyncedQ(filters.q);
    setKeyword(filters.q);
  }
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fieldProps = { filters, onChange, catalogs, isCandidate };

  return (
    <Card padding="sm" className="grid gap-3">
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onChange((prev) => ({ ...prev, q: keyword.trim() }));
        }}
      >
        {/* Input đặt className vào ô nhập, không vào khung bọc — giãn bằng thẻ bọc ngoài. */}
        <div className="min-w-0 flex-1">
          <Input
            icon="search"
            type="search"
            aria-label="Từ khoá"
            placeholder="Vị trí, kỹ năng hoặc công ty"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <Button type="submit" icon="search" className="max-md:hidden">
          Tìm việc
        </Button>
        <Button
          type="button"
          variant="secondary"
          icon="sliders-horizontal"
          className="md:hidden"
          aria-haspopup="dialog"
          onClick={() => setDrawerOpen(true)}
        >
          Bộ lọc{activeCount > 0 ? <span className="font-num tabular-nums"> ({activeCount})</span> : null}
        </Button>
      </form>

      <div className="max-md:hidden">
        <FilterFields {...fieldProps} layout="bar" />
      </div>

      <Dialog open={drawerOpen} onClose={() => setDrawerOpen(false)} labelledBy="job-filter-drawer-title" fullScreenOnMobile>
        <DialogHeader titleId="job-filter-drawer-title" title="Bộ lọc" onClose={() => setDrawerOpen(false)} />
        <DialogBody>
          <FilterFields {...fieldProps} layout="stack" />
        </DialogBody>
        <DialogFooter>
          {activeCount > 0 ? (
            <Button type="button" variant="ghost" onClick={() => onChange((prev) => ({ ...clearedJobFilters(prev), q: prev.q }))}>
              Xoá bộ lọc
            </Button>
          ) : null}
          <Button type="button" onClick={() => setDrawerOpen(false)}>
            {total === null ? "Xem kết quả" : (
              <>
                Xem <span className="font-num tabular-nums">{total.toLocaleString("vi-VN")}</span> việc làm
              </>
            )}
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}
