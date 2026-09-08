export interface ToastProps {
  tone?: "success" | "info" | "warning" | "danger";
  title: string;
  description?: string;
  /** Optional single follow-up action ("Hoàn tác", "Xem tin"). */
  action?: React.ReactNode;
  onDismiss?: () => void;
  /** Render as a full-width inline notice (no shadow) instead of a floating toast. */
  inline?: boolean;
  style?: React.CSSProperties;
}

export declare function Toast(props: ToastProps): JSX.Element;
