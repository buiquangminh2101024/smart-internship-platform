// Chạy: node --import tsx --test tests/unit/employer-identity-cache.test.ts (từ apps/server)
// AD-19 — cache userId → {employerId, companyId}. Repository và đồng hồ đều giả.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../../src/shared/errors/AppError";
import type { Logger } from "../../src/shared/logger";
import type { EmployerRepository } from "../../src/modules/employers/employer.repository";
import { EmployerIdentityCache } from "../../src/modules/employers/employer-identity-cache";

type Row = { id: string; companyId: string } | null;

class FakeRepository {
  rows = new Map<string, Row>();
  calls: string[] = [];
  error: Error | null = null;
  /** Đặt thì lần tra kế tiếp treo tới khi gọi release(). */
  hold = false;
  private releases: (() => void)[] = [];

  async findIdentityByUserId(userId: string): Promise<Row> {
    this.calls.push(userId);
    if (this.hold) await new Promise<void>((resolve) => this.releases.push(resolve));
    if (this.error) throw this.error;
    return this.rows.get(userId) ?? null;
  }

  release(): void {
    this.hold = false;
    for (const resolve of this.releases.splice(0)) resolve();
  }
}

class FakeLogger {
  warns: { message: string; meta?: Record<string, unknown> }[] = [];
  info() {}
  error() {}
  warn(message: string, meta?: Record<string, unknown>) {
    this.warns.push({ message, meta });
  }
}

function setup(options: { ttlMs?: number; maxEntries?: number } = {}) {
  const repo = new FakeRepository();
  const logger = new FakeLogger();
  const clock = { t: 1_000_000 };
  const cache = new EmployerIdentityCache(
    { employerRepository: repo as unknown as EmployerRepository, logger: logger as unknown as Logger },
    { ttlMs: options.ttlMs ?? 60_000, maxEntries: options.maxEntries ?? 100, now: () => clock.t },
  );
  for (let i = 1; i <= 20; i++) repo.rows.set(`u${i}`, { id: `e${i}`, companyId: `co${i}` });
  return { repo, logger, clock, cache };
}

test("lần 2 lấy từ cache, repository chỉ được gọi 1 lần", async () => {
  const { repo, cache } = setup();
  const first = await cache.get("u1");
  const second = await cache.get("u1");
  assert.deepEqual(first, { userId: "u1", employerId: "e1", companyId: "co1" });
  assert.deepEqual(second, first);
  assert.deepEqual(repo.calls, ["u1"]);
});

test("null không được lưu: Employer vừa làm thủ tục xong thấy được ngay", async () => {
  const { repo, cache } = setup();
  assert.equal(await cache.get("new"), null);
  repo.rows.set("new", { id: "e-new", companyId: "co-new" });
  assert.equal((await cache.get("new"))?.employerId, "e-new");
  assert.deepEqual(repo.calls, ["new", "new"]);
});

test("lỗi DB được ném tiếp và không được lưu", async () => {
  const { repo, cache } = setup();
  repo.error = new Error("db down");
  await assert.rejects(cache.get("u1"), /db down/);
  repo.error = null;
  assert.equal((await cache.get("u1"))?.companyId, "co1");
  assert.equal(repo.calls.length, 2);
});

test("quá TTL thì hỏi lại DB", async () => {
  const { repo, clock, cache } = setup({ ttlMs: 60_000 });
  await cache.get("u1");
  clock.t += 59_999;
  await cache.get("u1");
  assert.equal(repo.calls.length, 1);
  clock.t += 1;
  await cache.get("u1");
  assert.equal(repo.calls.length, 2);
});

test("invalidate xoá mục", async () => {
  const { repo, cache } = setup();
  await cache.get("u1");
  cache.invalidate("u1");
  await cache.get("u1");
  assert.equal(repo.calls.length, 2);
});

test("invalidate trong lúc đang tra thì kết quả đó không được lưu", async () => {
  const { repo, cache } = setup();
  repo.hold = true;
  const stale = cache.get("u1");
  cache.invalidate("u1");
  repo.release();
  assert.equal((await stale)?.employerId, "e1"); // request đang chạy vẫn nhận kết quả
  await cache.get("u1");
  assert.equal(repo.calls.length, 2);
  await cache.get("u1"); // lần tra sau invalidate thì được lưu bình thường
  assert.equal(repo.calls.length, 2);
});

test("nhiều request cùng thiếu cache chỉ hỏi DB 1 lần", async () => {
  const { repo, cache } = setup();
  repo.hold = true;
  const all = Promise.all([cache.get("u1"), cache.get("u1"), cache.require("u1")]);
  await Promise.resolve();
  repo.release();
  const results = await all;
  assert.deepEqual(repo.calls, ["u1"]);
  for (const result of results) assert.equal(result?.companyId, "co1");
});

test("vượt trần: mục đã hết hạn bị dọn trước, mục còn hạn không bị đụng", async () => {
  const { repo, logger, clock, cache } = setup({ ttlMs: 60_000, maxEntries: 3 });
  await cache.get("u1");
  await cache.get("u2");
  clock.t += 30_000;
  await cache.get("u3");
  clock.t += 30_000; // u1, u2 hết hạn; u3 còn hạn
  await cache.get("u4"); // 4 > 3 ⇒ dọn u1, u2
  repo.calls.length = 0;

  await cache.get("u3");
  await cache.get("u4");
  assert.deepEqual(repo.calls, []);
  assert.equal(logger.warns.length, 0);
});

test("vượt trần mà không có mục hết hạn: bỏ mục cũ nhất còn hạn, warn tối đa 1 lần/phút", async () => {
  const { repo, logger, clock, cache } = setup({ ttlMs: 10 * 60_000, maxEntries: 3 });
  for (const userId of ["u1", "u2", "u3", "u4", "u5"]) await cache.get(userId); // bỏ u1, u2
  assert.equal(logger.warns.length, 1);
  assert.equal(logger.warns[0].meta?.evicted, 1);
  assert.ok(!JSON.stringify(logger.warns).includes("u1"), "không ghi userId vào log");

  repo.calls.length = 0;
  for (const userId of ["u3", "u4", "u5"]) await cache.get(userId);
  assert.deepEqual(repo.calls, []);
  await cache.get("u1");
  assert.deepEqual(repo.calls, ["u1"]);

  clock.t += 60_000;
  await cache.get("u6");
  assert.equal(logger.warns.length, 2);
  assert.equal(logger.warns[1].meta?.evicted, 3); // u2 (cùng phút đầu), u3, u4
});

test("require ném 404 với đúng thông báo cũ", async () => {
  const { cache } = setup();
  await assert.rejects(cache.require("nobody"), (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 404);
    assert.equal(error.message, "Employer profile not found");
    return true;
  });
});
