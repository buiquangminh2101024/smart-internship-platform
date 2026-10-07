"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdminUserListItem, Role, UserStatus } from "@sip/shared-types";
import { useAdminUsers, type AdminUserFilters } from "@/hooks/useAdminUsers";
import { formatVnDate, formatVnTime } from "@/lib/dashboard-format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Select } from "@/components/ui/Select";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { DashButton } from "@/components/dashboard/DashButton";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { ReactivateUserDialog, SuspendUserDialog, type UserStatusOutcome } from "@/components/admin/UserStatusDialogs";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "CANDIDATE", label: "Sinh viên" },
  { value: "EMPLOYER", label: "Doanh nghiệp" },
  { value: "ADMIN", label: "Quản trị" },
];

const STATUS_META: Record<UserStatus, { label: string; tone: "success" | "warning" | "danger" }> = {
  ACTIVE: { label: "Hoạt động", tone: "success" },
  PENDING_VERIFICATION: { label: "Chờ xác thực", tone: "warning" },
  SUSPENDED: { label: "Đã khoá", tone: "danger" },
};

const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: "ACTIVE", label: STATUS_META.ACTIVE.label },
  { value: "PENDING_VERIFICATION", label: STATUS_META.PENDING_VERIFICATION.label },
  { value: "SUSPENDED", label: STATUS_META.SUSPENDED.label },
];

const ROLE_KEY: Record<Role, "candidate" | "employer" | "admin"> = {
  CANDIDATE: "candidate",
  EMPLOYER: "employer",
  ADMIN: "admin",
};

// Khớp `adminListUsersQuerySchema.q` ở server.
const SEARCH_MAX = 100;
const SEARCH_DEBOUNCE_MS = 300;

function asRole(value: string | null): Role | undefined {
  return ROLE_OPTIONS.some((option) => option.value === value) ? (value as Role) : undefined;
}

function asStatus(value: string | null): UserStatus | undefined {
  return STATUS_OPTIONS.some((option) => option.value === value) ? (value as UserStatus) : undefined;
}

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

export default function AdminUsersPage() {
  // useSearchParams() cần Suspense boundary khi Next prerender route này.
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-6 py-12 text-sm text-text-muted">Đang tải...</div>}>
      <AdminUsersView />
    </Suspense>
  );
}

/**
 * Quản lý người dùng (AD-17, plan FE `admin-users-support`). Bộ lọc nằm trên
 * query string (`?role=&status=&q=`) để link trong thông báo "Yêu cầu hỗ trợ
 * mới" (`/admin/users?q=<email>`) mở đúng người.
 */
function AdminUsersView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const role = asRole(searchParams.get("role"));
  const status = asStatus(searchParams.get("status"));
  const urlQ = (searchParams.get("q") ?? "").trim();
  const filters: AdminUserFilters = { role, status, q: urlQ || undefined };
  const hasFilters = Boolean(role || status || urlQ);

  const replaceParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  // Ô tìm kiếm: gõ thì đợi 300 ms mới đẩy lên URL. `syncedQ` = giá trị ô đang khớp
  // với URL; URL đổi từ nơi khác (bấm thông báo, nút quay lại) thì ghi đè ô.
  const [searchInput, setSearchInput] = useState(urlQ);
  const [syncedQ, setSyncedQ] = useState(urlQ);
  if (urlQ !== syncedQ) {
    setSyncedQ(urlQ);
    setSearchInput(urlQ);
  }

  useEffect(() => {
    const next = searchInput.trim();
    if (next === syncedQ) return;
    const timer = setTimeout(() => {
      setSyncedQ(next);
      replaceParams({ q: next || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, syncedQ, replaceParams]);

  const query = useAdminUsers(filters);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  const { toasts, push, dismiss } = useToast();
  const [suspendTarget, setSuspendTarget] = useState<AdminUserListItem | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<AdminUserListItem | null>(null);

  function handleDone(outcome: UserStatusOutcome) {
    setSuspendTarget(null);
    setReactivateTarget(null);
    push(outcome.tone, outcome.message);
  }

  return (
    // Admin bản D: số dùng font chữ thường + `tabular-nums`, không mono (như dashboard).
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 [--font-num:var(--font-sans)] sm:px-6 sm:py-12">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold text-text-strong">Người dùng</h1>
        <p className="text-sm text-text-muted">
          Tìm tài khoản theo email, khoá tài khoản vi phạm và mở khoá khi đã xử lý xong. Tài khoản quản trị không khoá
          được ở đây.
        </p>
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="grid gap-3 border-b border-border-subtle p-4 sm:grid-cols-[minmax(0,1fr)_180px_180px] sm:items-end">
          <Input
            label="Tìm theo email"
            icon="search"
            type="search"
            size="sm"
            placeholder="Nhập một phần email"
            maxLength={SEARCH_MAX}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <Select
            label="Vai trò"
            size="sm"
            value={role ?? ""}
            options={[{ value: "", label: "Tất cả vai trò" }, ...ROLE_OPTIONS]}
            onChange={(event) => replaceParams({ role: event.target.value || undefined })}
          />
          <Select
            label="Trạng thái"
            size="sm"
            value={status ?? ""}
            options={[{ value: "", label: "Tất cả trạng thái" }, ...STATUS_OPTIONS]}
            onChange={(event) => replaceParams({ status: event.target.value || undefined })}
          />
        </div>

        {query.isPending ? (
          <BlockSkeleton height={280} className="m-4" />
        ) : query.isError ? (
          <div className="p-4">
            <BlockError what="danh sách người dùng" onRetry={() => void query.refetch()} retrying={query.isFetching} />
          </div>
        ) : items.length === 0 ? (
          <div className="grid justify-items-start gap-3 p-6">
            <p className="text-sm text-text-body">
              {hasFilters
                ? "Không có người dùng nào khớp bộ lọc. Thử bỏ bớt điều kiện hoặc tìm bằng phần khác của email."
                : "Chưa có người dùng nào."}
            </p>
            {hasFilters ? (
              <Button
                variant="secondary"
                size="sm"
                icon="x"
                onClick={() => {
                  setSearchInput("");
                  replaceParams({ role: undefined, status: undefined, q: undefined });
                }}
              >
                Xoá bộ lọc
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="relative w-full min-w-[820px] text-left text-sm">
              <thead className="bg-surface-page text-[13px] text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Tên
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Vai trò
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Trạng thái
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Ngày tạo
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Thao tác
                  </th>
                </tr>
              </thead>
              {items.map((user) => (
                <UserRows
                  key={user.id}
                  user={user}
                  onSuspend={() => setSuspendTarget(user)}
                  onReactivate={() => setReactivateTarget(user)}
                />
              ))}
            </table>
          </div>
        )}

        {query.hasNextPage ? (
          <div className="flex justify-center border-t border-border-subtle p-4">
            <Button
              variant="secondary"
              size="sm"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Tải thêm
            </Button>
          </div>
        ) : null}
      </Card>

      <SuspendUserDialog user={suspendTarget} onClose={() => setSuspendTarget(null)} onDone={handleDone} />
      <ReactivateUserDialog user={reactivateTarget} onClose={() => setReactivateTarget(null)} onDone={handleDone} />
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/** Một người dùng = một `<tbody>`: hàng chính, cộng hàng thông tin khoá nếu đang `SUSPENDED`. */
function UserRows({
  user,
  onSuspend,
  onReactivate,
}: {
  user: AdminUserListItem;
  onSuspend: () => void;
  onReactivate: () => void;
}) {
  const statusMeta = STATUS_META[user.status];
  const suspended = user.status === "SUSPENDED";

  return (
    <tbody className="border-t border-border-subtle">
      <tr className="align-middle">
        <td className="max-w-[260px] px-4 py-3">
          <span className="block truncate font-medium text-text-strong" title={user.email}>
            {user.email}
          </span>
        </td>
        <td className="max-w-[220px] px-4 py-3">
          <UserName user={user} />
        </td>
        <td className="px-4 py-3">
          <RoleBadge role={ROLE_KEY[user.role]} />
        </td>
        <td className="px-4 py-3">
          <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
        </td>
        <td className="px-4 py-3 font-num text-text-body tabular-nums">{formatVnDate(user.createdAt)}</td>
        <td className="px-4 py-3 text-right">
          {user.role === "ADMIN" ? (
            <span className="text-[13px] text-text-subtle">
              —<span className="sr-only">Không có thao tác cho tài khoản quản trị</span>
            </span>
          ) : suspended ? (
            <DashButton variant="secondary" size="sm" icon="lock-open" onClick={onReactivate}>
              Mở khoá<span className="sr-only"> {user.email}</span>
            </DashButton>
          ) : (
            <DashButton variant="danger" size="sm" icon="lock" onClick={onSuspend}>
              Khoá<span className="sr-only"> {user.email}</span>
            </DashButton>
          )}
        </td>
      </tr>
      {suspended ? (
        <tr>
          <td colSpan={6} className="px-4 pb-3">
            <SuspensionNote user={user} />
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}

function UserName({ user }: { user: AdminUserListItem }) {
  if (!user.name) {
    return <span className="text-text-subtle">{user.role === "ADMIN" ? "—" : "Chưa có hồ sơ"}</span>;
  }
  if (user.role === "EMPLOYER" && user.companyId) {
    return (
      <Link
        href={`/admin/companies/${user.companyId}`}
        className="block truncate text-brand-700 hover:underline"
        title={user.name}
      >
        {user.name}
      </Link>
    );
  }
  return (
    <span className="block truncate text-text-body" title={user.name}>
      {user.name}
    </span>
  );
}

/** "Lý do: … · Khoá bởi … · lúc …" — cùng kiểu khung lý do ở "Hoạt động gần đây". */
function SuspensionNote({ user }: { user: AdminUserListItem }) {
  const suspension = user.suspension;
  if (!suspension) {
    return (
      <p className="rounded-r-md border-l-[3px] border-red-600 bg-red-50 px-2.5 py-1.5 text-[13px] text-text-body">
        Không có thông tin lần khoá (tài khoản bị khoá trước khi có nhật ký thao tác).
      </p>
    );
  }
  return (
    <p className="rounded-r-md border-l-[3px] border-red-600 bg-red-50 px-2.5 py-1.5 text-[13px] text-text-body">
      <span className="font-medium text-text-strong">Lý do:</span> {suspension.reason ?? "không ghi lý do"}
      <span className="text-text-muted">
        {" "}
        · Khoá bởi {suspension.byEmail ?? "quản trị viên không còn tồn tại"} · lúc{" "}
        <time dateTime={suspension.at} className="font-num tabular-nums">
          {formatVnTime(suspension.at)} {formatVnDate(suspension.at)}
        </time>
      </span>
    </p>
  );
}
