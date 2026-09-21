import type { MatchConfidence, MatchExperienceEvidence, MatchResult, MatchSkillEvidence } from "@sip/shared-types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

// Thẻ giải thích mức phù hợp — dùng chung cho Candidate (trang tin) và Employer
// (chi tiết đơn). Xem docs/05-frontend/phases/job-matcher-phase1/PLAN.md.

export type JobMatchAudience = "candidate" | "employer";

const CONFIDENCE_LABELS: Record<MatchConfidence, string> = {
  HIGH: "Cao",
  MEDIUM: "Trung bình",
  LOW: "Thấp",
};

function formatYears(years: number): string {
  return (Math.round(years * 10) / 10).toLocaleString("vi-VN");
}

function barTone(score: number): string {
  if (score >= 70) return "bg-success-600";
  if (score >= 40) return "bg-marigold-500";
  return "bg-text-muted";
}

export function JobMatchCard({ result, audience }: { result: MatchResult; audience: JobMatchAudience }) {
  const title = audience === "candidate" ? "Mức độ phù hợp với hồ sơ của bạn" : "Mức độ phù hợp với tin";

  return (
    <Card padding="lg" className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-base font-semibold text-text-strong">{title}</h2>
        {audience === "employer" ? (
          <p className="text-xs text-text-muted">Theo hồ sơ hiện tại của ứng viên</p>
        ) : null}
      </div>

      {result.status === "INSUFFICIENT_PROFILE" ? (
        audience === "candidate" ? (
          <div className="grid gap-3 rounded-lg bg-surface-page p-3 text-sm text-text-body">
            <p>Hãy thêm kỹ năng vào hồ sơ để xem mức phù hợp với tin này.</p>
            <Button as="a" href="/profile" size="sm" variant="secondary" className="w-fit">
              Cập nhật hồ sơ
            </Button>
          </div>
        ) : (
          <p className="text-sm text-text-muted">Ứng viên chưa khai kỹ năng nào nên chưa tính được mức phù hợp.</p>
        )
      ) : result.status === "INSUFFICIENT_JOB_DATA" ? (
        <p className="text-sm text-text-muted">Tin này chưa đủ thông tin để đánh giá mức phù hợp.</p>
      ) : (
        <ScoredBody result={result} audience={audience} />
      )}

      <p className="text-xs text-text-muted">Điểm chỉ mang tính tham khảo, không phải quyết định tuyển dụng.</p>
    </Card>
  );
}

function ScoredBody({ result, audience }: { result: MatchResult; audience: JobMatchAudience }) {
  const score = result.score ?? 0;
  const required = result.skills.filter((skill) => skill.importance === "REQUIRED");
  const preferred = result.skills.filter((skill) => skill.importance === "PREFERRED");

  return (
    <>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-3xl font-bold text-text-strong">{score}%</span>
          <span className="text-sm text-text-muted">Độ tin cậy: {CONFIDENCE_LABELS[result.confidence]}</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-surface-page"
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Mức độ phù hợp"
        >
          <div className={`h-full rounded-full ${barTone(score)}`} style={{ width: `${score}%` }} />
        </div>
      </div>

      {required.length > 0 ? <SkillGroup title="Kỹ năng bắt buộc" skills={required} audience={audience} /> : null}
      {preferred.length > 0 ? <SkillGroup title="Kỹ năng ưu tiên" skills={preferred} audience={audience} /> : null}

      <ExperienceLine experience={result.experience} />

      {audience === "candidate" && result.confidence === "LOW" ? (
        <p className="text-sm text-text-muted">
          Hồ sơ của bạn còn thiếu thông tin nên điểm có độ tin cậy thấp.{" "}
          <a href="/profile" className="text-brand-700 underline">
            Hoàn thiện hồ sơ
          </a>
        </p>
      ) : null}
    </>
  );
}

function SkillGroup({
  title,
  skills,
  audience,
}: {
  title: string;
  skills: MatchSkillEvidence[];
  audience: JobMatchAudience;
}) {
  const matched = skills.filter((skill) => skill.status === "MATCHED").length;
  return (
    <div className="grid gap-1.5">
      <h3 className="text-sm font-medium text-text-strong">
        {title} ({matched}/{skills.length})
      </h3>
      <ul className="grid gap-1 text-sm">
        {skills.map((skill) => (
          <li key={skill.skillId} className="flex flex-wrap items-center gap-2">
            {skill.status === "MATCHED" ? (
              <Icon name="check" size={16} className="text-success-600" title="Có" />
            ) : (
              <Icon name="x" size={16} className="text-red-600" title="Thiếu" />
            )}
            <span className={skill.status === "MATCHED" ? "text-text-body" : "text-text-muted"}>{skill.name}</span>
            {/* candidateYears null = chưa khai — không ghi "0 năm". */}
            {skill.candidateYears !== null ? (
              <span className="text-text-muted">({formatYears(skill.candidateYears)} năm)</span>
            ) : null}
            {skill.status === "MISSING" && audience === "candidate" ? (
              <a href="/profile" className="text-xs text-brand-700 underline">
                Thêm vào hồ sơ
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExperienceLine({ experience }: { experience: MatchExperienceEvidence }) {
  if (experience.status === "NOT_REQUIRED") {
    return <p className="text-sm text-text-muted">Tin không yêu cầu kinh nghiệm.</p>;
  }
  if (experience.status === "UNKNOWN") {
    return (
      <p className="text-sm text-text-muted">
        Tin yêu cầu {formatYears(experience.requiredYears ?? 0)} năm kinh nghiệm — chưa có thông tin kinh nghiệm làm việc.
      </p>
    );
  }
  const icon =
    experience.status === "MATCH"
      ? { name: "check", className: "text-success-600" }
      : experience.status === "PARTIAL"
        ? { name: "minus", className: "text-marigold-700" }
        : { name: "x", className: "text-red-600" };
  return (
    <p className="flex items-start gap-2 text-sm text-text-body">
      <Icon name={icon.name} size={16} className={`mt-0.5 shrink-0 ${icon.className}`} />
      <span>
        Tổng thời gian làm việc: {formatYears(experience.candidateYears ?? 0)} năm (chưa xét mức liên quan) — tin
        yêu cầu {formatYears(experience.requiredYears ?? 0)} năm.
      </span>
    </p>
  );
}

export function JobMatchCardSkeleton() {
  return (
    <Card padding="lg" className="grid gap-3" aria-busy="true">
      <div className="h-4 w-2/3 animate-pulse rounded bg-surface-page" />
      <div className="h-8 w-20 animate-pulse rounded bg-surface-page" />
      <div className="h-2 w-full animate-pulse rounded-full bg-surface-page" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-surface-page" />
    </Card>
  );
}
