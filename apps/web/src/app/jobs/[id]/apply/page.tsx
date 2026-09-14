"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApplyJob } from "@/hooks/useApplications";
import { useCvList } from "@/hooks/useCvs";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function ApplyJobPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const { data: cvs, isLoading } = useCvList();
  const applyMutation = useApplyJob();

  const [selectedCvId, setSelectedCvId] = useState<string>("");
  const [coverLetter, setCoverLetter] = useState<string>("");

  // Tự động chọn CV mặc định khi danh sách CV tải xong
  useEffect(() => {
    if (!cvs || cvs.length === 0) return;
    if (selectedCvId) return; // Không ghi đè nếu người dùng đã chọn
    const defaultCv = cvs.find((cv) => cv.isDefault) ?? cvs[0];
    if (defaultCv) setSelectedCvId(defaultCv.id);
  }, [cvs, selectedCvId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCvId) {
      alert("Vui lòng chọn CV.");
      return;
    }
    try {
      await applyMutation.mutateAsync({
        jobPostId: jobId,
        cvId: selectedCvId,
        ...(coverLetter ? { coverLetter } : {}),
      });
      alert("Ứng tuyển thành công!");
      router.push("/applications");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Có lỗi xảy ra khi ứng tuyển.";
      alert(message);
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
              ) : !cvs || cvs.length === 0 ? (
                <div className="p-4 bg-yellow-50 text-yellow-800 rounded">
                  Bạn chưa có CV nào. Vui lòng tải CV lên trước khi ứng tuyển.
                  <div className="mt-2">
                    <Button as="a" href="/cv" variant="secondary" size="sm">Đi tới Quản lý CV</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {cvs.map(cv => (
                    <label
                      key={cv.id}
                      className={`flex items-center gap-3 p-3 border rounded cursor-pointer transition-colors ${
                        selectedCvId === cv.id
                          ? "border-pine-600 bg-pine-50"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="cv"
                        value={cv.id}
                        checked={selectedCvId === cv.id}
                        onChange={() => setSelectedCvId(cv.id)}
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
              <Button type="submit" disabled={!selectedCvId || applyMutation.isPending}>
                {applyMutation.isPending ? "Đang gửi..." : "Nộp đơn"}
              </Button>
            </div>
          </form>
        </Card>
      </main>

      <SiteFooter />
    </div>
  );
}

