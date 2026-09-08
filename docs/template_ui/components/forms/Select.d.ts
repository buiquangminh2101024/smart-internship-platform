export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Plain strings or {value,label} pairs. */
  options?: (string | SelectOption)[];
  value?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  style?: React.CSSProperties;
}

export declare function Select(props: SelectProps): JSX.Element;
