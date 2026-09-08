/**
 * Internship posting summary — search results, saved jobs, employer job manager.
 * @startingPoint section="Domain" subtitle="Job posting card, role badges and stat tiles" viewport="700x330"
 */
export interface JobCardProps {
  title: string;
  company: string;
  /** Company logo URL; falls back to initials. */
  logo?: string;
  location?: string;
  /** Pre-formatted salary string, e.g. "4 – 6 triệu / tháng". */
  salary?: string;
  /** Pre-formatted deadline, e.g. "Còn 12 ngày". */
  deadline?: string;
  /** Short attribute chips: work type, skills, level. Keep to 4 or fewer. */
  tags?: string[];
  /** Show the lifecycle pill — employer and admin views only. */
  status?: "draft" | "review" | "published" | "closed" | "expired" | "takendown";
  verified?: boolean;
  isNew?: boolean;
  saved?: boolean;
  selected?: boolean;
  /** Omit to hide the bookmark button (employer/admin contexts). */
  onSave?: () => void;
  onClick?: () => void;
  /** Extra row under the card body — action buttons, match reasons. */
  footer?: React.ReactNode;
  style?: React.CSSProperties;
}

export declare function JobCard(props: JobCardProps): JSX.Element;
