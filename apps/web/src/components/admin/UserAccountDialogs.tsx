"use client";

import { useState } from "react";
import type { AdminUserListItem } from "@sip/shared-types";
import { ApiError } from "@/lib/api-client";
import { useActivateUser, useRevokeUserSessions, useSendPasswordResetGuide } from "@/hooks/useAdminUsers";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { DashButton } from "@/components/dashboard/DashButton";
import { NoteBox } from "@/components/interviews/NoteBox";
import { staleMessage, type UserStatusOutcome } from "./UserStatusDialogs";

/*
 * Ba thao tác của trang chi tiết người dùng (AD-18, E1–E3). Cùng cách làm với
 * `UserStatusDialogs`: `Dialog` render tại chỗ để giữ màu Plum; lỗi khiến hộp
 * thoại vô nghĩa (409/404/429) thì đóng và báo bằng toast, lỗi mạng giữ hộp
 * thoại để thử lại.
 */

// Khớp `revokeSessionsSchema` / `activateUserSchema` ở server (tối đa 500 ký tự sau khi trim).
const REASON_MAX = 500;

function EmailTitle({ prefix, email }: { prefix: string; email: string }) {
  return (
    <>
      {prefix} <span className="[overflow-wrap:anywhere]">{email}</span>?
    </>
  );
}

/** Ô lý do kèm bộ đếm; `error` hiện tại chỗ (`aria-invalid`). */
function ReasonField({
  id,
  label,
  required,
  value,
  error,
  hint,
  placeholder,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  required: boolean;
  value: string;
  error: string | null;
  hint: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-text-strong">
          {label}
          {required ? <span className="text-red-600"> *</span> : <span className="font-normal text-text-muted"> (không bắt buộc)</span>}
        </label>
        <span className="font-num text-[13px] text-text-muted tabular-nums" aria-hidden>
          {value.length}/{REASON_MAX}
        </span>
      </div>
      <Textarea
        id={id}
        rows={3}
        maxLength={REASON_MAX}
        value={value}
        disabled={disabled}
        aria-invalid={error !== null}
        aria-describedby={`${id}-hint`}
        className="aria-invalid:border-red-400"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <span id={`${id}-hint`} className={`text-[13px] ${error ? "text-red-600" : "text-text-muted"}`}>
        {error ?? hint}
      </span>
    </div>
  );
}

function ServerError({ message }: { message: string | null }) {
  return message ? (
    <NoteBox tone="danger" icon="circle-alert" role="alert">
      {message}
    </NoteBox>
  ) : null;
}

// ─── Buộc đăng xuất ─────────────────────────────────────────────────────

const REVOKE_FORM_ID = "revoke-sessions-form";
const REVOKE_REASON_ID = "revoke-sessions-reason";

/** Buộc đăng xuất mọi thiết bị (E2): không khoá, người dùng đăng nhập lại được ngay. */
export function RevokeSessionsDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserListItem | null;
  onClose: () => void;
  onDone: (outcome: UserStatusOutcome) => void;
}) {
  const mutation = useRevokeUserSessions();
  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      busy={mutation.isPending}
      size="sm"
      labelledBy="revoke-sessions-title"
      describedBy="revoke-sessions-msg"
      initialFocusId={REVOKE_REASON_ID}
    >
      {user ? <RevokeContent key={user.id} user={user} mutation={mutation} onClose={onClose} onDone={onDone} /> : null}
    </Dialog>
  );
}

function RevokeContent({
  user,
  mutation,
  onClose,
  onDone,
}: {
  user: AdminUserListItem;
  mutation: ReturnType<typeof useRevokeUserSessions>;
  onClose: () => void;
  onDone: (outcome: UserStatusOutcome) => void;
}) {
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const busy = mutation.isPending;

  async function submit() {
    setServerError(null);
    const trimmed = reason.trim();
    try {
      await mutation.mutateAsync({ userId: user.id, data: trimmed ? { reason: trimmed } : {} });
      onDone({ tone: "success", message: `Đã đăng xuất ${user.email} khỏi mọi thiết bị.` });
    } catch (err) {
      const stale = staleMessage(err, "Tài khoản này không còn ở trạng thái Hoạt động. Thông tin đã được tải lại.");
      if (stale) {
        onDone({ tone: "danger", message: stale });
        return;
      }
      setServerError("Không buộc đăng xuất được. Kiểm tra kết nối rồi thử lại.");
    }
  }

  return (
    <>
      <DialogHeader
        titleId="revoke-sessions-title"
        title={<EmailTitle prefix="Buộc đăng xuất" email={user.email} />}
        subtitleId="revoke-sessions-msg"
        subtitle={`Mọi thiết bị đang đăng nhập của ${user.email} sẽ bị đăng xuất. Tài khoản không bị khoá; người dùng đăng nhập lại được ngay.`}
      />
      <DialogBody>
        <form
          id={REVOKE_FORM_ID}
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <ServerError message={serverError} />
          <ReasonField
            id={REVOKE_REASON_ID}
            label="Lý do"
            required={false}
            value={reason}
            error={null}
            hint="Chỉ lưu trong lịch sử thao tác, người dùng không nhận được."
            placeholder="Ví dụ: người dùng báo mất điện thoại"
            disabled={busy}
            onChange={setReason}
          />
          <NoteBox tone="muted" icon="info">
            Nếu nghi tài khoản bị chiếm, hãy gửi thêm hướng dẫn đặt lại mật khẩu.
          </NoteBox>
        </form>
      </DialogBody>
      <DialogFooter>
        <DashButton variant="secondary" disabled={busy} onClick={onClose} className="max-[480px]:flex-1">
          Huỷ
        </DashButton>
        <DashButton
          variant="danger-solid"
          type="submit"
          form={REVOKE_FORM_ID}
          loading={busy}
          className="max-[480px]:flex-1"
        >
          {busy ? "Đang đăng xuất" : "Buộc đăng xuất"}
        </DashButton>
      </DialogFooter>
    </>
  );
}

// ─── Kích hoạt thủ công ──────────────────────────────────────────────────

const ACTIVATE_FORM_ID = "activate-user-form";
const ACTIVATE_REASON_ID = "activate-user-reason";

/** Kích hoạt tài khoản chưa xác thực email (E3, P1): lý do bắt buộc. */
export function ActivateUserDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserListItem | null;
  onClose: () => void;
  onDone: (outcome: UserStatusOutcome) => void;
}) {
  const mutation = useActivateUser();
  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      busy={mutation.isPending}
      size="sm"
      labelledBy="activate-user-title"
      describedBy="activate-user-msg"
      initialFocusId={ACTIVATE_REASON_ID}
    >
      {user ? <ActivateContent key={user.id} user={user} mutation={mutation} onClose={onClose} onDone={onDone} /> : null}
    </Dialog>
  );
}

function ActivateContent({
  user,
  mutation,
  onClose,
  onDone,
}: {
  user: AdminUserListItem;
  mutation: ReturnType<typeof useActivateUser>;
  onClose: () => void;
  onDone: (outcome: UserStatusOutcome) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const busy = mutation.isPending;

  async function submit() {
    setServerError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("Nhập lý do, ví dụ bạn đã trao đổi với người dùng qua kênh nào.");
      document.getElementById(ACTIVATE_REASON_ID)?.focus();
      return;
    }
    try {
      await mutation.mutateAsync({ userId: user.id, data: { reason: trimmed } });
      onDone({ tone: "success", message: `Đã kích hoạt tài khoản ${user.email}. Người dùng nhận email báo kích hoạt.` });
    } catch (err) {
      const stale = staleMessage(err, "Tài khoản này không còn ở trạng thái Chờ xác thực. Thông tin đã được tải lại.");
      if (stale) {
        onDone({ tone: "danger", message: stale });
        return;
      }
      setServerError("Không kích hoạt được tài khoản. Kiểm tra kết nối rồi thử lại.");
    }
  }

  return (
    <>
      <DialogHeader
        titleId="activate-user-title"
        title={<EmailTitle prefix="Kích hoạt tài khoản" email={user.email} />}
        subtitleId="activate-user-msg"
        subtitle="Tài khoản được coi như đã xác thực email và về trạng thái Hoạt động. Người dùng nhận email báo kích hoạt và đăng nhập được ngay."
      />
      <DialogBody>
        <form
          id={ACTIVATE_FORM_ID}
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <ServerError message={serverError} />
          <NoteBox tone="warning" icon="triangle-alert">
            Chỉ kích hoạt khi bạn đã trao đổi qua email với chính địa chỉ{" "}
            <b className="[overflow-wrap:anywhere]">{user.email}</b>. Biểu mẫu hỗ trợ không xác minh email người gửi.
          </NoteBox>
          <ReasonField
            id={ACTIVATE_REASON_ID}
            label="Lý do kích hoạt"
            required
            value={reason}
            error={error}
            hint="Chỉ lưu trong lịch sử thao tác, người dùng không nhận được."
            placeholder="Ví dụ: đã xác nhận qua email, người dùng không nhận được mã OTP"
            disabled={busy}
            onChange={(value) => {
              setReason(value);
              if (value.trim()) setError(null);
            }}
          />
        </form>
      </DialogBody>
      <DialogFooter>
        <DashButton variant="secondary" disabled={busy} onClick={onClose} className="max-[480px]:flex-1">
          Huỷ
        </DashButton>
        <DashButton
          variant="primary"
          type="submit"
          form={ACTIVATE_FORM_ID}
          loading={busy}
          className="max-[480px]:flex-1"
        >
          {busy ? "Đang kích hoạt" : "Kích hoạt tài khoản"}
        </DashButton>
      </DialogFooter>
    </>
  );
}

// ─── Gửi hướng dẫn đặt lại mật khẩu ──────────────────────────────────────

/** Lỗi riêng của thao tác này: hết hạn mức (429), chỉ có Google, đang khoá. */
function guideFailure(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 429) return "Đã gửi hướng dẫn 3 lần trong giờ qua cho tài khoản này. Bạn thử lại sau.";
  if (err.status === 409 && err.code === "USER_HAS_NO_PASSWORD") {
    return "Tài khoản chỉ đăng nhập bằng Google nên không có mật khẩu để đặt lại. Thông tin đã được tải lại.";
  }
  return staleMessage(err, "Tài khoản này đang bị khoá nên không gửi được hướng dẫn. Thông tin đã được tải lại.");
}

/** Gửi hướng dẫn đặt lại mật khẩu (E1): chỉ là thông báo + email, mật khẩu chưa đổi. */
export function PasswordResetGuideDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserListItem | null;
  onClose: () => void;
  onDone: (outcome: UserStatusOutcome) => void;
}) {
  const mutation = useSendPasswordResetGuide();
  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      busy={mutation.isPending}
      size="sm"
      labelledBy="reset-guide-title"
      describedBy="reset-guide-msg"
    >
      {user ? <GuideContent key={user.id} user={user} mutation={mutation} onClose={onClose} onDone={onDone} /> : null}
    </Dialog>
  );
}

function GuideContent({
  user,
  mutation,
  onClose,
  onDone,
}: {
  user: AdminUserListItem;
  mutation: ReturnType<typeof useSendPasswordResetGuide>;
  onClose: () => void;
  onDone: (outcome: UserStatusOutcome) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const busy = mutation.isPending;

  async function confirm() {
    setServerError(null);
    try {
      await mutation.mutateAsync(user.id);
      onDone({ tone: "success", message: `Đã gửi hướng dẫn đặt lại mật khẩu cho ${user.email}.` });
    } catch (err) {
      const failure = guideFailure(err);
      if (failure) {
        onDone({ tone: "danger", message: failure });
        return;
      }
      setServerError("Không gửi được hướng dẫn. Kiểm tra kết nối rồi thử lại.");
    }
  }

  return (
    <>
      <DialogHeader
        titleId="reset-guide-title"
        title={<EmailTitle prefix="Gửi hướng dẫn đặt lại mật khẩu cho" email={user.email} />}
        subtitleId="reset-guide-msg"
        subtitle="Người dùng nhận thông báo và email có link tới trang đặt lại mật khẩu, ở đó họ tự nhận mã xác thực. Mật khẩu hiện tại chưa đổi và họ vẫn đăng nhập bình thường."
      />
      {serverError ? (
        <DialogBody>
          <ServerError message={serverError} />
        </DialogBody>
      ) : null}
      <DialogFooter>
        <DashButton variant="secondary" disabled={busy} onClick={onClose} className="max-[480px]:flex-1">
          Huỷ
        </DashButton>
        <DashButton variant="primary" icon="send" loading={busy} onClick={() => void confirm()} className="max-[480px]:flex-1">
          {busy ? "Đang gửi" : "Gửi hướng dẫn"}
        </DashButton>
      </DialogFooter>
    </>
  );
}
