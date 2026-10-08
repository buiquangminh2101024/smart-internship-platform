"use client";

import { use, useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import type { AdminUserAccount, AdminUserDetail } from "@sip/shared-types";
import { ApiError } from "@/lib/api-client";
import { useAdminUserDetail } from "@/hooks/useAdminUsers";
import { formatVnDate } from "@/lib/dashboard-format";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { DashButton } from "@/components/dashboard/DashButton";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { ReactivateUserDialog, SuspendUserDialog, type UserStatusOutcome } from "@/components/admin/UserStatusDialogs";
import {
  ActivateUserDialog,
  PasswordResetGuideDialog,
  RevokeSessionsDialog,
} from "@/components/admin/UserAccountDialogs";
import { UserDetailActions, type UserDetailAction } from "@/components/admin/UserDetailActions";
import {
  AccountPanel,
  CandidateSections,
  EmployerSections,
  HistoryPanel,
} from "@/components/admin/UserDetailSections";
import { ROLE_BADGE_KEY, USER_STATUS_META } from "@/components/admin/UserMeta";

let toastIdCounter = 0;

function useToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const push = useCallback((tone: ToastData["tone"], message: string) => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, tone, message }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  return { toasts, push, dismiss };
}

function BackLink() {
  return (
    <Link
      href="/admin/users"
      className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text-strong"
    >
      <Icon name="arrow-left" size={16} />
      Về danh sách người dùng
    </Link>
  );
}

/**
 * Chi tiết người dùng (AD-18, E4, E5, E8). Hai cột ở ≥ lg: trái là khối theo
 * vai trò, phải là "Tài khoản" + "Lịch sử thao tác". Một cột ở màn hình hẹp,
 * "Tài khoản" lên đầu (cột phải đứng trước trong DOM).
 */
export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = useAdminUserDetail(id);
  const { toasts, push, dismiss } = useToast();
  const [dialog, setDialog] = useState<UserDetailAction | null>(null);

  function handleDone(outcome: UserStatusOutcome) {
    setDialog(null);
    push(outcome.tone, outcome.message);
  }

  const notFound = detail.error instanceof ApiError && detail.error.status === 404;

  return (
    // Admin bản D: số dùng font chữ thường + `tabular-nums`, không mono (như dashboard).
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 [--font-num:var(--font-sans)] sm:px-6 sm:py-12">
      <BackLink />

      {detail.isPending ? (
        <div className="grid gap-6">
          <BlockSkeleton height={72} />
          <BlockSkeleton height={360} />
        </div>
      ) : notFound ? (
        <Card padding="lg" className="grid justify-items-start gap-3">
          <h1 className="text-xl font-semibold text-text-strong">Không tìm thấy người dùng</h1>
          <p className="text-sm text-text-body">
            Tài khoản này không tồn tại hoặc link đã sai. Bạn tìm lại trong danh sách người dùng.
          </p>
          <DashButton href="/admin/users" variant="secondary" icon="users">
            Về danh sách người dùng
          </DashButton>
        </Card>
      ) : detail.isError || !detail.data ? (
        <BlockError what="thông tin người dùng" onRetry={() => void detail.refetch()} retrying={detail.isFetching} />
      ) : (
        <DetailView
          account={detail.data.account}
          main={<RoleSections detail={detail.data} />}
          aside={
            <>
              <AccountPanel account={detail.data.account} />
              <HistoryPanel history={detail.data.history} />
            </>
          }
          onAction={setDialog}
        />
      )}

      {detail.data ? (
        <>
          <SuspendUserDialog
            user={dialog === "suspend" ? detail.data.account : null}
            onClose={() => setDialog(null)}
            onDone={handleDone}
          />
          <ReactivateUserDialog
            user={dialog === "reactivate" ? detail.data.account : null}
            onClose={() => setDialog(null)}
            onDone={handleDone}
          />
          <RevokeSessionsDialog
            user={dialog === "revoke" ? detail.data.account : null}
            onClose={() => setDialog(null)}
            onDone={handleDone}
          />
          <ActivateUserDialog
            user={dialog === "activate" ? detail.data.account : null}
            onClose={() => setDialog(null)}
            onDone={handleDone}
          />
          <PasswordResetGuideDialog
            user={dialog === "guide" ? detail.data.account : null}
            onClose={() => setDialog(null)}
            onDone={handleDone}
          />
        </>
      ) : null}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function DetailView({
  account,
  main,
  aside,
  onAction,
}: {
  account: AdminUserAccount;
  main: ReactNode;
  aside: ReactNode;
  onAction: (action: UserDetailAction) => void;
}) {
  const status = USER_STATUS_META[account.status];
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <h1 className="text-2xl font-semibold [overflow-wrap:anywhere] text-text-strong">{account.email}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            <RoleBadge role={ROLE_BADGE_KEY[account.role]} />
            <Badge tone={status.tone}>{status.label}</Badge>
            {account.name ? <span className="[overflow-wrap:anywhere] text-text-body">{account.name}</span> : null}
            <span>
              Tạo ngày{" "}
              <time dateTime={account.createdAt} className="font-num tabular-nums">
                {formatVnDate(account.createdAt)}
              </time>
            </span>
          </div>
        </div>
        <UserDetailActions account={account} onAction={onAction} />
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <aside aria-label="Tài khoản và lịch sử" className="grid gap-6 lg:col-start-2 lg:row-start-1">
          {aside}
        </aside>
        <div className="grid min-w-0 gap-6 lg:col-start-1 lg:row-start-1">{main}</div>
      </div>
    </>
  );
}

function RoleSections({ detail }: { detail: AdminUserDetail }) {
  if (detail.account.role === "ADMIN") {
    return (
      <Card tone="sunken" padding="md" className="grid gap-1">
        <p className="font-semibold text-text-strong">Tài khoản quản trị không quản lý được ở đây</p>
        <p className="text-sm text-text-body">
          Trang này chỉ hiện thông tin tài khoản và lịch sử thao tác. Không khoá hay buộc đăng xuất quản trị viên từ
          trang người dùng.
        </p>
      </Card>
    );
  }
  if (detail.account.role === "EMPLOYER") return <EmployerSections employer={detail.employer} />;
  if (detail.candidate) return <CandidateSections candidate={detail.candidate} />;
  return null;
}
