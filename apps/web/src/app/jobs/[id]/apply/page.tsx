"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApplyJob } from "@/hooks/useApplications";
import { useCvList } from "@/hooks/useCvs";
import { apiUpload } from "@/lib/api-client";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function ApplyJobPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const { data: cvs, isLoading } = useCvList();
  const applyMutation = useApplyJob();

  const [selectedCvId, setSelectedCvId] = useState<string>("");
  const [localCvFile, setLocalCvFile] = useState<File | null>(null);
  const [saveToCvManager, setSaveToCvManager] = useState<boolean>(true);
  const [coverLetter, setCoverLetter] = useState<string>("");
  const [isUploadingCv, setIsUploadingCv] = useState(false);
  
  const [dialog, setDialog] = useState<{ isOpen: boolean; title: string; message: string; type: "success" | "error" | "info"; onConfirm?: () => void }>({ isOpen: false, title: "", message: "", type: "info" });

  // Tự động chọn CV mặc định khi danh sách CV tải xong
  useEffect(() => {
    if (!cvs || cvs.length === 0) return;
    if (selectedCvId) return; // Không ghi đè nếu người dùng đã chọn
    const defaultCv = cvs.find((cv) => cv.isDefault) ?? cvs[0];
    if (defaultCv) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedCvId(defaultCv.id);
    }
  }, [cvs, selectedCvId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCvId && !localCvFile) {
      setDialog({ isOpen: true, title: "Lỗi", message: "Vui lòng chọn hoặc tải lên CV.", type: "error" });
      return;
    }
    try {
      let finalCvId = selectedCvId;
      if (localCvFile && !selectedCvId) {
        setIsUploadingCv(true);
        const formData = new FormData();
        formData.append("file", localCvFile);
        formData.append("isHidden", (!saveToCvManager).toString());
        const res = await apiUpload<{ id: string }>("candidate", "/candidates/me/cvs", formData, "POST");
        finalCvId = res.id;
        setIsUploadingCv(false);
      }

      await applyMutation.mutateAsync({
        jobPostId: jobId,
        cvId: finalCvId,
        ...(coverLetter ? { coverLetter } : {}),
      });
      setDialog({ 
        isOpen: true, 
        title: "Thành công", 
        message: "Ứng tuyển thành công!", 
        type: "success",
        onConfirm: () => router.push("/applications")
      });
    } catch (err: unknown) {
      setIsUploadingCv(false);
      const message = err instanceof Error ? err.message : "Có lỗi xảy ra khi ứng tuyển.";
      setDialog({ isOpen: true, title: "Lỗi", message, type: "error" });
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <CandidateHomeHeader />

      <main className="mx-auto grid w-full max-w-3xl flex-1 gap-4 px-6 py-10">
        <h1 className="text-2xl font-bold">Nộp đơn ứng tuyển</h1>

        <Card padding="lg">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">Chọn CV của bạn</label>
              {isLoading ? (
                <p>Đang tải danh sách CV...</p>
              ) : (
                <div className="space-y-4">
                  {cvs && cvs.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-text-muted">CV đã lưu</p>
                      {cvs.map(cv => (
                        <label
                          key={cv.id}
                          className={`flex items-center gap-3 p-3 border rounded cursor-pointer transition-colors ${
                            selectedCvId === cv.id && !localCvFile
                              ? "border-pine-600 bg-pine-50"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="cv"
                            value={cv.id}
                            checked={selectedCvId === cv.id && !localCvFile}
                            onChange={() => {
                              setSelectedCvId(cv.id);
                              setLocalCvFile(null);
                            }}
                          />
                          <span className="flex-1">{cv.fileName}</span>
                          {cv.isDefault && (
                            <span className="text-xs text-pine-700 font-medium bg-pine-100 px-2 py-0.5 rounded-full">
                              Mặc định
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-text-muted">Tải CV từ máy</p>
                    <div className={`border rounded transition-colors ${
                      localCvFile
                        ? "border-pine-600 bg-pine-50"
                        : "hover:bg-gray-50"
                    }`}>
                      <label className="flex items-center gap-3 p-3 cursor-pointer w-full">
                        <input
                          type="radio"
                          name="cv"
                          value="local"
                          checked={!!localCvFile}
                          onChange={() => {
                            setSelectedCvId("");
                            // Click input file
                            document.getElementById("local-cv-upload")?.click();
                          }}
                        />
                        <span className="flex-1">
                          {localCvFile ? localCvFile.name : "Tải lên tệp PDF, DOCX, JPG hoặc PNG (Tối đa 5MB)"}
                        </span>
                        <input
                          id="local-cv-upload"
                          type="file"
                          className="hidden"
                          accept="application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 5 * 1024 * 1024) {
                                setDialog({ isOpen: true, title: "Lỗi", message: "Dung lượng tối đa 5MB", type: "error" });
                                return;
                              }
                              setLocalCvFile(file);
                              setSelectedCvId("");
                            }
                          }}
                        />
                      </label>
                      {localCvFile && (
                        <label className="flex items-center gap-2 p-3 pt-0 border-t border-pine-200 cursor-pointer w-full mt-2">
                          <input 
                            type="checkbox" 
                            checked={saveToCvManager} 
                            onChange={(e) => setSaveToCvManager(e.target.checked)} 
                            className="rounded border-gray-300 text-pine-600 focus:ring-pine-600"
                          />
                          <span className="text-sm text-text-muted">
                            Lưu CV này vào danh sách Quản lý CV để sử dụng cho các lần sau
                          </span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Thư xin việc (Tùy chọn)</label>
              <textarea
                className="w-full border rounded p-3 min-h-[150px]"
                placeholder="Viết thư xin việc ngắn gọn..."
                value={coverLetter}
                onChange={e => setCoverLetter(e.target.value)}
                maxLength={2000}
              />
            </div>

            <div className="flex justify-end gap-4">
              <Button type="button" variant="secondary" onClick={() => router.back()}>Hủy</Button>
              <Button type="submit" disabled={(!selectedCvId && !localCvFile) || applyMutation.isPending || isUploadingCv}>
                {applyMutation.isPending || isUploadingCv ? "Đang gửi..." : "Nộp đơn"}
              </Button>
            </div>
          </form>
        </Card>
      </main>

      <ConfirmDialog
        isOpen={dialog.isOpen}
        title={dialog.title}
        message={dialog.message}
        isDestructive={dialog.type === "error"}
        hideCancel
        onConfirm={() => {
          setDialog(prev => ({ ...prev, isOpen: false }));
          dialog.onConfirm?.();
        }}
        onCancel={() => setDialog(prev => ({ ...prev, isOpen: false }))}
      />
      <SiteFooter />
    </div>
  );
}

