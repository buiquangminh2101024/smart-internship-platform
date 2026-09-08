/**
 * Primary action control.
 * @startingPoint section="Core" subtitle="Button variants, sizes and states" viewport="700x260"
 */
export interface ButtonProps {
  /** primary = the one committing action in a view. accent = marketing CTA only. */
  variant?: "primary" | "secondary" | "ghost" | "accent" | "danger" | "link";
  size?: "sm" | "md" | "lg";
  /** Lucide icon name rendered before the label. */
  icon?: string;
  /** Lucide icon name rendered after the label (chevrons, external-link). */
  iconAfter?: string;
  fullWidth?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Render as an anchor for navigation actions. */
  as?: "button" | "a";
  href?: string;
  type?: "button" | "submit" | "reset";
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function Button(props: ButtonProps): JSX.Element;
