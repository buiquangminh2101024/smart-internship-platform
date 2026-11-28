// Chạy: node --import tsx --test tests/unit/payments/sepay-signing.test.ts (từ apps/server)
// AD-32 (docs/06-backend/sepay-payment-gateway/PLAN.md bước 4): chuỗi ký checkout SePay
// theo đúng thứ tự trường của tài liệu, bỏ trường rỗng / "0", không ký lang/signature;
// chữ ký là HMAC-SHA256 base64.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildSepaySigningString, hmacSha256Base64 } from "../../../src/shared/utils/payment-signing";

test("dựng lại đúng chuỗi ví dụ trong tài liệu SePay, kể cả khi truyền trường không theo thứ tự", () => {
  const signing = buildSepaySigningString({
    cancel_url: "https://yoursite.com/payment/cancel",
    order_invoice_number: "INV_20231201_001",
    merchant: "MERCHANT_123",
    order_amount: "100000",
    currency: "VND",
    operation: "PURCHASE",
    order_description: "Payment for order #12345",
    success_url: "https://yoursite.com/payment/success",
    error_url: "https://yoursite.com/payment/error",
    lang: "vi",
    signature: "khong-duoc-ky",
  });
  assert.equal(
    signing,
    "order_amount=100000,merchant=MERCHANT_123,currency=VND,operation=PURCHASE," +
      "order_description=Payment for order #12345,order_invoice_number=INV_20231201_001," +
      "success_url=https://yoursite.com/payment/success,error_url=https://yoursite.com/payment/error," +
      "cancel_url=https://yoursite.com/payment/cancel",
  );
});

test("bỏ trường thiếu, rỗng và 0; giá trị không bị URL-encode", () => {
  const signing = buildSepaySigningString({
    order_amount: "50000",
    merchant: "M",
    customer_id: "",
    payment_method: "0",
    success_url: "http://localhost:3000/r?orderCode=A-1&result=success",
  });
  assert.equal(signing, "order_amount=50000,merchant=M,success_url=http://localhost:3000/r?orderCode=A-1&result=success");
});

test("hmacSha256Base64 khớp HMAC-SHA256 mã hoá base64 của node:crypto", () => {
  const expected = createHmac("sha256", "secret").update("a=1,b=2").digest("base64");
  assert.equal(hmacSha256Base64("a=1,b=2", "secret"), expected);
  assert.match(hmacSha256Base64("x", "y"), /^[A-Za-z0-9+/]+=*$/);
});
