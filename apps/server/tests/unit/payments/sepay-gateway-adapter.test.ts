// Chạy: node --import tsx --test tests/unit/payments/sepay-gateway-adapter.test.ts (từ apps/server)
// AD-32 (docs/06-backend/sepay-payment-gateway/PLAN.md bước 6): form checkout đủ trường và
// chữ ký đúng; 3 return URL mang orderCode + result; IPN sai / thiếu X-Secret-Key ⇒ invalid;
// ORDER_PAID ⇒ success + amount + transaction.id; loại khác ⇒ ignored; mã ack cho SePay.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../../../src/shared/errors/AppError";
import { SepayGatewayAdapter } from "../../../src/infrastructure/sepay-gateway-adapter";
import { buildSepaySigningString, hmacSha256Base64 } from "../../../src/shared/utils/payment-signing";

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };
const CONFIG = {
  SEPAY_MERCHANT_ID: "SP-TEST-MERCHANT",
  SEPAY_SECRET_KEY: "merchant-secret",
  SEPAY_AUTH_TYPE_SECRET: "ipn-secret",
  SEPAY_CHECKOUT_URL: "https://pay-sandbox.sepay.vn/v1/checkout/init",
  SEPAY_RETURN_URL: "http://localhost:3000/employer/subscription/return/sepay",
};
const ORDER_CODE = "SEPAY-cmabc123-0A1B2C3D";
const GOOD_HEADERS = { "x-secret-key": "ipn-secret" };

function buildAdapter(overrides: Partial<typeof CONFIG> = {}) {
  return new SepayGatewayAdapter({ config: { ...CONFIG, ...overrides }, logger: silentLogger });
}

function paidPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    timestamp: 1759134682,
    notification_type: "ORDER_PAID",
    order: {
      id: "e2c195be-c721-47eb-b323-99ab24e52d85",
      order_id: "NQD-68DA43D73C1A5",
      order_status: "CAPTURED",
      order_currency: "VND",
      order_amount: "199000.00",
      order_invoice_number: ORDER_CODE,
    },
    transaction: {
      id: "384c66dd-41e6-4316-a544-b4141682595c",
      payment_method: "BANK_TRANSFER",
      transaction_id: "68da43da2d9de",
      transaction_status: "APPROVED",
    },
    ...overrides,
  };
}

test("createCheckoutUrl trả form POST tới SEPAY_CHECKOUT_URL với đủ trường và chữ ký đúng", async () => {
  const result = await buildAdapter().createCheckoutUrl({
    orderCode: ORDER_CODE,
    amount: 199000,
    orderInfo: "Thanh toan goi dich vu sub-1",
    clientIp: "127.0.0.1",
  });

  assert.ok(result.paymentForm);
  assert.equal(result.paymentUrl, CONFIG.SEPAY_CHECKOUT_URL);
  assert.equal(result.paymentForm.action, CONFIG.SEPAY_CHECKOUT_URL);

  const { fields } = result.paymentForm;
  assert.equal(fields.order_amount, "199000");
  assert.equal(fields.merchant, "SP-TEST-MERCHANT");
  assert.equal(fields.currency, "VND");
  assert.equal(fields.operation, "PURCHASE");
  assert.equal(fields.order_invoice_number, ORDER_CODE);
  assert.equal(fields.order_description, "Thanh toan goi dich vu sub-1");
  assert.equal(fields.lang, "vi");
  assert.equal(fields.success_url, `${CONFIG.SEPAY_RETURN_URL}?orderCode=${ORDER_CODE}&result=success`);
  assert.equal(fields.error_url, `${CONFIG.SEPAY_RETURN_URL}?orderCode=${ORDER_CODE}&result=error`);
  assert.equal(fields.cancel_url, `${CONFIG.SEPAY_RETURN_URL}?orderCode=${ORDER_CODE}&result=cancel`);

  const { signature, lang: _lang, ...signed } = fields;
  assert.equal(signature, hmacSha256Base64(buildSepaySigningString(signed), "merchant-secret"));
});

test("createCheckoutUrl báo lỗi chung (không lộ tên biến env) khi thiếu secret", async () => {
  await assert.rejects(
    buildAdapter({ SEPAY_SECRET_KEY: undefined }).createCheckoutUrl({
      orderCode: ORDER_CODE,
      amount: 1000,
      orderInfo: "x",
      clientIp: "127.0.0.1",
    }),
    (error: unknown) => error instanceof AppError && error.statusCode === 500 && !error.message.includes("SEPAY"),
  );
});

test("IPN thiếu, sai X-Secret-Key, hoặc server chưa cấu hình secret ⇒ invalid", () => {
  const adapter = buildAdapter();
  assert.deepEqual(adapter.verifyAndParseIpn({ data: paidPayload() }), { valid: false });
  assert.deepEqual(adapter.verifyAndParseIpn({ data: paidPayload(), headers: {} }), { valid: false });
  assert.deepEqual(adapter.verifyAndParseIpn({ data: paidPayload(), headers: { "x-secret-key": "sai" } }), {
    valid: false,
  });
  assert.deepEqual(
    adapter.verifyAndParseIpn({ data: paidPayload(), headers: { "x-secret-key": "merchant-secret" } }),
    { valid: false },
    "Merchant Secret Key không được dùng thay IPN Secret Key",
  );
  assert.deepEqual(
    buildAdapter({ SEPAY_AUTH_TYPE_SECRET: undefined }).verifyAndParseIpn({ data: paidPayload(), headers: GOOD_HEADERS }),
    { valid: false },
  );
});

test("IPN ORDER_PAID hợp lệ ⇒ success, orderCode, transaction.id và số tiền", () => {
  const result = buildAdapter().verifyAndParseIpn({ data: paidPayload(), headers: GOOD_HEADERS });
  assert.equal(result.valid, true);
  assert.equal(result.success, true);
  assert.equal(result.ignored, undefined);
  assert.equal(result.orderCode, ORDER_CODE);
  assert.equal(result.providerTransactionId, "384c66dd-41e6-4316-a544-b4141682595c");
  assert.equal(result.amount, 199000);
});

test("IPN ORDER_PAID thiếu order_amount ⇒ amount = NaN (service coi là lệch tiền)", () => {
  const payload = paidPayload();
  delete (payload.order as Record<string, unknown>).order_amount;
  const result = buildAdapter().verifyAndParseIpn({ data: payload, headers: GOOD_HEADERS });
  assert.equal(result.valid, true);
  assert.ok(Number.isNaN(result.amount));
});

test("IPN loại khác ORDER_PAID (TRANSACTION_VOID) ⇒ valid + ignored, không có success", () => {
  const result = buildAdapter().verifyAndParseIpn({
    data: paidPayload({ notification_type: "TRANSACTION_VOID" }),
    headers: GOOD_HEADERS,
  });
  assert.equal(result.valid, true);
  assert.equal(result.ignored, true);
  assert.equal(result.success, undefined);
});

test("buildIpnAckResponse: 401 / 404 / 500, còn lại 200", () => {
  const adapter = buildAdapter();
  assert.equal(adapter.buildIpnAckResponse("INVALID_SIGNATURE").status, 401);
  assert.equal(adapter.buildIpnAckResponse("ORDER_NOT_FOUND").status, 404);
  assert.equal(adapter.buildIpnAckResponse("UNKNOWN_ERROR").status, 500);
  assert.equal(adapter.buildIpnAckResponse("SUCCESS").status, 200);
  assert.equal(adapter.buildIpnAckResponse("ALREADY_PROCESSED").status, 200);
});
