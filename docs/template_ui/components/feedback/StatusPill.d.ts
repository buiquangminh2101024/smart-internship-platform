/**
 * Job-post lifecycle state, shared vocabulary across candidate, employer and admin views.
 * @startingPoint section="Feedback" subtitle="Lifecycle pills, empty states and toasts" viewport="700x300"
 */
export interface StatusPillProps {
  /** draft → review → published → closed | expired | takendown */
  status?: "draft" | "review" | "published" | "closed" | "expired" | "takendown";
  /** Override the Vietnamese default label (e.g. for the candidate-facing wording). */
  label?: string;
  size?: "sm" | "md";
  showIcon?: boolean;
  style?: React.CSSProperties;
}

export declare function StatusPill(props: StatusPillProps): JSX.Element;
/** { status: {label, icon, fg, bg} } — the canonical labels, for tables and filters. */
export declare const statusVocabulary: Record<string, { label: string; icon: string; fg: string; bg: string }>;
