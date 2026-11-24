"use client";

import { useId, useState } from "react";
import type { CandidateOutreachInvitationDto } from "@sip/shared-types";
import { useCvList } from "@/hooks/useCvs";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Textarea } from "@/components/ui/Textarea";

// "Nhận lời & ứng tuyển" (AD-28, docs/05-frontend/phases/invitation-apply/PLAN.md F2).
// Dùng cho cả nhận lời mời đang chờ và "Ứng tuyển ngay" từ lời mời đã nhận theo kiểu cũ.
// Chỉ chọn CV đã lưu (Q3); đơn vào thẳng "Đang xem xét" và không huỷ được (Q1, Q4).

export interface AcceptInvitationInput {
  cvId: string;
  coverLetter?: string;
}

export function AcceptInvitationDialog({
  invitation,
  mode,
  submitting,
  onSubmit,
  onClose,
}: {
  /** null ⇒ hộp thoại đóng. */
  invitation: CandidateOutreachInvitationDto | null;
  /** accept = lời mời đang chờ; apply = lời mời đã nhận, chưa có đơn. */
  mode: "accept" | "apply";
  submitting: boolean;
  onSubmit: (input: AcceptInvitationInput) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const noteId = useId();
  const open = invitation !== null;
  const { data: cvs, isLoading, isError } = useCvList();
  // Trạng thái form sống theo một lần mở: người gọi đặt `key` theo lời mời nên mở lại là form mới.
  const [picked, setPicked] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  // Chưa chọn ⇒ CV mặc định, không có thì CV đầu (cùng cách trang /jobs/[id]/apply).
  const cvId = picked || (cvs?.find((cv) => cv.isDefault) ?? cvs?.[0])?.id || "";

  const hasCvs = !!cvs && cvs.length > 0;
  const confirmLabel = mode === "accept" ? "Nhận lời & ứng tuyển" : "Ứng tuyển ngay";

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!cvId || submitting) return;
    const trimmed = coverLetter.trim();
    onSubmit({ cvId, ...(trimmed ? { coverLetter: trimmed } : {}) });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      {...(hasCvs ? { describedBy: noteId } : {})}
      busy={submitting}
      fullScreenOnMobile
    >
      {invitation ? (
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader
            titleId={titleId}
            title={invitation.jobPost.title}
            subtitle={invitation.company.name}
            onClose={onClose}
            closeDisabled={submitting}
          />
          <DialogBody>
            {isLoading ? (
              <p className="flex items-center gap-2 text-text-muted">
                <Icon name="loader-circle" size={16} className="animate-spin" />
                Đang tải danh sách CV
              </p>
            ) : isError ? (
              <p className="text-red-600">Không tải được danh sách CV. Bạn đóng hộp thoại và thử lại.</p>
            ) : !hasCvs ? (
              <div className="grid justify-items-start gap-3">
                <p className="text-text-body">Bạn cần có ít nhất một CV để nhận lời. Tạo hoặc tải CV lên rồi quay lại đây.</p>
                <Button as="a" href="/cv" variant="secondary" size="sm" iconAfter="arrow-right">
                  Đến trang CV
                </Button>
              </div>
            ) : (
              <>
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-sm font-medium text-text-strong">Chọn CV gửi nhà tuyển dụng</legend>
                  {cvs.map((cv) => {
                    const checked = cvId === cv.id;
                    return (
                      <label
                        key={cv.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors duration-150 ${
                          checked ? "border-brand-600 bg-brand-50" : "border-border-default hover:bg-surface-hover"
                        }`}
                      >
                        <input
                          type="radio"
                          name="invitation-cv"
                          value={cv.id}
                          checked={checked}
                          onChange={() => setPicked(cv.id)}
                          className="accent-brand-600"
                        />
                        <span className="min-w-0 flex-1 truncate text-text-body">{cv.fileName}</span>
                        {cv.isDefault ? (
                          <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                            Mặc định
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </fieldset>
                <Textarea
                  label="Thư giới thiệu (không bắt buộc)"
                  placeholder="Vài dòng giới thiệu ngắn về bạn"
                  value={coverLetter}
                  onChange={(event) => setCoverLetter(event.target.value)}
                  maxLength={2000}
                  rows={4}
                />
                <p id={noteId} className="flex items-start gap-2 rounded-lg bg-surface-page p-3 text-text-body">
                  <Icon name="info" size={16} className="mt-0.5 shrink-0 text-brand-700" />
                  <span>
                    Hồ sơ của bạn sẽ được gửi thẳng tới nhà tuyển dụng ở trạng thái <strong>Đang xem xét</strong> và không
                    thể huỷ.
                  </span>
                </p>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Để sau
            </Button>
            {hasCvs ? (
              <Button type="submit" loading={submitting} disabled={!cvId || submitting}>
                {confirmLabel}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      ) : null}
    </Dialog>
  );
}
