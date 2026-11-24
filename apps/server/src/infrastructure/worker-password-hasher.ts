import { extname, join } from "node:path";
import { Worker } from "node:worker_threads";
import type { Logger } from "../shared/logger";
import type { PasswordHasher } from "../shared/ports/PasswordHasher";
import type { PasswordHashRequest, PasswordHashResponse } from "./password-hash-worker";

/** Số worker băm mật khẩu (Q4 của AD-31). */
export const PASSWORD_HASH_POOL_SIZE = 2;
/** Một việc băm / so (bcrypt cost 12 ~0,25 s) quá thời gian này thì lỗi và dựng lại worker. */
export const PASSWORD_HASH_TIMEOUT_MS = 10_000;

/** Phần của `Worker` mà pool dùng; test thay bằng bản giả. */
export interface PasswordHashWorkerHandle {
  postMessage(message: PasswordHashRequest): void;
  on(event: "message", listener: (message: PasswordHashResponse) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit", listener: (exitCode: number) => void): unknown;
  terminate(): Promise<number>;
  ref(): void;
  unref(): void;
}

/** Tạo worker thật từ `password-hash-worker.ts` (tsx) hoặc `.js` (dist). */
export function createPasswordHashWorker(): PasswordHashWorkerHandle {
  const file = join(__dirname, `password-hash-worker${extname(__filename)}`);
  return new Worker(file) as unknown as PasswordHashWorkerHandle;
}

type Task = { op: "hash"; password: string; rounds: number } | { op: "compare"; password: string; hash: string };

interface Job {
  task: Task;
  resolve: (result: string | boolean) => void;
  reject: (error: Error) => void;
}

interface InflightJob extends Job {
  id: number;
  timer: NodeJS.Timeout;
}

interface Slot {
  worker: PasswordHashWorkerHandle | null;
  inflight: InflightJob | null;
}

/**
 * Pool worker băm mật khẩu (AD-31 D6). Khác `EmbeddingWorkerClient`: lỗi thì **ném**
 * (đăng nhập trả 500), không âm thầm coi là sai mật khẩu.
 *
 * - Mỗi ô (slot) một worker, tạo lười khi có việc. Mỗi worker chạy một việc một lúc; cả
 *   hai bận thì việc mới xếp hàng. Thời gian chờ tính từ lúc giao việc, không tính lúc xếp hàng.
 * - Quá giờ hoặc worker chết: việc đang chạy của ô đó lỗi, worker bị bỏ, lần sau tạo mới.
 *   Việc đang xếp hàng vẫn chờ ô khác (hoặc worker mới).
 * - Worker chỉ giữ process sống khi đang có việc (`ref` / `unref`).
 */
export class WorkerPasswordHasher implements PasswordHasher {
  private readonly logger: Logger;
  private readonly createWorker: () => PasswordHashWorkerHandle;
  private readonly timeoutMs: number;
  private readonly slots: Slot[];
  private readonly queue: Job[] = [];
  private nextId = 0;

  constructor({
    logger,
    createWorker = createPasswordHashWorker,
    poolSize = PASSWORD_HASH_POOL_SIZE,
    timeoutMs = PASSWORD_HASH_TIMEOUT_MS,
  }: {
    logger: Logger;
    createWorker?: () => PasswordHashWorkerHandle;
    poolSize?: number;
    timeoutMs?: number;
  }) {
    this.logger = logger;
    this.createWorker = createWorker;
    this.timeoutMs = timeoutMs;
    this.slots = Array.from({ length: Math.max(1, poolSize) }, () => ({ worker: null, inflight: null }));
  }

  async hash(password: string, rounds: number): Promise<string> {
    return (await this.run({ op: "hash", password, rounds })) as string;
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return (await this.run({ op: "compare", password, hash })) as boolean;
  }

  /** Dừng mọi worker; việc đang chạy / xếp hàng lỗi. Lần gọi sau tạo worker mới. */
  async close(): Promise<void> {
    const error = new Error("Password hasher closed");
    const workers = this.slots.map((slot) => this.detach(slot, error)).filter((w): w is PasswordHashWorkerHandle => !!w);
    for (const job of this.queue.splice(0)) job.reject(error);
    await Promise.all(workers.map((worker) => worker.terminate().catch(() => undefined)));
  }

  private run(task: Task): Promise<string | boolean> {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.pump();
    });
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (slot.inflight) continue;
      const job = this.queue.shift();
      if (!job) break;
      const worker = slot.worker ?? this.start(slot);
      if (!worker) {
        job.reject(new Error("Could not start password hash worker"));
        continue;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => this.onTimeout(slot, worker, id), this.timeoutMs);
      slot.inflight = { ...job, id, timer };
      worker.postMessage({ id, ...job.task });
    }
    for (const slot of this.slots) {
      if (!slot.worker) continue;
      if (slot.inflight) slot.worker.ref();
      else slot.worker.unref();
    }
  }

  private start(slot: Slot): PasswordHashWorkerHandle | null {
    let worker: PasswordHashWorkerHandle;
    try {
      worker = this.createWorker();
    } catch (error) {
      this.logger.error("Không tạo được worker băm mật khẩu", { message: describe(error) });
      return null;
    }
    slot.worker = worker;
    worker.on("message", (message) => this.onMessage(slot, worker, message));
    worker.on("error", (error) => this.onCrash(slot, worker, error));
    worker.on("exit", (exitCode) => this.onCrash(slot, worker, new Error(`Password hash worker exited with code ${exitCode}`)));
    return worker;
  }

  private onMessage(slot: Slot, worker: PasswordHashWorkerHandle, message: PasswordHashResponse): void {
    const job = slot.inflight;
    if (slot.worker !== worker || !job || job.id !== message.id) return;
    clearTimeout(job.timer);
    slot.inflight = null;
    if ("error" in message) job.reject(new Error(`Password hash failed: ${message.error}`));
    else job.resolve(message.result);
    this.pump();
  }

  private onTimeout(slot: Slot, worker: PasswordHashWorkerHandle, id: number): void {
    if (slot.worker !== worker || slot.inflight?.id !== id) return;
    this.logger.error("Băm mật khẩu quá giờ — dựng lại worker", { timeoutMs: this.timeoutMs });
    this.restart(slot, new Error(`Password hash timed out after ${this.timeoutMs} ms`));
  }

  private onCrash(slot: Slot, worker: PasswordHashWorkerHandle, error: Error): void {
    // Worker đã bị bỏ (quá giờ, close) thì sự kiện exit của nó không còn ý nghĩa.
    if (slot.worker !== worker) return;
    this.logger.error("Worker băm mật khẩu bị dừng — dựng lại khi có việc", { message: error.message });
    this.restart(slot, error);
  }

  private restart(slot: Slot, error: Error): void {
    const worker = this.detach(slot, error);
    void worker?.terminate().catch(() => undefined);
    this.pump();
  }

  /** Bỏ worker của ô, cho việc đang chạy lỗi. Trả worker để bên gọi dừng. */
  private detach(slot: Slot, error: Error): PasswordHashWorkerHandle | null {
    const worker = slot.worker;
    slot.worker = null;
    if (slot.inflight) {
      clearTimeout(slot.inflight.timer);
      slot.inflight.reject(error);
      slot.inflight = null;
    }
    return worker;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
