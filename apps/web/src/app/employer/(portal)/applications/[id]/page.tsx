"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEmployerApplication, useUpdateApplicationStatus, useUpdateApplicationEvaluation } from "@/hooks/useApplications";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { ApplicationStatus } from "@sip/shared-types";

export default function EmployerApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const { data: application, isLoading, isError } = useEmployerApplication(id);
  const statusMutation = useUpdateApplicationStatus();
  const evaluationMutation = useUpdateApplicationEvaluation();

  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState<number>(0);
  const [isEditingEval, setIsEditingEval] = useState(false);

  const handleStatusChange = async (newStatus: ApplicationStatus) => {
    try {
      await statusMutation.mutateAsync({ id, data: { status: newStatus } });
      alert("Cập nhật trạng thái thành công!");
    } catch (err: any) {
      alert(err.message || "Không thể cập nhật trạng thái");
    }
  };

  const handleSaveEvaluation = async () => {
    try {
      await evaluationMutation.mutateAsync({ 
        id, 
        data: { 
          employerNotes: notes || null, 
          rating: rating || null 
        } 
      });
      setIsEditingEval(false);
      alert("Đã lưu đánh giá nội bộ.");
    } catch (err: any) {
      alert(err.message || "Lỗi lưu đánh giá.");
    }
  };

  if (isLoading) return <div className="p-10">Đang tải...</div>;
  if (isError || !application) return <div className="p-10">Lỗi không tìm thấy ứng viên.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="secondary" onClick={() => router.back()}>Quay lại danh sách</Button>
        <h1 className="text-2xl font-bold">Chi tiết ứng viên</h1>
        <Badge tone={
          application.status === "ACCEPTED" ? "success" :
          application.status === "REJECTED" || application.status === "CANCELLED" ? "danger" :
          application.status === "PENDING" ? "warning" : "info"
        }>{application.status}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card padding="lg">
            <h2 className="text-xl font-bold mb-4">Thông tin hồ sơ</h2>
            <div className="mb-4">
              <span className="text-gray-600 font-medium mr-2">Tên:</span>
              <span>{application.candidate?.user?.email}</span>
            </div>
            
            <div className="mb-6">
              <h3 className="font-semibold text-gray-700 mb-2">Thư xin việc:</h3>
              <div className="bg-gray-50 p-4 rounded whitespace-pre-wrap">
                {application.coverLetter || "Không có thư xin việc"}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-gray-700 mb-2">CV Đính kèm:</h3>
              <div className="flex items-center gap-4 p-4 border rounded">
                <span className="font-medium">{application.cv?.fileName}</span>
                <a href={application.cv?.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm border rounded px-3 py-1 hover:bg-gray-50">
                  Xem PDF
                </a>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card padding="md">
            <h3 className="font-bold mb-4">Chuyển trạng thái</h3>
            <div className="grid grid-cols-1 gap-2">
              <Button disabled={application.status === "REVIEWING"} variant="secondary" onClick={() => handleStatusChange("REVIEWING")}>Đang xem xét</Button>
              <Button disabled={application.status === "SHORTLISTED"} variant="secondary" onClick={() => handleStatusChange("SHORTLISTED")}>Lọt vào vòng trong</Button>
              <Button disabled={application.status === "INTERVIEWING"} variant="secondary" onClick={() => handleStatusChange("INTERVIEWING")}>Phỏng vấn</Button>
              <Button disabled={application.status === "ACCEPTED"} variant="primary" onClick={() => handleStatusChange("ACCEPTED")}>Nhận (Accepted)</Button>
              <Button disabled={application.status === "REJECTED"} variant="danger" onClick={() => handleStatusChange("REJECTED")}>Từ chối (Rejected)</Button>
            </div>
          </Card>

          <Card padding="md">
            <h3 className="font-bold mb-4">Đánh giá nội bộ</h3>
            {!isEditingEval ? (
              <div className="space-y-4">
                <div>
                  <span className="text-gray-600 text-sm font-semibold block mb-1">Đánh giá (1-5):</span>
                  <span>{application.rating || "Chưa đánh giá"}</span>
                </div>
                <div>
                  <span className="text-gray-600 text-sm font-semibold block mb-1">Ghi chú:</span>
                  <p className="whitespace-pre-wrap text-sm">{application.employerNotes || "Không có ghi chú."}</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => {
                  setNotes(application.employerNotes || "");
                  setRating(application.rating || 0);
                  setIsEditingEval(true);
                }}>Chỉnh sửa</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-1">Điểm đánh giá (1-5)</label>
                  <input type="number" min="1" max="5" value={rating || ""} onChange={e => setRating(parseInt(e.target.value))} className="border rounded px-2 py-1 w-full" />
                </div>
                <div>
                  <label className="block text-sm mb-1">Ghi chú (chỉ nội bộ công ty xem)</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} className="border rounded px-2 py-1 w-full h-24" />
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={handleSaveEvaluation}>Lưu</Button>
                  <Button variant="secondary" size="sm" onClick={() => setIsEditingEval(false)}>Hủy</Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
