import type { AdminUserSuspension, Role, UserStatus } from "@sip/shared-types";
import { formatVnDate, formatVnTime } from "@/lib/dashboard-format";

/** Nhãn trạng thái tài khoản — dùng chung cho danh sách và trang chi tiết người dùng. */
export const USER_STATUS_META: Record<UserStatus, { label: string; tone: "success" | "warning" | "danger" }> = {
  ACTIVE: { label: "Hoạt động", tone: "success" },
  PENDING_VERIFICATION: { label: "Chờ xác thực", tone: "warning" },
  SUSPENDED: { label: "Đã khoá", tone: "danger" },
};

/** `Role` của API → khoá của `RoleBadge`. */
export const ROLE_BADGE_KEY: Record<Role, "candidate" | "employer" | "admin"> = {
  CANDIDATE: "candidate",
  EMPLOYER: "employer",
  ADMIN: "admin",
};

/** "Lý do: … · Khoá bởi … · lúc …" — cùng kiểu khung lý do ở "Hoạt động gần đây". */
export function SuspensionNote({ suspension }: { suspension: AdminUserSuspension | null }) {
  if (!suspension) {
    return (
      <p className="rounded-r-md border-l-[3px] border-red-600 bg-red-50 px-2.5 py-1.5 text-[13px] text-text-body">
        Không có thông tin lần khoá (tài khoản bị khoá trước khi có nhật ký thao tác).
      </p>
    );
  }
  return (
    <p className="rounded-r-md border-l-[3px] border-red-600 bg-red-50 px-2.5 py-1.5 text-[13px] text-text-body">
      <span className="font-medium text-text-strong">Lý do:</span> {suspension.reason ?? "không ghi lý do"}
      <span className="text-text-muted">
        {" "}
        · Khoá bởi {suspension.byEmail ?? "quản trị viên không còn tồn tại"} · lúc{" "}
        <time dateTime={suspension.at} className="font-num tabular-nums">
          {formatVnTime(suspension.at)} {formatVnDate(suspension.at)}
        </time>
      </span>
    </p>
  );
}
