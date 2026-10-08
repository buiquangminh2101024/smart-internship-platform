"use client";

import { useState } from "react";
import type { AdminBulkActionResponse, AdminUserListItem } from "@sip/shared-types";
import { useBulkReactivateUsers, useBulkSuspendUsers } from "@/hooks/useAdminUsers";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { DashButton } from "@/components/dashboard/DashButton";
import { NoteBox } from "@/components/interviews/NoteBox";

export type BulkAction = "suspend" | "reactivate";

/** Một người không xử lý được, kèm câu tiếng Việt theo mã lỗi. */
export interface BulkFailure {
  email: string;
  message: string;
}

/** Kết quả báo lên trang: toàn bộ thành công ⇒ toast; có lỗi ⇒ hộp thoại kết quả. */
export interface BulkOutcome {
  action: BulkAction;
  succeeded: number;
  failures: BulkFailure[];
}

const SUSPEND_FORM_ID = "bulk-suspend-form";
const REASON_ID = "bulk-suspend-reason";
// Khớp `bulkSuspendSchema.reason` ở server (1–500 ký tự sau khi trim).
const REASON_MAX = 500;
const EMAIL_PREVIEW = 5;

const ACTION_VERB: Record<BulkAction, string> = { suspend: "khoá", reactivate: "mở khoá" };

function failureMessage(status: number | undefined): string {
  if (status === 409) return "Tài khoản đã ở trạng thái này.";
  if (status === 403) return "Là tài khoản quản trị.";
  if (status === 404) return "Tài khoản không còn tồn tại.";
  return "Lỗi hệ thống, thử lại sau.";
}

function toOutcome(action: BulkAction, users: AdminUserListItem[], response: AdminBulkActionResponse): BulkOutcome {
  const emailById = new Map(users.map((user) => [user.id, user.email]));
  const failures = response.results
    .filter((result) => !result.ok)
    .map((result) => ({ email: emailById.get(result.userId) ?? result.userId, message: failureMessage(result.status) }));
  return { action, succeeded: response.results.length - failures.length, failures };
}

/** "a@x, b@x, … và 3 người khác". */
function EmailPreview({ users }: { users: AdminUserListItem[] }) {
  const shown = users.slice(0, EMAIL_PREVIEW);
  const rest = users.length - shown.length;
  return (
    <ul className="grid gap-1 rounded-lg bg-surface-page px-3 py-2.5 text-[13px] text-text-body">
      {shown.map((user) => (
        <li key={user.id} className="truncate" title={user.email}>
          {user.email}
        </li>
      ))}
      {rest > 0 ? <li className="text-text-muted">và {rest} người khác</li> : null}
    </ul>
  );
}

// ─── Khoá hàng loạt ──────────────────────────────────────────────────────

/**
 * Khoá nhiều tài khoản cùng một lý do (E7). Lý do bắt buộc như khoá một người.
 * `users` chỉ gồm người áp dụng được (không `SUSPENDED`, không `ADMIN`).
 */
export function BulkSuspendDialog({
  users,
  onClose,
  onDone,
}: {
  users: AdminUserListItem[] | null;
  onClose: () => void;
  onDone: (outcome: BulkOutcome) => void;
}) {
  const mutation = useBulkSuspendUsers();
  return (
    <Dialog
      open={users !== null}
      onClose={onClose}
      busy={mutation.isPending}
      size="sm"
      labelledBy="bulk-suspend-title"
      describedBy="bulk-suspend-msg"
      initialFocusId={REASON_ID}
    >
      {users ? <BulkSuspendContent users={users} mutation={mutation} onClose={onClose} onDone={onDone} /> : null}
    </Dialog>
  );
}

function BulkSuspendContent({
  users,
  mutation,
  onClose,
  onDone,
}: {
  users: AdminUserListItem[];
  mutation: ReturnType<typeof useBulkSuspendUsers>;
  onClose: () => void;
  onDone: (outcome: BulkOutcome) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const busy = mutation.isPending;

  async function submit() {
    setServerError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Nhập lý do để người dùng biết vì sao tài khoản bị khoá.");
      document.getElementById(REASON_ID)?.focus();
      return;
    }
    try {
      const response = await mutation.mutateAsync({ userIds: users.map((user) => user.id), reason: trimmed });
      onDone(toOutcome("suspend", users, response));
    } catch {
      setServerError("Không khoá được các tài khoản. Kiểm tra kết nối rồi thử lại.");
    }
  }

  return (
    <>
      <DialogHeader
        titleId="bulk-suspend-title"
        title={`Khoá ${users.length} tài khoản?`}
        subtitleId="bulk-suspend-msg"
        subtitle="Những người này bị đăng xuất ngay và không đăng nhập được cho tới khi mở khoá. Mỗi người nhận email báo khoá kèm lý do bên dưới."
      />
      <DialogBody>
        <form
          id={SUSPEND_FORM_ID}
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {serverError ? (
            <NoteBox tone="danger" icon="circle-alert" role="alert">
              {serverError}
            </NoteBox>
          ) : null}
          <EmailPreview users={users} />
          <div className="grid gap-1.5">
            <div className="flex justify-between gap-2">
              <label htmlFor={REASON_ID} className="text-sm font-medium text-text-strong">
                Lý do khoá<span className="text-red-600"> *</span>
              </label>
              <span className="font-num text-[13px] text-text-muted tabular-nums" aria-hidden>
                {reason.length}/{REASON_MAX}
              </span>
            </div>
            <Textarea
              id={REASON_ID}
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              disabled={busy}
              aria-invalid={error !== null}
              aria-describedby={`${REASON_ID}-hint`}
              className="aria-invalid:border-red-400"
              placeholder="Ví dụ: tài khoản tạo hàng loạt để gửi tin rác"
              onChange={(event) => {
                setReason(event.target.value);
                if (event.target.value.trim()) setError(null);
              }}
            />
            <span id={`${REASON_ID}-hint`} className={`text-[13px] ${error ? "text-red-600" : "text-text-muted"}`}>
              {error ?? "Mọi người trong danh sách đọc được lý do này trong email."}
            </span>
          </div>
        </form>
      </DialogBody>
      <DialogFooter>
        <DashButton variant="secondary" disabled={busy} onClick={onClose} className="max-[480px]:flex-1">
          Huỷ
        </DashButton>
        <DashButton
          variant="danger-solid"
          type="submit"
          form={SUSPEND_FORM_ID}
          loading={busy}
          className="max-[480px]:flex-1"
        >
          {busy ? "Đang khoá" : `Khoá ${users.length} tài khoản`}
        </DashButton>
      </DialogFooter>
    </>
  );
}

// ─── Mở khoá hàng loạt ───────────────────────────────────────────────────

/** Mở khoá nhiều tài khoản (E7): chỉ hỏi xác nhận. `users` chỉ gồm người đang `SUSPENDED`. */
export function BulkReactivateDialog({
  users,
  onClose,
  onDone,
}: {
  users: AdminUserListItem[] | null;
  onClose: () => void;
  onDone: (outcome: BulkOutcome) => void;
}) {
  const mutation = useBulkReactivateUsers();
  return (
    <Dialog
      open={users !== null}
      onClose={onClose}
      busy={mutation.isPending}
      size="sm"
      labelledBy="bulk-reactivate-title"
      describedBy="bulk-reactivate-msg"
    >
      {users ? <BulkReactivateContent users={users} mutation={mutation} onClose={onClose} onDone={onDone} /> : null}
    </Dialog>
  );
}

function BulkReactivateContent({
  users,
  mutation,
  onClose,
  onDone,
}: {
  users: AdminUserListItem[];
  mutation: ReturnType<typeof useBulkReactivateUsers>;
  onClose: () => void;
  onDone: (outcome: BulkOutcome) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const busy = mutation.isPending;
  const unverified = users.filter((user) => user.emailVerifiedAt === null).length;

  async function confirm() {
    setServerError(null);
    try {
      const response = await mutation.mutateAsync({ userIds: users.map((user) => user.id) });
      onDone(toOutcome("reactivate", users, response));
    } catch {
      setServerError("Không mở khoá được các tài khoản. Kiểm tra kết nối rồi thử lại.");
    }
  }

  return (
    <>
      <DialogHeader
        titleId="bulk-reactivate-title"
        title={`Mở khoá ${users.length} tài khoản?`}
        subtitleId="bulk-reactivate-msg"
        subtitle={
          unverified > 0
            ? `${unverified} người chưa xác thực email sẽ về trạng thái Chờ xác thực, cần nhập mã OTP khi đăng nhập. Những người còn lại về Hoạt động. Mỗi người nhận email báo mở khoá.`
            : "Các tài khoản về trạng thái Hoạt động và đăng nhập lại được ngay. Mỗi người nhận email báo mở khoá."
        }
      />
      <DialogBody>
        {serverError ? (
          <NoteBox tone="danger" icon="circle-alert" role="alert">
            {serverError}
          </NoteBox>
        ) : null}
        <EmailPreview users={users} />
      </DialogBody>
      <DialogFooter>
        <DashButton variant="secondary" disabled={busy} onClick={onClose} className="max-[480px]:flex-1">
          Huỷ
        </DashButton>
        <DashButton variant="primary" loading={busy} onClick={() => void confirm()} className="max-[480px]:flex-1">
          {busy ? "Đang mở khoá" : `Mở khoá ${users.length} tài khoản`}
        </DashButton>
      </DialogFooter>
    </>
  );
}

// ─── Kết quả có lỗi ──────────────────────────────────────────────────────

/** Có ít nhất một người không xử lý được: liệt kê từng email kèm lý do. */
export function BulkResultDialog({ outcome, onClose }: { outcome: BulkOutcome | null; onClose: () => void }) {
  return (
    <Dialog open={outcome !== null} onClose={onClose} size="sm" labelledBy="bulk-result-title" describedBy="bulk-result-msg">
      {outcome ? (
        <>
          <DialogHeader
            titleId="bulk-result-title"
            title={
              outcome.succeeded > 0
                ? `Đã ${ACTION_VERB[outcome.action]} ${outcome.succeeded} / ${outcome.succeeded + outcome.failures.length} tài khoản`
                : `Không ${ACTION_VERB[outcome.action]} được tài khoản nào`
            }
            subtitleId="bulk-result-msg"
            subtitle={`${outcome.failures.length} tài khoản dưới đây không được ${ACTION_VERB[outcome.action]}. Danh sách đã được tải lại.`}
          />
          <DialogBody>
            <ul className="grid gap-2">
              {outcome.failures.map((failure) => (
                <li
                  key={failure.email}
                  className="rounded-r-md border-l-[3px] border-red-600 bg-red-50 px-2.5 py-1.5 text-[13px]"
                >
                  <span className="block font-medium [overflow-wrap:anywhere] text-text-strong">{failure.email}</span>
                  <span className="text-text-body">{failure.message}</span>
                </li>
              ))}
            </ul>
          </DialogBody>
          <DialogFooter>
            <DashButton variant="primary" onClick={onClose} className="max-[480px]:flex-1">
              Đóng
            </DashButton>
          </DialogFooter>
        </>
      ) : null}
    </Dialog>
  );
}
