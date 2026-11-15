// Chạy: node --import tsx --test tests/unit/embedding-worker-client.test.ts (từ apps/server)
// Bước 2b của chấm lại theo ứng viên (docs/06-backend/live-rescore/PLAN.md, Q7, AD-27 mục 11):
// model embedding trong worker. Kiểm các đường của EmbeddingWorkerClient bằng worker giả:
// trả vector, worker trả lỗi, nạp model hỏng, quá thời gian chờ, worker chết, ref/unref, close.
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import {
  EmbeddingWorkerClient,
  type EmbeddingWorkerHandle,
} from "../../src/infrastructure/embedding-worker-client";
import type { EmbeddingWorkerMessage, EmbeddingWorkerRequest } from "../../src/infrastructure/embedding-worker";
import type { Logger } from "../../src/shared/logger";

class FakeWorker extends EventEmitter {
  readonly posted: EmbeddingWorkerRequest[] = [];
  terminated = false;
  refed = false;

  postMessage(message: EmbeddingWorkerRequest): void {
    this.posted.push(message);
  }
  async terminate(): Promise<number> {
    this.terminated = true;
    return 1;
  }
  ref(): void {
    this.refed = true;
  }
  unref(): void {
    this.refed = false;
  }
  send(message: EmbeddingWorkerMessage): void {
    this.emit("message", message);
  }
  /** Trả kết quả cho việc vừa gửi gần nhất. */
  answerLast(vector: number[]): void {
    const last = this.posted.at(-1);
    assert.ok(last, "worker chưa nhận việc nào");
    this.send({ type: "result", id: last.id, vector });
  }
}

function build(timeoutMs = 1_000) {
  const errors: string[] = [];
  const logger = { info: () => {}, warn: () => {}, error: (m: string) => errors.push(m) } as unknown as Logger;
  const workers: FakeWorker[] = [];
  const client = new EmbeddingWorkerClient({
    logger,
    timeoutMs,
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as EmbeddingWorkerHandle;
    },
  });
  return { client, workers, errors };
}

/** Chờ các callback của Promise chạy xong. */
const flush = () => sleep(0);

test("tạo worker lười, chờ nạp model xong mới gửi việc, trả vector", async () => {
  const { client, workers } = build();
  assert.equal(workers.length, 0);

  const pending = client.embed("react");
  assert.equal(workers.length, 1);
  assert.equal(workers[0]!.posted.length, 0, "chưa ready thì chưa gửi");
  assert.equal(workers[0]!.refed, true, "đang có việc thì giữ process sống");

  workers[0]!.send({ type: "ready" });
  assert.deepEqual(workers[0]!.posted.map((p) => p.text), ["react"]);
  workers[0]!.answerLast([0.1, 0.2]);
  assert.deepEqual(await pending, [0.1, 0.2]);
  assert.equal(workers[0]!.refed, false, "hết việc thì không giữ process");
});

test("gửi từng việc một, theo thứ tự, dùng chung một worker", async () => {
  const { client, workers } = build();
  const a = client.embed("a");
  const b = client.embed("b");
  const c = client.embed("c");
  const worker = workers[0]!;
  worker.send({ type: "ready" });
  assert.deepEqual(worker.posted.map((p) => p.text), ["a"]);
  worker.answerLast([1]);
  assert.deepEqual(worker.posted.map((p) => p.text), ["a", "b"]);
  worker.answerLast([2]);
  worker.answerLast([3]);
  assert.deepEqual(await Promise.all([a, b, c]), [[1], [2], [3]]);
  assert.equal(workers.length, 1);
});

test("worker trả lỗi cho một việc: việc đó null, việc sau vẫn chạy", async () => {
  const { client, workers, errors } = build();
  const a = client.embed("a");
  const b = client.embed("b");
  const worker = workers[0]!;
  worker.send({ type: "ready" });
  worker.send({ type: "result", id: worker.posted[0]!.id, error: "boom" });
  worker.answerLast([2]);
  assert.equal(await a, null);
  assert.deepEqual(await b, [2]);
  assert.equal(errors.length, 1);
  assert.equal(worker.terminated, false);
});

test("nạp model hỏng: mọi việc null, từ đó về sau null luôn và không tạo worker mới", async () => {
  const { client, workers, errors } = build();
  const a = client.embed("a");
  const b = client.embed("b");
  workers[0]!.send({ type: "load-error", message: "no disk space" });
  assert.equal(await a, null);
  assert.equal(await b, null);
  assert.equal(workers[0]!.terminated, true);

  assert.equal(await client.embed("c"), null);
  assert.equal(workers.length, 1);
  assert.equal(errors.length, 1);
});

test("worker chết trước khi nạp xong (vd. không import được gói): coi như không dùng được", async () => {
  const { client, workers } = build();
  const a = client.embed("a");
  workers[0]!.emit("error", new Error("Cannot find module"));
  workers[0]!.emit("exit", 1);
  assert.equal(await a, null);
  assert.equal(await client.embed("b"), null);
  assert.equal(workers.length, 1);
});

test("quá thời gian chờ: việc đang chạy và việc xếp hàng null, lần gọi sau tạo worker mới", async () => {
  const { client, workers, errors } = build(20);
  const a = client.embed("a");
  const b = client.embed("b");
  workers[0]!.send({ type: "ready" });
  assert.equal(await a, null);
  assert.equal(await b, null);
  assert.equal(workers[0]!.terminated, true);
  assert.match(errors[0]!, /timed out/);

  // Kết quả muộn của worker cũ bị bỏ qua.
  workers[0]!.answerLast([9]);

  const c = client.embed("c");
  assert.equal(workers.length, 2);
  workers[1]!.send({ type: "ready" });
  workers[1]!.answerLast([3]);
  assert.deepEqual(await c, [3]);
});

test("thời gian chờ không tính lúc nạp model", async () => {
  const { client, workers } = build(20);
  const a = client.embed("a");
  await sleep(50);
  workers[0]!.send({ type: "ready" });
  workers[0]!.answerLast([1]);
  assert.deepEqual(await a, [1]);
});

test("worker chết sau khi đã nạp: việc đang chờ null, lần gọi sau tạo worker mới", async () => {
  const { client, workers, errors } = build();
  const a = client.embed("a");
  workers[0]!.send({ type: "ready" });
  workers[0]!.emit("exit", 1);
  assert.equal(await a, null);
  assert.match(errors[0]!, /died/);

  const b = client.embed("b");
  assert.equal(workers.length, 2);
  workers[1]!.send({ type: "ready" });
  workers[1]!.answerLast([2]);
  assert.deepEqual(await b, [2]);
});

test("close(): dừng worker, việc đang chờ null, không ghi lỗi", async () => {
  const { client, workers, errors } = build();
  const a = client.embed("a");
  workers[0]!.send({ type: "ready" });
  await client.close();
  assert.equal(await a, null);
  assert.equal(workers[0]!.terminated, true);
  // Sự kiện exit của worker đã dừng không làm gì thêm.
  workers[0]!.emit("exit", 1);
  await flush();
  assert.deepEqual(errors, []);
});

test("tạo worker ném lỗi: không dùng được, trả null", async () => {
  const errors: string[] = [];
  const client = new EmbeddingWorkerClient({
    logger: { info: () => {}, warn: () => {}, error: (m: string) => errors.push(m) } as unknown as Logger,
    createWorker: () => {
      throw new Error("worker file missing");
    },
  });
  assert.equal(await client.embed("a"), null);
  assert.equal(await client.embed("b"), null);
  assert.equal(errors.length, 1);
});
