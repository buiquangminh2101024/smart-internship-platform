"use client";

import { useState } from "react";
import type { AdminUserListItem } from "@sip/shared-types";
import { ApiError } from "@/lib/api-client";
import { useReactivateUser, useSuspendUser } from "@/hooks/useAdminUsers";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import { DashButton } from "@/components/dashboard/DashButton";
import { NoteBox } from "@/components/interviews/NoteBox";

/** Kết quả báo lên trang để hiện toast: thành công, hoặc thao tác không còn hợp lệ (409/404). */
export interface UserStatusOutcome {
  tone: "success" | "danger";
  message: string;
}

const SUSPEND_FORM_ID = "suspend-user-form";
const REASON_ID = "suspend-user-reason";
// Khớp `suspendUserSchema` ở server (1–500 ký tự sau khi trim).
const REASON_MAX = 500;

/**
 * Lỗi khiến hộp thoại vô nghĩa (đã bị khoá / mở khoá ở nơi khác, tài khoản không
 * còn) thì đóng hộp thoại và báo bằng toast; danh sách tự tải lại (`onSettled`).
 * Lỗi khác (mạng, 5xx) giữ hộp thoại để thử lại.
 */
function staleMessage(err: unknown, conflict: string): string | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 409) return conflict;
  if (err.status === 404) return "Không tìm thấy tài khoản này. Danh sách đã được tải lại.";
  return null;
}

// ─── Khoá ────────────────────────────────────────────────────────────────

/** Khoá tài khoản (U1–U3): lý do bắt buộc, người dùng đọc được trong email. */
export function SuspendUserDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserListItem | null;
  onClose: () => void;
  onDone: (outcome: UserStatusOutcome) => void;
}) {
  const suspend = useSuspendUser();

  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      busy={suspend.isPending}
      size="sm"
      labelledBy="suspend-user-title"
      describedBy="suspend-user-msg"
      initialFocusId={REASON_ID}
    >
      {user ? <SuspendContent key={user.id} user={user} mutation={suspend} onClose={onClose} onDone={onDone} /> : null}
    </Dialog>
  );
}

function SuspendContent({
  user,
  mutation,
  onClose,
  onDone,
}: {
  user: AdminUserListItem;
  mutation: ReturnType<typeof useSuspendUser>;
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
      setError("Nhập lý do để người dùng biết vì sao tài khoản bị khoá.");
      document.getElementById(REASON_ID)?.focus();
      return;
    }
    try {
      await mutation.mutateAsync({ userId: user.id, data: { reason: trimmed } });
      onDone({ tone: "success", message: `Đã khoá tài khoản ${user.email}.` });
    } catch (err) {
      const stale = staleMessage(err, "Tài khoản này đã bị khoá trước đó. Danh sách đã được tải lại.");
      if (stale) {
        onDone({ tone: "danger", message: stale });
        return;
      }
      setServerError("Không khoá được tài khoản. Kiểm tra kết nối rồi thử lại.");
    }
  }

  return (
    <>
      <DialogHeader
        titleId="suspend-user-title"
        title={
          <>
            Khoá tài khoản <span className="[overflow-wrap:anywhere]">{user.email}</span>?
          </>
        }
        subtitleId="suspend-user-msg"
        subtitle="Người dùng bị đăng xuất ngay và không đăng nhập được cho tới khi mở khoá. Họ nhận email báo khoá kèm lý do bên dưới."
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
              placeholder="Ví dụ: đăng tin tuyển dụng giả mạo nhiều lần"
              onChange={(event) => {
                setReason(event.target.value);
                if (event.target.value.trim()) setError(null);
              }}
            />
            <span id={`${REASON_ID}-hint`} className={`text-[13px] ${error ? "text-red-600" : "text-text-muted"}`}>
              {error ?? "Người dùng đọc được lý do này trong email."}
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
          {busy ? "Đang khoá" : "Khoá tài khoản"}
        </DashButton>
      </DialogFooter>
    </>
  );
}

// ─── Mở khoá ─────────────────────────────────────────────────────────────

/**
 * Mở khoá (U4): chỉ hỏi xác nhận. Chưa xác thực email thì về "Chờ xác thực"
 * thay vì "Hoạt động". Dùng `Dialog` (render tại chỗ) thay `ConfirmDialog`
 * (portal ra `body`, mất `data-role="admin"` nên nút chính sẽ ra màu Pine).
 */
export function ReactivateUserDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserListItem | null;
  onClose: () => void;
  onDone: (outcome: UserStatusOutcome) => void;
}) {
  const reactivate = useReactivateUser();

  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      busy={reactivate.isPending}
      size="sm"
      labelledBy="reactivate-user-title"
      describedBy="reactivate-user-msg"
    >
      {user ? (
        <ReactivateContent key={user.id} user={user} mutation={reactivate} onClose={onClose} onDone={onDone} />
      ) : null}
    </Dialog>
  );
}

function ReactivateContent({
  user,
  mutation,
  onClose,
  onDone,
}: {
  user: AdminUserListItem;
  mutation: ReturnType<typeof useReactivateUser>;
  onClose: () => void;
  onDone: (outcome: UserStatusOutcome) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const busy = mutation.isPending;
  const verified = user.emailVerifiedAt !== null;

  async function confirm() {
    setServerError(null);
    try {
      await mutation.mutateAsync(user.id);
      onDone({
        tone: "success",
        message: verified
          ? `Đã mở khoá tài khoản ${user.email}.`
          : `Đã mở khoá tài khoản ${user.email}. Tài khoản về trạng thái Chờ xác thực.`,
      });
    } catch (err) {
      const stale = staleMessage(err, "Tài khoản này không còn bị khoá. Danh sách đã được tải lại.");
      if (stale) {
        onDone({ tone: "danger", message: stale });
        return;
      }
      setServerError("Không mở khoá được tài khoản. Kiểm tra kết nối rồi thử lại.");
    }
  }

  return (
    <>
      <DialogHeader
        titleId="reactivate-user-title"
        title={
          <>
            Mở khoá tài khoản <span className="[overflow-wrap:anywhere]">{user.email}</span>?
          </>
        }
        subtitleId="reactivate-user-msg"
        subtitle={
          verified
            ? "Tài khoản về trạng thái Hoạt động và đăng nhập lại được ngay. Người dùng nhận email báo mở khoá."
            : "Tài khoản chưa xác thực email nên sẽ về trạng thái Chờ xác thực, người dùng cần nhập mã OTP khi đăng nhập. Họ nhận email báo mở khoá."
        }
      />
      {serverError ? (
        <DialogBody>
          <NoteBox tone="danger" icon="circle-alert" role="alert">
            {serverError}
          </NoteBox>
        </DialogBody>
      ) : null}
      <DialogFooter>
        <DashButton variant="secondary" disabled={busy} onClick={onClose} className="max-[480px]:flex-1">
          Huỷ
        </DashButton>
        <DashButton variant="primary" loading={busy} onClick={() => void confirm()} className="max-[480px]:flex-1">
          {busy ? "Đang mở khoá" : "Mở khoá"}
        </DashButton>
      </DialogFooter>
    </>
  );
}
