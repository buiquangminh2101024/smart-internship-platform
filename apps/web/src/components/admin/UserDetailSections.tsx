import type { ReactNode } from "react";
import Link from "next/link";
import type {
  AdminLimitedList,
  AdminUserAccount,
  AdminUserCandidateDetail,
  AdminUserEducation,
  AdminUserEmployerDetail,
  AdminUserHistoryEntry,
  ApplicationStatus,
  CompanyVerificationStatus,
  JobPostStatus,
  OutreachInvitationStatus,
} from "@sip/shared-types";
import { formatNumber, formatVnDate, formatVnTime } from "@/lib/dashboard-format";
import { JOB_STATUS_LABEL } from "@/lib/job-post-display";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { AdminPanel, AdminPanelHead } from "@/components/dashboard/admin/AdminPanel";
import { SuspensionNote } from "./UserMeta";

/*
 * Các khối của trang chi tiết người dùng (AD-18, E4, E5, E8). Admin bản D:
 * `AdminPanel` nền trắng, số dùng `tabular-nums`, không khối tối.
 */

type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";

// Từ vựng theo `APPLICATION_STATUS_LABEL` ở server (notification-templates.ts).
const APPLICATION_STATUS: Record<ApplicationStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Chờ duyệt", tone: "warning" },
  REVIEWING: { label: "Đang xem xét", tone: "brand" },
  SHORTLISTED: { label: "Vào danh sách rút gọn", tone: "brand" },
  INTERVIEWING: { label: "Mời phỏng vấn", tone: "brand" },
  ACCEPTED: { label: "Được nhận", tone: "success" },
  REJECTED: { label: "Bị từ chối", tone: "danger" },
  CANCELLED: { label: "Đã huỷ", tone: "neutral" },
};

// Cùng nhãn với hộp thư lời mời của ứng viên (`OutreachInvitationInbox`).
const INVITATION_STATUS: Record<OutreachInvitationStatus, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Đang chờ", tone: "warning" },
  ACCEPTED: { label: "Đã chấp nhận", tone: "success" },
  DECLINED: { label: "Đã từ chối", tone: "danger" },
  EXPIRED: { label: "Hết hạn", tone: "neutral" },
};

const COMPANY_STATUS: Record<CompanyVerificationStatus, { label: string; tone: BadgeTone }> = {
  VERIFIED: { label: "Đã xác thực", tone: "success" },
  PENDING: { label: "Chờ xác thực", tone: "warning" },
  REJECTED: { label: "Bị từ chối", tone: "danger" },
};

const JOB_STATUS_ORDER: JobPostStatus[] = ["DRAFT", "PENDING", "PUBLISHED", "CLOSED", "EXPIRED", "TAKEN_DOWN"];

const LINK_CLASS = "font-medium text-brand-700 hover:underline";

function DateTime({ value }: { value: string }) {
  return (
    <time dateTime={value} className="font-num tabular-nums">
      {formatVnTime(value)} {formatVnDate(value)}
    </time>
  );
}

function DateOnly({ value }: { value: string }) {
  return (
    <time dateTime={value} className="font-num tabular-nums">
      {formatVnDate(value)}
    </time>
  );
}

/** "45" hoặc "20 / 45 gần nhất" khi server chỉ trả một phần (P6). */
function countText<T>(list: AdminLimitedList<T>): string {
  return list.total > list.items.length
    ? `${formatNumber(list.items.length)} / ${formatNumber(list.total)} gần nhất`
    : formatNumber(list.total);
}

/** Một dòng "nhãn – giá trị" trong khối thông tin. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-3">
      <dt className="text-[13px] text-text-muted">{label}</dt>
      <dd className="min-w-0 text-sm text-text-body">{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 pb-5 text-sm text-text-muted @xl:px-5">{children}</p>;
}

// ─── Tài khoản ─────────────────────────────────────────────────────────────

function loginMethodText(account: AdminUserAccount): string {
  if (account.hasPassword && account.hasGoogle) return "Mật khẩu và Google";
  if (account.hasGoogle) return "Google";
  return "Mật khẩu";
}

/** Cột phải: phương thức đăng nhập, xác thực email, lần buộc đăng xuất, thông tin khoá. */
export function AccountPanel({ account }: { account: AdminUserAccount }) {
  return (
    <AdminPanel labelledBy="user-account-title">
      <AdminPanelHead id="user-account-title" title="Tài khoản" />
      <div className="grid gap-3 px-4 pb-4 @xl:px-5">
        {account.status === "SUSPENDED" ? <SuspensionNote suspension={account.suspension} /> : null}
        <dl className="grid gap-3 text-sm">
          <AccountRow label="Đăng nhập bằng">{loginMethodText(account)}</AccountRow>
          <AccountRow label="Xác thực email">
            {account.emailVerifiedAt ? (
              <>
                Lúc <DateTime value={account.emailVerifiedAt} />
              </>
            ) : (
              <span className="text-marigold-800">Chưa xác thực</span>
            )}
          </AccountRow>
          <AccountRow label="Buộc đăng xuất lần cuối">
            {account.sessionsRevokedAt ? (
              <>
                Lúc <DateTime value={account.sessionsRevokedAt} />
              </>
            ) : (
              "Chưa từng"
            )}
          </AccountRow>
          <AccountRow label="Ngày tạo">
            <DateTime value={account.createdAt} />
          </AccountRow>
        </dl>
      </div>
    </AdminPanel>
  );
}

function AccountRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[13px] text-text-muted">{label}</dt>
      <dd className="text-text-body">{children}</dd>
    </div>
  );
}

// ─── Lịch sử thao tác ──────────────────────────────────────────────────────

type HistoryTone = "ok" | "no" | "sys";

const HISTORY_TONE_CLASS: Record<HistoryTone, string> = {
  ok: "bg-success-100 text-success-700",
  no: "bg-red-100 text-red-700",
  sys: "bg-surface-hover text-text-muted",
};

/** Cùng icon với "Hoạt động gần đây" (`ActivityTimeline`). */
function historyLook(action: string): { tone: HistoryTone; icon: string } {
  if (action === "USER_SUSPENDED") return { tone: "no", icon: "lock" };
  if (action === "USER_REACTIVATED") return { tone: "ok", icon: "lock-open" };
  if (action === "USER_ACTIVATED") return { tone: "ok", icon: "user-check" };
  if (action === "USER_SESSIONS_REVOKED") return { tone: "sys", icon: "log-out" };
  if (action === "USER_PASSWORD_RESET_GUIDE_SENT") return { tone: "sys", icon: "key-round" };
  return { tone: "sys", icon: "history" };
}

export function HistoryPanel({ history }: { history: AdminLimitedList<AdminUserHistoryEntry> }) {
  return (
    <AdminPanel labelledBy="user-history-title">
      <AdminPanelHead
        id="user-history-title"
        title="Lịch sử thao tác"
        subtitle={history.total > 0 ? <span className="tabular-nums">{countText(history)}</span> : undefined}
      />
      {history.items.length === 0 ? (
        <Empty>Chưa có thao tác nào của quản trị viên.</Empty>
      ) : (
        <ul className="px-4 pt-1 pb-3 @xl:px-5">
          {history.items.map((entry, index) => {
            const look = historyLook(entry.action);
            const last = index === history.items.length - 1;
            return (
              <li key={entry.id} className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-2.5">
                {last ? null : (
                  <span aria-hidden className="absolute top-11 -bottom-1 left-[15px] w-0.5 bg-border-subtle" />
                )}
                <span
                  aria-hidden
                  className={`relative z-[1] grid h-8 w-8 place-items-center rounded-full shadow-[0_0_0_3px_var(--color-surface-card)] ${HISTORY_TONE_CLASS[look.tone]}`}
                >
                  <Icon name={look.icon} size={16} />
                </span>
                <div className="min-w-0 text-[13px]">
                  <p className="font-semibold [overflow-wrap:anywhere] text-text-strong">{entry.summary}</p>
                  {entry.reason ? (
                    <p
                      className={`mt-1.5 rounded-r-md border-l-[3px] px-2.5 py-1.5 [overflow-wrap:anywhere] text-text-body ${
                        look.tone === "no" ? "border-red-600 bg-red-50" : "border-border-default bg-surface-page"
                      }`}
                    >
                      Lý do: {entry.reason}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-text-muted">
                    bởi <span className="[overflow-wrap:anywhere]">{entry.actorEmail ?? "Hệ thống"}</span> · lúc{" "}
                    <DateTime value={entry.at} />
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminPanel>
  );
}

// ─── Ứng viên ──────────────────────────────────────────────────────────────

function educationText(education: AdminUserEducation): string {
  const parts = [education.universityName, education.majorName, education.degree].filter(Boolean);
  const years =
    education.startYear !== null
      ? `${education.startYear} – ${education.isCurrent ? "nay" : (education.endYear ?? "?")}`
      : null;
  return [parts.join(" · ") || "Chưa ghi trường", years].filter(Boolean).join(", ");
}

export function CandidateSections({ candidate }: { candidate: AdminUserCandidateDetail }) {
  const profile = candidate.profile;
  return (
    <>
      <AdminPanel labelledBy="user-profile-title">
        <AdminPanelHead id="user-profile-title" title="Hồ sơ" />
        {profile ? (
          <dl className="divide-y divide-border-subtle px-4 pb-2 @xl:px-5">
            <Field label="Họ tên">{profile.fullName ?? <Missing />}</Field>
            <Field label="Tiêu đề">{profile.headline ?? <Missing />}</Field>
            <Field label="Học vấn">
              {profile.educations.length > 0 ? (
                <ul className="grid gap-1">
                  {profile.educations.map((education, index) => (
                    <li key={index}>{educationText(education)}</li>
                  ))}
                </ul>
              ) : (
                <Missing />
              )}
            </Field>
            <Field label="Kỹ năng">
              {profile.skills.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {profile.skills.map((skill) => (
                    <Badge key={skill}>{skill}</Badge>
                  ))}
                </span>
              ) : (
                <Missing />
              )}
            </Field>
            <Field label="Cho phép nhà tuyển dụng tìm thấy">{profile.isOpenToOutreach ? "Bật" : "Tắt"}</Field>
          </dl>
        ) : (
          <Empty>Ứng viên chưa tạo hồ sơ.</Empty>
        )}
      </AdminPanel>

      <AdminPanel labelledBy="user-cv-title">
        <AdminPanelHead
          id="user-cv-title"
          title="CV"
          subtitle="Chỉ hiện tên file và ngày tải lên, quản trị viên không tải được CV."
        />
        {candidate.cvs.length === 0 ? (
          <Empty>Ứng viên chưa tải CV nào.</Empty>
        ) : (
          <ul className="divide-y divide-border-subtle px-4 pb-2 @xl:px-5">
            {candidate.cvs.map((cv) => (
              <li key={cv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                <Icon name="file-text" size={18} className="shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere] text-text-strong">{cv.fileName}</span>
                {cv.isDefault ? <Badge tone="brand">Mặc định</Badge> : null}
                {cv.isHidden ? <Badge>Đã ẩn</Badge> : null}
                <span className="text-[13px] text-text-muted">
                  Tải lên <DateOnly value={cv.uploadedAt} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>

      <AdminPanel labelledBy="user-applications-title">
        <AdminPanelHead
          id="user-applications-title"
          title="Đơn ứng tuyển"
          subtitle={
            candidate.applications.total > 0 ? (
              <span className="tabular-nums">{countText(candidate.applications)}</span>
            ) : undefined
          }
        />
        {candidate.applications.items.length === 0 ? (
          <Empty>Ứng viên chưa ứng tuyển tin nào.</Empty>
        ) : (
          <ul className="divide-y divide-border-subtle px-4 pb-2 @xl:px-5">
            {candidate.applications.items.map((application) => {
              const status = APPLICATION_STATUS[application.status];
              return (
                <JobRow
                  key={application.id}
                  jobPost={application.jobPost}
                  company={application.company}
                  badge={<Badge tone={status.tone}>{status.label}</Badge>}
                  meta={
                    <>
                      Ứng tuyển <DateOnly value={application.createdAt} />
                    </>
                  }
                />
              );
            })}
          </ul>
        )}
      </AdminPanel>

      <AdminPanel labelledBy="user-invitations-title">
        <AdminPanelHead
          id="user-invitations-title"
          title="Lời mời đã nhận"
          subtitle={
            candidate.invitations.total > 0 ? (
              <span className="tabular-nums">{countText(candidate.invitations)}</span>
            ) : undefined
          }
        />
        {candidate.invitations.items.length === 0 ? (
          <Empty>Ứng viên chưa nhận lời mời nào.</Empty>
        ) : (
          <ul className="divide-y divide-border-subtle px-4 pb-2 @xl:px-5">
            {candidate.invitations.items.map((invitation) => {
              const status = INVITATION_STATUS[invitation.status];
              return (
                <JobRow
                  key={invitation.id}
                  jobPost={invitation.jobPost}
                  company={invitation.company}
                  badge={<Badge tone={status.tone}>{status.label}</Badge>}
                  meta={
                    <>
                      Gửi <DateOnly value={invitation.createdAt} /> · Hạn <DateOnly value={invitation.expiresAt} />
                    </>
                  }
                />
              );
            })}
          </ul>
        )}
      </AdminPanel>
    </>
  );
}

function Missing() {
  return <span className="text-text-subtle">Chưa ghi</span>;
}

/** Tin → `/admin/jobs/[id]`, công ty → `/admin/companies/[id]`, trạng thái, ngày. */
function JobRow({
  jobPost,
  company,
  badge,
  meta,
}: {
  jobPost: { id: string; title: string };
  company: { id: string; name: string };
  badge: ReactNode;
  meta: ReactNode;
}) {
  return (
    <li className="grid gap-1 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-4">
      <div className="min-w-0">
        <Link href={`/admin/jobs/${jobPost.id}`} className={`block [overflow-wrap:anywhere] ${LINK_CLASS}`}>
          {jobPost.title}
        </Link>
        <Link
          href={`/admin/companies/${company.id}`}
          className="text-[13px] [overflow-wrap:anywhere] text-text-muted hover:text-brand-700 hover:underline"
        >
          {company.name}
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
        {badge}
        <span className="text-[13px] text-text-muted">{meta}</span>
      </div>
    </li>
  );
}

// ─── Nhà tuyển dụng ────────────────────────────────────────────────────────

export function EmployerSections({ employer }: { employer: AdminUserEmployerDetail | null }) {
  if (!employer) {
    return (
      <AdminPanel labelledBy="user-company-title">
        <AdminPanelHead id="user-company-title" title="Công ty" />
        <Empty>Tài khoản chưa gắn với công ty nào.</Empty>
      </AdminPanel>
    );
  }

  const status = COMPANY_STATUS[employer.company.verificationStatus];
  return (
    <>
      <AdminPanel labelledBy="user-company-title">
        <AdminPanelHead id="user-company-title" title="Công ty" />
        <dl className="divide-y divide-border-subtle px-4 pb-2 @xl:px-5">
          <Field label="Tên công ty">
            <Link href={`/admin/companies/${employer.company.id}`} className={`[overflow-wrap:anywhere] ${LINK_CLASS}`}>
              {employer.company.name}
            </Link>
          </Field>
          <Field label="Xác thực">
            <Badge tone={status.tone}>{status.label}</Badge>
          </Field>
          <Field label="Quản trị công ty">{employer.isCompanyAdmin ? "Có" : "Không"}</Field>
          <Field label="Chức danh">{employer.title ?? <Missing />}</Field>
        </dl>
      </AdminPanel>

      <AdminPanel labelledBy="user-jobs-title">
        <AdminPanelHead id="user-jobs-title" title="Tin tuyển dụng" subtitle="Tin do chính người này tạo, theo trạng thái." />
        <dl className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-3 @xl:px-5">
          {JOB_STATUS_ORDER.map((jobStatus) => (
            <div key={jobStatus} className="grid gap-0.5 rounded-lg bg-surface-page px-3 py-2.5">
              <dt className="text-[13px] text-text-muted">{JOB_STATUS_LABEL[jobStatus].label}</dt>
              <dd className="text-xl font-bold text-text-strong tabular-nums">
                {formatNumber(employer.jobPostCounts[jobStatus] ?? 0)}
              </dd>
            </div>
          ))}
        </dl>
      </AdminPanel>
    </>
  );
}
