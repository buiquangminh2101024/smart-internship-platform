export interface PaginationProps {
  page?: number;
  total?: number;
  onChange?: (page: number) => void;
  /** Left-aligned result count, e.g. "1–20 trong 248 tin". */
  summary?: string;
  style?: React.CSSProperties;
}

export declare function Pagination(props: PaginationProps): JSX.Element;
