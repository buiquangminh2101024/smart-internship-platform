"use client";

import { Fragment, type ReactNode } from "react";
import type { CvExtractionResult } from "@sip/shared-types";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

// Preview CHỈ ĐỌC kết quả AI đọc CV (docs/05-frontend/phases/cv-ai-extraction-phase1/PLAN.md
// Quyết định #4/#6). Sửa/lưu vào hồ sơ thuộc Phase 2.

const GENDER_LABELS: Record<NonNullable<CvExtractionResult["candidate"]["gender"]>, string> = {
  MALE: "Nam",
  FEMALE: "Nữ",
  OTHER: "Khác",
};

/** Model trả "YYYY", "YYYY-MM" hoặc "YYYY-MM-DD" — hiển thị theo kiểu Việt Nam. */
function formatPartialDate(value: string | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.split("-");
  if (day && month) return `${day}/${month}/${year}`;
  if (month) return `${month}/${year}`;
  return value;
}

function formatPeriod(start: string | number | null, end: string | number | null, ongoing: boolean): string | null {
  const from = typeof start === "number" ? String(start) : formatPartialDate(start);
  const to = ongoing ? "Hiện tại" : typeof end === "number" ? String(end) : formatPartialDate(end);
  if (!from && !to) return null;
  return `${from ?? "?"} – ${to ?? "?"}`;
}

// ─── Building blocks ───────────────────────────────────────────────────────

function Section({ icon, title, count, children }: { icon: string; title: string; count?: number; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-text-strong">
        <Icon name={icon} size={16} className="text-pine-700" />
        {title}
        {count !== undefined ? <span className="font-normal text-text-muted">({count})</span> : null}
      </h4>
      {children}
    </section>
  );
}

function EmptyNote() {
  return <p className="text-sm text-text-muted">Không tìm thấy trong CV.</p>;
}

function Item({ title, subtitle, meta, description }: { title: string; subtitle?: string | null; meta?: string | null; description?: string | null }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-sm font-medium text-text-strong">{title}</span>
        {meta ? <span className="text-xs text-text-muted">{meta}</span> : null}
      </div>
      {subtitle ? <p className="text-sm text-text-body">{subtitle}</p> : null}
      {description ? <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-text-muted">{description}</p> : null}
    </div>
  );
}

function ItemList<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  if (items.length === 0) return <EmptyNote />;
  // Key theo vị trí: danh sách chỉ đọc, không sắp xếp lại, và model có thể trả
  // 2 mục trùng hết mọi field.
  return (
    <div className="grid gap-2">
      {items.map((item, index) => (
        <Fragment key={index}>{render(item)}</Fragment>
      ))}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export interface CvExtractionPreviewProps {
  data: CvExtractionResult;
  extractedAt: string | null;
}

export function CvExtractionPreview({ data, extractedAt }: CvExtractionPreviewProps) {
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text-strong">
        <Icon name="sparkles" size={16} className="text-pine-700" />
        Kết quả phân tích CV
      </h3>
      {extractedAt ? (
        <span className="text-xs text-text-muted">
          Phân tích lúc {new Date(extractedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })}
        </span>
      ) : null}
    </div>
  );

  // Không phải CV → chỉ hiện lý do, không hiện các khối rỗng bên dưới để khỏi
  // hiểu nhầm là "đọc được nhưng trống" (Phần 2 của PLAN).
  if (!data.isValidCv) {
    return (
      <div className="grid gap-3">
        {header}
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Tệp này không giống một CV</p>
            {data.invalidReason ? <p className="mt-0.5">{data.invalidReason}</p> : null}
          </div>
        </div>
      </div>
    );
  }

  const lowConfidenceBanner =
    data.extractionConfidence === "low" ? (
      <div className="flex items-start gap-2 rounded-lg border border-marigold-300 bg-marigold-100 px-3 py-2.5 text-sm text-marigold-700">
        <Icon name="triangle-alert" size={16} className="mt-0.5 shrink-0" />
        <p>Kết quả có thể không đầy đủ, vui lòng kiểm tra kỹ.</p>
      </div>
    ) : null;

  // Fallback OCR offline: không có dữ liệu cấu trúc, chỉ có text thô (Quyết định #6).
  if (data.rawOcrText) {
    return (
      <div className="grid gap-3">
        {header}
        {lowConfidenceBanner}
        <Section icon="scan-text" title="Văn bản đọc được từ ảnh">
          <p className="text-xs text-text-muted">
            Không đọc được bằng AI, đây là văn bản thô — vui lòng tự nhập lại các mục cần thiết.
          </p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-surface-card p-3 font-sans text-xs leading-relaxed text-text-body">
            {data.rawOcrText}
          </pre>
        </Section>
      </div>
    );
  }

  const { candidate } = data;
  const personalFields: Array<[string, string | null]> = [
    ["Họ tên", candidate.fullName],
    ["Chức danh", candidate.headline],
    ["Số điện thoại", candidate.phone],
    ["Ngày sinh", formatPartialDate(candidate.dateOfBirth)],
    ["Giới tính", candidate.gender ? GENDER_LABELS[candidate.gender] : null],
  ];
  const filledPersonal = personalFields.filter((field): field is [string, string] => Boolean(field[1]));

  return (
    <div className="grid gap-5">
      {header}
      {lowConfidenceBanner}

      <Section icon="user" title="Thông tin cá nhân">
        {filledPersonal.length === 0 && !candidate.bio ? (
          <EmptyNote />
        ) : (
          <div className="grid gap-2 rounded-lg border border-border-subtle bg-surface-card px-3 py-2.5">
            {filledPersonal.length > 0 ? (
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
                {filledPersonal.map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-text-muted">{label}</dt>
                    <dd className="text-text-strong">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {candidate.bio ? <p className="whitespace-pre-line text-xs leading-relaxed text-text-body">{candidate.bio}</p> : null}
          </div>
        )}
      </Section>

      <Section icon="graduation-cap" title="Học vấn" count={data.educations.length}>
        <ItemList
          items={data.educations}
          render={(edu) => (
            <Item
              title={edu.universityName ?? "(Chưa rõ trường)"}
              subtitle={[edu.majorName, edu.degree].filter(Boolean).join(" · ") || null}
              meta={formatPeriod(edu.startYear, edu.endYear, edu.isCurrent)}
              description={edu.description}
            />
          )}
        />
      </Section>

      <Section icon="briefcase" title="Kinh nghiệm làm việc" count={data.workExperiences.length}>
        <ItemList
          items={data.workExperiences}
          render={(work) => (
            <Item
              title={work.position || "(Chưa rõ vị trí)"}
              subtitle={work.company || null}
              meta={formatPeriod(work.startDate, work.endDate, work.isCurrent)}
              description={work.description}
            />
          )}
        />
      </Section>

      <Section icon="folder-kanban" title="Dự án" count={data.projects.length}>
        <ItemList
          items={data.projects}
          render={(project) => (
            <Item
              title={project.name}
              subtitle={project.url}
              meta={formatPeriod(project.startDate, project.endDate, project.isWorkingOn)}
              description={project.description}
            />
          )}
        />
      </Section>

      <Section icon="badge-check" title="Chứng chỉ" count={data.certificates.length}>
        <ItemList
          items={data.certificates}
          render={(cert) => (
            <Item
              title={cert.name}
              subtitle={cert.issuer}
              meta={formatPartialDate(cert.issueDate)}
              description={cert.description}
            />
          )}
        />
      </Section>

      <Section icon="award" title="Giải thưởng" count={data.awards.length}>
        <ItemList
          items={data.awards}
          render={(award) => (
            <Item
              title={award.name}
              subtitle={award.issuer}
              meta={formatPartialDate(award.date)}
              description={award.description}
            />
          )}
        />
      </Section>

      <Section icon="wrench" title="Kỹ năng" count={data.skills.length}>
        {data.skills.length === 0 ? (
          <EmptyNote />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {data.skills.map((skill) => (
              <Badge key={skill} tone="brand">
                {skill}
              </Badge>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
