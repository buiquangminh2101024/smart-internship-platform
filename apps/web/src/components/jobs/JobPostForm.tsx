"use client";

import { useState, type ReactNode } from "react";
import type { CreateJobPostRequest, JobPost, JobPostType } from "@sip/shared-types";
import { useCities, useIndustries } from "@/hooks/useCatalog";
import {
  JOB_TYPE_OPTIONS,
  MAX_EXPIRY_DAYS,
  expiryInputToIso,
  maxExpiryInputValue,
  minExpiryInputValue,
  toDateInputValue,
  validateExpiryInput,
} from "@/lib/job-post-display";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

export type JobPostFormAction = "draft" | "preview" | "submit";

export interface JobPostFormProps {
  initial?: JobPost | undefined;
  saving?: boolean;
  error?: string | null;
  /** Banner phía trên form (trạng thái xác minh công ty, quota còn lại...). */
  notice?: ReactNode;
  onAction: (dto: CreateJobPostRequest, action: JobPostFormAction) => void;
  onCancel?: (() => void) | undefined;
}

interface FormState {
  title: string;
  industryId: string;
  cityId: string;
  address: string;
  jobType: JobPostType;
  isNegotiable: boolean;
  salaryMin: string;
  salaryMax: string;
  expiresAt: string;
  description: string;
  requirements: string;
  benefits: string;
}

function toFormState(job: JobPost | undefined): FormState {
  return {
    title: job?.title ?? "",
    industryId: job?.industryId ?? "",
    cityId: job?.cityId ?? "",
    address: job?.address ?? "",
    jobType: job?.jobType ?? "INTERNSHIP",
    isNegotiable: job?.isNegotiable ?? false,
    salaryMin: job?.salaryMin != null ? String(job.salaryMin) : "",
    salaryMax: job?.salaryMax != null ? String(job.salaryMax) : "",
    expiresAt: toDateInputValue(job?.expiresAt ?? null),
    description: job?.description ?? "",
    requirements: job?.requirements ?? "",
    benefits: job?.benefits ?? "",
  };
}

/**
 * Form tạo/sửa tin tuyển dụng — khớp ảnh mẫu
 * `Screenshot 2026-09-12 134041.png` (panel 2): 1 cột, 2 nhóm "Thông tin cơ
 * bản" và "Chi tiết công việc". Dùng useState + callback (pattern của
 * CreateCompanyForm), không dùng CollectionSection vì đây là single-entity.
 */
export function JobPostForm({ initial, saving = false, error, notice, onAction, onCancel }: JobPostFormProps) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [validationError, setValidationError] = useState<string | null>(null);
  const { data: industries } = useIndustries();
  const { data: cities } = useCities();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(action: JobPostFormAction): CreateJobPostRequest | null {
    if (!form.title.trim()) return fail("Vui lòng nhập tiêu đề tin tuyển dụng");
    if (!form.description.trim()) return fail("Vui lòng nhập mô tả công việc");

    const salaryMin = form.salaryMin ? Number(form.salaryMin) : undefined;
    const salaryMax = form.salaryMax ? Number(form.salaryMax) : undefined;
    if (!form.isNegotiable && salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax) {
      return fail("Lương tối thiểu không được lớn hơn lương tối đa");
    }
    // Hạn nộp chỉ bắt buộc khi đưa tin ra ngoài; lưu nháp thì để trống được.
    if (action !== "draft" && !form.expiresAt) {
      return fail("Vui lòng chọn hạn nộp hồ sơ trước khi gửi duyệt");
    }
    if (form.expiresAt) {
      const expiryError = validateExpiryInput(form.expiresAt);
      if (expiryError) return fail(expiryError);
    }

    setValidationError(null);
    return {
      title: form.title.trim(),
      description: form.description.trim(),
      jobType: form.jobType,
      industryId: form.industryId,
      cityId: form.cityId,
      address: form.address.trim(),
      requirements: form.requirements.trim(),
      benefits: form.benefits.trim(),
      isNegotiable: form.isNegotiable,
      ...(form.isNegotiable ? {} : { ...(salaryMin !== undefined ? { salaryMin } : {}), ...(salaryMax !== undefined ? { salaryMax } : {}) }),
      ...(form.expiresAt ? { expiresAt: expiryInputToIso(form.expiresAt) } : {}),
    };
  }

  function fail(message: string): null {
    setValidationError(message);
    return null;
  }

  function handle(action: JobPostFormAction) {
    const dto = validate(action);
    if (dto) onAction(dto, action);
  }

  const message = validationError ?? error;

  return (
    <div className="grid gap-4">
      {notice}

      <Card padding="lg" className="grid gap-4">
        <h2 className="text-base font-semibold text-text-strong">Thông tin cơ bản</h2>
        <Input
          label="Tiêu đề tin tuyển dụng"
          required
          placeholder="Thực tập sinh Full Stack"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Ngành nghề"
            value={form.industryId}
            onChange={(e) => set("industryId", e.target.value)}
            options={[{ value: "", label: "— Chọn ngành nghề —" }, ...(industries ?? []).map((i) => ({ value: i.id, label: i.name }))]}
          />
          <Select
            label="Tỉnh / Thành phố"
            value={form.cityId}
            onChange={(e) => set("cityId", e.target.value)}
            options={[{ value: "", label: "— Chọn địa điểm —" }, ...(cities ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
        </div>
        <Input
          label="Địa chỉ làm việc"
          icon="map-pin"
          placeholder="Quận 1, TP. Hồ Chí Minh"
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Loại hình"
            required
            value={form.jobType}
            onChange={(e) => set("jobType", e.target.value as JobPostType)}
            options={JOB_TYPE_OPTIONS}
          />
          <Input
            label="Hạn nộp hồ sơ"
            type="date"
            hint={`Tối đa ${MAX_EXPIRY_DAYS} ngày kể từ hôm nay. Bắt buộc trước khi gửi duyệt.`}
            min={minExpiryInputValue()}
            max={maxExpiryInputValue()}
            value={form.expiresAt}
            onChange={(e) => set("expiresAt", e.target.value)}
          />
        </div>

        <Field label="Mức lương">
          <div className="grid gap-3">
            <label className="flex items-center gap-2 text-sm text-text-body">
              <input
                type="radio"
                name="salary-mode"
                checked={!form.isNegotiable}
                onChange={() => set("isNegotiable", false)}
              />
              Có mức lương cụ thể
            </label>
            {!form.isNegotiable ? (
              <div className="flex flex-wrap items-center gap-2 pl-6">
                <Input
                  type="number"
                  min={0}
                  step={500000}
                  placeholder="5000000"
                  aria-label="Lương tối thiểu (VND)"
                  className="w-40"
                  value={form.salaryMin}
                  onChange={(e) => set("salaryMin", e.target.value)}
                />
                <span className="text-text-muted">—</span>
                <Input
                  type="number"
                  min={0}
                  step={500000}
                  placeholder="8000000"
                  aria-label="Lương tối đa (VND)"
                  className="w-40"
                  value={form.salaryMax}
                  onChange={(e) => set("salaryMax", e.target.value)}
                />
                <span className="text-sm text-text-muted">VND / tháng</span>
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-text-body">
              <input type="radio" name="salary-mode" checked={form.isNegotiable} onChange={() => set("isNegotiable", true)} />
              Thỏa thuận
            </label>
          </div>
        </Field>
      </Card>

      <Card padding="lg" className="grid gap-4">
        <h2 className="text-base font-semibold text-text-strong">Chi tiết công việc</h2>
        <Textarea
          label="Mô tả công việc"
          required
          rows={6}
          placeholder="Tham gia phát triển giao diện người dùng cho các ứng dụng web quản lý doanh nghiệp."
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
        <Textarea
          label="Yêu cầu ứng viên"
          rows={5}
          placeholder="Sinh viên năm cuối hoặc mới tốt nghiệp."
          value={form.requirements}
          onChange={(e) => set("requirements", e.target.value)}
        />
        <Textarea
          label="Quyền lợi"
          rows={5}
          placeholder="Môi trường làm việc trẻ trung, năng động."
          value={form.benefits}
          onChange={(e) => set("benefits", e.target.value)}
        />
      </Card>

      {message ? <p className="text-sm text-red-600">{message}</p> : null}

      <div className="flex flex-wrap justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Hủy
          </Button>
        ) : null}
        <Button type="button" variant="secondary" disabled={saving} onClick={() => handle("draft")}>
          Lưu nháp
        </Button>
        <Button type="button" variant="secondary" icon="eye" disabled={saving} onClick={() => handle("preview")}>
          Xem trước
        </Button>
        <Button type="button" loading={saving} onClick={() => handle("submit")}>
          Gửi duyệt
        </Button>
      </div>
    </div>
  );
}
