"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePaymentStatus, useReportPaymentCancellation } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";

interface PaymentReturnStatusProps {
  provider: "vnpay" | "momo";
}

// Cổng thanh toán không đảm bảo gọi IPN khi người dùng chủ động huỷ ngay
// trên trang cổng (chưa để ngân hàng xử lý) — nên query param này CHỈ dùng để
// hiển thị UI + tự báo huỷ cho backend (chuyển PENDING -> FAILED, xem
// useReportPaymentCancellation), KHÔNG bao giờ dùng để tự kết luận thành
// công (status thật vẫn luôn lấy từ backend, xem usePaymentStatus bên dưới).
function isGatewayCancelled(provider: "vnpay" | "momo", searchParams: URLSearchParams): boolean {
  return provider === "momo" ? searchParams.get("resultCode") === "1006" : searchParams.get("vnp_ResponseCode") === "24";
}

function subscribeToNothing() {
  return () => {};
}

function getStoredOrderCode(): string | undefined {
  return window.sessionStorage.getItem("sip_pending_order_code") ?? undefined;
}

function getStoredOrderCodeServerSnapshot(): undefined {
  return undefined;
}

// Trang chờ xác nhận sau khi cổng thanh toán redirect về — KHÔNG đọc trạng
// thái từ query param (có thể bị giả mạo qua trình duyệt), chỉ dùng orderCode
// để poll GET /subscriptions/payments/by-order-code/:orderCode lấy trạng
// thái thật (xem API_CONVENTIONS.md §12, AD-6).
export function PaymentReturnStatus({ provider }: PaymentReturnStatusProps) {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Fallback đọc trực tiếp từ query nếu sessionStorage không có (xem bên
  // dưới) — vnp_TxnRef (VNPay) và orderId (Momo) là tên param mỗi cổng dùng
  // để echo lại orderCode, đọc an toàn ngay trong lần render đầu vì đến từ
  // URL, không phụ thuộc `window`.
  const orderCodeFromQuery =
    searchParams.get("orderCode") ?? searchParams.get("vnp_TxnRef") ?? searchParams.get("orderId") ?? undefined;

  // sessionStorage chỉ tồn tại ở client — đọc thẳng trong thân component (như
  // trước đây) khiến HTML server render (không có sessionStorage) khác HTML
  // lần render đầu ở client (có sessionStorage), gây lỗi "Hydration failed".
  // useSyncExternalStore là cách React khuyến nghị cho đúng trường hợp này:
  // getServerSnapshot trả undefined để khớp SSR, React tự defer việc đọc
  // getSnapshot (sessionStorage) tới sau khi hydrate xong, không gây mismatch.
  const storedOrderCode = useSyncExternalStore(subscribeToNothing, getStoredOrderCode, getStoredOrderCodeServerSnapshot);
  const orderCode = storedOrderCode ?? orderCodeFromQuery;
  const cancelledByGateway = isGatewayCancelled(provider, searchParams);

  const { data, isLoading, isError } = usePaymentStatus(orderCode);
  const reportCancellation = useReportPaymentCancellation();
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

  // Payment vẫn PENDING vì IPN sẽ không bao giờ tới cho giao dịch bị huỷ
  // trước khi ngân hàng xử lý — chủ động báo cho backend đóng lại thành
  // FAILED, tránh đơn hàng kẹt PENDING vĩnh viễn (xem PaymentsService.reportClientCancellation).
  useEffect(() => {
    if (!cancelledByGateway || !orderCode || data?.status !== "PENDING") return;
    reportCancellation.mutate(orderCode, {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["paymentStatus", orderCode] }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelledByGateway, orderCode, data?.status]);

  const providerLabel = provider === "vnpay" ? "VNPay" : "Momo";

  let content: React.ReactNode;

  if (!orderCode) {
    content = (
      <Card padding="lg" className="grid gap-3 text-center">
        <p className="text-sm text-red-600">Không tìm thấy mã đơn hàng. Vui lòng quay lại trang chọn gói và thử lại.</p>
        <Button as="a" href="/employer/subscription" variant="secondary" className="mx-auto w-fit">
          Về trang gói dịch vụ
        </Button>
      </Card>
    );
  } else if (data?.status === "COMPLETED") {
    content = (
      <Card padding="lg" className="grid justify-items-center gap-3 text-center">
        <Icon name="circle-check" size={32} className="text-pine-600" />
        <p className="text-sm text-text-strong">Thanh toán thành công! Gói dịch vụ của bạn đã được kích hoạt.</p>
        <Button as="a" href="/employer/subscription" className="mx-auto w-fit">
          Xem gói dịch vụ
        </Button>
      </Card>
    );
  } else if (cancelledByGateway) {
    content = (
      <Card padding="lg" className="grid justify-items-center gap-3 text-center">
        <Icon name="circle-x" size={32} className="text-text-muted" />
        <p className="text-sm text-text-strong">Bạn đã huỷ giao dịch thanh toán qua {providerLabel}.</p>
        <Button as="a" href="/employer/subscription" variant="secondary" className="mx-auto w-fit">
          Chọn gói khác
        </Button>
      </Card>
    );
  } else if (timedOut && data?.status === "PENDING") {
    content = (
      <Card padding="lg" className="grid gap-3 text-center">
        <p className="text-sm text-text-muted">Chưa nhận được xác nhận từ {providerLabel}. Vui lòng tải lại trang để kiểm tra lại.</p>
        <Button type="button" variant="secondary" className="mx-auto w-fit" onClick={() => window.location.reload()}>
          Tải lại trang
        </Button>
      </Card>
    );
  } else if (isLoading || !data || data.status === "PENDING") {
    content = (
      <Card padding="lg" className="grid justify-items-center gap-3 text-center">
        <Icon name="loader-circle" size={32} className="animate-spin text-pine-600" />
        <p className="text-sm text-text-muted">Đang xác nhận thanh toán qua {providerLabel}, vui lòng đợi trong giây lát...</p>
      </Card>
    );
  } else if (isError || data.status === "FAILED") {
    content = (
      <Card padding="lg" className="grid gap-3 text-center">
        <p className="text-sm text-red-600">Thanh toán không thành công hoặc chưa nhận được xác nhận. Vui lòng thử lại.</p>
        <Button as="a" href="/employer/subscription" variant="secondary" className="mx-auto w-fit">
          Thử lại
        </Button>
      </Card>
    );
  } else {
    content = (
      <Card padding="lg" className="grid justify-items-center gap-3 text-center">
        <Icon name="circle-check" size={32} className="text-pine-600" />
        <p className="text-sm text-text-strong">Thanh toán thành công! Gói dịch vụ của bạn đã được kích hoạt.</p>
        <Button as="a" href="/employer/subscription" className="mx-auto w-fit">
          Xem gói dịch vụ
        </Button>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {content}
      <Button as="a" href="/employer/subscription" variant="link" className="w-fit">
        ← Quay lại gói dịch vụ
      </Button>
    </div>
  );
}
