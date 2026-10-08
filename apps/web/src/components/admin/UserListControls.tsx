"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/dashboard-format";
import { Icon } from "@/components/ui/Icon";
import { DashButton } from "@/components/dashboard/DashButton";

/**
 * Thanh thao tác khi đã chọn người dùng (E7): "Đã chọn 5 · Khoá (3) · Mở khoá
 * (2) · Bỏ chọn". Cùng cách đặt với `SelectionBar` của trang ứng tuyển Employer
 * (con cuối của khối chứa bảng, `sticky` ở đáy màn hình), nhưng nền trắng theo
 * Admin bản D (không khối tối). Nút có số 0 thì ẩn.
 */
export function UserSelectionBar({
  count,
  suspendable,
  reactivatable,
  onSuspend,
  onReactivate,
  onClear,
}: {
  count: number;
  suspendable: number;
  reactivatable: number;
  onSuspend: () => void;
  onReactivate: () => void;
  onClear: () => void;
}) {
  const [announcement, setAnnouncement] = useState("");
  const previous = useRef(count);

  useEffect(() => {
    if (previous.current === count) return;
    previous.current = count;
    setAnnouncement(count > 0 ? `Đã chọn ${count} người dùng` : "Đã bỏ chọn tất cả");
  }, [count]);

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {count > 0 ? (
        <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
          <div
            role="region"
            aria-label="Thao tác với người dùng đã chọn"
            className="pointer-events-auto flex w-full max-w-[760px] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-subtle bg-surface-card py-2.5 pr-3 pl-5 shadow-[0_12px_32px_rgba(11,31,27,0.18)]"
          >
            <p className="font-semibold text-text-strong">
              Đã chọn <b className="font-num text-lg tabular-nums">{count}</b> người dùng
            </p>
            <DashButton variant="ghost" size="sm" onClick={onClear}>
              Bỏ chọn
            </DashButton>
            <span className="flex-1" />
            {reactivatable > 0 ? (
              <DashButton variant="secondary" icon="lock-open" onClick={onReactivate} className="max-[480px]:flex-1">
                Mở khoá ({reactivatable})
              </DashButton>
            ) : null}
            {suspendable > 0 ? (
              <DashButton variant="danger-solid" icon="lock" onClick={onSuspend} className="max-[480px]:flex-1">
                Khoá ({suspendable})
              </DashButton>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Các số trang cần hiện: đầu, cuối, trang hiện tại ± 1; khoảng trống thành "…". */
function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  for (const n of pages) {
    const last = result[result.length - 1];
    if (typeof last === "number" && n - last === 2) result.push(n - 1);
    else if (typeof last === "number" && n - last > 2) result.push("gap");
    result.push(n);
  }
  return result;
}

const PAGE_BUTTON =
  "grid h-8 min-w-8 cursor-pointer place-items-center rounded-lg px-2 text-[13px] font-semibold tabular-nums transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-45";

/** "Hiển thị 21–40 trong 57 người dùng" + "Trước · 1 2 3 … · Sau" (E6). */
export function PageNav({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = Math.min(total, (page - 1) * pageSize + 1);
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
      <p className="text-[13px] text-text-muted tabular-nums">
        Hiển thị {formatNumber(from)}–{formatNumber(to)} trong {formatNumber(total)} người dùng
      </p>
      {totalPages > 1 ? (
        <nav aria-label="Phân trang" className="flex items-center gap-1">
          <button
            type="button"
            className={`${PAGE_BUTTON} text-text-strong hover:bg-surface-hover`}
            aria-label="Trang trước"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
          >
            <span className="flex items-center gap-1">
              <Icon name="chevron-left" size={16} />
              <span className="max-sm:sr-only">Trước</span>
            </span>
          </button>
          {pageWindow(page, totalPages).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} aria-hidden className="px-1 text-[13px] text-text-subtle">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-current={item === page ? "page" : undefined}
                aria-label={`Trang ${item}`}
                onClick={() => onChange(item)}
                className={`${PAGE_BUTTON} ${
                  item === page ? "bg-brand-600 text-white hover:bg-brand-700" : "text-text-strong hover:bg-surface-hover"
                }`}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className={`${PAGE_BUTTON} text-text-strong hover:bg-surface-hover`}
            aria-label="Trang sau"
            disabled={page >= totalPages}
            onClick={() => onChange(page + 1)}
          >
            <span className="flex items-center gap-1">
              <span className="max-sm:sr-only">Sau</span>
              <Icon name="chevron-right" size={16} />
            </span>
          </button>
        </nav>
      ) : null}
    </div>
  );
}
