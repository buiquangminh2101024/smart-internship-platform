export interface BadgeProps {
  tone?: "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";
  variant?: "soft" | "outline";
  /** Lucide icon name shown at 13px before the label. */
  icon?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function Badge(props: BadgeProps): JSX.Element;
