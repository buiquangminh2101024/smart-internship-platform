"use client";

import { useRef, useState, type ReactNode } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { ConfirmRequirementsRequest, CreateJobPostRequest, ExtractedJobRequirements, JobPost } from "@sip/shared-types";
import { useCities, useIndustries, useMajors, useSkills } from "@/hooks/useCatalog";
import { useConfirmJobRequirements, useExtractJobRequirements } from "@/hooks/useJobPosts";
import { suggestSkill } from "@/lib/skills";
import { SkillMultiSelect, type SelectedSkill } from "@/components/shared/SkillMultiSelect";
import { MajorRequirementSelect, type SelectedMajor } from "@/components/employer/MajorRequirementSelect";
import { RequirementExtractionPreview } from "@/components/employer/RequirementExtractionPreview";
import {
  JOB_TYPE_OPTIONS,
  MAX_EXPIRY_DAYS,
  expiryInputToIso,
  formatDate,
  maxExpiryInputValue,
  minExpiryInputValue,
  toDateInputValue,
  validateExpiryInput,
} from "@/lib/job-post-display";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
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

function toSelectedSkills(job: JobPost | undefined): SelectedSkill[] {
  return (job?.skills ?? []).map((skill) => ({
    id: skill.id,
    name: skill.name,
    status: skill.status,
    importance: skill.importance,
    minYears: skill.minYears,
  }));
}

function toSelectedMajors(job: JobPost | undefined): SelectedMajor[] {
  return (job?.majors ?? []).map((major) => ({ majorId: major.majorId, majorName: major.name, relevance: major.relevance }));
}

/** Nudge #1 (PLAN FE GĐ3 Quyết định #5): ví dụ mẫu cho thấy nên viết gì để AI/ứng viên đọc được. */
const REQUIREMENTS_PLACEHOLDER = [
  "VD:",
  "- Sinh viên năm cuối ngành Công nghệ thông tin, Khoa học máy tính hoặc ngành liên quan",
  "- Bắt buộc: ReactJS (tối thiểu 6 tháng), HTML/CSS, Git",
  "- Ưu tiên: TypeScript, đã làm việc với REST API",
  "- Tiếng Anh đọc hiểu tài liệu kỹ thuật",
].join("\n");

type TextSnapshot = { title: string; description: string; requirements: string };

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
  const [skills, setSkills] = useState<SelectedSkill[]>(() => toSelectedSkills(initial));
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [majors, setMajors] = useState<SelectedMajor[]>(() => toSelectedMajors(initial));
  // Giữ song song với RHF (setValue đồng bộ) thay vì watch("isNegotiable") —
  // watch() trả về hàm không memo-hoá được, khiến React Compiler bỏ qua tối
  // ưu cho cả component (cảnh báo react-hooks/incompatible-library).
  const [isNegotiable, setIsNegotiable] = useState(initial?.isNegotiable ?? false);
  const { data: industries } = useIndustries();
  const { data: cities } = useCities();
  const { data: skillCatalog } = useSkills();
  const { data: majorCatalog } = useMajors();

  // ─── AI phân tích yêu cầu (Job Matcher GĐ3) — chỉ với tin nháp đã lưu ───
  const jobPostId = initial?.id ?? "";
  const canAnalyze = initial?.status === "DRAFT";
  const extract = useExtractJobRequirements(jobPostId);
  const confirm = useConfirmJobRequirements(jobPostId);
  const [extraction, setExtraction] = useState<{ draft: ExtractedJobRequirements; key: number } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = useState(initial?.requirementsConfirmedAt ?? null);
  // Nội dung chữ server đang có — backend phân tích bản ĐÃ LƯU, nên khác thì lưu trước.
  const [savedText, setSavedText] = useState<TextSnapshot>({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    requirements: initial?.requirements ?? "",
  });
  // Mô tả + yêu cầu lúc phân tích gần nhất (chỉ trong phiên này) — cho nudge "Phân tích lại".
  const [lastAnalyzed, setLastAnalyzed] = useState<string | null>(null);

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
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver,
    defaultValues: toDefaultValues(initial),
  });
  const [title, description, requirements, minExperienceYears] = useWatch({
    control,
    name: ["title", "description", "requirements", "minExperienceYears"],
  });
  const analyzedTextChanged = lastAnalyzed !== null && lastAnalyzed !== `${description.trim()}\n${requirements.trim()}`;

  async function analyze() {
    setAiError(null);
    const text: TextSnapshot = { title: title.trim(), description: description.trim(), requirements: requirements.trim() };
    if (!text.title || !text.description) {
      setAiError("Cần có tiêu đề và mô tả công việc trước khi phân tích.");
      return;
    }
    const dirty =
      text.title !== savedText.title || text.description !== savedText.description || text.requirements !== savedText.requirements;
    try {
      const draft = await extract.mutateAsync(dirty ? text : undefined);
      if (dirty) setSavedText(text);
      setLastAnalyzed(`${text.description}\n${text.requirements}`);
      // key mới ⇒ bảng xem trước dựng lại từ kết quả mới (bỏ chỉnh sửa của lần trước).
      setExtraction((prev) => ({ draft, key: (prev?.key ?? 0) + 1 }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Không phân tích được, vui lòng thử lại.");
    }
  }

  async function applyRequirements(payload: ConfirmRequirementsRequest) {
    const job = await confirm.mutateAsync(payload);
    // Đồng bộ lại form theo đúng dữ liệu đã lưu để lần "Lưu nháp" sau không ghi đè ngược.
    setSkills(toSelectedSkills(job));
    setMajors(toSelectedMajors(job));
    setValue("minExperienceYears", job.minExperienceYears != null ? String(job.minExperienceYears) : "");
    setConfirmedAt(job.requirementsConfirmedAt);
    setSkillsError(null);
    setExtraction(null);
  }

  // Nudge #2: chỉ báo độ đầy đủ, KHÔNG chặn lưu/gửi duyệt.
  const skillsWithYears = skills.filter((skill) => skill.minYears != null).length;
  const completeness = [
    { done: skills.length > 0, label: skills.length > 0 ? `${skills.length} kỹ năng` : "Chưa có kỹ năng" },
    {
      done: skillsWithYears > 0,
      label: `${skillsWithYears}/${skills.length} kỹ năng có số năm yêu cầu`,
    },
    { done: majors.length > 0, label: majors.length > 0 ? `${majors.length} ngành phù hợp` : "Ngành phù hợp: chưa chọn" },
    {
      done: confirmedAt !== null,
      label: confirmedAt ? `Đã xác nhận yêu cầu (${formatDate(confirmedAt)})` : "Chưa xác nhận yêu cầu bằng AI",
    },
  ];
  const missing = completeness.filter((item) => !item.done).length;

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
      // Gửi đủ mọi kỹ năng (null = không yêu cầu riêng) để xoá được số đã lưu.
      skillMinYears: Object.fromEntries(skills.map((skill) => [skill.id, skill.minYears ?? null])),
      majors: majors.map((major) => ({ majorId: major.majorId, relevance: major.relevance })),
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
          rows={6}
          hint="Ghi rõ kỹ năng bắt buộc/ưu tiên, số năm kinh nghiệm và ngành học phù hợp để hệ thống gợi ý ứng viên chính xác hơn."
          placeholder={REQUIREMENTS_PLACEHOLDER}
          {...register("requirements")}
        />
        <div className="grid gap-3 rounded-lg border border-border-subtle bg-surface-page p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium text-text-strong">
              <Icon name="sparkles" size={16} className="text-pine-700" />
              Yêu cầu có cấu trúc
              <span className="font-normal text-text-muted">
                {missing === 0 ? "— đầy đủ" : `— còn ${missing} mục có thể bổ sung (không bắt buộc)`}
              </span>
            </p>
            {canAnalyze ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon="sparkles"
                loading={extract.isPending}
                disabled={saving || confirm.isPending}
                onClick={() => void analyze()}
              >
                Phân tích yêu cầu bằng AI
              </Button>
            ) : null}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {completeness.map((item) => (
              <li key={item.label} className={`flex items-center gap-1 ${item.done ? "text-success-700" : "text-text-muted"}`}>
                <Icon name={item.done ? "circle-check" : "circle-dashed"} size={13} />
                {item.label}
              </li>
            ))}
          </ul>
          {canAnalyze ? (
            <p className="text-xs text-text-muted">
              AI đọc tiêu đề, mô tả và yêu cầu để gợi ý kỹ năng, số năm và ngành học — bạn xem lại trước khi áp dụng.
              Nội dung vừa sửa sẽ được lưu nháp trước khi phân tích.
            </p>
          ) : !initial ? (
            <p className="text-xs text-text-muted">Lưu nháp tin trước để dùng AI phân tích yêu cầu.</p>
          ) : null}
          {extract.isPending ? (
            <p className="text-xs text-text-muted">Đang phân tích, có thể mất tới vài chục giây…</p>
          ) : null}
          {analyzedTextChanged && canAnalyze && !extract.isPending ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-marigold-700">
              <Icon name="info" size={15} />
              Bạn đã sửa mô tả/yêu cầu kể từ lần phân tích gần nhất.
              <Button type="button" size="sm" variant="link" icon="refresh-cw" disabled={saving} onClick={() => void analyze()}>
                Phân tích lại
              </Button>
            </div>
          ) : null}
          {aiError ? (
            <p className="text-sm text-red-600">{aiError} Bạn vẫn có thể nhập kỹ năng, số năm và ngành học bằng tay bên dưới.</p>
          ) : null}
        </div>
        <Textarea
          label="Quyền lợi"
          rows={5}
          placeholder="Môi trường làm việc trẻ trung, năng động."
          {...register("benefits")}
        />
        <SkillMultiSelect
          label="Kỹ năng yêu cầu"
          hint="Bắt buộc ít nhất 1 kỹ năng trước khi xem trước/gửi duyệt. Kỹ năng mới thêm là Bắt buộc — bấm nhãn trên kỹ năng để đổi sang Ưu tiên. Ô “≥ … năm” là số năm tối thiểu cho riêng kỹ năng đó, để trống nếu không yêu cầu. Không tìm thấy kỹ năng cần tuyển? Gõ tên rồi bấm Thêm — kỹ năng mới sẽ được quản trị viên duyệt trước khi vào danh mục chung."
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
          onChangeMinYears={(skillId, minYears) =>
            setSkills((prev) => prev.map((skill) => (skill.id === skillId ? { ...skill, minYears } : skill)))
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
        <MajorRequirementSelect
          hint="Tuỳ chọn. “Đúng ngành” là ngành tin nhắm tới; “Ngành liên quan” vẫn được chấp nhận nhưng tính điểm phù hợp thấp hơn. Để trống nếu không yêu cầu ngành."
          selected={majors}
          catalog={majorCatalog ?? []}
          disabled={saving}
          onAdd={(major) => setMajors((prev) => [...prev, major])}
          onRemove={(majorId) => setMajors((prev) => prev.filter((major) => major.majorId !== majorId))}
          onChangeRelevance={(majorId, relevance) =>
            setMajors((prev) => prev.map((major) => (major.majorId === majorId ? { ...major, relevance } : major)))
          }
        />
      </Card>

      {extraction ? (
        <RequirementExtractionPreview
          key={extraction.key}
          draft={extraction.draft}
          current={{
            skills,
            majors,
            minExperienceYears: minExperienceYears ? Number(minExperienceYears) || null : null,
          }}
          skillCatalog={skillCatalog ?? []}
          majorCatalog={majorCatalog ?? []}
          onApply={applyRequirements}
          onCancel={() => setExtraction(null)}
          onReanalyze={() => void analyze()}
          reanalyzing={extract.isPending}
        />
      ) : null}

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
