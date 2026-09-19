"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import type {
  CvExtractionResult,
  ImportFromCvFieldOverrides,
  ImportFromCvRequest,
  ImportFromCvResponse,
} from "@sip/shared-types";
import type { CandidateProfileSnapshot } from "@/hooks/useCvs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

// Preview kết quả AI đọc CV (docs/05-frontend/phases/cv-ai-extraction-phase1/PLAN.md)
// + chỉnh sửa trước khi "Lưu vào hồ sơ" (docs/05-frontend/phases/cv-ai-extraction-phase2/PLAN.md
// Quyết định #1/#2): bỏ bớt mục/kỹ năng khỏi lần import, chọn giữ/ghi đè từng
// field đơn lẻ. Mọi thay đổi chỉ nằm ở state cục bộ tới khi bấm lưu — không
// sửa gì trên server, kể cả extractedData đã lưu.

const GENDER_LABELS: Record<NonNullable<CvExtractionResult["candidate"]["gender"]>, string> = {
  MALE: "Nam",
  FEMALE: "Nữ",
  OTHER: "Khác",
};

/** Model trả "YYYY", "YYYY-MM" hoặc "YYYY-MM-DD" — hiển thị theo kiểu Việt Nam. */
function formatPartialDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-");
  if (day && month) return `${day}/${month}/${year}`;
  if (month) return `${month}/${year}`;
  return value;
}

function formatPeriod(start: string | number | null, end: string | number | null, ongoing: boolean): string | null {
  const from = typeof start === "number" ? String(start) : formatPartialDate(start);
  const to = ongoing ? "Hiện tại" : typeof end === "number" ? String(end) : formatPartialDate(end);
  if (!from && !to) return null;
  return `${from ?? "?"} – ${to ?? "?"}`;
}

// ─── Building blocks ───────────────────────────────────────────────────────

function Section({ icon, title, count, children }: { icon: string; title: string; count?: string | number; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-text-strong">
        <Icon name={icon} size={16} className="text-pine-700" />
        {title}
        {count !== undefined ? <span className="font-normal text-text-muted">({count})</span> : null}
      </h4>
      {children}
    </section>
  );
}

function EmptyNote() {
  return <p className="text-sm text-text-muted">Không tìm thấy trong CV.</p>;
}

function Item({
  title,
  subtitle,
  meta,
  description,
  excluded = false,
  onToggle,
}: {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  description?: string | null;
  excluded?: boolean;
  onToggle?: (() => void) | undefined;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
        excluded ? "border-dashed border-border-default bg-surface-page opacity-60" : "border-border-subtle bg-surface-card"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className={`text-sm font-medium text-text-strong ${excluded ? "line-through" : ""}`}>{title}</span>
          {meta ? <span className="text-xs text-text-muted">{meta}</span> : null}
        </div>
        {subtitle ? <p className="text-sm text-text-body">{subtitle}</p> : null}
        {description && !excluded ? (
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-text-muted">{description}</p>
        ) : null}
      </div>
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={excluded ? "Thêm lại vào lần lưu" : "Bỏ khỏi lần lưu"}
          title={excluded ? "Thêm lại vào lần lưu" : "Bỏ khỏi lần lưu"}
          className="shrink-0 cursor-pointer rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-strong"
        >
          <Icon name={excluded ? "undo-2" : "x"} size={16} />
        </button>
      ) : null}
    </div>
  );
}

function ItemList<T>({
  items,
  excluded,
  onToggle,
  render,
}: {
  items: T[];
  excluded: Set<number>;
  onToggle: ((index: number) => void) | undefined;
  render: (item: T, props: { excluded: boolean; onToggle: (() => void) | undefined }) => ReactNode;
}) {
  if (items.length === 0) return <EmptyNote />;
  // Key theo vị trí: danh sách không sắp xếp lại, và model có thể trả 2 mục
  // trùng hết mọi field.
  return (
    <div className="grid gap-2">
      {items.map((item, index) => (
        <Fragment key={index}>
          {render(item, { excluded: excluded.has(index), onToggle: onToggle ? () => onToggle(index) : undefined })}
        </Fragment>
      ))}
    </div>
  );
}

// ─── Field đơn lẻ ──────────────────────────────────────────────────────────

type FieldKey = keyof ImportFromCvFieldOverrides;

interface PersonalField {
  key: FieldKey;
  label: string;
  next: string;
  current: string | null;
}

function buildPersonalFields(candidate: CvExtractionResult["candidate"], profile: CandidateProfileSnapshot | null): PersonalField[] {
  const rows: Array<[FieldKey, string, string | null | undefined, string | null | undefined]> = [
    ["headline", "Chức danh", candidate.headline, profile?.headline],
    ["phone", "Số điện thoại", candidate.phone, profile?.phone],
    ["dateOfBirth", "Ngày sinh", formatPartialDate(candidate.dateOfBirth), formatPartialDate(profile?.dateOfBirth)],
    [
      "gender",
      "Giới tính",
      candidate.gender ? GENDER_LABELS[candidate.gender] : null,
      profile?.gender ? GENDER_LABELS[profile.gender] : null,
    ],
    ["cityId", "Tỉnh/Thành phố", candidate.city, profile?.city?.name],
    ["bio", "Giới thiệu", candidate.bio, profile?.bio],
  ];
  // Field CV không có thì không có gì để ghi — không hiện lựa chọn.
  return rows.flatMap(([key, label, next, current]) => (next ? [{ key, label, next, current: current || null }] : []));
}

function FieldChoice({
  field,
  useNew,
  disabled,
  onChange,
}: {
  field: PersonalField;
  useNew: boolean;
  disabled: boolean;
  onChange: (useNew: boolean) => void;
}) {
  const name = `cv-import-${field.key}`;
  return (
    <div className="grid gap-1.5 border-b border-border-subtle py-2.5 last:border-b-0">
      <span className="text-xs font-medium text-text-muted">{field.label}</span>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <label
          className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-sm ${
            !useNew ? "border-pine-400 bg-pine-50" : "border-border-subtle"
          }`}
        >
          <input
            type="radio"
            name={name}
            className="mt-0.5"
            checked={!useNew}
            disabled={disabled}
            onChange={() => onChange(false)}
          />
          <span className="min-w-0">
            <span className="block text-xs text-text-muted">Giữ giá trị hiện tại</span>
            <span className={`block whitespace-pre-line break-words ${field.current ? "text-text-strong" : "italic text-text-muted"}`}>
              {field.current ?? "(trống)"}
            </span>
          </span>
        </label>
        <label
          className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-sm ${
            useNew ? "border-pine-400 bg-pine-50" : "border-border-subtle"
          }`}
        >
          <input
            type="radio"
            name={name}
            className="mt-0.5"
            checked={useNew}
            disabled={disabled}
            onChange={() => onChange(true)}
          />
          <span className="min-w-0">
            <span className="block text-xs text-text-muted">Dùng giá trị mới từ CV</span>
            <span className="block whitespace-pre-line break-words text-text-strong">{field.next}</span>
          </span>
        </label>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

type ListKey = "educations" | "workExperiences" | "projects" | "certificates" | "awards";

const EMPTY_EXCLUDED: Record<ListKey, number[]> = {
  educations: [],
  workExperiences: [],
  projects: [],
  certificates: [],
  awards: [],
};

export interface CvExtractionPreviewProps {
  data: CvExtractionResult;
  extractedAt: string | null;
  cvId?: string;
  /** Hồ sơ hiện tại — null khi chưa tải xong (khi đó chưa cho lưu). */
  currentProfile?: CandidateProfileSnapshot | null;
  /** Không truyền = chỉ xem (không hiện phần chỉnh sửa và nút lưu). */
  onImport?: (payload: ImportFromCvRequest) => Promise<ImportFromCvResponse>;
  isImporting?: boolean;
}

export function CvExtractionPreview({
  data,
  extractedAt,
  cvId,
  currentProfile = null,
  onImport,
  isImporting = false,
}: CvExtractionPreviewProps) {
  const [excluded, setExcluded] = useState<Record<ListKey, number[]>>(EMPTY_EXCLUDED);
  const [excludedSkills, setExcludedSkills] = useState<string[]>([]);
  // Chỉ lưu lựa chọn người dùng đã bấm; chưa bấm thì theo mặc định (Quyết định #2).
  const [choices, setChoices] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [result, setResult] = useState<ImportFromCvResponse | null>(null);

  const editable = Boolean(onImport) && result === null;
  const personalFields = useMemo(() => buildPersonalFields(data.candidate, currentProfile), [data.candidate, currentProfile]);

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-strong">
        <Icon name="sparkles" size={16} className="text-pine-700" />
        Kết quả phân tích CV
      </h3>
      {extractedAt ? (
        <span className="text-xs text-text-muted">
          Phân tích lúc {new Date(extractedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
        </span>
      ) : null}
    </div>
  );

  // Không phải CV → chỉ hiện lý do, không hiện các khối rỗng bên dưới để khỏi
  // hiểu nhầm là "đọc được nhưng trống" (Phần 2 của PLAN Phase 1).
  if (!data.isValidCv) {
    return (
      <div className="grid gap-3">
        {header}
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Tệp này không giống một CV</p>
            {data.invalidReason ? <p className="mt-0.5">{data.invalidReason}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  const lowConfidenceBanner =
    data.extractionConfidence === "low" ? (
      <div className="flex items-start gap-2 rounded-lg border border-marigold-300 bg-marigold-100 px-3 py-2.5 text-sm text-marigold-700">
        <Icon name="triangle-alert" size={16} className="mt-0.5 shrink-0" />
        <p>Kết quả có thể không đầy đủ, vui lòng kiểm tra kỹ.</p>
      </div>
    ) : null;

  // Fallback OCR offline: không có dữ liệu cấu trúc, chỉ có text thô — không
  // có gì để lưu tự động vào hồ sơ.
  if (data.rawOcrText) {
    return (
      <div className="grid gap-3">
        {header}
        {lowConfidenceBanner}
        <Section icon="scan-text" title="Văn bản đọc được từ ảnh">
          <p className="text-xs text-text-muted">
            Không đọc được bằng AI, đây là văn bản thô — vui lòng tự nhập lại các mục cần thiết.
          </p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-surface-card p-3 font-sans text-xs leading-relaxed text-text-body">
            {data.rawOcrText}
          </pre>
        </Section>
      </div>
    );
  }

  // Mặc định: hồ sơ đang trống field đó → dùng giá trị mới; đã có → giữ.
  const isUsingNew = (field: PersonalField) => choices[field.key] ?? field.current === null;

  const toggleItem = (list: ListKey) =>
    editable
      ? (index: number) =>
          setExcluded((prev) => ({
            ...prev,
            [list]: prev[list].includes(index) ? prev[list].filter((i) => i !== index) : [...prev[list], index],
          }))
      : undefined;
  const excludedSet = (list: ListKey) => new Set(editable ? excluded[list] : []);
  const kept = <T,>(list: ListKey, items: T[]) => items.filter((_, index) => !excluded[list].includes(index));

  const keptSkills = data.skills.filter((skill) => !excludedSkills.includes(skill));
  const counts = {
    educations: kept("educations", data.educations).length,
    workExperiences: kept("workExperiences", data.workExperiences).length,
    projects: kept("projects", data.projects).length,
    certificates: kept("certificates", data.certificates).length,
    awards: kept("awards", data.awards).length,
  };
  const countLabel = (list: ListKey, total: number) => (editable && counts[list] !== total ? `${counts[list]}/${total}` : total);
  const overriddenFields = personalFields.filter(isUsingNew);
  const nothingToImport =
    Object.values(counts).every((count) => count === 0) && keptSkills.length === 0 && overriddenFields.length === 0;

  async function handleImport() {
    if (!onImport) return;
    const fieldOverrides: ImportFromCvFieldOverrides = {};
    for (const field of overriddenFields) fieldOverrides[field.key] = true;

    const payload: ImportFromCvRequest = {
      ...(cvId ? { cvId } : {}),
      fieldOverrides,
      extractedData: {
        candidate: data.candidate,
        educations: kept("educations", data.educations),
        workExperiences: kept("workExperiences", data.workExperiences),
        projects: kept("projects", data.projects),
        certificates: kept("certificates", data.certificates),
        awards: kept("awards", data.awards),
        skills: keptSkills,
      },
    };
    try {
      setResult(await onImport(payload));
    } catch {
      // Parent đã báo lỗi qua toast (Phần 2 của PLAN) — giữ nguyên lựa chọn để thử lại.
    }
  }

  return (
    <div className="grid gap-5">
      {header}
      {lowConfidenceBanner}
      {editable ? (
        <p className="text-xs text-text-muted">
          Kiểm tra lại trước khi lưu: bấm <Icon name="x" size={12} className="inline" /> để bỏ một mục khỏi lần lưu này,
          bấm vào kỹ năng để bỏ/chọn lại. Các mục được lưu sẽ được <strong>thêm mới</strong> vào hồ sơ, không thay thế
          mục bạn đã có.
        </p>
      ) : null}

      <Section icon="user" title="Thông tin cá nhân">
        {personalFields.length === 0 && !data.candidate.fullName ? (
          <EmptyNote />
        ) : (
          <div className="grid rounded-lg border border-border-subtle bg-surface-card px-3 py-1">
            {data.candidate.fullName ? (
              <div className="grid gap-0.5 border-b border-border-subtle py-2.5 last:border-b-0">
                <span className="text-xs font-medium text-text-muted">Họ tên</span>
                <span className="text-sm text-text-strong">{data.candidate.fullName}</span>
                {editable ? (
                  <span className="text-xs text-text-muted">Hồ sơ dùng tên tài khoản, không lưu mục này.</span>
                ) : null}
              </div>
            ) : null}
            {personalFields.map((field) =>
              editable ? (
                <FieldChoice
                  key={field.key}
                  field={field}
                  useNew={isUsingNew(field)}
                  disabled={isImporting || currentProfile === null}
                  onChange={(value) => setChoices((prev) => ({ ...prev, [field.key]: value }))}
                />
              ) : (
                <div key={field.key} className="grid gap-0.5 border-b border-border-subtle py-2.5 last:border-b-0">
                  <span className="text-xs font-medium text-text-muted">{field.label}</span>
                  <span className="whitespace-pre-line text-sm text-text-strong">{field.next}</span>
                </div>
              ),
            )}
          </div>
        )}
      </Section>

      <Section icon="graduation-cap" title="Học vấn" count={countLabel("educations", data.educations.length)}>
        <ItemList
          items={data.educations}
          excluded={excludedSet("educations")}
          onToggle={toggleItem("educations")}
          render={(edu, props) => (
            <Item
              title={edu.universityName ?? "(Chưa rõ trường)"}
              subtitle={[edu.majorName, edu.degree].filter(Boolean).join(" · ") || null}
              meta={formatPeriod(edu.startYear, edu.endYear, edu.isCurrent)}
              description={edu.description}
              {...props}
            />
          )}
        />
      </Section>

      <Section icon="briefcase" title="Kinh nghiệm làm việc" count={countLabel("workExperiences", data.workExperiences.length)}>
        <ItemList
          items={data.workExperiences}
          excluded={excludedSet("workExperiences")}
          onToggle={toggleItem("workExperiences")}
          render={(work, props) => (
            <Item
              title={work.position || "(Chưa rõ vị trí)"}
              subtitle={work.company || null}
              meta={formatPeriod(work.startDate, work.endDate, work.isCurrent)}
              description={work.description}
              {...props}
            />
          )}
        />
      </Section>

      <Section icon="folder-kanban" title="Dự án" count={countLabel("projects", data.projects.length)}>
        <ItemList
          items={data.projects}
          excluded={excludedSet("projects")}
          onToggle={toggleItem("projects")}
          render={(project, props) => (
            <Item
              title={project.name}
              subtitle={project.url}
              meta={formatPeriod(project.startDate, project.endDate, project.isWorkingOn)}
              description={project.description}
              {...props}
            />
          )}
        />
      </Section>

      <Section icon="badge-check" title="Chứng chỉ" count={countLabel("certificates", data.certificates.length)}>
        <ItemList
          items={data.certificates}
          excluded={excludedSet("certificates")}
          onToggle={toggleItem("certificates")}
          render={(cert, props) => (
            <Item
              title={cert.name}
              subtitle={cert.issuer}
              meta={formatPartialDate(cert.issueDate)}
              description={cert.description}
              {...props}
            />
          )}
        />
      </Section>

      <Section icon="award" title="Giải thưởng" count={countLabel("awards", data.awards.length)}>
        <ItemList
          items={data.awards}
          excluded={excludedSet("awards")}
          onToggle={toggleItem("awards")}
          render={(award, props) => (
            <Item
              title={award.name}
              subtitle={award.issuer}
              meta={formatPartialDate(award.date)}
              description={award.description}
              {...props}
            />
          )}
        />
      </Section>

      <Section
        icon="wrench"
        title="Kỹ năng"
        count={editable && keptSkills.length !== data.skills.length ? `${keptSkills.length}/${data.skills.length}` : data.skills.length}
      >
        {data.skills.length === 0 ? (
          <EmptyNote />
        ) : editable ? (
          <div className="flex flex-wrap gap-1.5">
            {data.skills.map((skill) => {
              const off = excludedSkills.includes(skill);
              return (
                <button
                  key={skill}
                  type="button"
                  aria-pressed={!off}
                  onClick={() =>
                    setExcludedSkills((prev) => (off ? prev.filter((item) => item !== skill) : [...prev, skill]))
                  }
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    off
                      ? "border-dashed border-border-default text-text-muted line-through"
                      : "border-transparent bg-brand-100 text-brand-800 hover:bg-brand-200"
                  }`}
                >
                  <Icon name={off ? "plus" : "check"} size={12} />
                  {skill}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {data.skills.map((skill) => (
              <Badge key={skill} tone="brand">
                {skill}
              </Badge>
            ))}
          </div>
        )}
      </Section>

      {onImport && result ? <ImportResult result={result} /> : null}

      {editable ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <p className="text-xs text-text-muted">
            Kỹ năng đã có trong hồ sơ sẽ được giữ nguyên số năm kinh nghiệm. Trường/ngành/kỹ năng chưa có trong danh mục
            sẽ được gửi Admin duyệt.
          </p>
          <Button
            icon="save"
            loading={isImporting}
            disabled={nothingToImport || currentProfile === null}
            onClick={() => void handleImport()}
          >
            Lưu vào hồ sơ
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Sau khi lưu: báo kết quả + lối sang trang hồ sơ, KHÔNG tự điều hướng — để
 * Candidate còn xem/lưu tiếp CV khác (Quyết định #3).
 */
function ImportResult({ result }: { result: ImportFromCvResponse }) {
  const { created } = result;
  const parts = [
    [created.educations, "học vấn"],
    [created.workExperiences, "kinh nghiệm"],
    [created.projects, "dự án"],
    [created.certificates, "chứng chỉ"],
    [created.awards, "giải thưởng"],
    [created.skills, "kỹ năng mới"],
  ]
    .filter(([count]) => Number(count) > 0)
    .map(([count, label]) => `${count} ${label}`);
  if (result.updatedFields.length > 0) parts.push(`${result.updatedFields.length} thông tin cá nhân`);

  return (
    <div className="grid gap-2 rounded-lg border border-success-100 bg-success-100 px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium text-success-700">
          <Icon name="circle-check" size={16} />
          Đã lưu vào hồ sơ{parts.length > 0 ? `: ${parts.join(", ")}` : ""}.
        </p>
        <Button as="a" href="/profile" size="sm" variant="secondary" iconAfter="arrow-right">
          Xem hồ sơ
        </Button>
      </div>
      {result.warnings.length > 0 ? (
        <ul className="grid gap-1 text-xs text-marigold-700">
          {result.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5">
              <Icon name="triangle-alert" size={13} className="mt-0.5 shrink-0" />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
