import { extname, join } from "node:path";
import { Worker } from "node:worker_threads";
import type { Logger } from "../shared/logger";
import type { EmbeddingWorkerData, EmbeddingWorkerMessage, EmbeddingWorkerRequest } from "./embedding-worker";

/** Một lần embed (đã có model) quá thời gian này thì trả null và dựng lại worker. */
export const EMBEDDING_TIMEOUT_MS = 10_000;

/** Phần của `Worker` mà client dùng; test thay bằng bản giả. */
export interface EmbeddingWorkerHandle {
  postMessage(message: EmbeddingWorkerRequest): void;
  on(event: "message", listener: (message: EmbeddingWorkerMessage) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit", listener: (exitCode: number) => void): unknown;
  terminate(): Promise<number>;
  ref(): void;
  unref(): void;
}

/** Tạo worker thật từ `embedding-worker.ts` (tsx) hoặc `embedding-worker.js` (dist). */
export function createEmbeddingWorker(data: EmbeddingWorkerData): EmbeddingWorkerHandle {
  const file = join(__dirname, `embedding-worker${extname(__filename)}`);
  return new Worker(file, { workerData: data }) as unknown as EmbeddingWorkerHandle;
}

interface Job {
  text: string;
  resolve: (vector: number[] | null) => void;
}

interface InflightJob extends Job {
  id: number;
  timer: NodeJS.Timeout;
}

/**
 * Gửi việc embed sang một worker giữ model (Q7, AD-27 mục 11). Hành vi giữ như khi model
 * chạy trên luồng chính: mọi lỗi trả `null`, không ném.
 *
 * - Worker tạo lười ở lần gọi đầu. Nạp model hỏng (hoặc worker chết trước khi nạp xong)
 *   thì đánh dấu không dùng được và trả `null` từ đó về sau, không thử nạp lại.
 * - Gửi từng việc một: thời gian chờ đo đúng một lần embed, không tính lúc nạp model hay
 *   lúc xếp hàng.
 * - Quá thời gian chờ hoặc worker chết sau khi đã nạp xong: các việc đang chờ trả `null`,
 *   lần gọi sau tạo worker mới.
 * - Worker chỉ giữ process sống khi đang có việc (`ref` / `unref`), nên script dùng
 *   `SkillEmbeddingService` tự thoát khi xong mà không cần gọi `close()`.
 */
export class EmbeddingWorkerClient {
  private readonly logger: Logger;
  private readonly createWorker: () => EmbeddingWorkerHandle;
  private readonly timeoutMs: number;
  private worker: EmbeddingWorkerHandle | null = null;
  private ready = false;
  private unavailable = false;
  private readonly queue: Job[] = [];
  private inflight: InflightJob | null = null;
  private nextId = 0;

  constructor({
    logger,
    createWorker,
    timeoutMs = EMBEDDING_TIMEOUT_MS,
  }: {
    logger: Logger;
    createWorker: () => EmbeddingWorkerHandle;
    timeoutMs?: number;
  }) {
    this.logger = logger;
    this.createWorker = createWorker;
    this.timeoutMs = timeoutMs;
  }

  /** Vector đã chuẩn hoá độ dài, hoặc null nếu model không dùng được / lỗi / quá giờ. */
  embed(text: string): Promise<number[] | null> {
    if (this.unavailable) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.queue.push({ text, resolve });
      if (!this.worker && !this.startWorker()) return;
      this.pump();
    });
  }

  /** Dừng worker; việc đang chờ trả null. Lần gọi `embed` sau tạo worker mới. */
  async close(): Promise<void> {
    const worker = this.detachWorker();
    this.failAll();
    if (worker) await worker.terminate().catch(() => undefined);
  }

  private startWorker(): boolean {
    let worker: EmbeddingWorkerHandle;
    try {
      worker = this.createWorker();
    } catch (error) {
      this.markUnavailable(error);
      return false;
    }
    this.worker = worker;
    this.ready = false;
    worker.on("message", (message) => this.onMessage(worker, message));
    worker.on("error", (error) => this.onCrash(worker, error));
    worker.on("exit", (exitCode) => this.onCrash(worker, new Error(`Embedding worker exited with code ${exitCode}`)));
    return true;
  }

  private pump(): void {
    const worker = this.worker;
    if (!worker) return;
    if (this.ready && !this.inflight) {
      const job = this.queue.shift();
      if (job) {
        const id = this.nextId++;
        const timer = setTimeout(() => this.onTimeout(worker, id), this.timeoutMs);
        this.inflight = { ...job, id, timer };
        worker.postMessage({ id, text: job.text });
      }
    }
    // Chỉ giữ process sống khi còn việc (kể cả lúc đang nạp model cho việc đầu tiên).
    if (this.inflight || this.queue.length > 0) worker.ref();
    else worker.unref();
  }

  private onMessage(worker: EmbeddingWorkerHandle, message: EmbeddingWorkerMessage): void {
    if (worker !== this.worker) return;
    switch (message.type) {
      case "ready":
        this.ready = true;
        this.pump();
        return;
      case "load-error":
        this.markUnavailable(message.message);
        return;
      case "result": {
        const job = this.inflight;
        if (!job || job.id !== message.id) return;
        clearTimeout(job.timer);
        this.inflight = null;
        if ("error" in message) {
          this.logger.error("Failed to compute skill embedding", { error: message.error });
          job.resolve(null);
        } else {
          job.resolve(message.vector);
        }
        this.pump();
        return;
      }
    }
  }

  private onTimeout(worker: EmbeddingWorkerHandle, id: number): void {
    if (worker !== this.worker || this.inflight?.id !== id) return;
    this.logger.error("Embedding timed out — restarting the embedding worker on next use", { timeoutMs: this.timeoutMs });
    this.restart();
  }

  private onCrash(worker: EmbeddingWorkerHandle, error: Error): void {
    // Worker đã bị tách (tự dừng, quá giờ, close) thì sự kiện exit của nó không còn ý nghĩa.
    if (worker !== this.worker) return;
    if (!this.ready) {
      this.markUnavailable(error);
      return;
    }
    this.logger.error("Embedding worker died — restarting it on next use", { error: error.message });
    this.restart();
  }

  private restart(): void {
    const worker = this.detachWorker();
    this.failAll();
    void worker?.terminate().catch(() => undefined);
  }

  private markUnavailable(error: unknown): void {
    // Không có embedding thì pipeline vẫn chạy được bằng token-match + Admin duyệt tay,
    // chỉ kém tinh hơn — không để hỏng cả endpoint vì việc này.
    this.unavailable = true;
    this.logger.error("Embedding model unavailable — falling back to token matching only", {
      error: error instanceof Error ? error.message : error,
    });
    this.restart();
  }

  private detachWorker(): EmbeddingWorkerHandle | null {
    const worker = this.worker;
    this.worker = null;
    this.ready = false;
    return worker;
  }

  private failAll(): void {
    if (this.inflight) {
      clearTimeout(this.inflight.timer);
      this.inflight.resolve(null);
      this.inflight = null;
    }
    for (const job of this.queue.splice(0)) job.resolve(null);
  }
}
