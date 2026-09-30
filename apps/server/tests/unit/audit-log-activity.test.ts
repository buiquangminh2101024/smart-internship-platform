// Chạy: node --import tsx --test tests/unit/audit-log-activity.test.ts (từ apps/server)
// GET /admin/activity (D14): bộ lọc `actor` chuyển đúng xuống repository, và
// `reason` đọc từ metadata.reason. Repository là bản giả.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AuditLogService } from "../../src/modules/audit-log/audit-log.service";

const BASE = {
  actorId: "admin-1",
  actorRole: "ADMIN",
  entityType: "JobPost",
  entityId: "job-1",
  createdAt: new Date("2026-09-30T01:00:00Z"),
};

const ROWS = [
  { ...BASE, id: "a1", action: "JOB_POST_REJECTED", summary: "Từ chối tin", metadata: { reason: "Thiếu mức lương" } },
  { ...BASE, id: "a2", action: "JOB_POST_APPROVED", summary: "Duyệt tin", metadata: null },
  { ...BASE, id: "a3", action: "COMPANY_REQUIRES_APPROVAL_CHANGED", summary: "Tắt kiểm duyệt", metadata: { requiresApproval: false } },
  { ...BASE, id: "a4", action: "JOB_POST_TAKEN_DOWN", summary: "Gỡ tin", metadata: { reason: "   " } },
];

function buildService() {
  const calls: unknown[] = [];
  const auditLogRepository = {
    listLatest: async (options: unknown) => {
      calls.push(options);
      return { items: ROWS, hasMore: false };
    },
  };
  const service = new AuditLogService({
    auditLogRepository,
    userRepository: { findEmailsByIds: async () => new Map([["admin-1", "vy.le@internhub.vn"]]) },
    logger: { error: () => {} },
  } as unknown as ConstructorParameters<typeof AuditLogService>[0]);
  return { service, calls };
}

test("actor=admin lọc actorRole ADMIN; không truyền / all thì không lọc", async () => {
  const { service, calls } = buildService();
  await service.listActivity({ limit: 20, actor: "admin" });
  await service.listActivity({ limit: 20, actor: "all" });
  await service.listActivity({ limit: 20 });
  assert.deepEqual(calls, [
    { cursor: undefined, limit: 20, actorRole: "ADMIN" },
    { cursor: undefined, limit: 20 },
    { cursor: undefined, limit: 20 },
  ]);
});

test("reason lấy từ metadata.reason, dòng khác là null", async () => {
  const { service } = buildService();
  const page = await service.listActivity({ limit: 20 });
  assert.deepEqual(
    page.items.map((item) => [item.id, item.reason]),
    [
      ["a1", "Thiếu mức lương"],
      ["a2", null],
      ["a3", null],
      ["a4", null],
    ],
  );
  assert.equal(page.items[0]?.actorEmail, "vy.le@internhub.vn");
  assert.equal(page.items[0]?.summary, "Từ chối tin");
});
