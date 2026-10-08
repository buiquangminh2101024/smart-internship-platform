"use client";

import { useState, type ReactNode } from "react";
import type { AuthArea } from "@/lib/auth-area";
import { clearSessionsOfEmail, loginAfterResetHref, requestCodeErrorMessage } from "@/lib/password-reset";
import { authStoreForArea, useCurrentUser } from "@/stores/auth-store";
import { useForgotPassword } from "@/hooks/usePasswordReset";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { NoteBox } from "@/components/interviews/NoteBox";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

/**
 * Thẻ "Mật khẩu" ở Cài đặt (AD-18, E9): xin mã tới email đang đăng nhập rồi
 * đặt mật khẩu mới bằng `ResetPasswordForm`. Tài khoản chỉ có Google thì không
 * có nút. Đổi xong thì server đã thu hồi mọi phiên, kể cả phiên này.
 */
export function PasswordCard({ area }: { area: AuthArea }) {
  const hasHydrated = authStoreForArea(area)((s) => s.hasHydrated);
  const user = useCurrentUser(area);
  const requestCode = useForgotPassword();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  // Huỷ thì form (đang giữ focus) biến mất; đưa focus về nút "Đổi mật khẩu" vừa hiện lại.
  const [cancelled, setCancelled] = useState(false);

  function closeConfirm() {
    setConfirmOpen(false);
    setRequestError(null);
  }

  async function sendCode(email: string) {
    setRequestError(null);
    try {
      await requestCode.mutateAsync(email);
      setConfirmOpen(false);
      setCodeSent(true);
    } catch (err) {
      setRequestError(requestCodeErrorMessage(err));
    }
  }

  function handleChanged(email: string) {
    clearSessionsOfEmail(email);
    // Tải lại hẳn trang: bỏ luôn dữ liệu của phiên cũ còn trong bộ nhớ (React Query, socket).
    window.location.replace(loginAfterResetHref(area));
  }

  let body: ReactNode;
  if (!hasHydrated || !user) {
    body = <span aria-hidden className="block h-4 w-64 max-w-full rounded bg-surface-hover motion-safe:animate-pulse" />;
  } else if (!user.hasPassword) {
    body = <p className="text-sm text-text-muted">Bạn đăng nhập bằng Google nên tài khoản không có mật khẩu.</p>;
  } else if (!codeSent) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 basis-64 text-sm text-text-muted">
          Đổi mật khẩu bằng mã xác thực gửi tới{" "}
          <span className="font-medium [overflow-wrap:anywhere] text-text-strong">{user.email}</span>.
        </p>
        <Button
          variant="secondary"
          size="sm"
          icon="key-round"
          autoFocus={cancelled}
          onClick={() => setConfirmOpen(true)}
        >
          Đổi mật khẩu
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="grid max-w-md gap-4">
        <p className="text-sm text-text-body">
          Mã gồm 6 chữ số đã được gửi tới{" "}
          <span className="font-medium [overflow-wrap:anywhere] text-text-strong">{user.email}</span>. Mã có hiệu lực 5
          phút.
        </p>
        <ResetPasswordForm email={user.email} onSuccess={() => handleChanged(user.email)} />
        <Button
          variant="ghost"
          size="sm"
          className="justify-self-start"
          onClick={() => {
            setCancelled(true);
            setCodeSent(false);
          }}
        >
          Huỷ đổi mật khẩu
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Hộp thoại đứng trước form trong cây: effect đóng hộp thoại chạy trước effect focus ô mã của form. */}
      {user ? (
        <Dialog
          open={confirmOpen}
          onClose={closeConfirm}
          busy={requestCode.isPending}
          size="sm"
          labelledBy="change-password-title"
          describedBy="change-password-msg"
        >
          <DialogHeader
            titleId="change-password-title"
            title="Đổi mật khẩu"
            subtitleId="change-password-msg"
            subtitle={
              <>
                Mã xác thực sẽ được gửi tới <span className="[overflow-wrap:anywhere]">{user.email}</span>. Sau khi
                đổi, mọi thiết bị đang đăng nhập, kể cả thiết bị này, sẽ bị đăng xuất.
              </>
            }
          />
          {requestError ? (
            <DialogBody>
              <NoteBox tone="danger" icon="circle-alert" role="alert">
                {requestError}
              </NoteBox>
            </DialogBody>
          ) : null}
          <DialogFooter>
            <Button variant="secondary" disabled={requestCode.isPending} onClick={closeConfirm}>
              Huỷ
            </Button>
            <Button icon="send" loading={requestCode.isPending} onClick={() => void sendCode(user.email)}>
              {requestCode.isPending ? "Đang gửi mã" : "Gửi mã"}
            </Button>
          </DialogFooter>
        </Dialog>
      ) : null}
      <Card padding="md" className="grid gap-4">
        <p className="text-sm font-semibold text-text-strong">Mật khẩu</p>
        {body}
      </Card>
    </>
  );
}
