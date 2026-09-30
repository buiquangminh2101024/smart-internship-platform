import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

/** Khung xám giữ đúng chiều cao của khối đang tải (tránh nhảy bố cục). */
export function BlockSkeleton({ height, className = "" }: { height: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={["rounded-xl bg-surface-hover motion-safe:animate-pulse", className].join(" ")}
      style={{ height }}
    />
  );
}

export interface BlockErrorProps {
  /** Tên khối, vd. "việc cần làm". */
  what: string;
  onRetry: () => void;
  retrying?: boolean;
  minHeight?: number;
  className?: string;
}

/** Lỗi của riêng một khối — không làm hỏng cả trang. */
export function BlockError({ what, onRetry, retrying = false, minHeight, className = "" }: BlockErrorProps) {
  return (
    <Card
      role="alert"
      padding="md"
      className={["flex flex-wrap items-center justify-between gap-3", className].join(" ")}
      style={minHeight ? { minHeight } : undefined}
    >
      <p className="inline-flex items-center gap-2 text-sm text-text-body">
        <Icon name="circle-alert" size={18} className="shrink-0 text-red-600" />
        Không tải được {what}. Kiểm tra kết nối rồi bấm Tải lại.
      </p>
      <Button variant="secondary" size="sm" icon="refresh-cw" loading={retrying} onClick={onRetry}>
        Tải lại
      </Button>
    </Card>
  );
}
