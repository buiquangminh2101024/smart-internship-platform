"use client";

import { use, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { JobPost } from "@sip/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAdminJobPost } from "@/hooks/useJobPosts";
import { JOB_STATUS_LABEL, formatDate } from "@/lib/job-post-display";
import { JobPostContent, JobPostCompanyCard, JobPostHeaderCard } from "@/components/jobs/JobPostContent";
import { JobPostStepper } from "@/components/jobs/JobPostStepper";
import { RejectJobModal } from "@/components/jobs/RejectJobModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

const REVIEW_STEPS = ["Tạo tin", "Gửi duyệt", "Admin kiểm tra", "Đã duyệt", "Công khai"];
const REJECT_STEPS = ["Tạo tin", "Gửi duyệt", "Admin kiểm tra", "Từ chối"];

type Outcome = { kind: "approved" | "rejected" | "retracted"; job: JobPost };

/** Trang kết quả sau khi Admin xử lý — ảnh mẫu `134326.png` (panel 3) và `134745.png` (panel 2). */
function ModerationResult({ outcome }: { outcome: Outcome }) {
  const rejected = outcome.kind !== "approved";
  const reason = outcome.job.latestModerationAction?.reason;

  return (
    <Card padding="lg" className="grid justify-items-center gap-6 text-center">
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full ${rejected ? "bg-red-100 text-red-600" : "bg-success-100 text-success-600"}`}
      >
        <Icon name={rejected ? "x" : "check"} size={28} />
      </span>

      <h1 className={`text-2xl font-semibold ${rejected ? "text-red-700" : "text-text-strong"}`}>
        {outcome.kind === "approved"
          ? "Đã duyệt tin tuyển dụng thành công"
          : outcome.kind === "rejected"
            ? "Đã từ chối tin tuyển dụng"
            : "Đã thu hồi tin tuyển dụng"}
      </h1>
      <p className="-mt-4 text-sm text-text-muted">Thao tác đã được ghi nhận trên hệ thống.</p>

      <Card padding="md" tone="sunken" className="grid w-full justify-items-center gap-2">
        <span className="text-lg font-semibold text-text-strong">{outcome.job.title}</span>
        <span className="text-sm text-text-muted">{outcome.job.company.name}</span>
        <Badge tone={JOB_STATUS_LABEL[outcome.job.status].tone}>{JOB_STATUS_LABEL[outcome.job.status].label}</Badge>
      </Card>

      {rejected && reason ? (
        <div className="grid w-full gap-1 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-red-700">
            <Icon name="circle-alert" size={15} />
            Lý do
          </span>
          <p className="text-sm text-red-600">{reason}</p>
        </div>
      ) : null}

      <div className="w-full">
        <JobPostStepper
          steps={outcome.kind === "rejected" ? REJECT_STEPS : REVIEW_STEPS}
          current={outcome.kind === "rejected" ? 3 : 4}
          failed={rejected}
        />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button as="a" href="/admin/jobs" icon="arrow-left">
          Quay lại danh sách chờ duyệt
        </Button>
        {outcome.kind === "approved" ? (
          <Button as="a" href={`/jobs/${outcome.job.id}`} variant="secondary" icon="external-link">
            Xem tin trên web
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** Ngưỡng độ dài "có nội dung thật" — chỉ để nhắc Admin, không chặn duyệt. */
const MIN_DESCRIPTION_LENGTH = 150;
const MIN_REQUIREMENTS_LENGTH = 50;

const MANUAL_CHECKS = ["Mô tả công việc cụ thể, không chung chung?", "Yêu cầu ứng viên rõ ràng, đo lường được?"];

/**
 * Checklist khi duyệt (docs/05-frontend/phases/job-matcher-phase3/PLAN.md Quyết
 * định #6): auto-check tính từ dữ liệu tin đã tải, checklist thủ công chỉ là
 * state cục bộ để nhắc Admin — không gửi server, không ràng buộc nút Duyệt/Từ chối.
 */
function ReviewChecklist({ job }: { job: JobPost }) {
  const [checked, setChecked] = useState<string[]>([]);
  const descriptionLength = job.description.trim().length;
  const requirementsLength = job.requirements?.trim().length ?? 0;
  const requiredSkills = job.skills.filter((skill) => skill.importance === "REQUIRED").length;
  const autoChecks = [
    {
      ok: descriptionLength >= MIN_DESCRIPTION_LENGTH,
      label: `Mô tả công việc đủ chi tiết (${descriptionLength}/${MIN_DESCRIPTION_LENGTH} ký tự)`,
    },
    {
      ok: requirementsLength >= MIN_REQUIREMENTS_LENGTH,
      label: `Có phần yêu cầu ứng viên (${requirementsLength}/${MIN_REQUIREMENTS_LENGTH} ký tự)`,
    },
    { ok: requiredSkills > 0, label: `Có kỹ năng bắt buộc (${requiredSkills})` },
    {
      ok: job.requirementsConfirmedAt !== null,
      label: job.requirementsConfirmedAt
        ? `Nhà tuyển dụng đã xác nhận yêu cầu (${formatDate(job.requirementsConfirmedAt)})`
        : "Nhà tuyển dụng chưa xác nhận yêu cầu bằng AI",
    },
  ];

  return (
    <Card padding="md" className="grid gap-3">
      <h2 className="text-xs font-semibold tracking-wide text-text-subtle uppercase">Checklist duyệt tin</h2>
      <ul className="grid gap-1.5 text-sm">
        {autoChecks.map((item) => (
          <li key={item.label} className={`flex items-start gap-2 ${item.ok ? "text-success-700" : "text-marigold-700"}`}>
            <Icon name={item.ok ? "circle-check" : "circle-alert"} size={15} className="mt-0.5 shrink-0" />
            {item.label}
          </li>
        ))}
      </ul>
      {job.majors.length > 0 || job.minExperienceYears ? (
        <dl className="grid gap-1 border-t border-border-subtle pt-3 text-sm">
          {job.minExperienceYears ? (
            <div className="flex justify-between gap-3">
              <dt className="text-text-muted">Kinh nghiệm tối thiểu</dt>
              <dd className="text-right text-text-body">{job.minExperienceYears} năm</dd>
            </div>
          ) : null}
          {job.majors.length > 0 ? (
            <div className="grid gap-0.5">
              <dt className="text-text-muted">Ngành phù hợp</dt>
              <dd className="text-text-body">
                {job.majors
                  .map((major) => `${major.name}${major.relevance === "RELATED" ? " (liên quan)" : ""}`)
                  .join(", ")}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <fieldset className="grid gap-1.5 border-t border-border-subtle pt-3">
        <legend className="mb-1.5 text-sm text-text-muted">Admin tự đánh giá</legend>
        {MANUAL_CHECKS.map((label) => (
          <label key={label} className="flex items-start gap-2 text-sm text-text-body">
            <input
              type="checkbox"
              className="mt-1"
              checked={checked.includes(label)}
              onChange={() =>
                setChecked((prev) => (prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]))
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
    </Card>
  );
}

/**
 * Trang kiểm duyệt chi tiết một tin — khớp ảnh mẫu
 * `Screenshot 2026-09-12 134326.png` (panel 2): nội dung tin bên trái, card
 * công ty + trạng thái + nút Duyệt/Từ chối bên phải.
 */
export default function AdminJobPostReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const { data: job, isLoading } = useAdminJobPost(id);
  const [modal, setModal] = useState<"reject" | "retract" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function run(kind: Outcome["kind"], path: string, body?: unknown) {
    setError(null);
    setBusy(true);
    try {
      const updated = await apiFetch<JobPost>("admin", `/admin/job-posts/${id}/${path}`, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setModal(null);
      setOutcome({ kind, job: updated });
      await queryClient.invalidateQueries({ queryKey: ["adminJobPosts"] });
      await queryClient.invalidateQueries({ queryKey: ["adminJobPostStats"] });
      await queryClient.invalidateQueries({ queryKey: ["adminJobPost", id] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thực hiện được, vui lòng thử lại");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !job) {
    return <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-text-muted">Đang tải...</div>;
  }

  if (outcome) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <ModerationResult outcome={outcome} />
      </div>
    );
  }

  const status = JOB_STATUS_LABEL[job.status];

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 px-6 py-12">
      <Button as="a" href="/admin/jobs" variant="link" className="w-fit" icon="arrow-left">
        Quản lý tin tuyển dụng
      </Button>

      <JobPostHeaderCard
        job={job}
        action={
          <div className="grid justify-items-end gap-1">
            <Badge tone={status.tone}>{status.label}</Badge>
            <span className="text-sm text-text-muted">Ngày gửi: {formatDate(job.createdAt)}</span>
          </div>
        }
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <JobPostContent
        job={job}
        aside={
          <>
            <JobPostCompanyCard
              job={job}
              footer={
                <Button as="a" href={`/admin/companies/${job.companyId}`} variant="secondary" size="sm" fullWidth>
                  Xem hồ sơ công ty
                </Button>
              }
            />

            <Card padding="md" className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-text-muted">Trạng thái hiện tại</span>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>

              {job.status === "PENDING" ? (
                <>
                  <Button type="button" icon="circle-check" fullWidth loading={busy} onClick={() => void run("approved", "approve")}>
                    Duyệt tin
                  </Button>
                  <Button type="button" variant="danger" icon="circle-x" fullWidth disabled={busy} onClick={() => setModal("reject")}>
                    Từ chối
                  </Button>
                </>
              ) : null}

              {job.status === "PUBLISHED" ? (
                <>
                  <p className="text-sm text-text-muted">
                    Tin đang hiển thị công khai. Thu hồi sẽ được ghi vào lịch sử vi phạm của công ty.
                  </p>
                  <Button type="button" variant="danger" icon="circle-slash" fullWidth disabled={busy} onClick={() => setModal("retract")}>
                    Thu hồi tin
                  </Button>
                </>
              ) : null}

              {job.latestModerationAction ? (
                <div className="grid gap-1 border-t border-border-subtle pt-3 text-sm">
                  <span className="text-text-muted">Hành động gần nhất</span>
                  <span className="text-text-body">
                    {job.latestModerationAction.action} · {formatDate(job.latestModerationAction.createdAt)}
                  </span>
                  {job.latestModerationAction.actorName ? (
                    <span className="text-text-muted">Bởi {job.latestModerationAction.actorName}</span>
                  ) : (
                    <span className="text-text-muted">Tự động (công ty được miễn kiểm duyệt)</span>
                  )}
                  {job.latestModerationAction.reason ? (
                    <span className="text-text-body">Lý do: {job.latestModerationAction.reason}</span>
                  ) : null}
                </div>
              ) : null}
            </Card>

            {job.status === "PENDING" ? <ReviewChecklist job={job} /> : null}
          </>
        }
      />

      {modal === "reject" ? (
        <RejectJobModal
          title="Từ chối tin tuyển dụng"
          description="Lý do từ chối (chọn 1 hoặc nhiều):"
          confirmLabel="Xác nhận từ chối"
          submitting={busy}
          error={error}
          onCancel={() => setModal(null)}
          onConfirm={(reason) => void run("rejected", "reject", { reason })}
        />
      ) : null}

      {modal === "retract" ? (
        <RejectJobModal
          title="Thu hồi tin tuyển dụng"
          description="Lý do thu hồi (chọn 1 hoặc nhiều):"
          confirmLabel="Xác nhận thu hồi"
          submitting={busy}
          error={error}
          onCancel={() => setModal(null)}
          onConfirm={(reason) => void run("retracted", "retract", { reason })}
        />
      ) : null}
    </div>
  );
}
