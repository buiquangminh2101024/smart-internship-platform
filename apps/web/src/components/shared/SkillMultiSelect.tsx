"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { CatalogItem, CatalogEntryStatus, SkillImportance, SuggestSkillResponse } from "@sip/shared-types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";

export const MAX_SKILL_NAME_LENGTH = 50;

/**
 * Cùng 3 quy tắc với zod ở `apps/server/src/modules/skills/skills.dto.ts`. Không
 * dùng chung được schema (khác runtime) nên phải viết tay — đổi ngưỡng ở backend
 * thì sửa cả ở đây. Đây chỉ là validate CHO UX (báo lỗi ngay, khỏi gọi API vô
 * ích và khỏi tốn quota); backend vẫn là nơi xác thực cuối cùng.
 */
export function validateSkillName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Vui lòng nhập tên kỹ năng";
  if (trimmed.length > MAX_SKILL_NAME_LENGTH) {
    return `Tên kỹ năng không được dài quá ${MAX_SKILL_NAME_LENGTH} ký tự`;
  }
  if (!/[\p{L}\p{N}]/u.test(trimmed)) {
    return "Tên kỹ năng phải có ít nhất một chữ cái hoặc chữ số";
  }
  if (trimmed.split(/\s+/).some((word) => word.length === 1)) {
    return "Tên kỹ năng không được chứa từ chỉ có một ký tự";
  }
  return null;
}

export interface SelectedSkill {
  id: string;
  name: string;
  status: CatalogEntryStatus;
  yearsOfExperience?: number;
  /** Chỉ dùng ở form tin tuyển dụng; không có = coi như REQUIRED. */
  importance?: SkillImportance;
}

export interface SkillMultiSelectProps {
  selected: SelectedSkill[];
  catalog: CatalogItem[];
  onAdd: (skill: SelectedSkill) => Promise<void> | void;
  onRemove: (skillId: string) => Promise<void> | void;
  /** Gọi khi tên gõ vào không có trong catalog — POST /skills/suggest. */
  onSuggestNew: (name: string) => Promise<SuggestSkillResponse>;
  /** Chỉ bật cho hồ sơ ứng viên; tin tuyển dụng không có số năm kinh nghiệm. */
  allowYearsOfExperience?: boolean;
  /**
   * Có truyền thì mỗi kỹ năng sửa được số năm tại chỗ (trước đây phải xóa rồi
   * thêm lại). Không truyền → chỉ đọc, giữ nguyên hành vi cho form tin tuyển dụng.
   */
  onUpdateYears?: (skillId: string, yearsOfExperience: number) => Promise<void> | void;
  /**
   * Có truyền thì mỗi kỹ năng có công tắc Bắt buộc/Ưu tiên (form tin tuyển
   * dụng — Job Matcher). Không truyền → chip giữ nguyên như hồ sơ ứng viên.
   */
  onChangeImportance?: (skillId: string, importance: SkillImportance) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

const MAX_SUGGESTIONS = 6;
const MAX_YEARS = 60;
/** Chỉ là tiện ích của riêng trình duyệt này — không đồng bộ lên server. */
const YEARS_HINT_KEY = "sip.skill-years-hint-dismissed";

// localStorage là "external store" theo đúng nghĩa của React: đọc trong
// useEffect rồi setState sẽ thành render thừa (và bị eslint chặn), còn đọc
// thẳng lúc render thì server không có localStorage nên lệch HTML khi hydrate.
let hintDismissedCache: boolean | null = null;
const hintListeners = new Set<() => void>();

function readHintDismissed(): boolean {
  if (hintDismissedCache === null) {
    try {
      hintDismissedCache = window.localStorage.getItem(YEARS_HINT_KEY) === "1";
    } catch {
      // Trình duyệt chặn lưu trữ (tab ẩn danh, chặn cookie) — cứ hiện gợi ý.
      hintDismissedCache = false;
    }
  }
  return hintDismissedCache;
}

function subscribeHint(listener: () => void): () => void {
  hintListeners.add(listener);
  return () => {
    hintListeners.delete(listener);
  };
}

function dismissHint(): void {
  hintDismissedCache = true;
  try {
    window.localStorage.setItem(YEARS_HINT_KEY, "1");
  } catch {
    // Không lưu được thì lần sau hiện lại — chấp nhận được.
  }
  for (const listener of hintListeners) listener();
}

/**
 * Ô chọn kỹ năng dùng chung cho hồ sơ Ứng viên và form tin tuyển dụng của
 * Nhà tuyển dụng (xem docs/05-frontend/phases/jobpost-skill-huong-b/PLAN.md).
 * Tự viết bằng Tailwind, không thêm thư viện combobox mới.
 */
export function SkillMultiSelect({
  selected,
  catalog,
  onAdd,
  onRemove,
  onSuggestNew,
  allowYearsOfExperience = false,
  onUpdateYears,
  onChangeImportance,
  label = "Kỹ năng",
  hint,
  disabled = false,
}: SkillMultiSelectProps) {
  const [query, setQuery] = useState("");
  const [years, setYears] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Server snapshot = "đã ẩn": HTML render trên server không có gợi ý, client
  // đọc localStorage rồi tự hiện lại nếu cần.
  const yearsHintDismissed = useSyncExternalStore(subscribeHint, readHintDismissed, () => true);

  const selectedIds = useMemo(() => new Set(selected.map((skill) => skill.id)), [selected]);

  // Gợi ý CHUNG, không cảnh báo từng kỹ năng: phần lớn người dùng là sinh viên
  // chưa đi làm, 8 kỹ năng 0 năm mà 8 cảnh báo thì chỉ gây nhiễu.
  const showYearsHint =
    allowYearsOfExperience &&
    Boolean(onUpdateYears) &&
    !disabled &&
    !yearsHintDismissed &&
    selected.some((skill) => (skill.yearsOfExperience ?? 0) === 0);

  const suggestions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return catalog
      .filter((item) => !selectedIds.has(item.id) && item.name.toLowerCase().includes(keyword))
      .slice(0, MAX_SUGGESTIONS);
  }, [catalog, query, selectedIds]);

  // Tên gõ vào trùng hệt một mục trong catalog thì thêm thẳng, không cần gọi
  // /skills/suggest — đỡ một vòng request cho trường hợp phổ biến nhất.
  const exactMatch = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return null;
    return catalog.find((item) => item.name.toLowerCase() === keyword) ?? null;
  }, [catalog, query]);

  const validationError = query.trim() ? validateSkillName(query) : null;
  const canAdd = !disabled && !busy && query.trim().length > 0 && validationError === null;

  async function pick(item: { id: string; name: string; status: CatalogEntryStatus }) {
    if (selectedIds.has(item.id)) {
      setError("Kỹ năng này đã được thêm.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd({
        id: item.id,
        name: item.name,
        status: item.status,
        ...(allowYearsOfExperience ? { yearsOfExperience: Number(years) || 0 } : {}),
      });
      setQuery("");
      setYears("0");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thêm được kỹ năng, vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    const message = validateSkillName(query);
    if (message) {
      setError(message);
      return;
    }
    if (exactMatch) {
      await pick({ ...exactMatch, status: "APPROVED" });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const suggested = await onSuggestNew(query.trim());
      if (selectedIds.has(suggested.skillId)) {
        // Hệ thống khớp tên vừa gõ vào đúng kỹ năng đã có trong danh sách —
        // không báo lỗi kiểu "trùng", chỉ nói rõ vì sao không thêm gì thêm.
        setError(`"${query.trim()}" được ghi nhận là "${suggested.name}" — kỹ năng này đã có trong danh sách.`);
        setQuery("");
        return;
      }
      await onAdd({
        id: suggested.skillId,
        name: suggested.name,
        status: suggested.status,
        ...(allowYearsOfExperience ? { yearsOfExperience: Number(years) || 0 } : {}),
      });
      setQuery("");
      setYears("0");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thêm được kỹ năng, vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(skillId: string) {
    setError(null);
    try {
      await onRemove(skillId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không xóa được kỹ năng, vui lòng thử lại.");
    }
  }

  return (
    <Field label={label} hint={hint}>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {selected.length === 0 ? (
            <p className="text-sm text-text-muted">Chưa có kỹ năng nào.</p>
          ) : (
            selected.map((skill) => (
              <SkillTag
                key={skill.id}
                skill={skill}
                disabled={disabled}
                onRemove={remove}
                {...(onUpdateYears ? { onUpdateYears } : {})}
                {...(onChangeImportance ? { onChangeImportance } : {})}
                onError={setError}
              />
            ))
          )}
        </div>

        {showYearsHint ? (
          <div className="flex items-start gap-2 rounded-lg bg-surface-page px-3 py-2 text-sm text-text-muted">
            <Icon name="info" size={16} className="mt-0.5 shrink-0" />
            <p className="flex-1">
              Bạn có thể bấm vào số năm của từng kỹ năng để cập nhật, giúp nhà tuyển dụng hiểu rõ hơn. Bỏ qua nếu bạn
              chưa có kinh nghiệm.
            </p>
            <button type="button" className="shrink-0 hover:text-text-body" aria-label="Ẩn gợi ý" onClick={dismissHint}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ) : null}

        <div className="relative grid gap-2 rounded-lg bg-surface-page p-3 sm:flex sm:items-start">
          <div className="relative flex-1">
            <Input
              icon="search"
              placeholder="Nhập hoặc chọn kỹ năng, ví dụ: ReactJS"
              aria-label="Tên kỹ năng"
              value={query}
              disabled={disabled}
              maxLength={MAX_SKILL_NAME_LENGTH}
              onChange={(e) => {
                setQuery(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                // Enter trong form tin tuyển dụng sẽ submit cả form nếu không chặn.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (canAdd) void submit();
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
                      onClick={() => void pick({ ...item, status: "APPROVED" })}
                    >
                      {item.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {allowYearsOfExperience ? (
            <Input
              className="sm:w-32"
              type="number"
              min="0"
              max="60"
              step="0.5"
              aria-label="Số năm kinh nghiệm"
              value={years}
              disabled={disabled}
              onChange={(e) => setYears(e.target.value)}
            />
          ) : null}

          <Button type="button" icon="plus" loading={busy} disabled={!canAdd} onClick={() => void submit()}>
            Thêm
          </Button>
        </div>

        {validationError ?? error ? <p className="text-sm text-red-600">{validationError ?? error}</p> : null}
      </div>
    </Field>
  );
}

function SkillTag({
  skill,
  disabled,
  onRemove,
  onUpdateYears,
  onChangeImportance,
  onError,
}: {
  skill: SelectedSkill;
  disabled: boolean;
  onRemove: (skillId: string) => void;
  onUpdateYears?: (skillId: string, yearsOfExperience: number) => Promise<void> | void;
  onChangeImportance?: (skillId: string, importance: SkillImportance) => void;
  onError: (message: string | null) => void;
}) {
  const importance = skill.importance ?? "REQUIRED";
  const pending = skill.status === "PENDING";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const yearsTone = pending ? "text-marigold-600" : "text-pine-600";
  const editable = Boolean(onUpdateYears) && !disabled && skill.yearsOfExperience !== undefined;

  async function save() {
    if (!onUpdateYears) return;
    const value = Number(draft);
    const years = !draft || !Number.isFinite(value) || value < 0 ? 0 : Math.min(value, MAX_YEARS);
    // Không gọi API khi số không đổi — bấm vào rồi bấm ra ngoài là thao tác rất
    // hay gặp.
    if (years === skill.yearsOfExperience) {
      setEditing(false);
      return;
    }
    setSaving(true);
    onError(null);
    try {
      await onUpdateYears(skill.id, years);
      setEditing(false);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Không lưu được số năm kinh nghiệm, vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm",
        pending ? "bg-marigold-100 text-marigold-700" : "bg-pine-50 text-pine-800",
      ].join(" ")}
    >
      {skill.name}
      {onChangeImportance ? (
        <button
          type="button"
          disabled={disabled}
          title="Bấm để đổi giữa Bắt buộc và Ưu tiên"
          aria-label={`${skill.name}: ${importance === "REQUIRED" ? "Bắt buộc" : "Ưu tiên"} — bấm để đổi`}
          className={[
            "rounded-full px-2 py-0.5 text-xs font-medium",
            importance === "REQUIRED" ? "bg-brand-100 text-brand-800" : "bg-surface-hover text-text-body",
          ].join(" ")}
          onClick={() => onChangeImportance(skill.id, importance === "REQUIRED" ? "PREFERRED" : "REQUIRED")}
        >
          {importance === "REQUIRED" ? "Bắt buộc" : "Ưu tiên"}
        </button>
      ) : null}
      {editing ? (
        <span className={`flex items-center gap-1 ${yearsTone}`}>
          <input
            autoFocus
            type="number"
            min="0"
            max={MAX_YEARS}
            step="0.5"
            aria-label={`Số năm kinh nghiệm ${skill.name}`}
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              } else if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            className="w-14 rounded-md border border-border-default bg-surface-card px-1.5 py-0.5 text-sm text-text-body"
          />
          năm
        </span>
      ) : skill.yearsOfExperience !== undefined ? (
        editable ? (
          <button
            type="button"
            aria-label={`Sửa số năm kinh nghiệm ${skill.name}`}
            className={`${yearsTone} underline decoration-dotted underline-offset-2`}
            onClick={() => {
              setDraft(skill.yearsOfExperience ? String(skill.yearsOfExperience) : "");
              setEditing(true);
            }}
          >
            {skill.yearsOfExperience} năm
          </button>
        ) : (
          <span className={yearsTone}>{skill.yearsOfExperience} năm</span>
        )
      ) : null}
      {/* Người dùng cần biết kỹ năng tự gõ chưa công khai — nếu không họ sẽ
          tưởng đã xong và thắc mắc sao tìm kiếm không ra. */}
      {pending ? (
        <Badge tone="warning" icon="clock">
          Đang chờ duyệt
        </Badge>
      ) : null}
      {!disabled ? (
        <button
          type="button"
          aria-label={`Xóa ${skill.name}`}
          className="text-text-muted hover:text-red-600"
          onClick={() => onRemove(skill.id)}
        >
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </span>
  );
}
