"use client";

import { useRef, useState, type ReactNode } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { CreateJobPostRequest, JobPost } from "@sip/shared-types";
import { useCities, useIndustries, useSkills } from "@/hooks/useCatalog";
import { suggestSkill } from "@/lib/skills";
import { SkillMultiSelect, type SelectedSkill } from "@/components/shared/SkillMultiSelect";
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

const JOB_POST_TYPES = ["INTERNSHIP", "PART_TIME", "FULL_TIME", "CONTRACT"] as const;
/** Cùng trần với minExperienceYears ở apps/server/src/modules/job-posts/job-posts.dto.ts. */
const MAX_MIN_EXPERIENCE_YEARS = 20;

// Mọi field text luôn có giá trị string (mặc định "" từ toDefaultValues, chưa
// bao giờ undefined) — không dùng .optional() để tránh phải rải `| undefined`
// khắp component; draftSchema (lưu nháp) chỉ chặn chuỗi rỗng ở title/description,
// submitSchema ghi đè thêm .min(1) cho các field bắt buộc khi gửi duyệt.
const baseFields = {
  title: z.string().trim().min(1, "Vui lòng nhập tiêu đề tin tuyển dụng"),
  description: z.string().trim().min(1, "Vui lòng nhập mô tả công việc"),
  jobType: z.enum(JOB_POST_TYPES),
  industryId: z.string().trim(),
  cityId: z.string().trim(),
  address: z.string().trim(),
  salaryMin: z.string().trim(),
  salaryMax: z.string().trim(),
  isNegotiable: z.boolean(),
  expiresAt: z.string().trim(),
  requirements: z.string().trim(),
  benefits: z.string().trim(),
  // Tuỳ chọn ở mọi action (không thuộc bộ ràng buộc gửi duyệt AD-10); "" = không yêu cầu.
  minExperienceYears: z
    .string()
    .trim()
    .refine((value) => {
      if (!value) return true;
      const years = Number(value);
      return Number.isFinite(years) && years >= 0 && years <= MAX_MIN_EXPERIENCE_YEARS;
    }, `Số năm kinh nghiệm phải từ 0 đến ${MAX_MIN_EXPERIENCE_YEARS}`),
};

const draftSchema = z.object(baseFields);

// Xem trước / gửi duyệt cần đủ thông tin để ứng viên xem và ứng tuyển được —
// bắt buộc thêm ngành nghề, địa điểm, địa chỉ, hạn nộp, mức lương (hoặc thoả
// thuận) và ít nhất 1 kỹ năng (skills kiểm tra riêng, không nằm trong schema
// vì không phải field điều khiển bởi react-hook-form).
const submitSchema = z
  .object({
    ...baseFields,
    industryId: z.string().trim().min(1, "Vui lòng chọn ngành nghề"),
    cityId: z.string().trim().min(1, "Vui lòng chọn tỉnh / thành phố"),
    address: z.string().trim().min(1, "Vui lòng nhập địa chỉ làm việc"),
    expiresAt: z.string().trim().min(1, "Vui lòng chọn hạn nộp hồ sơ trước khi gửi duyệt"),
  })
  .superRefine((values, ctx) => {
    if (!values.isNegotiable && !values.salaryMin && !values.salaryMax) {
      ctx.addIssue({ code: "custom", path: ["salaryMin"], message: "Vui lòng nhập mức lương hoặc chọn Thỏa thuận" });
    }
    const min = values.salaryMin ? Number(values.salaryMin) : undefined;
    const max = values.salaryMax ? Number(values.salaryMax) : undefined;
    if (min !== undefined && max !== undefined && min > max) {
      ctx.addIssue({ code: "custom", path: ["salaryMax"], message: "Lương tối thiểu không được lớn hơn lương tối đa" });
    }
    const expiryError = values.expiresAt ? validateExpiryInput(values.expiresAt) : null;
    if (expiryError) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: expiryError });
    }
  });

type FormValues = z.infer<typeof draftSchema>;

function toDefaultValues(job: JobPost | undefined): FormValues {
  return {
    title: job?.title ?? "",
    description: job?.description ?? "",
    jobType: job?.jobType ?? "INTERNSHIP",
    industryId: job?.industryId ?? "",
    cityId: job?.cityId ?? "",
    address: job?.address ?? "",
    salaryMin: job?.salaryMin != null ? String(job.salaryMin) : "",
    salaryMax: job?.salaryMax != null ? String(job.salaryMax) : "",
    isNegotiable: job?.isNegotiable ?? false,
    expiresAt: toDateInputValue(job?.expiresAt ?? null),
    requirements: job?.requirements ?? "",
    benefits: job?.benefits ?? "",
    minExperienceYears: job?.minExperienceYears != null ? String(job.minExperienceYears) : "",
  };
}

/**
 * Form tạo/sửa tin tuyển dụng — khớp ảnh mẫu
 * `Screenshot 2026-09-12 134041.png` (panel 2): 1 cột, 2 nhóm "Thông tin cơ
 * bản" và "Chi tiết công việc". react-hook-form + zod để hiện lỗi theo từng
 * field cùng lúc (thay vì dừng lại ở lỗi đầu tiên) — action "draft" dùng
 * schema lỏng, "preview"/"submit" dùng schema đủ ràng buộc (xem actionRef).
 */
export function JobPostForm({ initial, saving = false, error, notice, onAction, onCancel }: JobPostFormProps) {
  const actionRef = useRef<JobPostFormAction>("draft");
  // Kỹ năng nằm ở bảng nối nên không đi cùng FormValues (toàn string) — giữ
  // state riêng, gom vào `skillIds` (Bắt buộc) / `preferredSkillIds` (Ưu tiên)
  // lúc submit. Skill PENDING employer vừa đề xuất cũng nằm trong danh sách này
  // và được gửi lên như skill thường.
  const [skills, setSkills] = useState<SelectedSkill[]>(() =>
    (initial?.skills ?? []).map((skill) => ({
      id: skill.id,
      name: skill.name,
      status: skill.status,
      importance: skill.importance,
    })),
  );
  const [skillsError, setSkillsError] = useState<string | null>(null);
  // Giữ song song với RHF (setValue đồng bộ) thay vì watch("isNegotiable") —
  // watch() trả về hàm không memo-hoá được, khiến React Compiler bỏ qua tối
  // ưu cho cả component (cảnh báo react-hooks/incompatible-library).
  const [isNegotiable, setIsNegotiable] = useState(initial?.isNegotiable ?? false);
  const { data: industries } = useIndustries();
  const { data: cities } = useCities();
  const { data: skillCatalog } = useSkills();

  // resolver chọn schema theo action lúc bấm nút (xem `handle`) — cùng một
  // useForm nhưng lưu nháp không bị áp các ràng buộc chỉ cần khi gửi duyệt.
  const resolver: Resolver<FormValues> = (values, context, options) => {
    const schema = actionRef.current === "draft" ? draftSchema : submitSchema;
    return zodResolver(schema)(values, context, options) as ReturnType<Resolver<FormValues>>;
  };

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver,
    defaultValues: toDefaultValues(initial),
  });

  function setNegotiable(value: boolean) {
    setIsNegotiable(value);
    setValue("isNegotiable", value);
  }

  function onValid(values: FormValues) {
    if (actionRef.current !== "draft" && skills.length === 0) {
      setSkillsError("Vui lòng chọn ít nhất 1 kỹ năng yêu cầu");
      return;
    }
    setSkillsError(null);

    const salaryMin = values.salaryMin ? Number(values.salaryMin) : undefined;
    const salaryMax = values.salaryMax ? Number(values.salaryMax) : undefined;

    const dto: CreateJobPostRequest = {
      title: values.title.trim(),
      description: values.description.trim(),
      jobType: values.jobType,
      industryId: values.industryId,
      cityId: values.cityId,
      address: values.address.trim(),
      requirements: values.requirements.trim(),
      benefits: values.benefits.trim(),
      isNegotiable: values.isNegotiable,
      // Luôn gửi cả hai danh sách — backend ghi kỹ năng thành một khối.
      skillIds: skills.filter((skill) => skill.importance !== "PREFERRED").map((skill) => skill.id),
      preferredSkillIds: skills.filter((skill) => skill.importance === "PREFERRED").map((skill) => skill.id),
      // null khi để trống để xoá được yêu cầu đã lưu trước đó.
      minExperienceYears: values.minExperienceYears ? Number(values.minExperienceYears) : null,
      ...(values.isNegotiable
        ? {}
        : { ...(salaryMin !== undefined ? { salaryMin } : {}), ...(salaryMax !== undefined ? { salaryMax } : {}) }),
      ...(values.expiresAt ? { expiresAt: expiryInputToIso(values.expiresAt) } : {}),
    };

    onAction(dto, actionRef.current);
  }

  function handle(action: JobPostFormAction) {
    actionRef.current = action;
    void handleSubmit(onValid)();
  }

  return (
    <div className="grid gap-4">
      {notice}

      <Card padding="lg" className="grid gap-4">
        <h2 className="text-base font-semibold text-text-strong">Thông tin cơ bản</h2>
        <Input
          label="Tiêu đề tin tuyển dụng"
          required
          placeholder="Thực tập sinh Full Stack"
          error={errors.title?.message}
          {...register("title")}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Ngành nghề"
            required
            hint="Bắt buộc trước khi xem trước/gửi duyệt."
            error={errors.industryId?.message}
            options={[{ value: "", label: "— Chọn ngành nghề —" }, ...(industries ?? []).map((i) => ({ value: i.id, label: i.name }))]}
            {...register("industryId")}
          />
          <Select
            label="Tỉnh / Thành phố"
            required
            hint="Bắt buộc trước khi xem trước/gửi duyệt."
            error={errors.cityId?.message}
            options={[{ value: "", label: "— Chọn địa điểm —" }, ...(cities ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            {...register("cityId")}
          />
        </div>
        <Input
          label="Địa chỉ làm việc"
          required
          icon="map-pin"
          hint="Bắt buộc trước khi xem trước/gửi duyệt."
          placeholder="Quận 1, TP. Hồ Chí Minh"
          error={errors.address?.message}
          {...register("address")}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Loại hình"
            required
            error={errors.jobType?.message}
            options={JOB_TYPE_OPTIONS}
            {...register("jobType")}
          />
          <Input
            label="Hạn nộp hồ sơ"
            required
            type="date"
            hint={`Tối đa ${MAX_EXPIRY_DAYS} ngày kể từ hôm nay. Bắt buộc trước khi gửi duyệt.`}
            min={minExpiryInputValue()}
            max={maxExpiryInputValue()}
            error={errors.expiresAt?.message}
            {...register("expiresAt")}
          />
        </div>

        <Field label="Mức lương" required error={errors.salaryMin?.message ?? errors.salaryMax?.message}>
          <div className="grid gap-3">
            <label className="flex items-center gap-2 text-sm text-text-body">
              <input
                type="radio"
                name="salary-mode"
                checked={!isNegotiable}
                onChange={() => setNegotiable(false)}
              />
              Có mức lương cụ thể
            </label>
            {!isNegotiable ? (
              <div className="flex flex-wrap items-center gap-2 pl-6">
                <Input
                  type="number"
                  min={0}
                  step={500000}
                  placeholder="5000000"
                  aria-label="Lương tối thiểu (VND)"
                  className="w-40"
                  {...register("salaryMin")}
                />
                <span className="text-text-muted">—</span>
                <Input
                  type="number"
                  min={0}
                  step={500000}
                  placeholder="8000000"
                  aria-label="Lương tối đa (VND)"
                  className="w-40"
                  {...register("salaryMax")}
                />
                <span className="text-sm text-text-muted">VND / tháng</span>
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-text-body">
              <input type="radio" name="salary-mode" checked={isNegotiable} onChange={() => setNegotiable(true)} />
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
          error={errors.description?.message}
          {...register("description")}
        />
        <Textarea
          label="Yêu cầu ứng viên"
          rows={5}
          placeholder="Sinh viên năm cuối hoặc mới tốt nghiệp."
          {...register("requirements")}
        />
        <Textarea
          label="Quyền lợi"
          rows={5}
          placeholder="Môi trường làm việc trẻ trung, năng động."
          {...register("benefits")}
        />
        <SkillMultiSelect
          label="Kỹ năng yêu cầu"
          hint="Bắt buộc ít nhất 1 kỹ năng trước khi xem trước/gửi duyệt. Kỹ năng mới thêm là Bắt buộc — bấm nhãn trên kỹ năng để đổi sang Ưu tiên. Không tìm thấy kỹ năng cần tuyển? Gõ tên rồi bấm Thêm — kỹ năng mới sẽ được quản trị viên duyệt trước khi vào danh mục chung."
          selected={skills}
          catalog={skillCatalog ?? []}
          disabled={saving}
          onAdd={(skill) => {
            setSkills((prev) => [...prev, { ...skill, importance: "REQUIRED" }]);
            setSkillsError(null);
          }}
          onRemove={(skillId) => setSkills((prev) => prev.filter((skill) => skill.id !== skillId))}
          onChangeImportance={(skillId, importance) =>
            setSkills((prev) => prev.map((skill) => (skill.id === skillId ? { ...skill, importance } : skill)))
          }
          onSuggestNew={(name) => suggestSkill("employer", name)}
        />
        {skillsError ? <p className="text-sm text-red-600">{skillsError}</p> : null}
        <Input
          label="Kinh nghiệm tối thiểu (năm)"
          type="number"
          min={0}
          max={MAX_MIN_EXPERIENCE_YEARS}
          step={0.5}
          className="w-40"
          hint="Tuỳ chọn. Để trống nếu không yêu cầu kinh nghiệm (phổ biến với tin thực tập)."
          error={errors.minExperienceYears?.message}
          {...register("minExperienceYears")}
        />
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

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
