import type { ReactNode } from "react";

export interface PanelHeadProps {
  id?: string;
  title: string;
  subtitle?: ReactNode;
  /** Nút chọn nằm bên phải tiêu đề (vd. Hồ sơ / Lượt xem). */
  actions?: ReactNode;
  /** Thẻ tiêu đề; khối cấp trang dùng h2, thẻ con trong khối dùng h3. */
  as?: "h2" | "h3";
}

/** Tiêu đề thẻ (bản C): 16px đậm, vạch brand 3px phía trước, dòng phụ màu muted. */
export function PanelHead({ id, title, subtitle, actions, as: Heading = "h3" }: PanelHeadProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <Heading id={id} className="flex items-center gap-2 text-base leading-[1.3] font-bold text-text-strong">
          <span aria-hidden className="h-3.5 w-[3px] shrink-0 rounded-sm bg-brand-600" />
          {title}
        </Heading>
        {subtitle ? <p className="mt-0.5 text-text-muted">{subtitle}</p> : null}
      </div>
      {actions}
    </header>
  );
}

/** Thẻ trắng padding 20px, chữ 14px, dùng cho các khối phân tích. */
export function Panel({ children, className = "", labelledBy }: { children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={["flex min-w-0 flex-col gap-4 rounded-xl border border-border-subtle bg-surface-card p-5 text-sm", className].join(" ")}
    >
      {children}
    </section>
  );
}
