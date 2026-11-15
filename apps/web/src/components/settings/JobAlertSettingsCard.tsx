"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import type { UpdateJobAlertSettingsRequest } from "@sip/shared-types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { JOB_ALERT_CITY_REQUIRED, useJobAlertSettings, useUpdateJobAlertSettings } from "@/hooks/useJobAlertSettings";
import { ApiError } from "@/lib/api-client";
import { PROFILE_COMPLETENESS_META } from "@/lib/profile-completeness";

// Cài đặt job alert ở /settings của ứng viên (AD-26 D7–D9, plan FE job-discovery bước F4).
// Mỗi công tắc lưu ngay khi bấm. Hai công tắc sau chỉ có tác dụng khi bật công tắc đầu
// nên mờ đi khi công tắc đầu tắt.

/** Neo để link từ nơi khác (FAQ, thông báo) tới thẳng thẻ này: `/settings#bao-tin-viec-lam`. */
export const JOB_ALERT_SETTINGS_ANCHOR = "bao-tin-viec-lam";

const CITY_HREF = PROFILE_COMPLETENESS_META.city.href;

type SaveError = { kind: "city" } | { kind: "other"; message: string } | null;

export function JobAlertSettingsCard() {
  const titleId = useId();
  const settings = useJobAlertSettings(true);
  const update = useUpdateJobAlertSettings();
  const [error, setError] = useState<SaveError>(null);

  function save(patch: UpdateJobAlertSettingsRequest) {
    setError(null);
    update.mutate(patch, {
      onError: (cause) =>
        setError(
          cause instanceof ApiError && cause.code === JOB_ALERT_CITY_REQUIRED
            ? { kind: "city" }
            : { kind: "other", message: "Không lưu được cài đặt. Kiểm tra kết nối rồi thử lại." },
        ),
    });
  }

  const header = (
    <div>
      <h2 id={titleId} className="text-sm font-semibold text-text-strong">
        Báo tin việc làm phù hợp
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Hệ thống tự báo khi có tin mới phù hợp từ <span className="font-num tabular-nums">70%</span> trở lên với hồ sơ
        của bạn.
      </p>
    </div>
  );

  if (settings.isPending) {
    return (
      <Card as="section" id={JOB_ALERT_SETTINGS_ANCHOR} padding="md" className="grid scroll-mt-24 gap-5" aria-labelledby={titleId}>
        {header}
        <div className="grid animate-pulse gap-5" aria-busy="true" aria-label="Đang tải cài đặt">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center gap-4 border-t border-border-subtle pt-5">
              <span className="h-5 w-5 rounded bg-surface-page" />
              <span className="h-4 flex-1 rounded bg-surface-page" />
              <span className="h-6 w-11 rounded-full bg-surface-page" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (settings.isError) {
    return (
      <Card as="section" id={JOB_ALERT_SETTINGS_ANCHOR} padding="md" className="grid scroll-mt-24 gap-4" aria-labelledby={titleId}>
        {header}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <p className="text-sm text-text-body">Không tải được cài đặt báo tin. Bạn thử lại sau ít phút.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon="refresh-cw"
            loading={settings.isFetching}
            onClick={() => void settings.refetch()}
          >
            Thử lại
          </Button>
        </div>
      </Card>
    );
  }

  const { enabled, emailEnabled, sameCityOnly, cityName } = settings.data;
  const busy = update.isPending;

  let cityHint: ReactNode;
  if (error?.kind === "city") {
    cityHint = (
      <span className="text-red-600" role="alert">
        Hồ sơ của bạn chưa có thành phố. <CityLink /> trước rồi bật lại.
      </span>
    );
  } else if (cityName) {
    cityHint = (
      <>
        Thành phố trên hồ sơ: <span className="font-medium text-text-body">{cityName}</span>.
      </>
    );
  } else if (sameCityOnly) {
    // Đã bật rồi bỏ thành phố khỏi hồ sơ: backend không báo tin nào cho tới khi chọn lại.
    cityHint = (
      <>
        Hồ sơ chưa có thành phố nên hiện không có tin nào được báo. <CityLink />.
      </>
    );
  } else {
    cityHint = (
      <>
        Cần chọn thành phố trong hồ sơ trước khi bật. <CityLink />.
      </>
    );
  }

  return (
    <Card as="section" id={JOB_ALERT_SETTINGS_ANCHOR} padding="md" className="grid scroll-mt-24 gap-5" aria-labelledby={titleId}>
      {header}
      <SettingRow
        icon="briefcase"
        label="Báo khi có tin mới phù hợp"
        hint={
          <>
            Gộp thành một thông báo mỗi ngày. Danh sách đầy đủ ở{" "}
            <Link href="/recommended-jobs" className="text-brand-700 underline-offset-2 hover:underline">
              Việc làm phù hợp
            </Link>
            .
          </>
        }
        checked={enabled}
        disabled={busy}
        onToggle={() => save({ enabled: !enabled })}
      />
      <SettingRow
        icon="mail"
        label="Gửi email tổng hợp mỗi ngày"
        hint={
          enabled
            ? "Gửi lúc 8 giờ sáng các tin phù hợp mà bạn chưa ứng tuyển, tối đa 10 tin."
            : "Bật “Báo khi có tin mới phù hợp” để nhận email tổng hợp."
        }
        checked={emailEnabled}
        disabled={busy}
        dimmed={!enabled}
        onToggle={() => save({ emailEnabled: !emailEnabled })}
      />
      <SettingRow
        icon="map-pin"
        label="Chỉ tin ở thành phố của tôi"
        hint={cityHint}
        checked={sameCityOnly}
        disabled={busy}
        dimmed={!enabled}
        onToggle={() => save({ sameCityOnly: !sameCityOnly })}
      />
      {error?.kind === "other" ? (
        <p className="text-sm text-red-600" role="alert">
          {error.message}
        </p>
      ) : null}
    </Card>
  );
}

function CityLink() {
  return (
    <Link href={CITY_HREF} className="font-medium text-brand-700 underline-offset-2 hover:underline">
      Chọn thành phố
    </Link>
  );
}

function SettingRow({
  icon,
  label,
  hint,
  checked,
  disabled,
  dimmed = false,
  onToggle,
}: {
  icon: string;
  label: string;
  hint: ReactNode;
  checked: boolean;
  disabled: boolean;
  /** Không có tác dụng lúc này (công tắc đầu đang tắt): mờ đi nhưng vẫn bấm được. */
  dimmed?: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-4 border-t border-border-subtle pt-5">
      <Icon
        name={icon}
        size={20}
        className={`mt-0.5 shrink-0 ${dimmed ? "text-text-subtle" : "text-brand-600"}`}
      />
      <div className="min-w-0 flex-1">
        <p id={`${id}-label`} className={`text-sm font-medium ${dimmed ? "text-text-muted" : "text-text-strong"}`}>
          {label}
        </p>
        <p id={`${id}-hint`} className="mt-1 text-sm text-text-muted">
          {hint}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        disabled={disabled}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:cursor-wait ${
          checked ? (dimmed ? "bg-brand-300" : "bg-brand-600") : "bg-text-subtle"
        } ${dimmed ? "opacity-60" : ""}`}
      >
        <span
          aria-hidden
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
