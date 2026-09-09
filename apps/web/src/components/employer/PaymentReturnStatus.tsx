"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePaymentStatus } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

interface PaymentReturnStatusProps {
  provider: "vnpay" | "momo";
}

// Trang chờ xác nhận sau khi cổng thanh toán redirect về — KHÔNG đọc trạng
// thái từ query param (có thể bị giả mạo qua trình duyệt), chỉ dùng orderCode
// để poll GET /subscriptions/payments/by-order-code/:orderCode lấy trạng
// thái thật (xem API_CONVENTIONS.md §12, AD-6).
export function PaymentReturnStatus({ provider }: PaymentReturnStatusProps) {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // orderCode ưu tiên lấy từ sessionStorage (ghi lúc bấm "Thanh toán", xem
  // hooks/useSubscription.ts) — phòng khi return URL của cổng không giữ
  // nguyên toàn bộ query string; fallback đọc trực tiếp từ query nếu có.
  const orderCodeFromQuery = searchParams.get("orderCode") ?? searchParams.get("vnp_TxnRef") ?? undefined;
  const orderCode =
    (typeof window !== "undefined" ? window.sessionStorage.getItem("sip_pending_order_code") : null) ??
    orderCodeFromQuery;

  const { data, isLoading, isError } = usePaymentStatus(orderCode);
  // Poll dừng tự động sau ~1 phút (xem usePaymentStatus) — theo dõi thời gian
  // riêng ở đây để đổi UI sang "chưa nhận được xác nhận" thay vì spinner vô hạn.
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (data?.status === "COMPLETED") {
      void queryClient.invalidateQueries({ queryKey: ["companySubscription"] });
      if (typeof window !== "undefined") window.sessionStorage.removeItem("sip_pending_order_code");
    }
  }, [data?.status, queryClient]);

  useEffect(() => {
    if (data?.status !== "PENDING") return undefined;
    const timer = setTimeout(() => setTimedOut(true), 65_000);
    return () => clearTimeout(timer);
  }, [data?.status, orderCode]);

  const providerLabel = provider === "vnpay" ? "VNPay" : "Momo";

  if (!orderCode) {
    return (
      <Card padding="lg" className="grid gap-3 text-center">
        <p className="text-sm text-red-600">Không tìm thấy mã đơn hàng. Vui lòng quay lại trang chọn gói và thử lại.</p>
        <Button as="a" href="/employer/subscription" variant="secondary" className="mx-auto w-fit">
          Về trang gói dịch vụ
        </Button>
      </Card>
    );
  }

  if (timedOut && data?.status === "PENDING") {
    return (
      <Card padding="lg" className="grid gap-3 text-center">
        <p className="text-sm text-text-muted">Chưa nhận được xác nhận từ {providerLabel}. Vui lòng tải lại trang để kiểm tra lại.</p>
        <Button type="button" variant="secondary" className="mx-auto w-fit" onClick={() => window.location.reload()}>
          Tải lại trang
        </Button>
      </Card>
    );
  }

  if (isLoading || !data || data.status === "PENDING") {
    return (
      <Card padding="lg" className="grid justify-items-center gap-3 text-center">
        <Icon name="loader-circle" size={32} className="animate-spin text-pine-600" />
        <p className="text-sm text-text-muted">Đang xác nhận thanh toán qua {providerLabel}, vui lòng đợi trong giây lát...</p>
      </Card>
    );
  }

  if (isError || data.status === "FAILED") {
    return (
      <Card padding="lg" className="grid gap-3 text-center">
        <p className="text-sm text-red-600">Thanh toán không thành công hoặc chưa nhận được xác nhận. Vui lòng thử lại.</p>
        <Button as="a" href="/employer/subscription" variant="secondary" className="mx-auto w-fit">
          Thử lại
        </Button>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="grid justify-items-center gap-3 text-center">
      <Icon name="circle-check" size={32} className="text-pine-600" />
      <p className="text-sm text-text-strong">Thanh toán thành công! Gói dịch vụ của bạn đã được kích hoạt.</p>
      <Button as="a" href="/employer/subscription" className="mx-auto w-fit">
        Xem gói dịch vụ
      </Button>
    </Card>
  );
}
