import type { MatchResult, MatchSkillEvidence } from "@sip/shared-types";
import { Icon } from "@/components/ui/Icon";

// Lý do xếp hạng theo từng tiêu chí, gọn cho thẻ tin (AD-26 D4) —
// docs/05-frontend/phases/job-discovery/PLAN.md bước F1. Đọc thẳng `MatchResult`, không tính lại.
// Bản đầy đủ (từng kỹ năng, số năm) là JobMatchCard ở trang chi tiết tin; câu chữ hai bên khớp nhau.

type Level = "good" | "partial" | "bad" | "info";

const LEVEL_ICON: Record<Level, { name: string; className: string; title: string }> = {
  good: { name: "check", className: "text-success-600", title: "Đạt" },
  partial: { name: "minus", className: "text-marigold-700", title: "Đạt một phần" },
  bad: { name: "x", className: "text-red-600", title: "Chưa đạt" },
  info: { name: "circle-help", className: "text-text-subtle", title: "Chưa đủ thông tin" },
};

/**
 * Ngưỡng chia mức tương đồng nội dung (trên `semantic.normalized`, 0..1). Số do thiết kế
 * hiển thị chọn, không phải ngưỡng của bộ chấm.
 */
const SEMANTIC_HIGH = 0.7;
const SEMANTIC_MEDIUM = 0.4;

const MISSING_PREVIEW = 3;

interface Reason {
  key: string;
  level: Level;
  text: string;
}

function formatYears(years: number): string {
  return (Math.round(years * 10) / 10).toLocaleString("vi-VN");
}

function applicable(result: MatchResult, key: MatchResult["components"][number]["key"]): boolean {
  return result.components.some((component) => component.key === key && component.applicable);
}

function skillReason(key: string, title: string, skills: MatchSkillEvidence[]): Reason | null {
  if (skills.length === 0) return null;
  const matched = skills.filter((skill) => skill.status === "MATCHED").length;
  const level: Level = matched === skills.length ? "good" : matched === 0 ? "bad" : "partial";
  return { key, level, text: `${title} ${matched}/${skills.length}` };
}

export function buildMatchReasons(result: MatchResult): Reason[] {
  const reasons: Array<Reason | null> = [];

  if (applicable(result, "requiredSkills")) {
    reasons.push(skillReason("required", "Kỹ năng bắt buộc", result.skills.filter((skill) => skill.importance === "REQUIRED")));
  }
  if (applicable(result, "preferredSkills")) {
    reasons.push(skillReason("preferred", "Kỹ năng ưu tiên", result.skills.filter((skill) => skill.importance === "PREFERRED")));
  }

  const experience = result.experience;
  if (experience.status === "MATCH") reasons.push({ key: "experience", level: "good", text: "Kinh nghiệm đạt yêu cầu" });
  else if (experience.status === "PARTIAL") reasons.push({ key: "experience", level: "partial", text: "Kinh nghiệm gần đạt" });
  else if (experience.status === "BELOW") reasons.push({ key: "experience", level: "bad", text: "Kinh nghiệm chưa đạt" });
  else if (experience.status === "UNKNOWN") {
    // Tin yêu cầu kinh nghiệm mà hồ sơ chưa có — cùng nghĩa với "Nên làm trước: thêm kinh nghiệm".
    reasons.push({
      key: "experience",
      level: "info",
      text: `Tin yêu cầu ${formatYears(experience.requiredYears ?? 0)} năm kinh nghiệm, hồ sơ chưa có`,
    });
  }

  const education = result.education;
  if (education.status === "PRIMARY") reasons.push({ key: "education", level: "good", text: "Đúng ngành" });
  else if (education.status === "RELATED") reasons.push({ key: "education", level: "partial", text: "Ngành liên quan" });
  else if (education.status === "NONE") reasons.push({ key: "education", level: "bad", text: "Khác ngành tin yêu cầu" });
  else if (education.status === "UNKNOWN") {
    reasons.push({ key: "education", level: "info", text: "Tin ghi ngành học, hồ sơ chưa chọn ngành" });
  }

  const normalized = result.semantic.available ? result.semantic.normalized : null;
  if (normalized !== null && applicable(result, "semantic")) {
    const level: Level = normalized >= SEMANTIC_HIGH ? "good" : normalized >= SEMANTIC_MEDIUM ? "partial" : "bad";
    const word = level === "good" ? "cao" : level === "partial" ? "vừa" : "thấp";
    reasons.push({ key: "semantic", level, text: `Nội dung hồ sơ tương đồng ${word}` });
  }

  return reasons.filter((reason): reason is Reason => reason !== null);
}

/** Tối đa 3 kỹ năng còn thiếu, bắt buộc trước. */
export function missingSkillsText(result: MatchResult): string | null {
  const missing = result.skills
    .filter((skill) => skill.status === "MISSING")
    .sort((left, right) => Number(right.importance === "REQUIRED") - Number(left.importance === "REQUIRED"));
  if (missing.length === 0) return null;
  const shown = missing.slice(0, MISSING_PREVIEW).map((skill) => skill.name).join(", ");
  const rest = missing.length - MISSING_PREVIEW;
  return rest > 0 ? `${shown} và ${rest} kỹ năng khác` : shown;
}

export function MatchReasons({ result }: { result: MatchResult }) {
  if (result.status !== "SCORED") return null;
  const reasons = buildMatchReasons(result);
  const missing = missingSkillsText(result);
  if (reasons.length === 0 && !missing) return null;

  return (
    <div className="grid gap-1.5">
      {reasons.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-text-body" aria-label="Lý do mức phù hợp">
          {reasons.map((reason) => {
            const icon = LEVEL_ICON[reason.level];
            return (
              <li key={reason.key} className="inline-flex items-center gap-1">
                <Icon name={icon.name} size={14} className={`shrink-0 ${icon.className}`} title={icon.title} />
                <span>{reason.text}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {missing ? (
        <p className="text-[13px] text-text-muted">
          <span className="font-medium text-text-body">Còn thiếu:</span> {missing}
        </p>
      ) : null}
    </div>
  );
}
