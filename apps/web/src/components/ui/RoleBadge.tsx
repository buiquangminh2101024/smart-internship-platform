import { Icon } from "./Icon";

type RoleKey = "candidate" | "employer" | "admin";

// Ngoại lệ có chủ đích của AD-7: component này dùng trực tiếp cả 3 bảng màu
// thay vì alias `brand-*`, vì nhiệm vụ của nó là phân biệt 3 actor — dùng alias
// sẽ khiến mọi badge cùng màu với khu vực đang đứng và mất hết ý nghĩa.
const roleVocabulary: Record<RoleKey, { label: string; icon: string; className: string }> = {
  candidate: { label: "Sinh viên", icon: "user", className: "bg-pine-100 text-pine-800" },
  employer: { label: "Doanh nghiệp", icon: "building-2", className: "bg-indigo-100 text-indigo-800" },
  admin: { label: "Quản trị", icon: "shield-check", className: "bg-plum-100 text-plum-800" },
};

export interface RoleBadgeProps {
  role: RoleKey;
  label?: string;
  className?: string;
}

export function RoleBadge({ role, label, className = "" }: RoleBadgeProps) {
  const meta = roleVocabulary[role];
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
        meta.className,
        className,
      ].join(" ")}
    >
      <Icon name={meta.icon} size={14} />
      {label ?? meta.label}
    </span>
  );
}
