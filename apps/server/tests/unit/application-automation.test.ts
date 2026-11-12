// Chạy: node --import tsx --test tests/unit/application-automation.test.ts (từ apps/server)
// Quy tắc thuần của tự xử lý hồ sơ (AD-25, docs/06-backend/application-automation/PLAN.md).
// Bước 3: dải điểm theo ngưỡng X / Y. Các bước sau thêm closeDueAt, khoá tuần.
import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveRejectThreshold, matchBand } from "../../src/modules/application-automation/application-automation.policy";

test("dải điểm: đúng biên X = 80 và Y = 50", () => {
  assert.equal(matchBand(80, 80, 50), "ABOVE");
  assert.equal(matchBand(100, 80, 50), "ABOVE");
  assert.equal(matchBand(79, 80, 50), "MIDDLE");
  assert.equal(matchBand(50, 80, 50), "MIDDLE");
  assert.equal(matchBand(49, 80, 50), "BELOW");
  assert.equal(matchBand(0, 80, 50), "BELOW");
});

test("dải điểm: không có điểm ⇒ null", () => {
  assert.equal(matchBand(null, 80, 50), null);
});

test("Y ≥ X (dữ liệu sửa tay) ⇒ kẹp Y = X − 1, không có điểm nào vừa ABOVE vừa BELOW", () => {
  assert.equal(effectiveRejectThreshold(80, 50), 50);
  assert.equal(effectiveRejectThreshold(60, 60), 59);
  assert.equal(effectiveRejectThreshold(60, 90), 59);
  assert.equal(effectiveRejectThreshold(0, 50), 0);
  assert.equal(matchBand(60, 60, 90), "ABOVE");
  assert.equal(matchBand(59, 60, 90), "MIDDLE");
  assert.equal(matchBand(58, 60, 90), "BELOW");
});
