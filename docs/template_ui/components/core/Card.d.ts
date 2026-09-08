export interface CardProps {
  padding?: "none" | "sm" | "md" | "lg";
  /** Adds pointer cursor + hover elevation. Use for whole-card links (job rows). */
  interactive?: boolean;
  /** Pine ring for the currently-open item in a list/detail layout. */
  selected?: boolean;
  tone?: "default" | "brand" | "sunken" | "warning";
  as?: "div" | "article" | "li" | "a" | "section";
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function Card(props: CardProps): JSX.Element;
