"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEmployerJobApplications } from "@/hooks/useApplications";
import { useEmployerApplicationMatches } from "@/hooks/useJobMatch";
import { MatchScoreBadge } from "@/components/jobs/MatchScoreBadge";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { ApplicationMatchSummary, ApplicationStatus } from "@sip/shared-types";

// Xếp hạng ứng viên (A3, AD-13 mục 9) — docs/05-frontend/phases/candidate-ranker/PLAN.md.
type SortMode = "newest" | "match";

function hasCoverLetter(app: { coverLetter?: string | null }): boolean {
  return !!app.coverLetter?.trim();
}

/**
 * Sort thuần ở FE: điểm giảm dần (đơn chưa SCORED xếp cuối), điểm bằng nhau
 * ⇒ đơn có thư xin việc lên trước. Sort ổn định nên các đơn hoà hoàn toàn giữ
 * thứ tự API trả về.
 */
function sortApplicationsByMatch<T extends { id: string; coverLetter?: string | null }>(
  applications: T[],
  matchByApplication: Map<string, ApplicationMatchSummary>,
): T[] {
  const scoreOf = (app: T): number => {
    const match = matchByApplication.get(app.id);
    return match?.status === "SCORED" && match.score !== null ? match.score : -1;
  };
  return [...applications].sort(
    (a, b) => scoreOf(b) - scoreOf(a) || Number(hasCoverLetter(b)) - Number(hasCoverLetter(a)),
  );
}

export default function EmployerJobApplicationsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "">("");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  
  const { data: applications, isLoading, isError } = useEmployerJobApplications(jobId, statusFilter ? statusFilter : undefined);
  // Điểm tham khảo, ghép theo applicationId — chỉ đổi thứ tự khi Employer chủ động chọn "Phù hợp nhất".
  const { data: matches, isError: isMatchesError } = useEmployerApplicationMatches(jobId);
  const matchByApplication = new Map((matches ?? []).map((match) => [match.applicationId, match]));
  // Chưa có điểm (đang tải/lỗi) ⇒ khoá "Phù hợp nhất", không skeleton danh sách (D4).
  const matchesReady = !!matches;
  const effectiveSortMode: SortMode = matchesReady ? sortMode : "newest";
  const displayedApplications =
    applications && effectiveSortMode === "match"
      ? sortApplicationsByMatch(applications, matchByApplication)
      : applications;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Danh sách ứng viên</h1>
        <Button variant="secondary" onClick={() => router.back()}>Quay lại tin tuyển dụng</Button>
      </div>

      <Card padding="md" className="flex flex-wrap items-center gap-4">
        <span className="text-sm font-medium">Lọc theo trạng thái:</span>
        <select 
          className="border rounded p-2"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ApplicationStatus | "")}
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
        <span className="text-sm font-medium">Sắp xếp:</span>
        <select
          className="border rounded p-2"
          value={effectiveSortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
        >
          <option value="newest">Mới nhất</option>
          <option value="match" disabled={!matchesReady}>
            Phù hợp nhất
          </option>
        </select>
        <span className="text-xs text-gray-500">
          {matchesReady
            ? "Điểm chỉ mang tính tham khảo, không phải quyết định tuyển dụng."
            : isMatchesError
              ? "Không tải được điểm phù hợp"
              : "Đang tải điểm phù hợp…"}
        </span>
      </Card>

      {isLoading ? (
        <p>Đang tải...</p>
      ) : isError ? (
        <p>Có lỗi xảy ra khi tải danh sách ứng viên.</p>
      ) : !displayedApplications || displayedApplications.length === 0 ? (
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
                <th className="p-4 font-medium" title="Theo hồ sơ hiện tại của ứng viên — chỉ mang tính tham khảo">
                  Phù hợp
                </th>
                <th className="p-4 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {displayedApplications.map(app => (
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
                    <MatchScoreBadge
                      score={matchByApplication.get(app.id)?.score}
                      status={matchByApplication.get(app.id)?.status}
                    />
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
