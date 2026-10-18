"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { AuditActionGroup, AuditActorRoleFilter } from "@sip/shared-types";
import {
  AUDIT_GROUPS,
  ENTITY_LABEL,
  GROUP_META,
  RESUBMIT_ACTIONS,
  ROLE_FILTERS,
  ROLE_LABEL,
  actionLabel,
  countActiveFilters,
  effectiveRange,
  formatIsoDate,
  sessionTimeLabel,
  slotLabel,
  type ActivityFilters as Filters,
  type ActivityRange,
  type ParsedActivityParams,
} from "@/lib/audit-activity";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { DashButton } from "@/components/dashboard/DashButton";
import { DateRangeField } from "./DateRangeField";
import { GroupSwatch } from "./ActivityMeta";

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN = 2;
const SEARCH_MAX = 100;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** Bỏ một hành động; cờ gửi lại chỉ giữ khi các hành động còn lại đều là gửi duyệt / tự đăng. */
function withoutAction(filters: Filters, action: string): Filters {
  const actions = filters.actions.filter((item) => item !== action);
  const keepResubmit = actions.length > 0 && actions.every((item) => RESUBMIT_ACTIONS.includes(item));
  return { ...filters, actions, resubmit: keepResubmit ? filters.resubmit : null };
}

function ToggleChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${
        pressed
          ? "border-brand-300 bg-brand-50 text-brand-800 shadow-[0_0_0_3px_var(--color-brand-50)]"
          : "border-border-default bg-surface-card text-text-body hover:bg-surface-hover"
      }`}
    >
      {children}
    </button>
  );
}

interface ActiveChip {
  key: string;
  label: ReactNode;
  /** Tên đọc cho nút ✕. */
  name: string;
  remove: () => Filters;
}

function activeChips(filters: Filters, actorEmail: string | null): ActiveChip[] {
  const chips: ActiveChip[] = [];
  for (const group of filters.groups) {
    chips.push({
      key: `group-${group}`,
      label: (
        <>
          <GroupSwatch group={group} size={16} />
          {GROUP_META[group].label}
        </>
      ),
      name: `nhóm ${GROUP_META[group].label}`,
      remove: () => ({ ...filters, groups: filters.groups.filter((item) => item !== group) }),
    });
  }
  for (const role of filters.roles) {
    chips.push({
      key: `role-${role}`,
      label: `Vai trò: ${ROLE_LABEL[role]}`,
      name: `vai trò ${ROLE_LABEL[role]}`,
      remove: () => ({ ...filters, roles: filters.roles.filter((item) => item !== role) }),
    });
  }
  if (filters.from || filters.to) {
    const text = `${filters.from ? formatIsoDate(filters.from) : "…"} – ${filters.to ? formatIsoDate(filters.to) : "nay"}`;
    chips.push({
      key: "range",
      label: `Ngày: ${text}`,
      name: "khoảng ngày",
      remove: () => ({ ...filters, from: null, to: null }),
    });
  }
  if (filters.q) {
    chips.push({
      key: "q",
      label: `Email: “${filters.q}”`,
      name: "tìm theo email",
      remove: () => ({ ...filters, q: null }),
    });
  }
  for (const action of filters.actions) {
    chips.push({
      key: `action-${action}`,
      label: actionLabel(action),
      name: `hành động ${actionLabel(action)}`,
      remove: () => withoutAction(filters, action),
    });
  }
  if (filters.resubmit !== null) {
    const label = filters.resubmit ? "Gửi lại sau từ chối" : "Gửi lần đầu";
    chips.push({ key: "resubmit", label, name: label, remove: () => ({ ...filters, resubmit: null }) });
  }
  if (filters.slot) {
    const label = slotLabel(filters.slot.dow, filters.slot.hour);
    chips.push({ key: "slot", label, name: `khung ${label}`, remove: () => ({ ...filters, slot: null }) });
  }
  if (filters.ent) {
    const type = ENTITY_LABEL[filters.ent.type] ?? filters.ent.type;
    chips.push({
      key: "ent",
      label: (
        <>
          {type} <span className="font-num">…{filters.ent.id.slice(-8)}</span>
        </>
      ),
      name: `đối tượng ${type}`,
      remove: () => ({ ...filters, ent: null }),
    });
  }
  if (filters.actorId || filters.since || filters.until) {
    const who = actorEmail ?? "người làm này";
    const label =
      filters.since && filters.until
        ? `Phiên ${sessionTimeLabel(filters.since, new Date(Date.parse(filters.until) - 1).toISOString())} của ${who}`
        : filters.actorId
          ? `Người làm: ${who}`
          : "Một phiên làm việc";
    chips.push({
      key: "session",
      label,
      name: filters.since ? "phiên làm việc" : "người làm",
      remove: () => ({ ...filters, actorId: null, since: null, until: null }),
    });
  }
  return chips;
}

/**
 * Thanh lọc của trang (nhóm, vai trò, khoảng ngày, email) và hàng chip các bộ
 * lọc đang bật, kể cả bộ lọc đặt từ biểu đồ. Dưới `lg` thanh lọc thu thành nút
 * "Bộ lọc (n)"; hàng chip luôn hiện.
 */
export function ActivityFilters({
  filters,
  errors,
  range,
  actorEmail,
  onChange,
  onClear,
}: {
  filters: Filters;
  errors: ParsedActivityParams["errors"];
  range: ActivityRange;
  /** Email của `actorId` đang lọc (tìm trong các dòng đã tải), cho nhãn chip. */
  actorEmail: string | null;
  onChange: (next: Filters) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(filters);
  const chips = activeChips(filters, actorEmail);

  // Ô email: gõ thì đợi 300 ms mới đẩy lên URL; 1 ký tự thì chỉ nhắc, chưa gọi API.
  const urlQ = filters.q ?? "";
  const [searchInput, setSearchInput] = useState(urlQ);
  const [syncedQ, setSyncedQ] = useState(urlQ);
  if (urlQ !== syncedQ) {
    setSyncedQ(urlQ);
    setSearchInput(urlQ);
  }
  const typed = searchInput.trim();
  const tooShort = typed.length > 0 && typed.length < SEARCH_MIN;

  useEffect(() => {
    if (typed === syncedQ || tooShort) return;
    const timer = setTimeout(() => {
      setSyncedQ(typed);
      onChange({ ...filters, q: typed || null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, syncedQ, tooShort, filters, onChange]);

  function clearAll() {
    setSearchInput("");
    onClear();
  }

  return (
    <div className="grid gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="activity-filter-panel"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 cursor-pointer items-center gap-2 justify-self-start rounded-lg border border-border-default bg-surface-card px-3 text-sm font-semibold text-text-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 lg:hidden"
      >
        <Icon name="sliders-horizontal" size={16} />
        Bộ lọc{activeCount > 0 ? ` (${activeCount})` : ""}
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} className="text-text-muted" />
      </button>

      <div
        id="activity-filter-panel"
        className={`${open ? "flex" : "hidden"} flex-col gap-4 rounded-[14px] border border-border-subtle bg-surface-card p-4 lg:flex lg:flex-row lg:flex-wrap lg:items-start lg:gap-x-6`}
      >
        <fieldset className="grid min-w-0 gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-text-strong">Nhóm hành động</legend>
          <div className="flex flex-wrap gap-1.5">
            {AUDIT_GROUPS.map((group: AuditActionGroup) => (
              <ToggleChip
                key={group}
                pressed={filters.groups.includes(group)}
                onClick={() => onChange({ ...filters, groups: toggle(filters.groups, group) })}
              >
                <GroupSwatch group={group} size={18} />
                {GROUP_META[group].label}
              </ToggleChip>
            ))}
          </div>
          {errors.group ? <p className="text-sm text-red-600">{errors.group}</p> : null}
        </fieldset>

        <fieldset className="grid min-w-0 gap-1.5">
          <legend className="mb-1.5 text-sm font-medium text-text-strong">Vai trò người làm</legend>
          <div className="flex flex-wrap gap-1.5">
            {ROLE_FILTERS.map((role: AuditActorRoleFilter) => (
              <ToggleChip
                key={role}
                pressed={filters.roles.includes(role)}
                onClick={() => onChange({ ...filters, roles: toggle(filters.roles, role) })}
              >
                {ROLE_LABEL[role]}
              </ToggleChip>
            ))}
          </div>
          {errors.actorRole ? <p className="text-sm text-red-600">{errors.actorRole}</p> : null}
        </fieldset>

        <DateRangeField
          range={range}
          allByDefault={effectiveRange({ ...filters, from: null, to: null, since: null, until: null }).kind === "all"}
          linkError={errors.range}
          onChange={(next) =>
            // Chọn ngày thì bỏ lọc theo phiên (since/until không đi cùng from/to).
            onChange({ ...filters, from: next?.from ?? null, to: next?.to ?? null, since: null, until: null })
          }
        />

        <div className="w-full min-w-0 lg:w-[260px]">
          <Input
            label="Tìm theo email"
            icon="search"
            type="search"
            size="sm"
            placeholder="vd. vy.le@"
            maxLength={SEARCH_MAX}
            value={searchInput}
            error={tooShort ? undefined : errors.q}
            hint={tooShort ? `Gõ ít nhất ${SEARCH_MIN} ký tự.` : "Khớp người làm hoặc tài khoản bị tác động."}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
      </div>

      {chips.length > 0 || errors.link ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Bộ lọc đang bật" role="group">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 pr-1 pl-3 text-[13px] font-medium text-brand-800"
            >
              <span className="flex min-w-0 items-center gap-1.5 truncate">{chip.label}</span>
              <button
                type="button"
                aria-label={`Bỏ lọc ${chip.name}`}
                onClick={() => onChange(chip.remove())}
                className="grid h-6 w-6 flex-none cursor-pointer place-items-center rounded-full text-brand-700 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <Icon name="x" size={14} />
              </button>
            </span>
          ))}
          {chips.length > 0 ? (
            <DashButton variant="ghost" size="sm" icon="x" onClick={clearAll}>
              Bỏ lọc
            </DashButton>
          ) : null}
          {errors.link ? (
            <p className="flex w-full items-center gap-1.5 text-[13px] text-text-muted">
              <Icon name="circle-alert" size={14} className="flex-none text-red-600" />
              {errors.link}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
