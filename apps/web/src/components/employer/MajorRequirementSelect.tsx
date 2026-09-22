"use client";

import { useMemo, useState } from "react";
import type { CatalogItem, MajorRelevance } from "@sip/shared-types";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";

export interface SelectedMajor {
  majorId: string;
  majorName: string;
  relevance: MajorRelevance;
}

/** Cùng trần với `majorList` ở apps/server/src/modules/job-posts/job-posts.dto.ts. */
export const MAX_JOB_MAJORS = 10;

const MAX_SUGGESTIONS = 6;

export interface MajorRequirementSelectProps {
  selected: SelectedMajor[];
  /** Danh mục ngành đã duyệt (`/catalog/majors`). */
  catalog: CatalogItem[];
  onAdd: (major: SelectedMajor) => void;
  onRemove: (majorId: string) => void;
  onChangeRelevance: (majorId: string, relevance: MajorRelevance) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

/**
 * Chọn ngành học phù hợp cho tin (docs/05-frontend/phases/job-matcher-phase3/PLAN.md
 * Quyết định #3). Chỉ chọn trong danh mục đã duyệt — không đề xuất ngành mới từ
 * đây. Ngành mới thêm mặc định "Đúng ngành"; bấm nhãn để đổi sang "Ngành liên quan".
 */
export function MajorRequirementSelect({
  selected,
  catalog,
  onAdd,
  onRemove,
  onChangeRelevance,
  label = "Ngành học phù hợp",
  hint,
  disabled = false,
}: MajorRequirementSelectProps) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedIds = useMemo(() => new Set(selected.map((major) => major.majorId)), [selected]);
  const full = selected.length >= MAX_JOB_MAJORS;

  const suggestions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    return catalog
      .filter((item) => !selectedIds.has(item.id) && item.name.toLowerCase().includes(keyword))
      .slice(0, MAX_SUGGESTIONS);
  }, [catalog, query, selectedIds]);

  function pick(item: CatalogItem) {
    if (full) {
      setError(`Chỉ chọn tối đa ${MAX_JOB_MAJORS} ngành.`);
      return;
    }
    onAdd({ majorId: item.id, majorName: item.name, relevance: "PRIMARY" });
    setQuery("");
    setError(null);
  }

  return (
    <Field label={label} hint={hint}>
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {selected.length === 0 ? (
            <p className="text-sm text-text-muted">Chưa chọn ngành nào — tin không yêu cầu ngành cụ thể.</p>
          ) : (
            selected.map((major) => (
              <span
                key={major.majorId}
                className="inline-flex items-center gap-2 rounded-full bg-pine-50 px-3 py-1.5 text-sm text-pine-800"
              >
                {major.majorName}
                <button
                  type="button"
                  disabled={disabled}
                  title="Bấm để đổi giữa Đúng ngành và Ngành liên quan"
                  aria-label={`${major.majorName}: ${major.relevance === "PRIMARY" ? "Đúng ngành" : "Ngành liên quan"} — bấm để đổi`}
                  className={[
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    major.relevance === "PRIMARY" ? "bg-brand-100 text-brand-800" : "bg-surface-hover text-text-body",
                  ].join(" ")}
                  onClick={() => onChangeRelevance(major.majorId, major.relevance === "PRIMARY" ? "RELATED" : "PRIMARY")}
                >
                  {major.relevance === "PRIMARY" ? "Đúng ngành" : "Ngành liên quan"}
                </button>
                {!disabled ? (
                  <button
                    type="button"
                    aria-label={`Xóa ${major.majorName}`}
                    className="text-text-muted hover:text-red-600"
                    onClick={() => onRemove(major.majorId)}
                  >
                    <Icon name="x" size={14} />
                  </button>
                ) : null}
              </span>
            ))
          )}
        </div>

        <div className="relative rounded-lg bg-surface-page p-3">
          <Input
            icon="search"
            placeholder={full ? `Đã đủ ${MAX_JOB_MAJORS} ngành` : "Tìm ngành trong danh mục, ví dụ: Công nghệ thông tin"}
            aria-label="Tên ngành học"
            value={query}
            disabled={disabled || full}
            onChange={(e) => {
              setQuery(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const exact = catalog.find((item) => item.name.toLowerCase() === query.trim().toLowerCase());
                const target = exact && !selectedIds.has(exact.id) ? exact : suggestions[0];
                if (target) pick(target);
              }
            }}
          />
          {suggestions.length > 0 ? (
            <ul className="absolute right-3 left-3 z-10 mt-1 overflow-hidden rounded-lg border border-border-subtle bg-surface-card shadow-lg">
              {suggestions.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm text-text-body hover:bg-surface-hover"
                    onClick={() => pick(item)}
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() ? (
            <p className="mt-2 text-xs text-text-muted">Không tìm thấy ngành phù hợp trong danh mục.</p>
          ) : null}
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </Field>
  );
}
