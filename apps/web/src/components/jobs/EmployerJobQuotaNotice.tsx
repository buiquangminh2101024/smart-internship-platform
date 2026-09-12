"use client";

import { useCompanySubscription } from "@/hooks/useSubscription";
import { useEmployerMe } from "@/hooks/useEmployerMe";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

/**
 * Banner đầu trang tạo tin — khớp ảnh mẫu `Screenshot 2026-09-12 134041.png`
 * (dải xanh "công ty đã được xác minh"). Kèm số lượt đăng còn lại để Employer
 * biết trước khi bấm gửi duyệt thay vì chỉ nhận lỗi 403 từ server.
 */
export function EmployerJobQuotaNotice() {
  const { data: me } = useEmployerMe();
  const { data: access } = useCompanySubscription();
  const companyName = me?.company?.name;

  if (!access) {
    return null;
  }

  if (access.mode === "BLOCKED" && access.publishRemaining === undefined) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-marigold-300 bg-marigold-100 px-4 py-3">
        <Icon name="triangle-alert" size={18} className="shrink-0 text-marigold-700" />
        <p className="flex-1 text-sm text-text-body">
          Công ty của bạn đã hết lượt đăng tin miễn phí và chưa có gói dịch vụ còn hiệu lực. Bạn vẫn có thể soạn nháp,
          nhưng cần mua gói để đăng tin.
        </p>
        <Button as="a" href="/employer/subscription" size="sm" variant="secondary">
          Xem gói dịch vụ
        </Button>
      </div>
    );
  }

  const remaining = access.publishRemaining;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-pine-100 bg-surface-brand-soft px-4 py-3">
      <Icon name="badge-check" size={18} className="shrink-0 text-pine-600" />
      <p className="flex-1 text-sm text-text-body">
        {companyName ? <strong className="font-semibold">{companyName}</strong> : "Công ty của bạn"} đã được xác minh.
        Các tin đăng của bạn sẽ được ưu tiên hiển thị.
        {remaining !== undefined ? (
          <>
            {" "}
            Còn <strong className="font-semibold">{remaining}</strong> lượt đăng tin
            {access.mode === "TRIAL" ? " trong thời gian dùng thử" : " trong gói hiện tại"}.
          </>
        ) : null}
      </p>
    </div>
  );
}
