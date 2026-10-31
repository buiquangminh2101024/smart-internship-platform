"use client";

import { Icon } from "./Icon";

type PageItem = number | "gap";

/**
 * Dải số trang: trang 1, trang cuối, trang đang xem và `siblings` trang mỗi bên.
 * Khoảng trống chỉ thiếu đúng một trang thì hiện luôn số trang đó thay cho "…".
 */
export function pageItems(page: number, pageCount: number, siblings: number): PageItem[] {
  const shown = new Set([1, pageCount]);
  for (let p = page - siblings; p <= page + siblings; p++) {
    if (p >= 1 && p <= pageCount) shown.add(p);
  }
  const sorted = [...shown].sort((a, b) => a - b);
  const items: PageItem[] = [];
  for (const p of sorted) {
    const previous = items.at(-1);
    if (typeof previous === "number" && p - previous === 2) items.push(previous + 1);
    else if (typeof previous === "number" && p - previous > 2) items.push("gap");
    items.push(p);
  }
  return items;
}

/**
 * Phân trang đánh số. Màn rộng hiện một trang lân cận mỗi bên trang đang xem;
 * ≤720px chỉ còn trang đầu, trang đang xem, trang cuối, và hai nút chỉ còn icon.
 * Ẩn khi chỉ có một trang.
 */
export function Pagination({
  page,
  pageCount,
  onChange,
  label,
  className = "",
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** `aria-label` của `nav`, vd. "Phân trang hồ sơ chờ đặt lịch". */
  label: string;
  className?: string;
}) {
  if (pageCount <= 1) return null;

  const arrowClass =
    "inline-flex h-9 min-w-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border-default bg-surface-card px-3 text-[13px] font-semibold text-text-strong transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface-card motion-reduce:transition-none max-[720px]:px-0";

  const renderItems = (items: PageItem[], className: string) => (
    <ol className={`items-center gap-1 ${className}`}>
      {items.map((item, index) =>
        item === "gap" ? (
          <li key={`gap-${index}`} aria-hidden className="px-1 text-text-muted">
            …
          </li>
        ) : (
          <li key={item}>
            <button
              type="button"
              aria-current={item === page ? "page" : undefined}
              aria-label={`Trang ${item}`}
              onClick={() => item !== page && onChange(item)}
              className={`inline-flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg px-2 font-num text-[13px] font-bold tabular-nums transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 motion-reduce:transition-none ${
                item === page ? "bg-brand-600 text-white" : "text-text-body hover:bg-surface-hover"
              }`}
            >
              {item}
            </button>
          </li>
        ),
      )}
    </ol>
  );

  return (
    <nav aria-label={label} className={`flex items-center justify-center gap-2 ${className}`}>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Trang trước"
        className={arrowClass}
      >
        <Icon name="chevron-left" size={16} />
        <span aria-hidden className="max-[720px]:hidden">
          Trang trước
        </span>
      </button>
      {renderItems(pageItems(page, pageCount, 1), "hidden min-[721px]:flex")}
      {renderItems(pageItems(page, pageCount, 0), "flex min-[721px]:hidden")}
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        aria-label="Trang sau"
        className={arrowClass}
      >
        <span aria-hidden className="max-[720px]:hidden">
          Trang sau
        </span>
        <Icon name="chevron-right" size={16} />
      </button>
    </nav>
  );
}
