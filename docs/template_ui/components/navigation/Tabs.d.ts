export interface TabItem {
  value: string;
  label: string;
  /** Lucide icon name. */
  icon?: string;
  /** Trailing count chip — application counts, pipeline stages. */
  count?: number;
}

export interface TabsProps {
  items: (string | TabItem)[];
  value?: string;
  onChange?: (value: string) => void;
  size?: "sm" | "md";
  style?: React.CSSProperties;
}

export declare function Tabs(props: TabsProps): JSX.Element;
