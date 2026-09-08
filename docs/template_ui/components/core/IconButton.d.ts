export interface IconButtonProps {
  /** Lucide icon name. */
  icon: string;
  /** Required accessible label; also used as the tooltip. */
  label: string;
  variant?: "ghost" | "outline" | "solid";
  size?: "sm" | "md" | "lg";
  /** Toggled/selected state (e.g. a saved job). */
  active?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

export declare function IconButton(props: IconButtonProps): JSX.Element;
