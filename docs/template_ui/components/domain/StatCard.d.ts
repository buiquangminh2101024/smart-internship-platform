export interface StatCardProps {
  label: string;
  value: string | number;
  /** Trailing unit, e.g. "hồ sơ", "ngày". */
  unit?: string;
  /** Lucide icon name in the 28px tile. */
  icon?: string;
  /** Change text, e.g. "+8 tuần này". */
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
  /** Neutral context after the delta, e.g. "so với tuần trước". */
  hint?: string;
  style?: React.CSSProperties;
}

export declare function StatCard(props: StatCardProps): JSX.Element;
