import type { AuditActivityGroup, AuditActivityItem, Role } from "@sip/shared-types";
import { GROUP_META, ROLE_LABEL } from "@/lib/audit-activity";
import { Icon } from "@/components/ui/Icon";

/*
 * Mảnh dùng chung của trang Nhật ký hoạt động. Màu nhóm không bao giờ đứng một
 * mình: ô màu luôn đi kèm icon, và nơi dùng luôn có nhãn chữ bên cạnh.
 */

/** Ô màu nhóm có icon trắng bên trong (trang trí; nhãn nằm cạnh). */
export function GroupSwatch({ group, size = 22 }: { group: AuditActivityGroup; size?: number }) {
  const meta = GROUP_META[group];
  return (
    <span
      aria-hidden
      className={`inline-grid flex-none place-items-center rounded-md text-white ${meta.swatch}`}
      style={{ width: size, height: size }}
    >
      <Icon name={meta.icon} size={Math.round(size * 0.62)} strokeWidth={2} />
    </span>
  );
}

/** Ô màu nhỏ cho chú giải biểu đồ. */
export function GroupDot({ group }: { group: AuditActivityGroup }) {
  return <i aria-hidden className={`inline-block h-[10px] w-[10px] flex-none rounded-[3px] ${GROUP_META[group].swatch}`} />;
}

/** Nhãn vai trò người làm; `null` = dòng hệ thống (thanh toán, đăng nhập sai nhiều lần). */
export function roleLabelOf(role: Role | null): string {
  return role ? ROLE_LABEL[role] : ROLE_LABEL.SYSTEM;
}

/** Email người làm + vai trò, hoặc "Hệ thống". */
export function ActorCell({ item }: { item: Pick<AuditActivityItem, "actorEmail" | "actorRole" | "actorId"> }) {
  if (!item.actorId) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-text-muted">
        <Icon name="settings-2" size={14} className="flex-none" />
        Hệ thống
      </span>
    );
  }
  return (
    <span className="grid min-w-0">
      <span className="truncate font-semibold text-text-strong" title={item.actorEmail ?? undefined}>
        {item.actorEmail ?? "Tài khoản đã xoá"}
      </span>
      <span className="text-[13px] text-text-muted">{roleLabelOf(item.actorRole)}</span>
    </span>
  );
}

/** Nhãn nhỏ dạng ô nền xám cho các bộ lọc / thẻ phụ (chữ 13px). */
export function MetaPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium ${
        tone === "danger" ? "bg-red-50 text-red-700" : "bg-surface-hover text-text-body"
      }`}
    >
      {children}
    </span>
  );
}
