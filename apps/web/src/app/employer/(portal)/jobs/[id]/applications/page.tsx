"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEmployerJobApplications } from "@/hooks/useApplications";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { ApplicationStatus } from "@sip/shared-types";

export default function EmployerJobApplicationsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "">("");
  
  const { data: applications, isLoading, isError } = useEmployerJobApplications(jobId, statusFilter ? statusFilter : undefined);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Danh sách ứng viên</h1>
        <Button variant="secondary" onClick={() => router.back()}>Quay lại tin tuyển dụng</Button>
      </div>

      <Card padding="md" className="flex items-center gap-4">
        <span className="text-sm font-medium">Lọc theo trạng thái:</span>
        <select 
          className="border rounded p-2"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
        >
          <option value="">Tất cả</option>
          <option value="PENDING">Chờ xử lý (PENDING)</option>
          <option value="REVIEWING">Đang xem xét (REVIEWING)</option>
          <option value="SHORTLISTED">Lọt vào vòng trong (SHORTLISTED)</option>
          <option value="INTERVIEWING">Phỏng vấn (INTERVIEWING)</option>
          <option value="ACCEPTED">Đã nhận (ACCEPTED)</option>
          <option value="REJECTED">Từ chối (REJECTED)</option>
          <option value="CANCELLED">Đã hủy (CANCELLED)</option>
        </select>
      </Card>

      {isLoading ? (
        <p>Đang tải...</p>
      ) : isError ? (
        <p>Có lỗi xảy ra khi tải danh sách ứng viên.</p>
      ) : !applications || applications.length === 0 ? (
        <Card padding="lg">
          <p>Chưa có ứng viên nào.</p>
        </Card>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 font-medium">Ứng viên</th>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Ngày nộp</th>
                <th className="p-4 font-medium">Trạng thái</th>
                <th className="p-4 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {applications.map(app => (
                <tr key={app.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-4 font-medium">{app.candidate?.user?.email || "N/A"}</td>
                  <td className="p-4 text-gray-600">{app.candidate?.user?.email || "N/A"}</td>
                  <td className="p-4 text-gray-600">{new Date(app.createdAt).toLocaleDateString()}</td>
                  <td className="p-4">
                    <Badge tone={
                      app.status === "ACCEPTED" ? "success" :
                      app.status === "REJECTED" || app.status === "CANCELLED" ? "danger" :
                      app.status === "PENDING" ? "warning" : "info"
                    }>{app.status}</Badge>
                  </td>
                  <td className="p-4">
                    <Button as="a" href={"/employer/applications/" + app.id} size="sm" variant="secondary">
                      Xem chi tiết
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
