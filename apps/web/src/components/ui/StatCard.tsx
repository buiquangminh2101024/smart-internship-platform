import { Icon } from "./Icon";

export interface StatCardProps {
  label: string;
  value: string | number;
  /** Đơn vị đi kèm, vd. "hồ sơ", "giờ". */
  unit?: string;
  icon?: string;
  className?: string;
}

export function StatCard({ label, value, unit, icon, className = "" }: StatCardProps) {
  return (
    <div className={["flex items-center gap-4 rounded-xl border border-border-subtle bg-white p-4", className].join(" ")}>
      {icon ? (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-pine-50 text-pine-600">
          <Icon name={icon} size={20} />
        </span>
      ) : null}
      <div className="grid gap-0.5">
        <span className="text-2xl font-semibold text-text-strong">
          {value}
          {unit ? <span className="ml-1 text-sm font-normal text-text-muted">{unit}</span> : null}
        </span>
        <span className="text-sm text-text-muted">{label}</span>
      </div>
    </div>
  );
}
