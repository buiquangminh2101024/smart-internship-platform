export interface AvatarProps {
  /** Full name; drives the initials fallback and the title attribute. */
  name?: string;
  src?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Defaults to circle for people, square for employers. */
  shape?: "circle" | "square";
  /** Adds the role-coloured ring. */
  role?: "candidate" | "employer" | "admin";
  style?: React.CSSProperties;
}

export declare function Avatar(props: AvatarProps): JSX.Element;
