// Chạy: node --import tsx --test tests/unit/auth/worker-password-hasher.test.ts (từ apps/server)
// AD-31 D6 (docs/06-backend/auth-hardening/PLAN.md bước 5): bcrypt chạy trong pool 2 worker.
// - Worker thật: hash rồi compare đúng / sai; hash do bcryptjs cũ tạo vẫn compare đúng;
//   nhiều việc song song không lẫn kết quả.
// - Worker giả: quá giờ / worker chết ⇒ việc đó lỗi (không trả false), lần sau tạo worker
//   mới; mỗi worker một việc một lúc, việc thừa xếp hàng.
import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {
  PASSWORD_HASH_POOL_SIZE,
  WorkerPasswordHasher,
  type PasswordHashWorkerHandle,
} from "../../../src/infrastructure/worker-password-hasher";
import type { PasswordHashRequest, PasswordHashResponse } from "../../../src/infrastructure/password-hash-worker";

const logger = { error: () => {}, info: () => {}, warn: () => {} } as never;

test("pool mặc định 2 worker", () => {
  assert.equal(PASSWORD_HASH_POOL_SIZE, 2);
});

test("worker thật: hash rồi compare đúng / sai, hash cũ của bcryptjs vẫn dùng được", async () => {
  const hasher = new WorkerPasswordHasher({ logger });
  try {
    const hash = await hasher.hash("mat-khau-123", 4);
    assert.match(hash, /^\$2[aby]\$04\$/);
    assert.equal(await hasher.compare("mat-khau-123", hash), true);
    assert.equal(await hasher.compare("sai", hash), false);

    const legacy = bcrypt.hashSync("mat-khau-cu", 4);
    assert.equal(await hasher.compare("mat-khau-cu", legacy), true);
    assert.equal(bcrypt.compareSync("mat-khau-123", hash), true, "hash mới đọc được bằng bcryptjs trực tiếp");
  } finally {
    await hasher.close();
  }
});

test("worker thật: 8 việc song song không lẫn kết quả", async () => {
  const hasher = new WorkerPasswordHasher({ logger });
  try {
    const passwords = Array.from({ length: 8 }, (_, i) => `mat-khau-${i}`);
    const hashes = await Promise.all(passwords.map((password) => hasher.hash(password, 4)));
    const right = await Promise.all(passwords.map((password, i) => hasher.compare(password, hashes[i])));
    const wrong = await Promise.all(passwords.map((password, i) => hasher.compare(password, hashes[(i + 1) % 8])));
    assert.deepEqual(right, Array(8).fill(true));
    assert.deepEqual(wrong, Array(8).fill(false));
  } finally {
    await hasher.close();
  }
});

/** Worker giả: giữ việc nhận được, test tự trả lời / làm chết. */
class FakeWorker implements PasswordHashWorkerHandle {
  readonly received: PasswordHashRequest[] = [];
  private readonly listeners: Record<string, ((value: never) => void)[]> = {};
  terminated = false;
  refed = false;

  postMessage(message: PasswordHashRequest): void {
    this.received.push(message);
  }
  on(event: string, listener: (value: never) => void): unknown {
    (this.listeners[event] ??= []).push(listener);
    return this;
  }
  emit(event: "message" | "error" | "exit", value: PasswordHashResponse | Error | number): void {
    for (const listener of this.listeners[event] ?? []) listener(value as never);
  }
  reply(result: string | boolean, index = this.received.length - 1): void {
    this.emit("message", { id: this.received[index].id, result });
  }
  async terminate(): Promise<number> {
    this.terminated = true;
    return 0;
  }
  ref(): void {
    this.refed = true;
  }
  unref(): void {
    this.refed = false;
  }
}

function fakePool(options: { poolSize?: number; timeoutMs?: number } = {}) {
  const workers: FakeWorker[] = [];
  const errors: string[] = [];
  const hasher = new WorkerPasswordHasher({
    logger: { error: (message: string) => errors.push(message), info: () => {} } as never,
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    poolSize: options.poolSize ?? 2,
    timeoutMs: options.timeoutMs ?? 1_000,
  });
  return { hasher, workers, errors };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("worker tạo lười; mỗi worker một việc, việc thứ 3 xếp hàng tới khi có worker rảnh", async () => {
  const { hasher, workers } = fakePool();
  assert.equal(workers.length, 0);
  const a = hasher.compare("a", "h");
  const b = hasher.compare("b", "h");
  const c = hasher.compare("c", "h");
  assert.equal(workers.length, 2);
  assert.deepEqual(workers.map((w) => w.received.length), [1, 1]);
  assert.ok(workers.every((w) => w.refed));

  workers[0].reply(true);
  assert.equal(await a, true);
  await tick();
  assert.deepEqual(workers.map((w) => w.received.length), [2, 1]);
  assert.equal(workers[0].received[1].password, "c");

  workers[1].reply(false);
  workers[0].reply(true);
  assert.deepEqual([await b, await c], [false, true]);
  assert.ok(workers.every((w) => !w.refed), "rảnh thì unref để process thoát được");
});

test("quá giờ ⇒ việc đó lỗi (không trả false), worker bị dừng, lần sau tạo worker mới", async () => {
  const { hasher, workers, errors } = fakePool({ poolSize: 1, timeoutMs: 20 });
  await assert.rejects(hasher.compare("a", "h"), /timed out/);
  assert.equal(workers[0].terminated, true);
  assert.equal(errors.length, 1);

  const next = hasher.compare("b", "h");
  assert.equal(workers.length, 2);
  workers[1].reply(true);
  assert.equal(await next, true);
});

test("worker chết ⇒ việc đang chạy lỗi, việc xếp hàng chạy trên worker mới", async () => {
  const { hasher, workers } = fakePool({ poolSize: 1 });
  const a = hasher.hash("a", 4);
  const b = hasher.hash("b", 4);
  workers[0].emit("exit", 1);
  await assert.rejects(a, /exited with code 1/);
  assert.equal(workers.length, 2);
  assert.equal(workers[1].received[0].password, "b");
  workers[1].reply("hash-b");
  assert.equal(await b, "hash-b");
});

test("worker báo lỗi việc (vd. hash hỏng) ⇒ việc đó lỗi, worker giữ nguyên", async () => {
  const { hasher, workers } = fakePool({ poolSize: 1 });
  const a = hasher.compare("a", "khong-phai-hash");
  workers[0].emit("message", { id: workers[0].received[0].id, error: "Invalid salt" });
  await assert.rejects(a, /Invalid salt/);
  const b = hasher.compare("b", "h");
  assert.equal(workers.length, 1);
  workers[0].reply(true);
  assert.equal(await b, true);
});

test("không tạo được worker ⇒ việc lỗi, không treo", async () => {
  const hasher = new WorkerPasswordHasher({
    logger: { error: () => {}, info: () => {} } as never,
    createWorker: () => {
      throw new Error("no threads");
    },
  });
  await assert.rejects(hasher.compare("a", "h"), /Could not start/);
});
