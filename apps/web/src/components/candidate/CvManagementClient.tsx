"use client";

import { useCallback, useRef, useState } from "react";
import type { CandidateCvRecord, ImportFromCvRequest, ImportFromCvResponse } from "@sip/shared-types";
import {
  useCandidateProfile,
  useCvDelete,
  useCvExtract,
  useCvList,
  useCvProfileImport,
  useCvSetDefault,
  useCvUpload,
  type CandidateProfileSnapshot,
} from "@/hooks/useCvs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { ToastViewport, type ToastData } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CvExtractionPreview } from "./CvExtractionPreview";

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileIcon(fileName: string): string {
  if (fileName.toLowerCase().endsWith(".pdf")) return "file-text";
  if (/\.(jpe?g|png)$/i.test(fileName)) return "image";
  if (fileName.toLowerCase().endsWith(".docx") || fileName.toLowerCase().endsWith(".doc")) return "file";
  return "file";
}

// ─── Toast helper ──────────────────────────────────────────────────────────

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

// ─── CV Card ───────────────────────────────────────────────────────────────

interface CvCardProps {
  cv: CandidateCvRecord;
  onSetDefault: () => void;
  onDelete: () => void;
  onExtract: () => void;
  onToggleResult: () => void;
  isSettingDefault: boolean;
  isDeleting: boolean;
  isExtracting: boolean;
  isResultOpen: boolean;
  currentProfile: CandidateProfileSnapshot | null;
  onImport: (payload: ImportFromCvRequest) => Promise<ImportFromCvResponse>;
  isImporting: boolean;
}

// Badge theo extractionStatus (docs/05-frontend/phases/cv-ai-extraction-phase1/PLAN.md
// Quyết định #2). NOT_STARTED không có badge.
function ExtractionBadge({ cv, isExtracting }: { cv: CandidateCvRecord; isExtracting: boolean }) {
  if (cv.isBuilder) {
    return (
      <Badge tone="brand" icon="wand-2">
        CV Builder
      </Badge>
    );
  }

  if (isExtracting || cv.extractionStatus === "PROCESSING") {
    return (
      <Badge tone="info">
        <Icon name="loader-circle" size={13} className="animate-spin" />
        Đang phân tích
      </Badge>
    );
  }
  if (cv.extractionStatus === "DONE") {
    return (
      <Badge tone="brand" icon="sparkles">
        Đã phân tích
      </Badge>
    );
  }
  if (cv.extractionStatus === "FAILED") {
    return (
      <Badge tone="danger" icon="circle-alert">
        Phân tích thất bại
      </Badge>
    );
  }
  return null;
}

function CvCard({
  cv,
  onSetDefault,
  onDelete,
  onExtract,
  onToggleResult,
  isSettingDefault,
  isDeleting,
  isExtracting,
  isResultOpen,
  currentProfile,
  onImport,
  isImporting,
}: CvCardProps) {
  const busy = isExtracting || cv.extractionStatus === "PROCESSING";

  return (
    <Card padding="md" className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pine-50 text-pine-700">
            <Icon name={fileIcon(cv.fileName)} size={18} />
          </span>
          <div className="grid min-w-0 gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-text-strong">{cv.fileName}</span>
              {cv.isDefault ? (
                <Badge tone="success" icon="star">
                  Mặc định
                </Badge>
              ) : null}
              <ExtractionBadge cv={cv} isExtracting={isExtracting} />
            </div>
            <span className="text-xs text-text-muted">Tải lên: {formatDate(cv.uploadedAt)}</span>
            <a
              href={cv.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1 text-xs text-pine-700 hover:underline"
            >
              <Icon name="external-link" size={12} />
              Xem CV
            </a>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {cv.isBuilder && (
            <Button variant="primary" size="sm" icon="edit-3" as="a" href={`/cv/editor?cvId=${cv.id}`}>
              Chỉnh sửa
            </Button>
          )}
          {!cv.isBuilder && (
            <>
              <Button variant="secondary" size="sm" icon="sparkles" loading={busy} onClick={onExtract}>
                {cv.extractedData ? "Phân tích lại" : "Phân tích CV"}
              </Button>
              {cv.extractedData ? (
                <Button variant="ghost" size="sm" icon={isResultOpen ? "eye-off" : "eye"} onClick={onToggleResult}>
                  {isResultOpen ? "Ẩn kết quả" : "Xem kết quả"}
                </Button>
              ) : null}
            </>
          )}
          {!cv.isDefault ? (
            <Button
              variant="ghost"
              size="sm"
              icon="star"
              loading={isSettingDefault}
              onClick={onSetDefault}
            >
              Đặt mặc định
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            icon="trash-2"
            loading={isDeleting}
            onClick={onDelete}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            Xóa
          </Button>
        </div>
      </div>

      {isResultOpen && cv.extractedData ? (
        <div className="rounded-lg border border-border-subtle bg-surface-page p-4">
          {/* key theo extractedAt: phân tích lại thì bỏ hết lựa chọn cũ trên kết quả cũ. */}
          <CvExtractionPreview
            key={cv.extractedAt ?? "none"}
            data={cv.extractedData}
            extractedAt={cv.extractedAt}
            cvId={cv.id}
            currentProfile={currentProfile}
            onImport={onImport}
            isImporting={isImporting}
          />
        </div>
      ) : null}
    </Card>
  );
}

// ─── Upload Zone ───────────────────────────────────────────────────────────

interface UploadZoneProps {
  onFile: (file: File) => void;
  isUploading: boolean;
}

function UploadZone({ onFile, isUploading }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0]!;
    onFile(file);
  }

  return (
    <div
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
        dragging ? "border-pine-500 bg-pine-50" : "border-border-default bg-surface-page hover:border-pine-400"
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={isUploading}
      />
      {isUploading ? (
        <>
          <Icon name="loader-circle" size={36} className="animate-spin text-pine-600" />
          <p className="text-sm text-text-muted">Đang tải lên...</p>
        </>
      ) : (
        <>
          <Icon name="upload-cloud" size={36} className="text-text-muted" />
          <div>
            <p className="text-sm font-medium text-text-strong">Kéo thả hoặc click để chọn file</p>
            <p className="mt-1 text-xs text-text-muted">Chấp nhận PDF, DOC, DOCX, JPG, PNG — tối đa 5MB</p>
          </div>
          <Button variant="secondary" size="sm" icon="plus">
            Chọn file CV
          </Button>
        </>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function CvManagementClient() {
  const { data: cvs, isLoading, isError } = useCvList();
  const uploadMutation = useCvUpload();
  const setDefaultMutation = useCvSetDefault();
  const deleteMutation = useCvDelete();
  const extractMutation = useCvExtract();
  const importMutation = useCvProfileImport();
  const { data: currentProfile } = useCandidateProfile();
  const { toasts, push, dismiss } = useToast();

  // Track which cv is currently being set default / deleted
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cvToDelete, setCvToDelete] = useState<CandidateCvRecord | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [cvToReExtract, setCvToReExtract] = useState<CandidateCvRecord | null>(null);
  const [openResultId, setOpenResultId] = useState<string | null>(null);

  async function handleUpload(file: File) {
    try {
      await uploadMutation.mutateAsync(file);
      push("success", `CV "${file.name}" đã được tải lên thành công.`);
    } catch (err) {
      push("danger", err instanceof Error ? err.message : "Không thể tải lên CV. Vui lòng thử lại.");
    }
  }

  async function handleSetDefault(cvId: string) {
    setSettingDefaultId(cvId);
    try {
      await setDefaultMutation.mutateAsync(cvId);
      push("success", "Đã đặt CV mặc định thành công.");
    } catch (err) {
      push("danger", err instanceof Error ? err.message : "Không thể đặt CV mặc định.");
    } finally {
      setSettingDefaultId(null);
    }
  }

  // Đã có kết quả cũ → hỏi trước khi ghi đè (Quyết định #5); chưa có thì chạy luôn.
  function handleExtractClick(cv: CandidateCvRecord) {
    if (cv.extractedData) {
      setCvToReExtract(cv);
      return;
    }
    void runExtract(cv);
  }

  async function runExtract(cv: CandidateCvRecord) {
    setExtractingId(cv.id);
    try {
      const updated = await extractMutation.mutateAsync(cv.id);
      setOpenResultId(updated.id);
      if (updated.extractedData && !updated.extractedData.isValidCv) {
        push("danger", `"${cv.fileName}" có vẻ không phải là CV — xem chi tiết bên dưới.`);
      } else {
        push("success", `Đã phân tích xong CV "${cv.fileName}".`);
      }
    } catch (err) {
      // Gồm cả 429 hết lượt — hiện nguyên message backend trả về.
      push("danger", err instanceof Error ? err.message : "Không thể phân tích CV. Vui lòng thử lại.");
    } finally {
      setExtractingId(null);
    }
  }

  async function confirmReExtract() {
    if (!cvToReExtract) return;
    const cv = cvToReExtract;
    setCvToReExtract(null);
    await runExtract(cv);
  }

  async function handleImport(payload: ImportFromCvRequest): Promise<ImportFromCvResponse> {
    try {
      const result = await importMutation.mutateAsync(payload);
      push(
        "success",
        result.warnings.length > 0
          ? `Đã lưu vào hồ sơ, kèm ${result.warnings.length} lưu ý — xem chi tiết bên dưới.`
          : "Đã lưu thông tin từ CV vào hồ sơ.",
      );
      return result;
    } catch (err) {
      push("danger", err instanceof Error ? err.message : "Không thể lưu vào hồ sơ. Vui lòng thử lại.");
      throw err;
    }
  }

  function handleDeleteClick(cv: CandidateCvRecord) {
    setCvToDelete(cv);
  }

  async function confirmDelete() {
    if (!cvToDelete) return;
    setDeletingId(cvToDelete.id);
    try {
      await deleteMutation.mutateAsync(cvToDelete.id);
      push("success", `Đã xóa CV "${cvToDelete.fileName}".`);
      setCvToDelete(null);
    } catch (err) {
      push("danger", err instanceof Error ? err.message : "Không thể xóa CV.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <ToastViewport toasts={toasts} onDismiss={dismiss} />

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-strong">Quản lý CV</h1>
        <p className="mt-1 text-sm text-text-muted">
          Tải lên và quản lý CV của bạn. CV mặc định sẽ được dùng khi ứng tuyển.
        </p>
        <div className="mt-4 flex gap-3">
          <Button as="a" href="/cv/templates" icon="plus" variant="primary">
            Tạo CV
          </Button>
        </div>
      </div>

      {/* Upload Zone */}
      <UploadZone onFile={handleUpload} isUploading={uploadMutation.isPending} />

      {/* CV List */}
      <div className="mt-8">
        <h2 className="mb-4 text-base font-semibold text-text-strong">CV của tôi</h2>

        {isLoading ? (
          <Card padding="lg" className="flex items-center justify-center gap-2 text-text-muted">
            <Icon name="loader-circle" size={18} className="animate-spin" />
            <span className="text-sm">Đang tải...</span>
          </Card>
        ) : isError ? (
          <Card padding="lg" className="grid justify-items-center gap-2 text-center">
            <Icon name="circle-alert" size={32} className="text-red-500" />
            <p className="text-sm text-text-body">Không thể tải danh sách CV. Vui lòng thử lại.</p>
          </Card>
        ) : !cvs || cvs.length === 0 ? (
          <Card padding="lg" tone="sunken" className="grid justify-items-center gap-3 text-center">
            <Icon name="file-x" size={36} className="text-text-muted" />
            <div>
              <p className="font-medium text-text-strong">Chưa có CV nào</p>
              <p className="mt-1 text-sm text-text-muted">Tải lên CV đầu tiên của bạn ở trên.</p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3">
            {cvs.map((cv) => (
              <CvCard
                key={cv.id}
                cv={cv}
                onSetDefault={() => void handleSetDefault(cv.id)}
                onDelete={() => handleDeleteClick(cv)}
                onExtract={() => handleExtractClick(cv)}
                onToggleResult={() => setOpenResultId((current) => (current === cv.id ? null : cv.id))}
                isSettingDefault={settingDefaultId === cv.id}
                isDeleting={deletingId === cv.id}
                isExtracting={extractingId === cv.id}
                isResultOpen={openResultId === cv.id}
                currentProfile={currentProfile ?? null}
                onImport={handleImport}
                isImporting={importMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={cvToDelete !== null}
        title="Xóa CV"
        message={`Bạn có chắc chắn muốn xóa CV "${cvToDelete?.fileName}" không? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa CV"
        cancelLabel="Hủy"
        isDestructive={true}
        isConfirming={deleteMutation.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setCvToDelete(null)}
      />

      <ConfirmDialog
        isOpen={cvToReExtract !== null}
        title="Phân tích lại CV"
        message={`CV "${cvToReExtract?.fileName}" đã có kết quả phân tích. Phân tích lại sẽ thay thế kết quả cũ và tính thêm 1 lượt (tối đa 5 lượt/tuần). Tiếp tục?`}
        confirmLabel="Phân tích lại"
        cancelLabel="Hủy"
        onConfirm={() => void confirmReExtract()}
        onCancel={() => setCvToReExtract(null)}
      />
    </div>
  );
}
