export interface SideNavItem {
  value?: string;
  label?: string;
  /** Lucide icon name. */
  icon?: string;
  count?: number;
  /** Renders an uppercase group heading instead of a link. */
  section?: string;
}

export interface SideNavProps {
  /** Tints the active item and the 3px rail edge — the primary role cue in the app shell. */
  role?: "candidate" | "employer" | "admin";
  items: SideNavItem[];
  value?: string;
  onChange?: (value: string) => void;
  /** Logo lockup or workspace switcher. */
  header?: React.ReactNode;
  /** Pinned to the bottom: account, help, sign out. */
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function SideNav(props: SideNavProps): JSX.Element;
