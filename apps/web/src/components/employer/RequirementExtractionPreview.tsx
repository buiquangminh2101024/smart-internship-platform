"use client";

import { useMemo, useState, type ReactNode } from "react";
import type {
  CatalogEntryStatus,
  CatalogItem,
  ConfirmRequirementsRequest,
  ExtractedJobRequirements,
  ExtractionConfidence,
  SkillImportance,
} from "@sip/shared-types";
import { suggestSkill } from "@/lib/skills";
import {
  MAX_SKILL_NAME_LENGTH,
  MinYearsInput,
  parseMinYears,
  validateSkillName,
  type SelectedSkill,
} from "@/components/shared/SkillMultiSelect";
import { MajorRequirementSelect, type SelectedMajor } from "@/components/employer/MajorRequirementSelect";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";

// Bảng xem trước kết quả AI phân tích yêu cầu của tin
// (docs/05-frontend/phases/job-matcher-phase3/PLAN.md Quyết định #1). Cùng khuôn
// CvExtractionPreview: mọi chỉnh sửa nằm ở state cục bộ, chỉ gọi API khi bấm
// "Áp dụng". Áp dụng = đồng bộ TOÀN BỘ kỹ năng/ngành của tin, nên bảng gộp sẵn
// cả kỹ năng/ngành tin đang có mà AI không nhắc tới — Employer không vô tình
// mất mục đã chọn tay.

/** Cùng trần với confirmRequirementsSchema ở apps/server/src/modules/job-posts/job-posts.dto.ts. */
const MAX_SKILLS = 30;
const MAX_SUGGESTIONS = 6;

const CONFIDENCE_LABEL: Record<ExtractionConfidence, { label: string; tone: "success" | "info" | "warning" }> = {
  HIGH: { label: "Cao", tone: "success" },
  MEDIUM: { label: "Trung bình", tone: "info" },
  LOW: { label: "Thấp", tone: "warning" },
};

type RowSource = "AI" | "CURRENT" | "MANUAL";

interface SkillRow {
  key: string;
  /** Tên AI đọc ra (dòng AI) hoặc tên kỹ năng (dòng hiện có/tự thêm). */
  rawName: string;
  skillId: string | null;
  name: string | null;
  status: CatalogEntryStatus;
  importance: SkillImportance;
  minYears: number | null;
  evidence: string | null;
  confidence: ExtractionConfidence | null;
  source: RowSource;
  included: boolean;
}

export interface RequirementPreviewCurrent {
  skills: SelectedSkill[];
  majors: SelectedMajor[];
  minExperienceYears: number | null;
}

function buildSkillRows(draft: ExtractedJobRequirements, current: SelectedSkill[]): SkillRow[] {
  const currentById = new Map(current.map((skill) => [skill.id, skill]));
  const fromAi: SkillRow[] = draft.skills.map((skill, index) => {
    const existing = skill.resolved ? currentById.get(skill.resolved.skillId) : undefined;
    return {
      key: `ai-${index}`,
      rawName: skill.rawName,
      skillId: skill.resolved?.skillId ?? null,
      name: skill.resolved?.name ?? null,
      status: existing?.status ?? "APPROVED",
      importance: skill.importance,
      // Tin không nêu số năm thì giữ số Employer đã nhập tay (nếu có).
      minYears: skill.minYears ?? existing?.minYears ?? null,
      evidence: skill.evidence || null,
      confidence: skill.confidence,
      source: "AI",
      // Chưa có trong danh mục ⇒ chưa chọn được tới khi thêm vào danh mục.
      included: skill.resolved !== null,
    };
  });
  const aiIds = new Set(fromAi.map((row) => row.skillId).filter(Boolean));
  const kept: SkillRow[] = current
    .filter((skill) => !aiIds.has(skill.id))
    .map((skill) => ({
      key: `cur-${skill.id}`,
      rawName: skill.name,
      skillId: skill.id,
      name: skill.name,
      status: skill.status,
      importance: skill.importance ?? "REQUIRED",
      minYears: skill.minYears ?? null,
      evidence: null,
      confidence: null,
      source: "CURRENT",
      included: true,
    }));
  return [...fromAi, ...kept];
}

function buildMajors(draft: ExtractedJobRequirements, current: SelectedMajor[]): SelectedMajor[] {
  const result: SelectedMajor[] = [];
  const seen = new Set<string>();
  for (const major of draft.majors) {
    if (!major.resolved || seen.has(major.resolved.majorId)) continue;
    seen.add(major.resolved.majorId);
    result.push({ majorId: major.resolved.majorId, majorName: major.resolved.name, relevance: major.relevance });
  }
  for (const major of current) {
    if (seen.has(major.majorId)) continue;
    seen.add(major.majorId);
    result.push(major);
  }
  return result;
}

// ─── Building blocks ───────────────────────────────────────────────────────

function Section({ icon, title, note, children }: { icon: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h4 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text-strong">
        <Icon name={icon} size={16} className="text-pine-700" />
        {title}
        {note ? <span className="text-xs font-normal text-text-muted">{note}</span> : null}
      </h4>
      {children}
    </section>
  );
}

function SourceBadge({ row }: { row: SkillRow }) {
  if (row.status === "PENDING") {
    return (
      <Badge tone="warning" icon="clock">
        Đang chờ duyệt
      </Badge>
    );
  }
  if (row.source === "CURRENT") return <Badge>Đang có trong tin</Badge>;
  if (row.source === "MANUAL") return <Badge>Tự thêm</Badge>;
  return null;
}

function SkillRowItem({
  row,
  disabled,
  onChange,
}: {
  row: SkillRow;
  disabled: boolean;
  onChange: (patch: Partial<SkillRow>) => void;
}) {
  const label = row.name ?? row.rawName;
  // Dòng AI không chắc chắn: tô nhạt + viền đứt để Employer soát kỹ.
  const low = row.confidence === "LOW";
  return (
    <div
      className={[
        "grid gap-1 rounded-lg border px-3 py-2",
        !row.included
          ? "border-dashed border-border-default bg-surface-page opacity-60"
          : low
            ? "border-dashed border-marigold-300 bg-surface-card opacity-70"
            : "border-border-subtle bg-surface-card",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-strong">
          <input
            type="checkbox"
            checked={row.included}
            disabled={disabled}
            onChange={(e) => onChange({ included: e.target.checked })}
          />
          <span className={row.included ? "" : "line-through"}>{label}</span>
        </label>
        {row.source === "AI" && row.name && row.name.toLowerCase() !== row.rawName.toLowerCase() ? (
          <span className="text-xs text-text-muted">(AI đọc là “{row.rawName}”)</span>
        ) : null}
        <SourceBadge row={row} />
        {low ? (
          <Badge tone="warning" icon="triangle-alert">
            AI không chắc
          </Badge>
        ) : null}
        {row.included ? (
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              title="Bấm để đổi giữa Bắt buộc và Ưu tiên"
              aria-label={`${label}: ${row.importance === "REQUIRED" ? "Bắt buộc" : "Ưu tiên"} — bấm để đổi`}
              className={[
                "rounded-full px-2 py-0.5 text-xs font-medium",
                row.importance === "REQUIRED" ? "bg-brand-100 text-brand-800" : "bg-surface-hover text-text-body",
              ].join(" ")}
              onClick={() => onChange({ importance: row.importance === "REQUIRED" ? "PREFERRED" : "REQUIRED" })}
            >
              {row.importance === "REQUIRED" ? "Bắt buộc" : "Ưu tiên"}
            </button>
            <MinYearsInput
              label={`Số năm kinh nghiệm tối thiểu cho ${label}`}
              value={row.minYears}
              disabled={disabled}
              onChange={(minYears) => onChange({ minYears })}
            />
          </span>
        ) : null}
      </div>
      {row.evidence ? <p className="text-xs text-text-muted italic">“{row.evidence}”</p> : null}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export interface RequirementExtractionPreviewProps {
  draft: ExtractedJobRequirements;
  /** Kỹ năng/ngành/số năm đang có trong form — gộp vào bảng để không bị xoá mất khi áp dụng. */
  current: RequirementPreviewCurrent;
  skillCatalog: CatalogItem[];
  majorCatalog: CatalogItem[];
  /** Lỗi ném ra được hiện ngay trong bảng; thành công thì parent tự đóng bảng. */
  onApply: (payload: ConfirmRequirementsRequest) => Promise<void>;
  onCancel: () => void;
  onReanalyze: () => void;
  reanalyzing?: boolean;
}

export function RequirementExtractionPreview({
  draft,
  current,
  skillCatalog,
  majorCatalog,
  onApply,
  onCancel,
  onReanalyze,
  reanalyzing = false,
}: RequirementExtractionPreviewProps) {
  const [rows, setRows] = useState<SkillRow[]>(() => buildSkillRows(draft, current.skills));
  const [majors, setMajors] = useState<SelectedMajor[]>(() => buildMajors(draft, current.majors));
  const [overallYears, setOverallYears] = useState(() => {
    const value = draft.overallMinExperienceYears ?? current.minExperienceYears;
    return value != null && value > 0 ? String(value) : "";
  });
  const [excludedLanguages, setExcludedLanguages] = useState<number[]>([]);
  const [excludedOther, setExcludedOther] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const disabled = applying || reanalyzing;
  const usedIds = useMemo(() => new Set(rows.map((row) => row.skillId).filter((id): id is string => id !== null)), [rows]);
  const suggestions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return skillCatalog
      .filter((item) => !usedIds.has(item.id) && item.name.toLowerCase().includes(keyword))
      .slice(0, MAX_SUGGESTIONS);
  }, [skillCatalog, query, usedIds]);

  const resolvedRows = rows.filter((row) => row.skillId !== null);
  const unresolvedRows = rows.filter((row) => row.skillId === null);
  const includedCount = resolvedRows.filter((row) => row.included).length;
  const unresolvedMajors = draft.majors.filter((major) => major.resolved === null);
  const resolvedMajorNotes = draft.majors.filter((major) => major.resolved !== null && major.evidence);

  function patchRow(key: string, patch: Partial<SkillRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addManual(skill: { id: string; name: string; status: CatalogEntryStatus }) {
    if (usedIds.has(skill.id)) {
      setError(`"${skill.name}" đã có trong bảng.`);
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        key: `man-${skill.id}`,
        rawName: skill.name,
        skillId: skill.id,
        name: skill.name,
        status: skill.status,
        importance: "REQUIRED",
        minYears: null,
        evidence: null,
        confidence: null,
        source: "MANUAL",
        included: true,
      },
    ]);
    setQuery("");
    setError(null);
  }

  async function submitManual() {
    const message = validateSkillName(query);
    if (message) {
      setError(message);
      return;
    }
    const exact = skillCatalog.find((item) => item.name.toLowerCase() === query.trim().toLowerCase());
    if (exact) {
      addManual({ ...exact, status: "APPROVED" });
      return;
    }
    setBusyKey("manual");
    setError(null);
    try {
      const suggested = await suggestSkill("employer", query.trim());
      addManual({ id: suggested.skillId, name: suggested.name, status: suggested.status });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thêm được kỹ năng, vui lòng thử lại.");
    } finally {
      setBusyKey(null);
    }
  }

  /** Tên AI đọc ra chưa có trong danh mục ⇒ đề xuất như Employer tự gõ (có thể khớp mục sẵn có). */
  async function resolveRow(row: SkillRow) {
    const message = validateSkillName(row.rawName.slice(0, MAX_SKILL_NAME_LENGTH));
    if (message) {
      setError(`"${row.rawName}": ${message}`);
      return;
    }
    setBusyKey(row.key);
    setError(null);
    try {
      const suggested = await suggestSkill("employer", row.rawName.slice(0, MAX_SKILL_NAME_LENGTH));
      if (usedIds.has(suggested.skillId)) {
        // Khớp đúng kỹ năng đã có trong bảng — bỏ dòng này, giữ dòng sẵn có.
        setRows((prev) => prev.filter((item) => item.key !== row.key));
        setError(`"${row.rawName}" được ghi nhận là "${suggested.name}" — kỹ năng này đã có trong bảng.`);
        return;
      }
      patchRow(row.key, { skillId: suggested.skillId, name: suggested.name, status: suggested.status, included: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thêm được kỹ năng, vui lòng thử lại.");
    } finally {
      setBusyKey(null);
    }
  }

  async function apply() {
    if (includedCount > MAX_SKILLS) {
      setError(`Chỉ chọn tối đa ${MAX_SKILLS} kỹ năng.`);
      return;
    }
    const overall = parseMinYears(overallYears);
    const payload: ConfirmRequirementsRequest = {
      skills: resolvedRows
        .filter((row) => row.included)
        .map((row) => ({ skillId: row.skillId!, importance: row.importance, minYears: row.minYears })),
      minExperienceYears: overall,
      majors: majors.map((major) => ({ majorId: major.majorId, relevance: major.relevance })),
      languages: draft.languages
        .filter((_, index) => !excludedLanguages.includes(index))
        .map(({ language, level, importance }) => ({ language, level, importance })),
      other: draft.other.filter((_, index) => !excludedOther.includes(index)),
    };
    setApplying(true);
    setError(null);
    try {
      await onApply(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không áp dụng được, vui lòng thử lại.");
    } finally {
      setApplying(false);
    }
  }

  const confidence = CONFIDENCE_LABEL[draft.confidence];
  const groups: Array<[SkillImportance, string]> = [
    ["REQUIRED", "Kỹ năng bắt buộc"],
    ["PREFERRED", "Kỹ năng ưu tiên"],
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-text-strong/40 px-4 py-6 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AI phân tích yêu cầu của tin"
        className="flex max-h-full w-full max-w-3xl flex-col rounded-xl bg-white shadow-lg"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <h2 className="inline-flex items-center gap-2 font-semibold text-text-strong">
            <Icon name="sparkles" size={18} className="text-pine-700" />
            AI phân tích yêu cầu của tin
          </h2>
          <div className="flex items-center gap-3">
            <Badge tone={confidence.tone}>Độ tin cậy: {confidence.label}</Badge>
            <button
              type="button"
              aria-label="Đóng"
              onClick={onCancel}
              className="text-text-muted transition-colors hover:text-text-strong"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>

        <div className="grid gap-5 overflow-y-auto px-5 py-4">
          {draft.confidence === "LOW" ? (
            <div className="flex items-start gap-2 rounded-lg border border-marigold-300 bg-marigold-100 px-3 py-2.5 text-sm text-marigold-700">
              <Icon name="triangle-alert" size={16} className="mt-0.5 shrink-0" />
              <p>Nội dung tin khá ít thông tin về yêu cầu nên kết quả có thể chưa đầy đủ, vui lòng kiểm tra kỹ.</p>
            </div>
          ) : null}
          <p className="text-xs text-text-muted">
            Bỏ tick để loại một kỹ năng, bấm nhãn Bắt buộc/Ưu tiên để đổi, nhập số năm nếu tin yêu cầu (để trống = không
            yêu cầu riêng). Dòng viền đứt màu vàng là chỗ AI không chắc chắn.
          </p>

          {groups.map(([importance, title]) => {
            const list = resolvedRows.filter((row) => row.importance === importance);
            return (
              <Section key={importance} icon={importance === "REQUIRED" ? "list-checks" : "star"} title={title}>
                {list.length === 0 ? (
                  <p className="text-sm text-text-muted">Không có.</p>
                ) : (
                  <div className="grid gap-2">
                    {list.map((row) => (
                      <SkillRowItem key={row.key} row={row} disabled={disabled} onChange={(patch) => patchRow(row.key, patch)} />
                    ))}
                  </div>
                )}
              </Section>
            );
          })}

          {unresolvedRows.length > 0 ? (
            <Section icon="circle-help" title="Chưa có trong danh mục kỹ năng" note="— chưa được chọn, thêm vào danh mục để dùng">
              <div className="grid gap-2">
                {unresolvedRows.map((row) => (
                  <div
                    key={row.key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-border-default bg-surface-page px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-text-strong">{row.rawName}</span>
                      {row.evidence ? <p className="text-xs text-text-muted italic">“{row.evidence}”</p> : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      icon="plus"
                      loading={busyKey === row.key}
                      disabled={disabled || (busyKey !== null && busyKey !== row.key)}
                      onClick={() => void resolveRow(row)}
                    >
                      Thêm vào danh mục
                    </Button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-muted">
                Kỹ năng mới sẽ được quản trị viên duyệt trước khi vào danh mục chung (vẫn gắn được vào tin ngay).
              </p>
            </Section>
          ) : null}

          <Section icon="plus" title="Thêm kỹ năng AI bỏ sót">
            <div className="relative grid gap-2 rounded-lg bg-surface-page p-3 sm:flex sm:items-start">
              <div className="relative flex-1">
                <Input
                  icon="search"
                  placeholder="Nhập hoặc chọn kỹ năng, ví dụ: Git"
                  aria-label="Tên kỹ năng cần thêm"
                  value={query}
                  disabled={disabled}
                  maxLength={MAX_SKILL_NAME_LENGTH}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (query.trim() && busyKey === null) void submitManual();
                    }
                  }}
                />
                {suggestions.length > 0 ? (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border-subtle bg-surface-card shadow-lg">
                    {suggestions.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm text-text-body hover:bg-surface-hover"
                          onClick={() => addManual({ ...item, status: "APPROVED" })}
                        >
                          {item.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <Button
                type="button"
                icon="plus"
                loading={busyKey === "manual"}
                disabled={disabled || busyKey !== null || !query.trim()}
                onClick={() => void submitManual()}
              >
                Thêm
              </Button>
            </div>
          </Section>

          <Section icon="briefcase" title="Kinh nghiệm chung tối thiểu">
            <label className="flex items-center gap-2 text-sm text-text-body">
              <input
                type="number"
                min="0"
                max="20"
                step="0.5"
                placeholder="–"
                aria-label="Số năm kinh nghiệm chung tối thiểu"
                value={overallYears}
                disabled={disabled}
                onChange={(e) => setOverallYears(e.target.value)}
                className="w-20 rounded-md border border-border-default bg-surface-card px-2 py-1 text-sm"
              />
              năm <span className="text-xs text-text-muted">(để trống nếu không yêu cầu)</span>
            </label>
          </Section>

          <Section icon="graduation-cap" title="Ngành học phù hợp">
            {resolvedMajorNotes.length > 0 || unresolvedMajors.length > 0 ? (
              <ul className="grid gap-1 text-xs text-text-muted">
                {resolvedMajorNotes.map((major, index) => (
                  <li key={`r-${index}`}>
                    AI đọc được “{major.evidence}” → <span className="text-text-body">{major.resolved!.name}</span>
                  </li>
                ))}
                {unresolvedMajors.map((major, index) => (
                  <li key={`u-${index}`}>
                    “{major.rawName}” chưa có trong danh mục ngành — tìm ngành gần nhất bên dưới nếu cần.
                  </li>
                ))}
              </ul>
            ) : null}
            <MajorRequirementSelect
              label=""
              selected={majors}
              catalog={majorCatalog}
              disabled={disabled}
              onAdd={(major) => setMajors((prev) => [...prev, major])}
              onRemove={(majorId) => setMajors((prev) => prev.filter((major) => major.majorId !== majorId))}
              onChangeRelevance={(majorId, relevance) =>
                setMajors((prev) => prev.map((major) => (major.majorId === majorId ? { ...major, relevance } : major)))
              }
            />
          </Section>

          {draft.languages.length > 0 || draft.other.length > 0 ? (
            <Section icon="languages" title="Ngoại ngữ và yêu cầu khác" note="— chỉ hiển thị, không tính vào điểm phù hợp">
              <div className="grid gap-1.5">
                {draft.languages.map((language, index) => {
                  const off = excludedLanguages.includes(index);
                  return (
                    <label key={`l-${index}`} className={`flex items-center gap-2 text-sm ${off ? "text-text-muted line-through" : "text-text-body"}`}>
                      <input
                        type="checkbox"
                        checked={!off}
                        disabled={disabled}
                        onChange={() =>
                          setExcludedLanguages((prev) => (off ? prev.filter((i) => i !== index) : [...prev, index]))
                        }
                      />
                      {language.language}
                      {language.level ? ` (${language.level})` : ""} — {language.importance === "REQUIRED" ? "Bắt buộc" : "Ưu tiên"}
                    </label>
                  );
                })}
                {draft.other.map((item, index) => {
                  const off = excludedOther.includes(index);
                  return (
                    <label key={`o-${index}`} className={`flex items-center gap-2 text-sm ${off ? "text-text-muted line-through" : "text-text-body"}`}>
                      <input
                        type="checkbox"
                        checked={!off}
                        disabled={disabled}
                        onChange={() => setExcludedOther((prev) => (off ? prev.filter((i) => i !== index) : [...prev, index]))}
                      />
                      {item}
                    </label>
                  );
                })}
              </div>
            </Section>
          ) : null}
        </div>

        <div className="grid gap-3 border-t border-border-subtle px-5 py-4">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <p className="text-xs text-text-muted">
            AI chỉ gợi ý — bạn là người quyết định cuối cùng. Áp dụng sẽ thay toàn bộ kỹ năng và ngành học của tin bằng
            các mục đang được chọn ở đây ({includedCount} kỹ năng, {majors.length} ngành).
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={applying} onClick={onCancel}>
              Hủy
            </Button>
            <Button type="button" variant="secondary" icon="refresh-cw" loading={reanalyzing} disabled={applying} onClick={onReanalyze}>
              Phân tích lại
            </Button>
            <Button type="button" icon="check" loading={applying} disabled={reanalyzing} onClick={() => void apply()}>
              Áp dụng
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
