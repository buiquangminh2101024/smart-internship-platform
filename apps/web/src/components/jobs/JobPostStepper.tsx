import { Icon } from "@/components/ui/Icon";

export interface StepperProps {
  steps: string[];
  /** Chỉ số bước hiện tại (0-based) — các bước trước đó coi như đã xong. */
  current: number;
  /** Bước hiện tại là kết quả thất bại (bị từ chối) — hiện dấu X đỏ. */
  failed?: boolean;
}

/**
 * Stepper ngang cho các trang kết quả gửi duyệt / duyệt / từ chối — khớp ảnh
 * mẫu `Screenshot 2026-09-12 134041.png`, `134326.png`, `134745.png`.
 */
export function JobPostStepper({ steps, current, failed = false }: StepperProps) {
  return (
    <ol className="flex items-start">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const isFailed = active && failed;
        const circle = isFailed
          ? "bg-red-600 text-white"
          : done || active
            ? "bg-pine-500 text-white"
            : "bg-surface-hover text-text-subtle";

        return (
          <li key={step} className="flex flex-1 flex-col items-center gap-2 text-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${index === 0 ? "bg-transparent" : done || active ? "bg-pine-400" : "bg-border-subtle"}`} />
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${circle}`}>
                <Icon name={isFailed ? "x" : done ? "check" : active ? "loader-circle" : "circle"} size={15} />
              </span>
              <span
                className={`h-0.5 flex-1 ${index === steps.length - 1 ? "bg-transparent" : done ? "bg-pine-400" : "bg-border-subtle"}`}
              />
            </div>
            <span className={`px-1 text-xs ${isFailed ? "text-red-600" : active || done ? "text-text-strong" : "text-text-subtle"}`}>
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
