import * as icons from "lucide-react";
import type { LucideProps } from "lucide-react";

export interface IconProps {
  /** Tên icon Lucide dạng kebab-case, vd. "search", "briefcase", "map-pin". */
  name: string;
  /** Kích thước render (px). */
  size?: number;
  strokeWidth?: number;
  /** Nhãn accessible. Bỏ trống nếu icon chỉ mang tính trang trí. */
  title?: string;
  className?: string;
}

function toPascalCase(kebabName: string): string {
  return kebabName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function Icon({ name, size = 18, strokeWidth = 1.75, title, className }: IconProps) {
  const componentName = toPascalCase(name);
  const LucideIcon = (icons as unknown as Record<string, React.ComponentType<LucideProps>>)[componentName];

  if (!LucideIcon) {
    return null;
  }

  return (
    <LucideIcon
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
    />
  );
}
