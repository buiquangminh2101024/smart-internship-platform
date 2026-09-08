export interface CheckboxProps {
  label?: React.ReactNode;
  /** Second line under the label, for consent and filter explanations. */
  description?: string;
  checked?: boolean;
  /** Partial state for "select all" headers. */
  indeterminate?: boolean;
  disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  style?: React.CSSProperties;
}

export declare function Checkbox(props: CheckboxProps): JSX.Element;
