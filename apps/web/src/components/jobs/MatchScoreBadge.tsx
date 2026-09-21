import type { MatchStatus } from "@sip/shared-types";
import { Badge } from "@/components/ui/Badge";

/** Badge % mức phù hợp: xanh ≥70, vàng 40–69, xám <40, "—" khi không chấm được. */
export function MatchScoreBadge({ score, status }: { score: number | null | undefined; status?: MatchStatus | undefined }) {
  if (status !== "SCORED" || score == null) {
    return <span className="text-text-muted">—</span>;
  }
  const tone = score >= 70 ? "success" : score >= 40 ? "warning" : "neutral";
  return <Badge tone={tone}>{score}%</Badge>;
}
