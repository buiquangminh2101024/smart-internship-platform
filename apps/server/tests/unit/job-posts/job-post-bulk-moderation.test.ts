/**
 * AD-29 bước 7 — duyệt / từ chối hàng loạt: mỗi tin một transaction, tối đa N tin cùng lúc,
 * chờ có giới hạn rồi chạy tiếp ở nền; bỏ qua đúng lý do; ghi `bulk`, điểm, batchId.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BulkModerationBatches } from "../../../src/modules/job-posts/bulk-moderation-batches";
import { bulkApproveSchema, bulkRejectSchema } from "../../../src/modules/job-posts/job-posts.dto";
import { JobPostsService } from "../../../src/modules/job-posts/job-posts.service";
import { NotificationsService } from "../../../src/modules/notifications/notifications.service";
import { AppError } from "../../../src/shared/errors/AppError";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Chờ tới khi lô không còn tin đang chạy (trần 2 s) — không dùng sleep cố định, tránh chập chờn khi máy bận. */
async function untilSettled(read: () => { pending: string[] } | null): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const result = read();
    if (result && result.pending.length === 0) return;
    await sleep(5);
  }
}

// ─── BulkModerationBatches ────────────────────────────────────────────────

test("lô: không quá `concurrency` tin cùng lúc, kết quả giữ thứ tự id gửi lên", async () => {
  const batches = new BulkModerationBatches({ concurrency: 2, syncMs: 1_000 });
  let running = 0;
  let peak = 0;
  const result = await batches.run({
    batchId: "b1",
    adminId: "admin-1",
    action: "APPROVE",
    ids: ["a", "b", "c", "d", "e"],
    worker: async (id) => {
      running++;
      peak = Math.max(peak, running);
      await sleep(id === "a" ? 15 : 5); // "a" xong sau cùng
      running--;
      return id === "c" ? "NOT_PENDING" : "OK";
    },
  });
  assert.equal(peak, 2);
  assert.deepEqual(result, {
    batchId: "b1",
    action: "APPROVE",
    succeeded: ["a", "b", "d", "e"],
    skipped: [{ id: "c", reason: "NOT_PENDING" }],
    pending: [],
  });
});

test("lô: quá thời gian chờ ⇒ trả phần đã xong + pending, phần còn lại chạy tiếp ở nền", async () => {
  const batches = new BulkModerationBatches({ concurrency: 1, syncMs: 20 });
  const first = await batches.run({
    batchId: "b2",
    adminId: "admin-1",
    action: "REJECT",
    ids: ["a", "b", "c"],
    worker: async (id) => {
      await sleep(id === "a" ? 1 : 30);
      return "OK";
    },
  });
  assert.deepEqual(first.succeeded, ["a"]);
  assert.deepEqual(first.pending, ["b", "c"]);

  await untilSettled(() => batches.get("b2", "admin-1"));
  const later = batches.get("b2", "admin-1");
  assert.deepEqual(later?.succeeded, ["a", "b", "c"]);
  assert.deepEqual(later?.pending, []);
  // Admin khác không đọc được lô.
  assert.equal(batches.get("b2", "admin-2"), null);
});

test("lô: worker ném lỗi ⇒ FAILED cho đúng tin đó; lô hết hạn sau TTL kể từ lúc xong", async () => {
  let now = 1_000;
  const batches = new BulkModerationBatches({ syncMs: 1_000, ttlMs: 100, now: () => now });
  const result = await batches.run({
    batchId: "b3",
    adminId: "admin-1",
    action: "APPROVE",
    ids: ["a", "b"],
    worker: async (id) => {
      if (id === "a") throw new Error("boom");
      return "OK";
    },
  });
  assert.deepEqual(result.skipped, [{ id: "a", reason: "FAILED" }]);
  assert.deepEqual(result.succeeded, ["b"]);
  now += 100;
  assert.notEqual(batches.get("b3", "admin-1"), null);
  now += 1;
  assert.equal(batches.get("b3", "admin-1"), null);
});

// ─── zod ──────────────────────────────────────────────────────────────────

test("body: 1–50 id, không trùng; lý do từ chối có thể bỏ trống", () => {
  assert.equal(bulkApproveSchema.safeParse({ ids: [] }).success, false);
  assert.equal(bulkApproveSchema.safeParse({ ids: ["a", "a"] }).success, false);
  assert.equal(bulkApproveSchema.safeParse({ ids: Array.from({ length: 51 }, (_, i) => `id-${i}`) }).success, false);
  assert.equal(bulkApproveSchema.safeParse({ ids: Array.from({ length: 50 }, (_, i) => `id-${i}`) }).success, true);
  assert.deepEqual(bulkRejectSchema.parse({ ids: ["a"] }), { ids: ["a"] });
  assert.equal(bulkRejectSchema.safeParse({ ids: ["a"], reason: "  " }).success, false);
});

// ─── JobPostsService ──────────────────────────────────────────────────────

const REASON_BREAKDOWN = {
  criteria: [
    {
      key: "content",
      label: "Chất lượng nội dung",
      weight: 0.2,
      score: 65,
      issues: [{ code: "DESCRIPTION_TOO_SHORT", penalty: 35, message: "Mô tả công việc quá ngắn (90/150 ký tự)." }],
    },
  ],
  flags: [],
};
const AUTO_REASON = "Thiếu thông tin. Mô tả công việc quá ngắn (90/150 ký tự).";

interface FakePost {
  id: string;
  status: string;
  title: string;
  companyId: string;
  company: { name: string };
  qualityBreakdown: unknown;
  qualityScore: number | null;
  qualityBand: string | null;
  autoOutreachEnabled: boolean;
}

function post(id: string, overrides: Partial<FakePost> = {}): FakePost {
  return {
    id,
    status: "PENDING",
    title: `Tin ${id}`,
    companyId: "co-1",
    company: { name: "Công ty A" },
    qualityBreakdown: REASON_BREAKDOWN,
    qualityScore: 85,
    qualityBand: "SUGGEST_APPROVE",
    autoOutreachEnabled: false,
    ...overrides,
  };
}

function buildService(options: {
  posts: FakePost[];
  /** id thua cuộc đua ở bước đổi trạng thái có điều kiện. */
  lostRace?: string[];
  /** id có breakdown đọc lại trong transaction khác bản đọc trước. */
  freshBreakdown?: Record<string, unknown>;
  failOn?: string;
  rateAllowed?: boolean | "throw";
  batches?: BulkModerationBatches;
  txDelayMs?: number;
}) {
  const writes: { kind: string; id: string; data?: unknown }[] = [];
  const triggers: string[] = [];
  const enqueued: { jobPostId: string; companyId: string; autoOutreachEnabled: boolean }[][] = [];
  let transactions = 0;
  let committed = 0;
  const byId = new Map(options.posts.map((p) => [p.id, p]));

  const jobPostRepository = {
    findForBulkModeration: async (ids: string[]) => ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])),
    transitionIfStatus: async (id: string, _from: string, data: unknown) => {
      if (options.lostRace?.includes(id)) return false;
      if (options.failOn === id) throw new Error("db down");
      writes.push({ kind: "transition", id, data });
      return true;
    },
    findQuality: async (id: string) => {
      const p = byId.get(id)!;
      const breakdown = options.freshBreakdown && id in options.freshBreakdown ? options.freshBreakdown[id] : p.qualityBreakdown;
      return { qualityScore: p.qualityScore, qualityBand: p.qualityBand, qualityBreakdown: breakdown };
    },
    createModerationAction: async (data: { jobPostId: string }) => {
      writes.push({ kind: "action", id: data.jobPostId, data });
    },
  };
  const employerRepository = {
    findRecipientsByCompanyIds: async (companyIds: string[]) =>
      new Map(companyIds.map((companyId) => [companyId, [{ userId: `emp-${companyId}`, email: `${companyId}@x.vn` }]])),
  };
  const notificationsService = {
    notifyRecipients: async (type: string, recipients: unknown, data: { jobPostId: string }) => {
      writes.push({ kind: `notify:${type}`, id: data.jobPostId, data: { recipients, ...data } });
    },
  };
  const auditLogService = {
    record: async (entry: { entityId: string; action: string; metadata: unknown }) => {
      writes.push({ kind: `audit:${entry.action}`, id: entry.entityId, data: entry.metadata });
    },
  };
  const prisma = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transactions++;
      if (options.txDelayMs) await sleep(options.txDelayMs);
      const result = await fn({});
      committed++;
      return result;
    },
  };
  const rateLimiter = {
    consume: async () => {
      if (options.rateAllowed === "throw") throw new Error("redis down");
      return options.rateAllowed ?? true;
    },
  };
  const service = new JobPostsService({
    prisma,
    jobPostRepository,
    employerRepository,
    notificationsService,
    auditLogService,
    rateLimiter,
    logger: { error: () => {}, info: () => {}, warn: () => {} },
    matchScoreTrigger: (id: string) => triggers.push(`match:${id}`),
    autoOutreachTrigger: (id: string) => triggers.push(`outreach:${id}`),
    bulkModerationBatches: options.batches ?? new BulkModerationBatches({ syncMs: 1_000 }),
    publishFollowUpService: { enqueue: (items: (typeof enqueued)[number]) => void enqueued.push(items) },
  } as unknown as ConstructorParameters<typeof JobPostsService>[0]);
  return { service, writes, triggers, enqueued, counts: () => ({ transactions, committed }) };
}

test("duyệt hàng loạt: đúng succeeded / skipped, mỗi tin chờ duyệt một transaction, việc sau duyệt qua hàng đợi (không gọi trigger)", async () => {
  const { service, writes, triggers, enqueued, counts } = buildService({
    posts: [
      post("p1"),
      post("p2", { status: "PUBLISHED" }),
      post("p3", { companyId: "co-2", autoOutreachEnabled: true }),
      post("p4"),
    ],
    lostRace: ["p4"],
  });
  const result = await service.bulkApprove("admin-1", ["p1", "p2", "missing", "p3", "p4"]);

  assert.deepEqual(result.succeeded, ["p1", "p3"]);
  assert.deepEqual(result.skipped, [
    { id: "p2", reason: "NOT_PENDING" },
    { id: "missing", reason: "NOT_FOUND" },
    { id: "p4", reason: "NOT_PENDING" }, // Admin khác vừa xử lý (bước 5)
  ]);
  assert.deepEqual(result.pending, []);
  assert.equal(result.action, "APPROVE");
  // p2 và "missing" bị bỏ qua từ bản đọc trước, không mở transaction.
  assert.equal(counts().transactions, 3);
  // Bước 8: không gọi matchScoreTrigger / autoOutreachTrigger từng tin; một lần enqueue các tin đã duyệt.
  assert.deepEqual(triggers, []);
  assert.deepEqual(enqueued, [
    [
      { jobPostId: "p1", companyId: "co-1", autoOutreachEnabled: false },
      { jobPostId: "p3", companyId: "co-2", autoOutreachEnabled: true },
    ],
  ]);

  const p1 = writes.filter((w) => w.id === "p1").map((w) => w.kind);
  assert.deepEqual(p1, ["transition", "action", "notify:JOB_POST_APPROVED", "audit:JOB_POST_APPROVED"]);
  assert.deepEqual(writes.find((w) => w.id === "p1" && w.kind === "action")?.data, {
    jobPostId: "p1",
    action: "APPROVED",
    actorId: "admin-1",
    bulk: true,
    qualityScore: 85,
    qualityBand: "SUGGEST_APPROVE",
  });
  assert.deepEqual(writes.find((w) => w.id === "p1" && w.kind.startsWith("audit"))?.data, {
    bulk: true,
    batchId: result.batchId,
    qualityScore: 85,
    qualityBand: "SUGGEST_APPROVE",
  });
  // Người nhận lấy từ bản đọc trước theo công ty.
  const notifyP3 = writes.find((w) => w.id === "p3" && w.kind.startsWith("notify"))?.data as { recipients: unknown };
  assert.deepEqual(notifyP3.recipients, [{ userId: "emp-co-2", email: "co-2@x.vn" }]);
  // Tin thua cuộc đua không ghi gì.
  assert.equal(writes.filter((w) => w.id === "p4").length, 0);
});

test("từ chối hàng loạt không kèm lý do: lý do tự sinh từ điểm; tin chưa chấm ⇒ REASON_REQUIRED, không mở transaction", async () => {
  const { service, writes, enqueued, counts } = buildService({
    posts: [post("p1"), post("p2", { qualityBreakdown: null, qualityScore: null, qualityBand: null })],
  });
  const result = await service.bulkReject("admin-1", ["p1", "p2"], undefined);

  assert.deepEqual(result.succeeded, ["p1"]);
  assert.deepEqual(enqueued, []); // từ chối không có việc sau duyệt
  assert.deepEqual(result.skipped, [{ id: "p2", reason: "REASON_REQUIRED" }]);
  assert.equal(counts().transactions, 1);
  const action = writes.find((w) => w.kind === "action")?.data as { reason: string; bulk: boolean };
  assert.equal(action.reason, AUTO_REASON);
  assert.equal(action.bulk, true);
  const notify = writes.find((w) => w.kind === "notify:JOB_POST_REJECTED")?.data as { reason: string };
  assert.equal(notify.reason, AUTO_REASON);
  const audit = writes.find((w) => w.kind === "audit:JOB_POST_REJECTED")?.data as { reason: string; bulk: boolean };
  assert.equal(audit.reason, AUTO_REASON);
  assert.equal(audit.bulk, true);
  // Từ chối đưa tin về nháp.
  assert.deepEqual(writes.find((w) => w.kind === "transition")?.data, { status: "DRAFT" });
});

test("từ chối hàng loạt: lý do Admin ghi dùng cho mọi tin, kể cả tin không có lỗi nào", async () => {
  const { service, writes } = buildService({ posts: [post("p1"), post("p2", { qualityBreakdown: null })] });
  const result = await service.bulkReject("admin-1", ["p1", "p2"], "Trùng tin đã đăng");
  assert.deepEqual(result.succeeded, ["p1", "p2"]);
  const reasons = writes.filter((w) => w.kind === "action").map((w) => (w.data as { reason: string }).reason);
  assert.deepEqual(reasons, ["Trùng tin đã đăng", "Trùng tin đã đăng"]);
});

test("từ chối hàng loạt: điểm đọc lại trong transaction không còn lý do ⇒ rollback, REASON_REQUIRED", async () => {
  const { service, writes, counts } = buildService({
    posts: [post("p1")],
    freshBreakdown: { p1: { criteria: [], flags: [] } }, // lối chấm nền vừa ghi điểm sạch
  });
  const result = await service.bulkReject("admin-1", ["p1"], undefined);
  assert.deepEqual(result.skipped, [{ id: "p1", reason: "REASON_REQUIRED" }]);
  // Transaction đã mở nhưng không commit (fake: ném ra trước khi đếm committed).
  assert.deepEqual(counts(), { transactions: 1, committed: 0 });
  assert.equal(writes.filter((w) => w.kind !== "transition").length, 0);
});

test("lỗi bất ngờ ở một tin ⇒ FAILED, các tin khác vẫn chạy", async () => {
  const { service } = buildService({ posts: [post("p1"), post("p2"), post("p3")], failOn: "p2" });
  const result = await service.bulkApprove("admin-1", ["p1", "p2", "p3"]);
  assert.deepEqual(result.succeeded, ["p1", "p3"]);
  assert.deepEqual(result.skipped, [{ id: "p2", reason: "FAILED" }]);
});

test("quá thời gian chờ ⇒ pending; bulkResult trả kết quả mới nhất, lô lạ ⇒ 404; việc sau duyệt chờ cả phần chạy nền", async () => {
  const { service, enqueued } = buildService({
    posts: [post("p1"), post("p2")],
    batches: new BulkModerationBatches({ concurrency: 1, syncMs: 5 }),
    txDelayMs: 15,
  });
  const first = await service.bulkApprove("admin-1", ["p1", "p2"]);
  assert.deepEqual(first.pending, ["p1", "p2"]);
  assert.deepEqual(enqueued, []); // lô chưa xong ⇒ chưa enqueue
  await untilSettled(() => service.bulkResult("admin-1", first.batchId));
  assert.deepEqual(service.bulkResult("admin-1", first.batchId).succeeded, ["p1", "p2"]);
  assert.deepEqual(
    enqueued.map((items) => items.map((item) => item.jobPostId)),
    [["p1", "p2"]],
  );
  assert.throws(
    () => service.bulkResult("admin-2", first.batchId),
    (error: unknown) => error instanceof AppError && error.statusCode === 404,
  );
});

test("rate limit: vượt ⇒ 429, chưa đọc gì; Redis lỗi ⇒ vẫn cho chạy", async () => {
  const blocked = buildService({ posts: [post("p1")], rateAllowed: false });
  await assert.rejects(
    blocked.service.bulkApprove("admin-1", ["p1"]),
    (error: unknown) => error instanceof AppError && error.statusCode === 429,
  );
  assert.equal(blocked.counts().transactions, 0);

  const redisDown = buildService({ posts: [post("p1")], rateAllowed: "throw" });
  assert.deepEqual((await redisDown.service.bulkApprove("admin-1", ["p1"])).succeeded, ["p1"]);
});

// ─── NotificationsService.notifyRecipients ───────────────────────────────

test("notifyRecipients: thông báo một câu, outbox một câu kèm đúng email, đẩy realtime từng người", async () => {
  const calls: string[] = [];
  let outboxRows: { aggregateId: string; payload: { to: string } }[] = [];
  const pushed: string[] = [];
  const service = new NotificationsService({
    prisma: {},
    notificationsRepository: {
      createManyAndReturn: async (rows: { userId: string; type: string; title: string; body: string; link: string }[]) => {
        calls.push(`notifications:${rows.length}`);
        return rows.map((row, i) => ({ ...row, id: `n${i}`, createdAt: new Date() }));
      },
    },
    outboxRepository: {
      createMany: async (rows: typeof outboxRows) => {
        calls.push(`outbox:${rows.length}`);
        outboxRows = rows;
      },
    },
    realtimeNotifier: { pushToUser: (userId: string) => void pushed.push(userId) },
    logger: { warn: () => {}, error: () => {}, info: () => {} },
    config: { CORS_ORIGIN: "http://localhost:3000" },
  } as unknown as ConstructorParameters<typeof NotificationsService>[0]);

  await service.notifyRecipients(
    "JOB_POST_APPROVED",
    [
      { userId: "u1", email: "u1@x.vn" },
      { userId: "u2", email: "u2@x.vn" },
    ],
    { jobPostId: "job-1", jobPostTitle: "Thực tập Backend" },
    {} as never,
  );
  assert.deepEqual(calls, ["notifications:2", "outbox:2"]);
  assert.deepEqual(
    outboxRows.map((row) => [row.aggregateId, row.payload.to]),
    [
      ["n0", "u1@x.vn"],
      ["n1", "u2@x.vn"],
    ],
  );
  assert.deepEqual(pushed, ["u1", "u2"]);

  calls.length = 0;
  await service.notifyRecipients("JOB_POST_APPROVED", [], { jobPostId: "job-1", jobPostTitle: "X" });
  assert.deepEqual(calls, []);
});
