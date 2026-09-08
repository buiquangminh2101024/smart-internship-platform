export interface IconProps {
  /** Lucide icon name in kebab-case, e.g. "search", "briefcase", "map-pin". */
  name: string;
  /** Rendered box in px. 16 inline with text, 18 in controls, 20+ standalone. */
  size?: number;
  strokeWidth?: number;
  /** Accessible label. Omit for purely decorative icons (default: aria-hidden). */
  title?: string;
  style?: React.CSSProperties;
}

export declare function Icon(props: IconProps): JSX.Element;
