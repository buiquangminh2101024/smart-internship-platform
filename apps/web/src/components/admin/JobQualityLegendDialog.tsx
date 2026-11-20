"use client";

import { useId, useState } from "react";
import { DashButton } from "@/components/dashboard/DashButton";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { JOB_QUALITY_BAND_LABEL } from "@/lib/job-post-display";
import {
  QUALITY_BAND_LEGEND,
  QUALITY_CRITERIA_LEGEND,
  QUALITY_FLAG_LEGEND,
  QUALITY_LEGEND_VERSION,
  QUALITY_NOTE_LEGEND,
  QUALITY_TOTAL_LEGEND,
} from "@/lib/job-quality-legend";

/**
 * Nút "Cách tính điểm" + hộp chú giải (AD-29 F5). Đặt ở trang hàng đợi `/admin/jobs` và trên thẻ
 * điểm ở trang chi tiết. Nội dung ở `lib/job-quality-legend.ts`.
 */
export function JobQualityLegendButton({ size = "sm" }: { size?: "sm" | "md" }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  return (
    <>
      <DashButton variant="ghost" size={size} icon="circle-help" onClick={() => setOpen(true)}>
        Cách tính điểm
      </DashButton>
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy={titleId} size="lg" fullScreenOnMobile>
        <DialogHeader
          titleId={titleId}
          title="Cách tính điểm chất lượng tin"
          subtitle={`Phiên bản thuật toán v${QUALITY_LEGEND_VERSION}`}
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <p>{QUALITY_TOTAL_LEGEND}</p>

          <section className="grid gap-2">
            <h3 className="font-semibold text-text-strong">Sáu tiêu chí</h3>
            <ul className="grid gap-2">
              {QUALITY_CRITERIA_LEGEND.map((criterion, index) => (
                <li key={criterion.key} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-lg bg-surface-page px-3 py-2">
                  <span className="font-semibold text-text-strong">
                    {index + 1}. {criterion.label}
                  </span>
                  <span className="text-[13px] text-text-muted">
                    Trọng số <span className="font-num font-bold tabular-nums text-text-body">{criterion.weight}%</span>
                  </span>
                  <span className="col-span-2 text-[13px] text-text-body">{criterion.summary}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-2">
            <h3 className="font-semibold text-text-strong">Ba vùng gợi ý</h3>
            <dl className="grid gap-2">
              {QUALITY_BAND_LEGEND.map((item) => (
                <div key={item.band} className="grid gap-1 sm:grid-cols-[150px_1fr] sm:items-baseline sm:gap-3">
                  <dt>
                    <Badge tone={JOB_QUALITY_BAND_LABEL[item.band].tone}>{JOB_QUALITY_BAND_LABEL[item.band].label}</Badge>
                  </dt>
                  <dd className="text-text-body">{item.rule}</dd>
                </div>
              ))}
            </dl>
          </section>

          <p className="flex items-start gap-2 rounded-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-red-700">
            <Icon name="triangle-alert" size={16} className="mt-0.5 shrink-0" />
            {QUALITY_FLAG_LEGEND}
          </p>

          <p className="text-text-muted">{QUALITY_NOTE_LEGEND}</p>
        </DialogBody>
        <DialogFooter>
          <DashButton onClick={() => setOpen(false)}>Đóng</DashButton>
        </DialogFooter>
      </Dialog>
    </>
  );
}
