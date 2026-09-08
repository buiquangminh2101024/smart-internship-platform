/**
 * Single-line text field with the shared label / hint / error shell.
 * @startingPoint section="Forms" subtitle="Text, select, checkbox and switch controls" viewport="700x320"
 */
export interface InputProps {
  label?: string;
  /** Helper text below the field. Hidden while `error` is set. */
  hint?: string;
  error?: string;
  required?: boolean;
  /** Lucide icon inside the leading edge (search, mail, map-pin). */
  icon?: string;
  iconAfter?: string;
  size?: "sm" | "md" | "lg";
  type?: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  style?: React.CSSProperties;
}

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function Input(props: InputProps): JSX.Element;
export declare function Field(props: FieldProps): JSX.Element;
