"use client";

import { useCallback, useState } from "react";
import type { ProfileInsight, ProfileInsightSuggestion, ProfileInsightSuggestionKind } from "@sip/shared-types";
import { useCandidateProfileInsight, useGenerateProfileInsight } from "@/hooks/useCandidateProfileInsight";
import { ApiError } from "@/lib/api-client";
import { useCandidateAuthStore } from "@/stores/auth-store";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";

// "Phân tích hồ sơ" (A1 + A4, AD-14) — docs/05-frontend/phases/candidate-insights/PLAN.md.
// Không tự gọi LLM khi vào trang: chỉ đọc kết quả cũ; nút mới gọi POST (tốn hạn mức).
// Mọi lỗi chỉ hiện cục bộ trong khung này, không chặn phần còn lại của trang hồ sơ.

// ─── Toast helper (cùng khuôn SavedJobsClient) ─────────────────────────────

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

// ─── Hiển thị ──────────────────────────────────────────────────────────────

const SUGGESTION_GROUPS: Array<{ kind: ProfileInsightSuggestionKind; title: string; hint?: string }> = [
  { kind: "WRITING", title: "Gợi ý cải thiện cách viết" },
  { kind: "SKILL_GAP", title: "Kỹ năng nên bổ sung", hint: "Dựa trên các tin phù hợp gần đây" },
  { kind: "INDUSTRY_MISMATCH", title: "Có thể bạn muốn cân nhắc" },
];

const EVIDENCE_PREVIEW = 3;

function formatGeneratedAt(iso: string): string {
  const diffMinutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMinutes < 1) return "vừa xong";
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}

function EvidenceList({ evidence }: { evidence: string[] }) {
  const shown = evidence.slice(0, EVIDENCE_PREVIEW);
  const rest = evidence.length - shown.length;
  return (
    <ul className="mt-1 grid gap-0.5 text-xs text-text-muted">
      {shown.map((entry) => (
        <li key={entry}>– {entry}</li>
      ))}
      {rest > 0 ? <li>và {rest} tin khác</li> : null}
    </ul>
  );
}

function SuggestionItem({ suggestion }: { suggestion: ProfileInsightSuggestion }) {
  const evidence = suggestion.evidence ?? [];
  return (
    <li className="text-sm text-text-body">
      <span>{suggestion.text}</span>
      {evidence.length === 0 ? null : suggestion.kind === "INDUSTRY_MISMATCH" ? (
        // INDUSTRY_MISMATCH luôn phải kèm bằng chứng cụ thể — hiện thẳng, không giấu.
        <EvidenceList evidence={evidence} />
      ) : (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-text-muted hover:text-text-strong">Xem tin liên quan</summary>
          <EvidenceList evidence={evidence} />
        </details>
      )}
    </li>
  );
}

function BulletGroup({ title, hint, children }: { title: string; hint?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <div>
        <h3 className="text-sm font-semibold text-text-strong">{title}</h3>
        {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
      </div>
      <ul className="grid list-disc gap-2 pl-5 marker:text-text-subtle">{children}</ul>
    </div>
  );
}

function CompletenessBar({ score }: { score: number }) {
  const value = Math.max(0, Math.min(100, score));
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-text-strong">Độ hoàn thiện hồ sơ</span>
        <span className="text-sm font-semibold text-text-strong">{value}%</span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-surface-page"
        role="progressbar"
        aria-label="Độ hoàn thiện hồ sơ"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function InsightResult({ insight }: { insight: ProfileInsight }) {
  const hasAnyText = insight.strengths.length > 0 || insight.suggestions.length > 0;
  return (
    <div className="grid gap-6">
      <CompletenessBar score={insight.completenessScore} />

      {insight.strengths.length > 0 ? (
        <BulletGroup title="Điểm mạnh">
          {insight.strengths.map((strength) => (
            <li key={strength} className="text-sm text-text-body">
              {strength}
            </li>
          ))}
        </BulletGroup>
      ) : null}

      {SUGGESTION_GROUPS.map((group) => {
        const items = insight.suggestions.filter((suggestion) => suggestion.kind === group.kind);
        if (items.length === 0) return null;
        return (
          <BulletGroup key={group.kind} title={group.title} hint={group.hint}>
            {items.map((suggestion) => (
              <SuggestionItem key={suggestion.text} suggestion={suggestion} />
            ))}
          </BulletGroup>
        );
      })}

      {hasAnyText ? null : (
        <p className="text-sm text-text-muted">
          Hồ sơ chưa có đủ nội dung để nhận xét — hãy bổ sung giới thiệu bản thân, kỹ năng, kinh nghiệm hoặc dự án rồi
          phân tích lại.
        </p>
      )}
    </div>
  );
}

function InsightSkeleton() {
  return (
    <div className="grid animate-pulse gap-4" aria-busy="true" aria-label="Đang tải phân tích hồ sơ">
      <span className="h-3 w-1/3 rounded bg-surface-page" />
      <span className="h-2.5 w-full rounded-full bg-surface-page" />
      <span className="h-3 w-2/3 rounded bg-surface-page" />
      <span className="h-3 w-1/2 rounded bg-surface-page" />
    </div>
  );
}

// ─── Component chính ───────────────────────────────────────────────────────

export function ProfileInsightCard() {
  const user = useCandidateAuthStore((state) => state.user);
  const isLoggedIn = useCandidateAuthStore((state) => !!state.accessToken);
  const isCandidate = isLoggedIn && user?.role === "CANDIDATE";

  const { data: insight, isPending, isError } = useCandidateProfileInsight(isCandidate);
  const generate = useGenerateProfileInsight();
  const { toasts, push, dismiss } = useToast();
  // 429 hiện cố định trong khung (kết quả cũ vẫn giữ), không dùng toast tự tắt.
  const [quotaMessage, setQuotaMessage] = useState("");

  function handleGenerate() {
    setQuotaMessage("");
    generate.mutate(undefined, {
      onSuccess: () => push("success", "Đã cập nhật phân tích hồ sơ."),
      onError: (error) => {
        if (error instanceof ApiError && error.status === 429) {
          setQuotaMessage(error.message);
          return;
        }
        push("danger", error instanceof Error ? error.message : "Chưa phân tích được hồ sơ, vui lòng thử lại sau.");
      },
    });
  }

  const hasResult = !!insight;
  const button = (
    <Button
      type="button"
      variant={hasResult ? "secondary" : "primary"}
      icon={hasResult ? "refresh-cw" : "sparkles"}
      loading={generate.isPending}
      onClick={handleGenerate}
    >
      {generate.isPending ? "Đang phân tích..." : hasResult ? "Phân tích lại" : "Phân tích hồ sơ"}
    </Button>
  );

  return (
    <Card className="grid gap-5" padding="lg">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-text-strong">Phân tích hồ sơ</h2>
          <Badge tone="brand" icon="sparkles">
            AI
          </Badge>
        </div>
        <p className="mt-1 text-sm text-text-muted">
          Nhận xét điểm mạnh, cách viết hồ sơ và kỹ năng thường gặp ở các tin tuyển dụng phù hợp với bạn.
        </p>
      </div>

      {quotaMessage ? (
        <Card tone="warning" padding="sm" className="flex items-start gap-2">
          <Icon name="circle-alert" size={18} className="mt-0.5 shrink-0 text-marigold-700" />
          <p className="text-sm text-text-strong">{quotaMessage}</p>
        </Card>
      ) : null}

      {isCandidate && isPending ? (
        <InsightSkeleton />
      ) : isError ? (
        <div className="grid gap-4">
          <p className="text-sm text-text-muted">Không tải được kết quả phân tích trước đó. Bạn vẫn có thể phân tích lại.</p>
          <div>{button}</div>
        </div>
      ) : !insight ? (
        <div className="grid gap-4">
          <p className="text-sm text-text-body">
            Bạn chưa phân tích hồ sơ lần nào. Bấm nút bên dưới để AI đọc hồ sơ và gợi ý những điểm có thể cải thiện.
          </p>
          <div>{button}</div>
        </div>
      ) : (
        <>
          <InsightResult insight={insight} />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
            <p className="text-xs text-text-muted">
              Phân tích lần cuối: {formatGeneratedAt(insight.generatedAt)}
              {insight.basedOnJobCount > 0 ? ` · dựa trên ${insight.basedOnJobCount} tin tuyển dụng phù hợp` : ""}
            </p>
            {button}
          </div>
        </>
      )}

      <p className="text-xs text-text-subtle">Gợi ý mang tính tham khảo, không phải lời khuyên nghề nghiệp.</p>

      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </Card>
  );
}
