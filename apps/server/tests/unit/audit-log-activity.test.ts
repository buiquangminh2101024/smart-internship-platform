// Chạy: node --import tsx --test tests/unit/audit-log-activity.test.ts (từ apps/server)
// GET /admin/activity, /:id và /export (docs/06-backend/admin-audit-log/PLAN.md L7–L10,
// L13, L34, L35): bộ lọc chuyển đúng xuống repository, `total` chỉ ở trang đầu, `q` hai
// bước, link dòng thanh toán, 404, giới hạn CSV. Repository là bản giả.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../../src/shared/errors/AppError";
import { activityExportQuerySchema, activityListQuerySchema } from "../../src/modules/audit-log/audit-log.dto";
import { AuditLogService, EXPORT_MAX_ROWS, MAX_SEARCH_USERS } from "../../src/modules/audit-log/audit-log.service";

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
  {
    ...BASE,
    id: "a5",
    actorId: null,
    actorRole: null,
    action: "PAYMENT_COMPLETED",
    entityType: "Subscription",
    entityId: "sub-1",
    summary: "Thanh toán",
    metadata: { amount: 499000 },
  },
];

function buildService(options: { total?: number; userIds?: string[]; rateLimitOk?: boolean } = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const auditLogRepository = {
    list: async (...args: unknown[]) => {
      calls.push({ method: "list", args });
      return { items: ROWS, hasMore: true, nextCursor: "a5" };
    },
    count: async (...args: unknown[]) => {
      calls.push({ method: "count", args });
      return options.total ?? ROWS.length;
    },
    findById: async (id: string, archived: boolean) => {
      calls.push({ method: "findById", args: [id, archived] });
      return ROWS.find((row) => row.id === id) ?? null;
    },
    listForExport: async (...args: unknown[]) => {
      calls.push({ method: "listForExport", args });
      return ROWS;
    },
  };
  const service = new AuditLogService({
    auditLogRepository,
    userRepository: {
      findEmailsByIds: async () => new Map([["admin-1", "vy.le@internhub.vn"]]),
      findIdsByEmailContains: async (_q: string, take: number) => {
        calls.push({ method: "findIdsByEmailContains", args: [_q, take] });
        return options.userIds ?? [];
      },
    },
    companySubscriptionRepository: { findCompanyIdsByIds: async () => new Map([["sub-1", "company-9"]]) },
    rateLimiter: { consume: async () => options.rateLimitOk ?? true },
    logger: { error: () => {} },
  } as unknown as ConstructorParameters<typeof AuditLogService>[0]);
  return { service, calls };
}

const listQuery = (query: Record<string, string>) => activityListQuerySchema.parse(query);

test("actor=admin của dashboard lọc actorRole ADMIN; không gửi thì không lọc", async () => {
  const { service, calls } = buildService();
  await service.listActivity(listQuery({ limit: "6", actor: "admin" }));
  await service.listActivity(listQuery({ limit: "6" }));
  const lists = calls.filter((call) => call.method === "list");
  assert.deepEqual(lists[0]?.args, [
    { AND: [{ actorRole: "ADMIN" }] },
    { cursor: undefined, limit: 6, order: "desc", archived: false },
  ]);
  assert.deepEqual(lists[1]?.args[0], {});
});

test("total chỉ có ở trang đầu; archived và order chuyển xuống repository", async () => {
  const { service, calls } = buildService({ total: 1234 });
  const first = await service.listActivity(listQuery({ archived: "true" }));
  assert.equal(first.total, 1234);
  assert.equal(first.nextCursor, "a5");
  assert.deepEqual(calls.find((call) => call.method === "count")?.args, [{}, true]);

  const next = await service.listActivity(listQuery({ cursor: "a5" }));
  assert.equal(next.total, undefined);
  assert.equal(calls.filter((call) => call.method === "count").length, 1);
});

test("q tìm tối đa 200 người, khớp người làm hoặc đối tượng; hơn 200 thì searchTruncated", async () => {
  const many = Array.from({ length: MAX_SEARCH_USERS + 1 }, (_, i) => `u-${i}`);
  const { service, calls } = buildService({ userIds: many });
  const page = await service.listActivity(listQuery({ q: "vy.le" }));
  assert.equal(page.searchTruncated, true);
  assert.deepEqual(calls.find((call) => call.method === "findIdsByEmailContains")?.args, ["vy.le", MAX_SEARCH_USERS + 1]);
  const where = calls.find((call) => call.method === "list")?.args[0] as { AND: Array<{ OR: Array<Record<string, { in: string[] }>> }> };
  assert.equal(where.AND[0]!.OR[0]!.actorId!.in.length, MAX_SEARCH_USERS);

  const { service: few } = buildService({ userIds: ["u-1"] });
  assert.equal((await few.listActivity(listQuery({ q: "vy.le" }))).searchTruncated, undefined);
});

test("mỗi dòng: reason, group, email người làm, companyId của dòng thanh toán", async () => {
  const { service } = buildService();
  const page = await service.listActivity(listQuery({}));
  assert.deepEqual(
    page.items.map((item) => [item.id, item.reason, item.group, item.companyId]),
    [
      ["a1", "Thiếu mức lương", "JOB_POST", null],
      ["a2", null, "JOB_POST", null],
      ["a3", null, "COMPANY", null],
      ["a4", null, "JOB_POST", null],
      ["a5", null, "PAYMENT", "company-9"],
    ],
  );
  assert.equal(page.items[0]?.actorEmail, "vy.le@internhub.vn");
  assert.equal(page.items[4]?.actorEmail, null);
});

test("GET /admin/activity/:id: có thì trả, không có thì 404", async () => {
  const { service, calls } = buildService();
  assert.equal((await service.getActivity("a5", true)).companyId, "company-9");
  assert.deepEqual(calls[0]?.args, ["a5", true]);
  await assert.rejects(
    service.getActivity("khong-co", false),
    (error: unknown) => error instanceof AppError && error.statusCode === 404,
  );
});

test("xuất CSV: quá 5.000 dòng thì 422, quá 10 lần mỗi giờ thì 429, đúng thì có BOM và tên file", async () => {
  const exportQuery = activityExportQuerySchema.parse({});
  const { service: big } = buildService({ total: EXPORT_MAX_ROWS + 1 });
  await assert.rejects(
    big.exportCsv("admin-1", exportQuery),
    (error: unknown) => error instanceof AppError && error.statusCode === 422 && error.code === "AUDIT_EXPORT_TOO_LARGE",
  );

  const { service: limited } = buildService({ rateLimitOk: false });
  await assert.rejects(
    limited.exportCsv("admin-1", exportQuery),
    (error: unknown) => error instanceof AppError && error.statusCode === 429,
  );

  const { service } = buildService();
  const csv = await service.exportCsv("admin-1", exportQuery, new Date("2026-10-18T20:00:00Z"));
  assert.equal(csv.fileName, "nhat-ky-20261019.csv");
  assert.equal(csv.content.charCodeAt(0), 0xfeff);
  assert.equal(csv.content.trimEnd().split("\r\n").length, ROWS.length + 1);
});
