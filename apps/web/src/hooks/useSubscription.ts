"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  CheckoutRequest,
  CheckoutResponse,
  CompanySubscriptionSummary,
  PaginatedResponse,
  PaymentStatusResponse,
  SubscriptionAccessStatus,
  SubscriptionPlan,
} from "@sip/shared-types";
import { apiFetch } from "@/lib/api-client";

const PLANS_STALE_TIME_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30;

/** GET /employers/company/subscription — trạng thái trial/quota + gói hiện tại. */
export function useCompanySubscription() {
  return useQuery({
    queryKey: ["companySubscription"],
    queryFn: () => apiFetch<SubscriptionAccessStatus>("employer", "/employers/company/subscription"),
  });
}

/** GET /subscription-plans — catalog gói đang mở bán, cùng pattern useCatalog.ts ở Phase 4. */
export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ["subscriptionPlans"],
    queryFn: () => apiFetch<SubscriptionPlan[]>("employer", "/subscription-plans"),
    staleTime: PLANS_STALE_TIME_MS,
  });
}

/** GET /subscriptions/history — lịch sử CompanySubscription (cursor, chỉ lấy trang đầu cho bảng đơn giản ở /employer/subscription). */
export function useSubscriptionHistory() {
  return useQuery({
    queryKey: ["subscriptionHistory"],
    queryFn: () => apiFetch<PaginatedResponse<CompanySubscriptionSummary>>("employer", "/subscriptions/history"),
  });
}

/** POST /subscriptions/checkout — trả { paymentUrl, orderCode }, redirect toàn trang sang cổng thanh toán. */
export function useCheckout() {
  return useMutation({
    mutationFn: (dto: CheckoutRequest) =>
      apiFetch<CheckoutResponse>("employer", "/subscriptions/checkout", { method: "POST", body: JSON.stringify(dto) }),
  });
}

/**
 * GET /subscriptions/payments/by-order-code/:orderCode — poll trạng thái
 * thanh toán THẬT (IPN đã xử lý xong), không bao giờ tin query param của
 * return URL (xem API_CONVENTIONS.md §12). Dừng poll khi có kết quả cuối
 * (COMPLETED/FAILED) hoặc quá MAX_POLLS lần (~1 phút) — gọi component tự
 * invalidate ["companySubscription"] khi status chuyển COMPLETED (xem
 * components/employer/PaymentReturnStatus.tsx).
 */
export function usePaymentStatus(orderCode: string | undefined) {
  return useQuery({
    queryKey: ["paymentStatus", orderCode],
    queryFn: () => apiFetch<PaymentStatusResponse>("employer", `/subscriptions/payments/by-order-code/${orderCode}`),
    enabled: !!orderCode,
    refetchInterval: (query) => {
      if (query.state.data?.status !== "PENDING") return false;
      const attempts = query.state.dataUpdateCount;
      if (attempts >= MAX_POLLS) return false;
      return POLL_INTERVAL_MS;
    },
  });
}
