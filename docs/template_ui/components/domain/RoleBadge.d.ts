export interface RoleBadgeProps {
  role?: "candidate" | "employer" | "admin";
  label?: string;
  variant?: "soft" | "solid";
  showIcon?: boolean;
  style?: React.CSSProperties;
}

export declare function RoleBadge(props: RoleBadgeProps): JSX.Element;
/** { role: {label, icon, fg, bg, solid} } — role colours and Vietnamese labels. */
export declare const roleVocabulary: Record<string, { label: string; icon: string; fg: string; bg: string; solid: string }>;
