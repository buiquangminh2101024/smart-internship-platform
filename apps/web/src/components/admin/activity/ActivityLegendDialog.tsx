"use client";

import type { ReactNode } from "react";
import type { AuditActivityGroup } from "@sip/shared-types";
import { ACTION_META, AUDIT_GROUPS, GROUP_META, ROLE_FILTERS, ROLE_LABEL } from "@/lib/audit-activity";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { GroupSwatch } from "./ActivityMeta";

/*
 * Hộp thoại "Chú giải" của trang Nhật ký hoạt động (plan admin-activity-v2, M16): nghĩa
 * của ô màu nhóm, các dấu hiệu ở Điểm chính và nhãn vai trò. Icon và màu vẽ bằng đúng
 * component của trang (`GroupSwatch`, `Icon`), nên đổi icon hay thêm nhóm thì chú giải
 * tự theo. Nhãn hành động lấy từ `ACTION_META`.
 */

const TITLE_ID = "activity-legend-title";

/** 2–3 hành động ví dụ mỗi nhóm. */
const GROUP_EXAMPLES: Record<(typeof AUDIT_GROUPS)[number], string[]> = {
  JOB_POST: ["JOB_POST_SUBMITTED", "JOB_POST_APPROVED", "JOB_POST_RETRACTED"],
  COMPANY: ["COMPANY_VERIFIED", "COMPANY_REJECTED", "COMPANY_REQUIRES_APPROVAL_CHANGED"],
  CATALOG: ["CATALOG_ENTRY_APPROVED", "CATALOG_ENTRY_MERGED"],
  PAYMENT: ["PAYMENT_COMPLETED"],
  ACCOUNT: ["USER_SUSPENDED", "USER_REACTIVATED", "USER_SESSIONS_REVOKED"],
  SECURITY: ["AUTH_LOGIN_SUCCEEDED", "AUTH_LOGIN_FAILED_REPEATED", "AUTH_PASSWORD_RESET"],
};

const REPORT_EXAMPLES = ["JOB_REPORT_ACTION_EXECUTED", "JOB_REPORT_RESOLVED"];

const ROLE_HINT: Record<(typeof ROLE_FILTERS)[number], string> = {
  ADMIN: "Tài khoản quản trị nền tảng",
  EMPLOYER: "Tài khoản nhà tuyển dụng",
  CANDIDATE: "Tài khoản ứng viên",
  SYSTEM: "Dòng do hệ thống tự ghi, không có người làm (vd. thanh toán, đăng nhập sai nhiều lần)",
};

function examples(actions: string[]): string {
  return actions.map((action) => ACTION_META[action]?.label ?? action).join(", ");
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <h3 id={id} className="text-[13px] font-bold text-text-muted">
        {title}
      </h3>
      <ul className="grid">{children}</ul>
    </section>
  );
}

/** Một mục: mẫu hình bên trái, tên và giải thích bên phải. */
function Entry({ sample, name, children }: { sample: ReactNode; name: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-x-3 border-t border-border-subtle py-2 first:border-t-0">
      <span aria-hidden className="flex min-h-6 items-center">
        {sample}
      </span>
      <span className="grid gap-0.5">
        <span className="text-sm font-semibold text-text-strong">{name}</span>
        <span className="text-[13px] text-text-body">{children}</span>
      </span>
    </li>
  );
}

function GroupEntry({ group, children }: { group: AuditActivityGroup; children: ReactNode }) {
  return (
    <Entry sample={<GroupSwatch group={group} size={22} />} name={GROUP_META[group].label}>
      {children}
    </Entry>
  );
}

export function ActivityLegendDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy={TITLE_ID} size="md">
      <DialogHeader
        titleId={TITLE_ID}
        title="Chú giải"
        subtitle="Màu, icon và dấu hiệu trên trang Nhật ký hoạt động."
        onClose={onClose}
      />
      <DialogBody className="gap-5">
        <Section id="legend-groups" title="Nhóm hoạt động">
          {AUDIT_GROUPS.map((group) => (
            <GroupEntry key={group} group={group}>
              Ví dụ: {examples(GROUP_EXAMPLES[group])}.
            </GroupEntry>
          ))}
          <Entry sample={<GroupSwatch group="JOB_POST" size={22} icon="flag" />} name="Báo cáo vi phạm">
            Thuộc nhóm Tin tuyển dụng nên cùng màu, icon lá cờ giống mục Báo cáo vi phạm ở menu. Ví dụ:{" "}
            {examples(REPORT_EXAMPLES)}.
          </Entry>
          <GroupEntry group="OTHER">Hành động chưa có trong danh sách nhóm, thường là dữ liệu cũ.</GroupEntry>
        </Section>

        <Section id="legend-signs" title="Dấu hiệu ở Điểm chính">
          <Entry
            sample={<span className="block h-6 w-9 rounded-md border border-marigold-300 border-l-[3px] border-l-marigold-500" />}
            name="Viền vàng"
          >
            Quy tắc có trường hợp cần bạn xem. Bấm vào để mở danh sách tài khoản hoặc tin.
          </Entry>
          <Entry sample={<Icon name="check" size={18} className="text-text-subtle" />} name="Dấu ✓ xám">
            Không có gì bất thường trong khoảng đang xem.
          </Entry>
          <Entry
            sample={
              <span className="flex text-text-muted">
                <Icon name="chevron-down" size={18} />
                <Icon name="chevron-up" size={18} />
              </span>
            }
            name="Mũi tên xuống / lên"
          >
            Mở hoặc đóng danh sách của một quy tắc.
          </Entry>
          <Entry sample={<Icon name="chevron-right" size={18} className="text-text-muted" />} name="Mũi tên phải">
            Lọc danh sách hoạt động theo dòng đó, hoặc mở chi tiết dòng nhật ký.
          </Entry>
          <Entry sample={<Icon name="arrow-up-right" size={18} className="text-text-muted" />} name="Mũi tên chéo">
            Mở trang khác, ở đây là trang Báo cáo vi phạm.
          </Entry>
          <Entry
            sample={
              <span className="inline-grid h-5 min-w-[22px] place-items-center rounded-full bg-marigold-100 px-[7px] text-xs font-bold text-marigold-800 tabular-nums">
                2
              </span>
            }
            name="Số trên tab Điểm chính"
          >
            Số quy tắc đang cần xem. Không có quy tắc nào thì không hiện số.
          </Entry>
          <Entry sample={<b className="text-sm text-text-strong tabular-nums">12</b>} name="Số ở Hoạt động chính">
            Số khác 0 bấm được để xem các hoạt động đó trong tab Danh sách. Số 0 màu xám không bấm được.
          </Entry>
        </Section>

        <Section id="legend-roles" title="Vai trò người làm">
          {ROLE_FILTERS.map((role) => (
            <Entry
              key={role}
              sample={
                role === "SYSTEM" ? <Icon name="settings-2" size={16} className="text-text-muted" /> : <span />
              }
              name={ROLE_LABEL[role]}
            >
              {ROLE_HINT[role]}
            </Entry>
          ))}
        </Section>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          Đóng
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
