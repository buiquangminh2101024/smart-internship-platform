import type { JobQualityDto } from "@sip/shared-types";
import { Badge } from "@/components/ui/Badge";
import { JOB_QUALITY_BAND_LABEL } from "@/lib/job-post-display";

export interface JobQualityBadgeProps {
  quality: JobQualityDto | null;
  /** false = chỉ hiện số điểm (chỗ hẹp); nhãn vùng vẫn đọc được qua `title` và chữ ẩn. */
  showLabel?: boolean;
  className?: string;
}

/**
 * Huy hiệu điểm chất lượng tin (AD-29): số điểm + nhãn vùng, màu theo vùng. Dùng ở hàng đợi
 * `/admin/jobs` (F2) và thẻ điểm ở trang chi tiết (F4). Màu không là kênh duy nhất: luôn có
 * nhãn vùng (hiện hoặc ẩn cho trình đọc màn hình).
 */
export function JobQualityBadge({ quality, showLabel = true, className = "" }: JobQualityBadgeProps) {
  if (!quality) {
    return (
      <Badge tone={JOB_QUALITY_BAND_LABEL.UNSCORED.tone} className={className}>
        {JOB_QUALITY_BAND_LABEL.UNSCORED.label}
      </Badge>
    );
  }
  const band = JOB_QUALITY_BAND_LABEL[quality.band];
  return (
    <span title={`${quality.score} điểm · ${band.label}`} className="relative inline-flex">
      <Badge tone={band.tone} className={className}>
        <span className="font-num font-bold tabular-nums">{quality.score}</span>
        <span className="sr-only"> điểm</span>
        {showLabel ? <span>· {band.label}</span> : <span className="sr-only">, {band.label}</span>}
      </Badge>
    </span>
  );
}
