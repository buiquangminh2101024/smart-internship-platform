import type { SubmitJobPostResponse } from "@sip/shared-types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { JOB_STATUS_LABEL } from "@/lib/job-post-display";
import { JobPostStepper } from "./JobPostStepper";

/**
 * Trang kết quả sau khi Employer gửi duyệt — khớp ảnh mẫu
 * `Screenshot 2026-09-12 134041.png` (panel 3): card giữa màn hình + stepper
 * ngang. Số bước phụ thuộc `autoPublished` (company.requiresApproval).
 */
export function JobPostSubmitResult({ result }: { result: SubmitJobPostResponse }) {
  const { jobPost, autoPublished } = result;
  const status = JOB_STATUS_LABEL[jobPost.status];
  const steps = autoPublished
    ? ["Tạo tin", "Gửi duyệt", "Công khai"]
    : ["Tạo tin", "Gửi duyệt", "Admin kiểm tra", "Công khai"];

  return (
    <Card padding="lg" className="grid justify-items-center gap-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-pine-100 text-pine-600">
        <Icon name="check" size={28} />
      </span>

      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold text-text-strong">
          {autoPublished ? "Tin tuyển dụng đã được đăng công khai" : "Tin tuyển dụng đã được gửi thành công"}
        </h1>
      </div>

      <Card padding="md" tone="sunken" className="grid w-full justify-items-center gap-2">
        <span className="text-lg font-semibold text-text-strong">{jobPost.title}</span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </Card>

      <div className="w-full">
        {/* Cả hai nhánh đều dừng ở bước thứ 3: "Công khai" (đã xong) hoặc
            "Admin kiểm tra" (đang chờ). */}
        <JobPostStepper steps={steps} current={2} />
      </div>

      <div className="flex w-full items-start gap-3 rounded-xl border border-border-subtle bg-surface-page px-4 py-3 text-left">
        <Icon name="info" size={17} className="mt-0.5 shrink-0 text-pine-600" />
        <p className="text-sm text-text-body">
          {autoPublished
            ? "Công ty của bạn được miễn kiểm duyệt nên tin đã hiển thị công khai ngay. Bạn có thể đóng tin bất cứ lúc nào."
            : "Tin tuyển dụng sẽ được công khai sau khi được Admin kiểm duyệt (thường trong vòng 24h)."}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button as="a" href="/employer/jobs">
          Quay về quản lý tin tuyển dụng
        </Button>
        <Button as="a" href={`/employer/jobs/${jobPost.id}`} variant="secondary">
          Xem chi tiết tin
        </Button>
      </div>
    </Card>
  );
}
