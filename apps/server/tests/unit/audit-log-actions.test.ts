// Chạy: node --import tsx --test tests/unit/audit-log-actions.test.ts (từ apps/server)
// Nhóm hành động của nhật ký (docs/06-backend/admin-audit-log/PLAN.md L1): mỗi action thuộc
// đúng một nhóm, action cũ xếp theo đối tượng; các trường đọc từ metadata (L6, L28).
import { test } from "node:test";
import assert from "node:assert/strict";
import { AUDIT_ACTION_GROUPS, AUDIT_ACTIONS, groupOfAction } from "../../src/modules/audit-log/audit-log.actions";
import { readIp, readResubmit } from "../../src/modules/audit-log/audit-log.service";

test("mọi action thuộc đúng một nhóm, nhóm không chứa action lạ", () => {
  const grouped = Object.values(AUDIT_ACTION_GROUPS).flat();
  assert.equal(new Set(grouped).size, grouped.length, "có action nằm ở hai nhóm");
  assert.deepEqual([...grouped].sort(), [...AUDIT_ACTIONS].sort());
});

test("groupOfAction: theo danh sách, action cũ xếp theo entityType, còn lại OTHER", () => {
  assert.equal(groupOfAction("JOB_POST_SUBMITTED"), "JOB_POST");
  assert.equal(groupOfAction("PAYMENT_COMPLETED", "Subscription"), "PAYMENT");
  assert.equal(groupOfAction("AUTH_LOGIN_FAILED_REPEATED", "User"), "SECURITY");
  assert.equal(groupOfAction("JOB_POST_TAKEN_DOWN", "JobPost"), "JOB_POST");
  assert.equal(groupOfAction("SOMETHING_OLD", "Major"), "CATALOG");
  assert.equal(groupOfAction("SOMETHING_OLD", "Interview"), "OTHER");
  assert.equal(groupOfAction("SOMETHING_OLD"), "OTHER");
});

test("readResubmit: chỉ hai hành động gửi tin, thiếu khoá thì false", () => {
  assert.equal(readResubmit("JOB_POST_SUBMITTED", { resubmit: true }), true);
  assert.equal(readResubmit("JOB_POST_AUTO_PUBLISHED", { resubmit: false }), false);
  assert.equal(readResubmit("JOB_POST_SUBMITTED", null), false);
  assert.equal(readResubmit("JOB_POST_SUBMITTED", { resubmit: "true" }), false);
  assert.equal(readResubmit("JOB_POST_APPROVED", { resubmit: true }), null);
});

test("readIp: chỉ dòng nhóm Bảo mật", () => {
  assert.equal(readIp("AUTH_LOGIN_SUCCEEDED", { ip: "203.0.113.7" }), "203.0.113.7");
  assert.equal(readIp("AUTH_PASSWORD_RESET", { via: "reset" }), null);
  assert.equal(readIp("USER_SUSPENDED", { ip: "203.0.113.7" }), null);
});
