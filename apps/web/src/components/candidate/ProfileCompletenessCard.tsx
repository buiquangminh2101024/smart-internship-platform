"use client";

import Link from "next/link";
import type { ProfileCompleteness, ProfileCompletenessItem, ProfileCompletenessNextStep } from "@sip/shared-types";
import { useProfileCompleteness } from "@/hooks/useProfileCompleteness";
import {
  PROFILE_COMPLETENESS_GROUPS,
  PROFILE_COMPLETENESS_META,
  PROFILE_SECTION_ID,
  describeNextStep,
} from "@/lib/profile-completeness";
import { useCandidateAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

// Độ hoàn thiện hồ sơ (AD-26 mục 8) — docs/05-frontend/phases/job-discovery/PLAN.md bước F1, F3.
// "compact": đầu trang "Việc làm phù hợp", ẩn khi đủ 100% (và khi chưa tải được — không chặn
// danh sách). "full": trang /profile, luôn hiện, kèm tám mục chia ba nhóm.

export function CompletenessBar({ score, label = "Độ hoàn thiện hồ sơ" }: { score: number; label?: string }) {
  const value = Math.max(0, Math.min(100, score));
  return (
    <div
      className="h-2.5 overflow-hidden rounded-full bg-surface-page"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
    >
      <div className="h-full rounded-full bg-brand-600 transition-[width] duration-200" style={{ width: `${value}%` }} />
    </div>
  );
}

function NextStepText({ step }: { step: ProfileCompletenessNextStep }) {
  return (
    <p className="text-sm text-text-body">
      <span className="font-semibold text-text-strong">Nên làm trước:</span> {PROFILE_COMPLETENESS_META[step.key].action}{" "}
      — {describeNextStep(step)}
    </p>
  );
}

export function ProfileCompletenessCard({ variant }: { variant: "compact" | "full" }) {
  const user = useCandidateAuthStore((state) => state.user);
  const isLoggedIn = useCandidateAuthStore((state) => !!state.accessToken);
  const isCandidate = isLoggedIn && user?.role === "CANDIDATE";
  const { data, isPending, isError } = useProfileCompleteness(isCandidate);

  if (variant === "compact") {
    if (!data || data.score >= 100) return null;
    return <CompactCard data={data} />;
  }

  return (
    <Card id={PROFILE_SECTION_ID.completeness} padding="lg" className="grid scroll-mt-24 gap-5">
      {isError ? (
        <>
          <h2 className="text-xl font-semibold text-text-strong">Độ hoàn thiện hồ sơ</h2>
          <p className="text-sm text-text-muted">Không tải được độ hoàn thiện hồ sơ. Tải lại trang để thử lại.</p>
        </>
      ) : isPending || !data ? (
        <div className="grid animate-pulse gap-4" aria-busy="true" aria-label="Đang tải độ hoàn thiện hồ sơ">
          <span className="h-5 w-1/3 rounded bg-surface-page" />
          <span className="h-2.5 w-full rounded-full bg-surface-page" />
          <span className="h-16 w-full rounded-lg bg-surface-page" />
        </div>
      ) : (
        <FullBody data={data} />
      )}
    </Card>
  );
}

function CompactCard({ data }: { data: ProfileCompleteness }) {
  const step = data.nextStep;
  return (
    <Card padding="sm" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-text-strong">
          Hồ sơ hoàn thiện <span className="font-num tabular-nums">{data.score}%</span>
        </p>
        <Link
          href={`/profile#${PROFILE_SECTION_ID.completeness}`}
          className="text-[13px] text-brand-700 hover:underline"
        >
          Xem các mục còn thiếu
        </Link>
      </div>
      <CompletenessBar score={data.score} />
      {step ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <NextStepText step={step} />
          </div>
          <Button as="a" href={PROFILE_COMPLETENESS_META[step.key].href} variant="secondary" size="sm" iconAfter="arrow-right">
            {PROFILE_COMPLETENESS_META[step.key].cta}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function FullBody({ data }: { data: ProfileCompleteness }) {
  const complete = data.score >= 100 || data.nextStep === null;
  const groups = PROFILE_COMPLETENESS_GROUPS.map(({ group, title }) => ({
    title,
    items: data.items.filter((item) => item.group === group),
  })).filter((group) => group.items.length > 0);

  const list = (
    <div className="grid gap-5 sm:grid-cols-2">
      {groups.map((group) => (
        <div key={group.title} className={`grid content-start gap-2 ${group.items.length > 2 ? "sm:row-span-2" : ""}`}>
          <h3 className="text-sm font-semibold text-text-strong">{group.title}</h3>
          <ul className="grid gap-3">
            {group.items.map((item) => (
              <CompletenessRow key={item.key} item={item} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold text-text-strong">Độ hoàn thiện hồ sơ</h2>
          <span className="font-num text-xl font-bold text-text-strong tabular-nums">{data.score}%</span>
        </div>
        <CompletenessBar score={data.score} />
        <p className="text-sm text-text-muted">
          {complete
            ? "Hồ sơ đã có đủ cả tám mục."
            : "Tám mục giúp hệ thống gợi ý việc làm sát với bạn và giúp nhà tuyển dụng tìm thấy bạn."}
        </p>
      </div>

      {data.nextStep ? (
        <Card tone="brand" padding="sm" className="grid gap-3">
          <NextStepText step={data.nextStep} />
          <Button
            as="a"
            href={PROFILE_COMPLETENESS_META[data.nextStep.key].href}
            size="sm"
            iconAfter="arrow-right"
            className="w-fit"
          >
            {PROFILE_COMPLETENESS_META[data.nextStep.key].cta}
          </Button>
        </Card>
      ) : null}

      {complete ? (
        <details>
          <summary className="cursor-pointer text-sm text-text-muted hover:text-text-strong">Xem tám mục</summary>
          <div className="mt-4">{list}</div>
        </details>
      ) : (
        list
      )}
    </>
  );
}

function CompletenessRow({ item }: { item: ProfileCompletenessItem }) {
  const meta = PROFILE_COMPLETENESS_META[item.key];
  return (
    <li className="flex items-start gap-2.5">
      {item.done ? (
        <Icon name="circle-check" size={18} className="mt-px shrink-0 text-success-600" title="Đã có" />
      ) : (
        <Icon name="circle-dashed" size={18} className="mt-px shrink-0 text-text-subtle" title="Còn thiếu" />
      )}
      <div className="grid min-w-0 gap-0.5">
        <span className={`text-sm ${item.done ? "text-text-body" : "font-medium text-text-strong"}`}>
          {meta.label}
          {item.done ? <span className="sr-only"> — đã có</span> : null}
        </span>
        {item.done ? null : (
          <>
            <span className="text-[13px] text-text-muted">{meta.benefit}</span>
            <Link href={meta.href} className="w-fit text-[13px] text-brand-700 hover:underline">
              {meta.cta}
            </Link>
          </>
        )}
      </div>
    </li>
  );
}
