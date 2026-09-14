"use client";

import { useCandidateApplications, useCancelApplication } from "@/hooks/useApplications";
import { CandidateHomeHeader } from "@/components/marketing/CandidateHomeHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";

export default function ApplicationsPage() {
  const { data: applications, isLoading, isError } = useCandidateApplications();
  const cancelMutation = useCancelApplication();

  const handleCancel = async (id: string) => {
    if (confirm("Bạn có chắc chắn muốn hủy đơn ứng tuyển này?")) {
      await cancelMutation.mutateAsync(id);
    }
  };

    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Lịch sử ứng tuyển</h1>
        <p className="mt-1 text-sm text-text-muted">Theo dõi trạng thái các đơn ứng tuyển của bạn.</p>
      </div>

      {isLoading ? (
        <Card padding="lg" className="flex items-center justify-center gap-2 text-text-muted">
          <Icon name="loader-circle" size={18} className="animate-spin" />
          <span className="text-sm">Đang tải...</span>
        </Card>
      ) : isError ? (
        <Card padding="lg" className="grid justify-items-center gap-2 text-center">
          <Icon name="circle-alert" size={32} className="text-red-500" />
          <p className="text-sm text-text-body">Có lỗi xảy ra khi tải danh sách.</p>
        </Card>
      ) : !applications || applications.length === 0 ? (
        <Card padding="lg" tone="sunken" className="grid justify-items-center gap-4 text-center">
          <Icon name="briefcase-business" size={40} className="text-text-muted" />
          <div>
            <p className="font-medium text-text-strong">Chưa có ứng tuyển nào</p>
            <p className="mt-1 text-sm text-text-muted">Khi bạn nộp đơn ứng tuyển, thông tin sẽ hiển thị tại đây.</p>
          </div>
          <Button as="a" href="/jobs" variant="secondary" icon="search">
            Tìm việc ngay
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-text-muted">{applications.length} đơn ứng tuyển</p>
          {applications.map((app) => (
            <Card key={app.id} padding="md" className="flex flex-col md:flex-row justify-between md:items-center gap-4">
              <div>
                <h3 className="font-semibold text-lg text-text-strong">{app.jobPost.title}</h3>
                <p className="text-sm text-text-body mt-1">
                  <Icon name="building-2" size={14} className="inline-block mr-1 text-text-muted" />
                  {app.jobPost.company.name}
                </p>
                <p className="text-xs text-text-muted mt-2">Nộp lúc: {new Date(app.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex flex-col items-end gap-3 shrink-0">
                <Badge tone={
                  app.status === "ACCEPTED" ? "success" :
                  app.status === "REJECTED" || app.status === "CANCELLED" ? "danger" :
                  app.status === "PENDING" ? "warning" : "info"
                }>{app.status}</Badge>
                
                <div className="flex gap-2">
                  {(app.status === "PENDING" || app.status === "REVIEWING") && (
                    <Button variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" size="sm" onClick={() => void handleCancel(app.id)}>
                      Hủy đơn
                    </Button>
                  )}
                  <Button as="a" href={"/jobs/" + app.jobPostId} variant="secondary" size="sm">
                    Xem tin
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
}
