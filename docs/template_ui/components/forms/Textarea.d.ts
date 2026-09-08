export interface TextareaProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  rows?: number;
  /** Shows a live counter under the field. */
  maxLength?: number;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  style?: React.CSSProperties;
}

export declare function Textarea(props: TextareaProps): JSX.Element;
