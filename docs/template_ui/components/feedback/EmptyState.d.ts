export interface EmptyStateProps {
  /** Lucide icon name in the 44px circle. */
  icon?: string;
  title: string;
  description?: string;
  /** Usually a single <Button>. */
  action?: React.ReactNode;
  tone?: "default" | "brand";
  /** Tighter padding for use inside a panel or column. */
  compact?: boolean;
  style?: React.CSSProperties;
}

export declare function EmptyState(props: EmptyStateProps): JSX.Element;
