"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { CreateJobPostRequest, JobPost, SubmitJobPostResponse } from "@sip/shared-types";
import { apiFetch, ApiError } from "@/lib/api-client";
import { JobPostForm, type JobPostFormAction } from "@/components/jobs/JobPostForm";
import { JobPostContent, JobPostHeaderCard } from "@/components/jobs/JobPostContent";
import { JobPostSubmitResult } from "@/components/jobs/JobPostSubmitResult";
import { EmployerJobQuotaNotice } from "@/components/jobs/EmployerJobQuotaNotice";
import { AutoOutreachDraftFields, type AutoOutreachDraftValues } from "@/components/employer/AutoOutreachDraftFields";
import { HIRING_TARGET_MAX, parseIntInRange, useUpdateJobAutoOutreach } from "@/hooks/useAutoOutreach";
import { useCompanySubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

type View = "form" | "preview" | "result";

/** Giá trị mặc định của backend cho tin mới (AD-23): tuyển 1 người, chưa bật tự mời. */
const AUTO_DEFAULTS = { hiringTarget: 1, enabled: false };

/**
 * Tạo tin tuyển dụng — 3 bước trong cùng một route (soạn → xem trước → kết
 * quả), khớp ảnh mẫu `Screenshot 2026-09-12 134041.png` và `134155.png`.
 * Bản nháp được lưu thật ở bước đầu tiên nên thoát giữa chừng không mất dữ liệu.
 */
export default function NewJobPostPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [view, setView] = useState<View>("form");
  const [draft, setDraft] = useState<JobPost | null>(null);
  const [result, setResult] = useState<SubmitJobPostResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AD-23 — "Số người cần tuyển" và công tắc tự mời; gói Dùng thử / chưa có gói thì ẩn công tắc.
  const { data: access } = useCompanySubscription();
  const autoAllowed = access?.mode === "SUBSCRIBED";
  const updateAuto = useUpdateJobAutoOutreach();
  const [auto, setAuto] = useState<AutoOutreachDraftValues>({
    hiringTarget: String(AUTO_DEFAULTS.hiringTarget),
    enabled: AUTO_DEFAULTS.enabled,
  });
  const [autoError, setAutoError] = useState<string | undefined>(undefined);
  /** Cài đặt đã lưu lên nháp — chỉ PATCH lại khi người dùng đổi. */
  const [savedAuto, setSavedAuto] = useState(AUTO_DEFAULTS);

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["employerJobPosts"] });
    await queryClient.invalidateQueries({ queryKey: ["employerJobPostStats"] });
    await queryClient.invalidateQueries({ queryKey: ["companySubscription"] });
  }

  /** Tạo mới ở lần lưu đầu, các lần sau PATCH lên chính bản nháp đó. */
  async function persist(dto: CreateJobPostRequest): Promise<JobPost> {
    const saved = draft
      ? await apiFetch<JobPost>("employer", `/employer/job-posts/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify(dto),
        })
      : await apiFetch<JobPost>("employer", "/employer/job-posts", { method: "POST", body: JSON.stringify(dto) });
    setDraft(saved);
    return saved;
  }

  /**
   * Lưu cài đặt tự mời lên nháp vừa lưu. Lỗi thì nháp vẫn còn: báo lỗi, dừng thao tác
   * để người dùng thử lại hoặc tắt tự mời (chỉnh lại được ở trang tin).
   */
  async function persistAuto(jobId: string, hiringTarget: number): Promise<boolean> {
    const enabled = autoAllowed && auto.enabled;
    if (hiringTarget === savedAuto.hiringTarget && enabled === savedAuto.enabled) return true;
    try {
      await updateAuto.mutateAsync({ jobId, patch: { hiringTarget, enabled } });
      setSavedAuto({ hiringTarget, enabled });
      return true;
    } catch (err) {
      const reason = err instanceof ApiError ? ` (${err.message})` : "";
      setError(`Đã lưu nháp nhưng chưa lưu được cài đặt tự mời${reason}. Thử lại, hoặc chỉnh lại ở trang tin sau khi tạo.`);
      return false;
    }
  }

  async function handleAction(dto: CreateJobPostRequest, action: JobPostFormAction) {
    setError(null);
    const hiringTarget = parseIntInRange(auto.hiringTarget, 1, HIRING_TARGET_MAX);
    if (hiringTarget === null) {
      setAutoError(`Nhập số nguyên từ 1 đến ${HIRING_TARGET_MAX}.`);
      return;
    }
    setAutoError(undefined);
    setSaving(true);
    try {
      const saved = await persist(dto);
      if (!(await persistAuto(saved.id, hiringTarget))) return;
      if (action === "preview") {
        setView("preview");
      } else if (action === "submit") {
        await submit(saved.id);
      } else {
        await invalidate();
        router.push(`/employer/jobs/${saved.id}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không lưu được tin tuyển dụng, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  }

  async function submit(id: string) {
    const submitted = await apiFetch<SubmitJobPostResponse>("employer", `/employer/job-posts/${id}/submit`, {
      method: "POST",
    });
    setResult(submitted);
    setView("result");
    await invalidate();
  }

  async function handleSubmitFromPreview() {
    if (!draft) return;
    setError(null);
    setSaving(true);
    try {
      await submit(draft.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không gửi duyệt được, vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  }

  if (view === "result" && result) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <JobPostSubmitResult result={result} />
      </div>
    );
  }

  if (view === "preview" && draft) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-6 py-12">
        <div className="flex items-start gap-3 rounded-xl border border-marigold-300 bg-marigold-100 px-4 py-3">
          <Icon name="triangle-alert" size={18} className="mt-0.5 shrink-0 text-marigold-700" />
          <p className="text-sm text-text-body">
            Vui lòng kiểm tra lại thông tin trước khi gửi duyệt. Sau khi gửi, tin sẽ được Admin kiểm duyệt trước khi
            công khai.
          </p>
        </div>

        <JobPostHeaderCard job={draft} />
        <JobPostContent job={draft} />

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle pt-4">
          <Button type="button" variant="secondary" icon="arrow-left" disabled={saving} onClick={() => setView("form")}>
            Quay lại chỉnh sửa
          </Button>
          <Button type="button" loading={saving} onClick={handleSubmitFromPreview}>
            Gửi duyệt
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5 px-6 py-12">
      <div className="grid gap-1">
        <Button as="a" href="/employer/jobs" variant="link" className="w-fit" icon="arrow-left">
          Quản lý tin tuyển dụng
        </Button>
        <h1 className="text-2xl font-semibold text-text-strong">Tạo tin tuyển dụng</h1>
      </div>

      <JobPostForm
        initial={draft ?? undefined}
        saving={saving}
        error={error}
        notice={<EmployerJobQuotaNotice />}
        beforeActions={
          <AutoOutreachDraftFields
            values={auto}
            error={autoError}
            autoAllowed={autoAllowed}
            disabled={saving}
            onChange={(next) => {
              setAuto(next);
              setAutoError(undefined);
            }}
          />
        }
        onAction={handleAction}
      />
    </div>
  );
}
