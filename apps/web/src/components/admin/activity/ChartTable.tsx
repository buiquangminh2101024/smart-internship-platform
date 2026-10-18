import type { ReactNode } from "react";

/** Bảng thay cho một biểu đồ (nút "Xem dạng bảng"); số canh phải. */
export function ChartTable({
  caption,
  headers,
  rows,
  numeric = [],
}: {
  caption: string;
  headers: string[];
  rows: ReactNode[][];
  /** Chỉ số các cột là số (canh phải, `tabular-nums`). */
  numeric?: number[];
}) {
  return (
    <div className="relative max-h-[360px] overflow-auto rounded-lg border border-border-subtle">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-page text-text-muted">
          <tr>
            {headers.map((header, index) => (
              <th
                key={header}
                scope="col"
                className={`px-3 py-2 font-medium whitespace-nowrap ${numeric.includes(index) ? "text-right" : ""}`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-border-subtle">
              {row.map((cell, index) =>
                index === 0 ? (
                  <th key={index} scope="row" className="px-3 py-1.5 font-medium whitespace-nowrap text-text-strong">
                    {cell}
                  </th>
                ) : (
                  <td
                    key={index}
                    className={`px-3 py-1.5 text-text-body ${numeric.includes(index) ? "text-right tabular-nums" : ""}`}
                  >
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
