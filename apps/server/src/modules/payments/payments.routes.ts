import { Router } from "express";
import { asClass, type AwilixContainer } from "awilix";
import { PaymentCallbackLogRepository } from "./payment-callback-log.repository";
import { PaymentMethodRepository } from "./payment-method.repository";
import { PaymentRepository } from "./payment.repository";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { TransactionRepository } from "./transaction.repository";

// IPN callback của VNPay/Momo — public (không authenticate), xác thực bằng
// chữ ký HMAC riêng của từng cổng (API_CONVENTIONS.md §12).
export function paymentsRouter(container: AwilixContainer): Router {
  container.register({
    paymentRepository: asClass(PaymentRepository).singleton(),
    transactionRepository: asClass(TransactionRepository).singleton(),
    paymentCallbackLogRepository: asClass(PaymentCallbackLogRepository).singleton(),
    paymentMethodRepository: asClass(PaymentMethodRepository).singleton(),
    paymentsService: asClass(PaymentsService).singleton(),
    paymentsController: asClass(PaymentsController).singleton(),
  });

  const router = Router();
  const resolveController = () => container.resolve<PaymentsController>("paymentsController");

  router.get("/payments/vnpay/ipn", (req, res, next) => {
    void resolveController().vnpayIpn(req, res, next);
  });
  router.post("/payments/momo/ipn", (req, res, next) => {
    void resolveController().momoIpn(req, res, next);
  });

  return router;
}
