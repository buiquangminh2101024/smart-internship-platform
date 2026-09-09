import { Suspense } from "react";
import { PaymentReturnStatus } from "@/components/employer/PaymentReturnStatus";

export default function VnpayReturnPage() {
  return (
    <div className="mx-auto grid w-full max-w-md px-6 py-16">
      <Suspense fallback={<p className="text-center text-sm text-text-muted">Đang tải...</p>}>
        <PaymentReturnStatus provider="vnpay" />
      </Suspense>
    </div>
  );
}
