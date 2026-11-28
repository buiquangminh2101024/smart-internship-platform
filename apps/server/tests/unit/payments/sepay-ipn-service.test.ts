// Chạy: node --import tsx --test tests/unit/payments/sepay-ipn-service.test.ts (từ apps/server)
// AD-32 (docs/06-backend/sepay-payment-gateway/PLAN.md bước 8): PaymentsService.handleIpn("SEPAY")
// với SepayGatewayAdapter thật và repository giả trong bộ nhớ.
// - ORDER_PAID đúng tiền ⇒ Transaction SUCCESS, Payment COMPLETED, gói được kích hoạt.
// - Lệch tiền ⇒ FAILED, không kích hoạt, vẫn trả 200.
// - Gửi trùng (cùng transaction.id) ⇒ chỉ xử lý một lần.
// - TRANSACTION_VOID ⇒ chỉ ghi log, không đổi trạng thái.
// - Sai X-Secret-Key ⇒ 401, vẫn ghi PaymentCallbackLog, header không bị ghi vào log.
// - Không tìm thấy đơn ⇒ 404. Checkout trả paymentForm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PaymentsService } from "../../../src/modules/payments/payments.service";
import { SepayGatewayAdapter } from "../../../src/infrastructure/sepay-gateway-adapter";

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };
const ORDER_CODE = "SEPAY-pay-1-0A1B2C3D";
const HEADERS = { "x-secret-key": "ipn-secret" };

function buildService(options: { amount?: number } = {}) {
  const payment = { id: "pay-1", companySubscriptionId: "sub-1", amount: options.amount ?? 199000, status: "PENDING" };
  const transaction: {
    id: string;
    paymentId: string;
    orderCode: string;
    status: string;
    providerTransactionId: string | null;
  } = { id: "tx-1", paymentId: "pay-1", orderCode: ORDER_CODE, status: "INIT", providerTransactionId: null };
  const callbackLogs: { provider: string; rawPayload?: string; rawQueryString?: string }[] = [];
  const activated: string[] = [];
  const createdTransactions: unknown[] = [];

  const adapter = new SepayGatewayAdapter({
    config: {
      SEPAY_MERCHANT_ID: "SP-TEST",
      SEPAY_SECRET_KEY: "merchant-secret",
      SEPAY_AUTH_TYPE_SECRET: "ipn-secret",
      SEPAY_CHECKOUT_URL: "https://pay-sandbox.sepay.vn/v1/checkout/init",
      SEPAY_RETURN_URL: "http://localhost:3000/employer/subscription/return/sepay",
    },
    logger: silentLogger,
  });

  const service = new PaymentsService({
    paymentRepository: {
      create: async () => payment,
      findById: async (id: string) => (id === payment.id ? payment : null),
      updateStatus: async (_id: string, status: string) => {
        payment.status = status;
      },
    },
    transactionRepository: {
      create: async (data: unknown) => {
        createdTransactions.push(data);
      },
      findByOrderCode: async (code: string) => (code === transaction.orderCode ? transaction : null),
      findByProviderTransactionId: async (id: string) => (transaction.providerTransactionId === id ? transaction : null),
      updateStatus: async (_id: string, data: { status: string; providerTransactionId?: string }) => {
        transaction.status = data.status;
        if (data.providerTransactionId) transaction.providerTransactionId = data.providerTransactionId;
      },
    },
    paymentMethodRepository: { findByProcessorType: async () => ({ id: "pm-sepay" }) },
    paymentCallbackLogRepository: {
      create: async (data: { provider: string; rawPayload?: string }) => {
        callbackLogs.push(data);
      },
    },
    companySubscriptionRepository: {
      findById: async () => ({ id: "sub-1", companyId: "company-1", plan: { durationDays: 30, name: "Pro" } }),
      cancelActive: async () => {},
      activate: async (id: string) => {
        activated.push(id);
      },
    },
    paymentGatewayAdapters: { SEPAY: adapter },
    logger: silentLogger,
    config: {
      DEV_SKIP_PAYMENT_GATEWAY: false,
      VNPAY_RETURN_URL: "http://localhost:3000/r/vnpay",
      MOMO_RETURN_URL: "http://localhost:3000/r/momo",
      SEPAY_RETURN_URL: "http://localhost:3000/r/sepay",
    },
    prisma: { $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
    companyRepository: { findById: async () => ({ name: "Mây Xanh" }) },
    userRepository: { findAdminIds: async () => [] },
    notificationsService: { notifyMany: async () => {} },
    auditLogService: { record: async () => {} },
  } as unknown as ConstructorParameters<typeof PaymentsService>[0]);

  return { service, payment, transaction, callbackLogs, activated, createdTransactions };
}

function ipnBody(overrides: { type?: string; amount?: string; transactionId?: string; orderCode?: string } = {}) {
  return {
    notification_type: overrides.type ?? "ORDER_PAID",
    order: {
      order_status: "CAPTURED",
      order_amount: overrides.amount ?? "199000.00",
      order_invoice_number: overrides.orderCode ?? ORDER_CODE,
    },
    transaction: { id: overrides.transactionId ?? "sepay-tx-uuid-1", transaction_status: "APPROVED" },
  };
}

test("createCheckout(SEPAY) trả paymentForm và tạo Transaction INIT", async () => {
  const { service, createdTransactions } = buildService();
  const result = await service.createCheckout({
    provider: "SEPAY",
    companySubscriptionId: "sub-1",
    amount: 199000,
    orderInfo: "Thanh toan goi dich vu sub-1",
    clientIp: "127.0.0.1",
  });
  assert.ok(result.paymentForm);
  assert.equal(result.paymentForm.fields.order_invoice_number, result.orderCode);
  assert.match(result.orderCode, /^SEPAY-pay-1-[0-9A-F]{8}$/);
  assert.equal(createdTransactions.length, 1);
});

test("ORDER_PAID đúng số tiền ⇒ SUCCESS / COMPLETED, kích hoạt gói, trả 200", async () => {
  const { service, payment, transaction, activated, callbackLogs } = buildService();
  const ack = await service.handleIpn("SEPAY", { data: ipnBody(), headers: HEADERS });

  assert.equal(ack.status, 200);
  assert.equal(transaction.status, "SUCCESS");
  assert.equal(transaction.providerTransactionId, "sepay-tx-uuid-1");
  assert.equal(payment.status, "COMPLETED");
  assert.deepEqual(activated, ["sub-1"]);
  assert.equal(callbackLogs.length, 1);
  assert.equal(callbackLogs[0].provider, "SEPAY");
  assert.ok(callbackLogs[0].rawPayload);
});

test("lệch số tiền ⇒ FAILED, không kích hoạt gói, vẫn trả 200", async () => {
  const { service, payment, transaction, activated } = buildService();
  const ack = await service.handleIpn("SEPAY", { data: ipnBody({ amount: "1000.00" }), headers: HEADERS });

  assert.equal(ack.status, 200);
  assert.equal(transaction.status, "FAILED");
  assert.equal(payment.status, "FAILED");
  assert.deepEqual(activated, []);
});

test("thiếu order_amount ⇒ coi là lệch tiền, không kích hoạt", async () => {
  const { service, payment, activated } = buildService();
  const body = ipnBody();
  delete (body.order as Partial<typeof body.order>).order_amount;
  await service.handleIpn("SEPAY", { data: body, headers: HEADERS });

  assert.equal(payment.status, "FAILED");
  assert.deepEqual(activated, []);
});

test("IPN gửi trùng (cùng transaction.id) ⇒ chỉ xử lý một lần", async () => {
  const { service, activated, callbackLogs } = buildService();
  const first = await service.handleIpn("SEPAY", { data: ipnBody(), headers: HEADERS });
  const second = await service.handleIpn("SEPAY", { data: ipnBody(), headers: HEADERS });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(activated, ["sub-1"]);
  assert.equal(callbackLogs.length, 2, "mọi lần gọi đều được ghi log");
});

test("TRANSACTION_VOID ⇒ trả 200, không đổi trạng thái", async () => {
  const { service, payment, transaction, activated, callbackLogs } = buildService();
  const ack = await service.handleIpn("SEPAY", { data: ipnBody({ type: "TRANSACTION_VOID" }), headers: HEADERS });

  assert.equal(ack.status, 200);
  assert.equal(transaction.status, "INIT");
  assert.equal(payment.status, "PENDING");
  assert.deepEqual(activated, []);
  assert.equal(callbackLogs.length, 1);
});

test("sai X-Secret-Key ⇒ 401, vẫn ghi log, không ghi header vào log, không đổi trạng thái", async () => {
  const { service, payment, callbackLogs } = buildService();
  const ack = await service.handleIpn("SEPAY", { data: ipnBody(), headers: { "x-secret-key": "doan-bừa" } });

  assert.equal(ack.status, 401);
  assert.equal(payment.status, "PENDING");
  assert.equal(callbackLogs.length, 1);
  assert.ok(!callbackLogs[0].rawPayload?.includes("doan-bừa"));
});

test("không tìm thấy đơn ⇒ 404", async () => {
  const { service } = buildService();
  const ack = await service.handleIpn("SEPAY", { data: ipnBody({ orderCode: "SEPAY-khac" }), headers: HEADERS });
  assert.equal(ack.status, 404);
});
