"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdminUserListItem, AdminUserLoginMethod, AdminUserSort, Role, UserStatus } from "@sip/shared-types";
import { useAdminUsers, type AdminUserFilters } from "@/hooks/useAdminUsers";
import { formatVnDate } from "@/lib/dashboard-format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { RoleBadge } from "@/components/ui/RoleBadge";
import { Select } from "@/components/ui/Select";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { DashButton } from "@/components/dashboard/DashButton";
import { BlockError, BlockSkeleton } from "@/components/dashboard/BlockState";
import { RowCheckbox, TriStateCheckbox } from "@/components/interviews/SelectionBar";
import { ReactivateUserDialog, SuspendUserDialog, type UserStatusOutcome } from "@/components/admin/UserStatusDialogs";
import {
  BulkReactivateDialog,
  BulkResultDialog,
  BulkSuspendDialog,
  type BulkOutcome,
} from "@/components/admin/UserBulkDialogs";
import { PageNav, UserSelectionBar } from "@/components/admin/UserListControls";
import { ROLE_BADGE_KEY, SuspensionNote, USER_STATUS_META } from "@/components/admin/UserMeta";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "CANDIDATE", label: "Sinh viên" },
  { value: "EMPLOYER", label: "Doanh nghiệp" },
  { value: "ADMIN", label: "Quản trị" },
];

const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: "ACTIVE", label: USER_STATUS_META.ACTIVE.label },
  { value: "PENDING_VERIFICATION", label: USER_STATUS_META.PENDING_VERIFICATION.label },
  { value: "SUSPENDED", label: USER_STATUS_META.SUSPENDED.label },
];

const LOGIN_METHOD_OPTIONS: { value: AdminUserLoginMethod; label: string }[] = [
  { value: "PASSWORD", label: "Mật khẩu" },
  { value: "GOOGLE", label: "Google" },
  { value: "BOTH", label: "Cả hai" },
];

const EMAIL_VERIFIED_OPTIONS = [
  { value: "true", label: "Đã xác thực" },
  { value: "false", label: "Chưa xác thực" },
];

const SORT_OPTIONS: { value: AdminUserSort; label: string }[] = [
  { value: "newest", label: "Mới nhất" },
  { value: "oldest", label: "Cũ nhất" },
  { value: "email", label: "Email A–Z" },
];

// Khớp `adminListUsersQuerySchema` ở server.
const SEARCH_MAX = 100;
const SEARCH_DEBOUNCE_MS = 300;
const PAGE_MAX = 10_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Tham số bộ lọc trên URL (đổi thì về trang 1). `sort` và `page` không tính là bộ lọc. */
const FILTER_KEYS = ["role", "status", "q", "loginMethod", "emailVerified", "createdFrom", "createdTo"] as const;

function pick<T extends string>(options: readonly { value: T }[], value: string | null): T | undefined {
  return options.some((option) => option.value === value) ? (value as T) : undefined;
}

function asDate(value: string | null): string | undefined {
  return value && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function asPage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= PAGE_MAX ? page : 1;
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
 * Quản lý người dùng (AD-17, mở rộng 1 — AD-18). Bộ lọc, sắp xếp và trang nằm
 * trên query string để link trong thông báo "Yêu cầu hỗ trợ mới"
 * (`/admin/users?q=<email>`) mở đúng người, và nút quay lại giữ đúng trang.
 */
function AdminUsersView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const role = pick(ROLE_OPTIONS, searchParams.get("role"));
  const status = pick(STATUS_OPTIONS, searchParams.get("status"));
  const urlQ = (searchParams.get("q") ?? "").trim();
  const loginMethod = pick(LOGIN_METHOD_OPTIONS, searchParams.get("loginMethod"));
  const emailVerifiedParam = pick(EMAIL_VERIFIED_OPTIONS, searchParams.get("emailVerified"));
  const createdFrom = asDate(searchParams.get("createdFrom"));
  const createdTo = asDate(searchParams.get("createdTo"));
  const sort = pick(SORT_OPTIONS, searchParams.get("sort")) ?? "newest";
  const page = asPage(searchParams.get("page"));

  const filters: AdminUserFilters = {
    role,
    status,
    q: urlQ || undefined,
    loginMethod,
    emailVerified: emailVerifiedParam === undefined ? undefined : emailVerifiedParam === "true",
    createdFrom,
    createdTo,
    sort: sort === "newest" ? undefined : sort,
    page: page === 1 ? undefined : page,
  };
  const moreFilterCount = [loginMethod, emailVerifiedParam, createdFrom, createdTo].filter(Boolean).length;
  const hasFilters = Boolean(role || status || urlQ) || moreFilterCount > 0;
  // Server trả 400 khi "từ" sau "đến" ⇒ không gọi, báo ngay tại ô.
  const rangeInvalid = Boolean(createdFrom && createdTo && createdFrom > createdTo);

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

  /** Đổi bộ lọc / sắp xếp ⇒ về trang 1. */
  const setFilter = useCallback(
    (patch: Record<string, string | undefined>) => replaceParams({ ...patch, page: undefined }),
    [replaceParams],
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
      setFilter({ q: next || undefined });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, syncedQ, setFilter]);

  // Hàng "Bộ lọc khác" tự mở nếu URL có bộ lọc trong đó.
  const [moreOpen, setMoreOpen] = useState(moreFilterCount > 0);

  const query = useAdminUsers(filters, { enabled: !rangeInvalid });
  const data = query.data;
  const items = data?.items ?? [];

  // Chọn nhiều (E7): chỉ trong trang đang xem. Chuyển trang / đổi bộ lọc ⇒ bỏ chọn.
  // Giữ id rồi lấy dữ liệu từ trang hiện tại, để trạng thái luôn theo lần tải mới nhất.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const viewKey = searchParams.toString();
  const [selectedViewKey, setSelectedViewKey] = useState(viewKey);
  if (viewKey !== selectedViewKey) {
    setSelectedViewKey(viewKey);
    setSelected(new Set());
  }

  const selectable = items.filter((user) => user.role !== "ADMIN");
  const selectedInView = selectable.filter((user) => selected.has(user.id)).length;
  const selectedUsers = selectable.filter((user) => selected.has(user.id));
  const toSuspend = selectedUsers.filter((user) => user.status !== "SUSPENDED");
  const toReactivate = selectedUsers.filter((user) => user.status === "SUSPENDED");

  function toggle(users: AdminUserListItem[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const user of users) {
        if (checked) next.add(user.id);
        else next.delete(user.id);
      }
      return next;
    });
  }

  const { toasts, push, dismiss } = useToast();
  const [suspendTarget, setSuspendTarget] = useState<AdminUserListItem | null>(null);
  const [reactivateTarget, setReactivateTarget] = useState<AdminUserListItem | null>(null);
  const [bulkSuspend, setBulkSuspend] = useState<AdminUserListItem[] | null>(null);
  const [bulkReactivate, setBulkReactivate] = useState<AdminUserListItem[] | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkOutcome | null>(null);

  function handleDone(outcome: UserStatusOutcome) {
    setSuspendTarget(null);
    setReactivateTarget(null);
    push(outcome.tone, outcome.message);
  }

  function handleBulkDone(outcome: BulkOutcome) {
    setBulkSuspend(null);
    setBulkReactivate(null);
    setSelected(new Set());
    if (outcome.failures.length === 0) {
      push("success", `Đã ${outcome.action === "suspend" ? "khoá" : "mở khoá"} ${outcome.succeeded} tài khoản.`);
    } else {
      setBulkResult(outcome);
    }
  }

  function clearFilters() {
    setSearchInput("");
    setFilter(Object.fromEntries(FILTER_KEYS.map((key) => [key, undefined])));
  }

  return (
    // Admin bản D: số dùng font chữ thường + `tabular-nums`, không mono (như dashboard).
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 [--font-num:var(--font-sans)] sm:px-6 sm:py-12">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold text-text-strong">Người dùng</h1>
        <p className="text-sm text-text-muted">
          Tìm tài khoản, xem chi tiết, khoá tài khoản vi phạm và mở khoá khi đã xử lý xong. Chọn nhiều người để khoá
          hoặc mở khoá cùng lúc. Tài khoản quản trị không khoá được ở đây.
        </p>
      </div>

      {/* `min-w-0`: không thì bảng `min-w-[880px]` kéo rộng cả cột grid ở màn hẹp, vùng cuộn ngang mất tác dụng. */}
      <div className="min-w-0">
        <Card padding="none" className="overflow-hidden">
          <div className="grid gap-3 border-b border-border-subtle p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_160px_160px_auto_160px] lg:items-end">
              <div className="sm:col-span-2 lg:col-span-1">
                <Input
                  label="Tìm kiếm"
                  icon="search"
                  type="search"
                  size="sm"
                  placeholder="Tìm theo email, họ tên hoặc tên công ty"
                  maxLength={SEARCH_MAX}
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </div>
              <Select
                id="users-filter-role"
                label="Vai trò"
                size="sm"
                value={role ?? ""}
                options={[{ value: "", label: "Tất cả vai trò" }, ...ROLE_OPTIONS]}
                onChange={(event) => setFilter({ role: event.target.value || undefined })}
              />
              <Select
                id="users-filter-status"
                label="Trạng thái"
                size="sm"
                value={status ?? ""}
                options={[{ value: "", label: "Tất cả trạng thái" }, ...STATUS_OPTIONS]}
                onChange={(event) => setFilter({ status: event.target.value || undefined })}
              />
              <DashButton
                variant="secondary"
                icon="sliders-horizontal"
                className="h-9"
                onClick={() => setMoreOpen((open) => !open)}
              >
                Bộ lọc khác
                {moreFilterCount > 0 ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-xs text-white tabular-nums">
                    {moreFilterCount}
                    <span className="sr-only"> đang bật</span>
                  </span>
                ) : null}
                <span className="sr-only">{moreOpen ? " (đang mở)" : " (đang đóng)"}</span>
              </DashButton>
              <Select
                id="users-sort"
                label="Sắp xếp"
                size="sm"
                value={sort}
                options={SORT_OPTIONS}
                onChange={(event) => setFilter({ sort: event.target.value === "newest" ? undefined : event.target.value })}
              />
            </div>

            {moreOpen ? (
              <div className="grid gap-3 rounded-lg bg-surface-page p-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-start">
                <Select
                  id="users-filter-login"
                  label="Đăng nhập bằng"
                  size="sm"
                  value={loginMethod ?? ""}
                  options={[{ value: "", label: "Mọi cách" }, ...LOGIN_METHOD_OPTIONS]}
                  onChange={(event) => setFilter({ loginMethod: event.target.value || undefined })}
                />
                <Select
                  id="users-filter-verified"
                  label="Xác thực email"
                  size="sm"
                  value={emailVerifiedParam ?? ""}
                  options={[{ value: "", label: "Tất cả" }, ...EMAIL_VERIFIED_OPTIONS]}
                  onChange={(event) => setFilter({ emailVerified: event.target.value || undefined })}
                />
                <Input
                  label="Tạo từ ngày"
                  type="date"
                  size="sm"
                  value={createdFrom ?? ""}
                  max={createdTo}
                  onChange={(event) => setFilter({ createdFrom: event.target.value || undefined })}
                />
                <Input
                  label="Đến ngày"
                  type="date"
                  size="sm"
                  value={createdTo ?? ""}
                  min={createdFrom}
                  error={rangeInvalid ? "Ngày kết thúc phải từ ngày bắt đầu trở đi." : undefined}
                  onChange={(event) => setFilter({ createdTo: event.target.value || undefined })}
                />
              </div>
            ) : null}
          </div>

          {rangeInvalid ? (
            <p className="p-6 text-sm text-text-body">
              Khoảng ngày tạo không hợp lệ. Chọn ngày kết thúc từ ngày bắt đầu trở đi.
            </p>
          ) : query.isPending ? (
            <BlockSkeleton height={280} className="m-4" />
          ) : query.isError || !data ? (
            <div className="p-4">
              <BlockError what="danh sách người dùng" onRetry={() => void query.refetch()} retrying={query.isFetching} />
            </div>
          ) : items.length === 0 && data.total > 0 ? (
            // Trang vượt quá tổng (vd. vừa khoá hết người ở trang cuối khi đang lọc theo trạng thái).
            <div className="grid justify-items-start gap-3 p-6">
              <p className="text-sm text-text-body">Trang {page} không còn người dùng nào.</p>
              <Button
                variant="secondary"
                size="sm"
                icon="arrow-left"
                onClick={() => replaceParams({ page: String(Math.max(1, Math.ceil(data.total / data.pageSize))) })}
              >
                Về trang cuối
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="grid justify-items-start gap-3 p-6">
              <p className="text-sm text-text-body">
                {hasFilters
                  ? "Không có người dùng nào khớp bộ lọc. Thử bỏ bớt điều kiện hoặc tìm bằng phần khác của email, tên."
                  : "Chưa có người dùng nào."}
              </p>
              {hasFilters ? (
                <Button variant="secondary" size="sm" icon="x" onClick={clearFilters}>
                  Xoá bộ lọc
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div
                className={`overflow-x-auto transition-opacity duration-150 ${query.isPlaceholderData ? "opacity-60" : ""}`}
                aria-busy={query.isPlaceholderData || undefined}
              >
                <table className="relative w-full min-w-[880px] text-left text-sm">
                  <thead className="bg-surface-page text-[13px] text-text-muted">
                    <tr>
                      <th scope="col" className="w-12 py-0 pr-0 pl-4">
                        <TriStateCheckbox
                          label="Chọn tất cả người dùng trong trang này"
                          checked={selectable.length > 0 && selectedInView === selectable.length}
                          indeterminate={selectedInView > 0 && selectedInView < selectable.length}
                          disabled={selectable.length === 0 || query.isPlaceholderData}
                          onChange={(checked) => toggle(selectable, checked)}
                        />
                      </th>
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
                      checked={selected.has(user.id)}
                      selectDisabled={query.isPlaceholderData}
                      onCheck={(checked) => toggle([user], checked)}
                      onSuspend={() => setSuspendTarget(user)}
                      onReactivate={() => setReactivateTarget(user)}
                    />
                  ))}
                </table>
              </div>
              <PageNav
                page={data.page}
                pageSize={data.pageSize}
                total={data.total}
                onChange={(next) => replaceParams({ page: next === 1 ? undefined : String(next) })}
              />
            </>
          )}
        </Card>

        <UserSelectionBar
          count={selectedUsers.length}
          suspendable={toSuspend.length}
          reactivatable={toReactivate.length}
          onSuspend={() => setBulkSuspend(toSuspend)}
          onReactivate={() => setBulkReactivate(toReactivate)}
          onClear={() => setSelected(new Set())}
        />
      </div>

      <SuspendUserDialog user={suspendTarget} onClose={() => setSuspendTarget(null)} onDone={handleDone} />
      <ReactivateUserDialog user={reactivateTarget} onClose={() => setReactivateTarget(null)} onDone={handleDone} />
      <BulkSuspendDialog users={bulkSuspend} onClose={() => setBulkSuspend(null)} onDone={handleBulkDone} />
      <BulkReactivateDialog users={bulkReactivate} onClose={() => setBulkReactivate(null)} onDone={handleBulkDone} />
      <BulkResultDialog outcome={bulkResult} onClose={() => setBulkResult(null)} />
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/** Một người dùng = một `<tbody>`: hàng chính, cộng hàng thông tin khoá nếu đang `SUSPENDED`. */
function UserRows({
  user,
  checked,
  selectDisabled,
  onCheck,
  onSuspend,
  onReactivate,
}: {
  user: AdminUserListItem;
  checked: boolean;
  selectDisabled: boolean;
  onCheck: (checked: boolean) => void;
  onSuspend: () => void;
  onReactivate: () => void;
}) {
  const statusMeta = USER_STATUS_META[user.status];
  const suspended = user.status === "SUSPENDED";
  const isAdmin = user.role === "ADMIN";

  return (
    <tbody className={`border-t border-border-subtle ${checked ? "bg-brand-50" : ""}`}>
      <tr className="align-middle">
        <td className="py-0 pr-0 pl-4">
          {isAdmin ? null : (
            <RowCheckbox checked={checked} disabled={selectDisabled} onChange={onCheck} label={user.email} />
          )}
        </td>
        <td className="max-w-[260px] px-4 py-3">
          <Link
            href={`/admin/users/${user.id}`}
            className="block truncate font-medium text-brand-700 hover:underline"
            title={user.email}
          >
            {user.email}
          </Link>
        </td>
        <td className="max-w-[220px] px-4 py-3">
          <UserName user={user} />
        </td>
        <td className="px-4 py-3">
          <RoleBadge role={ROLE_BADGE_KEY[user.role]} />
        </td>
        <td className="px-4 py-3">
          <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
        </td>
        <td className="px-4 py-3 font-num text-text-body tabular-nums">{formatVnDate(user.createdAt)}</td>
        <td className="px-4 py-3 text-right">
          {isAdmin ? (
            <span className="relative text-[13px] text-text-subtle">
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
          <td />
          <td colSpan={6} className="px-4 pb-3">
            <SuspensionNote suspension={user.suspension} />
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
