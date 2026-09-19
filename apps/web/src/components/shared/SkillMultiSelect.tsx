"use client";

import { useMemo, useState } from "react";
import type { CatalogItem, CatalogEntryStatus, SuggestSkillResponse } from "@sip/shared-types";
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
  label?: string;
  hint?: string;
  disabled?: boolean;
}

const MAX_SUGGESTIONS = 6;

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
  label = "Kỹ năng",
  hint,
  disabled = false,
}: SkillMultiSelectProps) {
  const [query, setQuery] = useState("");
  const [years, setYears] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedIds = useMemo(() => new Set(selected.map((skill) => skill.id)), [selected]);

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
            selected.map((skill) => <SkillTag key={skill.id} skill={skill} disabled={disabled} onRemove={remove} />)
          )}
        </div>

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
}: {
  skill: SelectedSkill;
  disabled: boolean;
  onRemove: (skillId: string) => void;
}) {
  const pending = skill.status === "PENDING";
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm",
        pending ? "bg-marigold-100 text-marigold-700" : "bg-pine-50 text-pine-800",
      ].join(" ")}
    >
      {skill.name}
      {skill.yearsOfExperience !== undefined ? (
        <span className={pending ? "text-marigold-600" : "text-pine-600"}>{skill.yearsOfExperience} năm</span>
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
