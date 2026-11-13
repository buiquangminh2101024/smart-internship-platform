"use client";

import { useId, useMemo, useState } from "react";
import type { CatalogItem, JobPostSkillMode } from "@sip/shared-types";
import { Icon } from "@/components/ui/Icon";
import { MAX_FILTER_SKILLS } from "@/lib/job-search-params";

// Bộ lọc kỹ năng của /jobs (AD-26, plan FE job-discovery bước F2): ô gõ để tìm trong danh mục
// thay cho bức tường chip toàn danh mục. Không dùng SkillMultiSelect (ô đó còn đề xuất kỹ năng
// mới và số năm — không hợp với bộ lọc). Mẫu ARIA combobox + listbox, không thêm thư viện.

const MAX_OPTIONS = 8;

/** Bỏ dấu để gõ "lap trinh" vẫn ra "Lập trình". */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export interface SkillFilterProps {
  catalog: CatalogItem[];
  selectedIds: string[];
  mode: JobPostSkillMode;
  onAdd: (skillId: string) => void;
  onRemove: (skillId: string) => void;
  onModeChange: (mode: JobPostSkillMode) => void;
  /** Hiện chip kỹ năng đã chọn ngay dưới ô (ngăn kéo điện thoại — dòng "Đang lọc" bị che). */
  showSelected?: boolean;
  /** Có thì hiện nhãn trên ô; không thì dùng aria-label. */
  label?: string;
}

export function SkillFilter({
  catalog,
  selectedIds,
  mode,
  onAdd,
  onRemove,
  onModeChange,
  showSelected = false,
  label,
}: SkillFilterProps) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const full = selectedIds.length >= MAX_FILTER_SKILLS;
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const options = useMemo(() => {
    const keyword = fold(query.trim());
    if (!keyword) return [];
    const matches = catalog.filter((item) => !selected.has(item.id) && fold(item.name).includes(keyword));
    // Tên bắt đầu bằng chữ đã gõ lên trước (gõ "java": "Java", "JavaScript" trước "RxJava").
    matches.sort((left, right) => Number(fold(right.name).startsWith(keyword)) - Number(fold(left.name).startsWith(keyword)));
    return matches.slice(0, MAX_OPTIONS);
  }, [catalog, query, selected]);
  const expanded = open && options.length > 0;
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));

  function pick(item: CatalogItem) {
    onAdd(item.id);
    setQuery("");
    setActive(0);
  }

  const names = new Map(catalog.map((item) => [item.id, item.name]));

  return (
    <div className="grid gap-2">
      {label ? (
        <label htmlFor={inputId} className="text-sm font-medium text-text-strong">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <Icon
          name="search"
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle"
        />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-label={label ? undefined : "Lọc theo kỹ năng"}
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          disabled={full}
          placeholder={full ? `Đã chọn tối đa ${MAX_FILTER_SKILLS} kỹ năng` : "Kỹ năng, ví dụ ReactJS"}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && options.length > 0) {
              event.preventDefault();
              setOpen(true);
              setActive((activeIndex + 1) % options.length);
            } else if (event.key === "ArrowUp" && options.length > 0) {
              event.preventDefault();
              setActive((activeIndex - 1 + options.length) % options.length);
            } else if (event.key === "Enter") {
              // Không để Enter gửi form từ khoá bao ngoài.
              event.preventDefault();
              const item = expanded ? options[activeIndex] : undefined;
              if (item) pick(item);
            } else if (event.key === "Escape" && expanded) {
              event.preventDefault();
              setOpen(false);
            }
          }}
          className="h-11 w-full rounded-lg border border-border-default bg-white pr-3 pl-9 text-[15px] outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-surface-page disabled:text-text-subtle"
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Kỹ năng khớp"
          hidden={!expanded}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border-subtle bg-surface-card py-1 shadow-lg"
        >
          {options.map((item, index) => (
            <li
              key={item.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // mousedown: chọn trước khi ô mất focus (blur đóng danh sách).
              onMouseDown={(event) => {
                event.preventDefault();
                pick(item);
              }}
              onMouseEnter={() => setActive(index)}
              className={`cursor-pointer px-3 py-2 text-sm text-text-body ${index === activeIndex ? "bg-surface-hover text-text-strong" : ""}`}
            >
              {item.name}
            </li>
          ))}
        </ul>
        {open && query.trim() && options.length === 0 && !full ? (
          <p className="absolute z-20 mt-1 w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-[13px] text-text-muted shadow-lg">
            Không có kỹ năng nào khớp “{query.trim()}”.
          </p>
        ) : null}
      </div>

      {showSelected && selectedIds.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Kỹ năng đã chọn">
          {selectedIds.map((skillId) => (
            <li key={skillId}>
              <button
                type="button"
                onClick={() => onRemove(skillId)}
                aria-label={`Bỏ kỹ năng ${names.get(skillId) ?? ""}`}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-brand-50 px-3 text-[13px] text-brand-800 hover:bg-brand-100"
              >
                {names.get(skillId) ?? "…"}
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selectedIds.length > 1 ? (
        <div role="radiogroup" aria-label="Cách lọc nhiều kỹ năng" className="inline-flex w-fit rounded-lg bg-surface-page p-0.5">
          {(
            [
              ["any", "Có ít nhất một"],
              ["all", "Có đủ tất cả"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => onModeChange(value)}
              className={`min-h-8 rounded-md px-3 text-[13px] transition-colors ${
                mode === value ? "bg-surface-card font-medium text-text-strong shadow-sm" : "text-text-muted hover:text-text-strong"
              }`}
            >
              {text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
