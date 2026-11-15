import { parentPort, workerData } from "node:worker_threads";

// Worker giữ model embedding (0.6, AD-27 mục 11, Q7; bước 2b của
// docs/06-backend/live-rescore/PLAN.md). Mỗi lần embed trên luồng chính chặn event loop
// ~24 ms (bước 0 mục 3); chạy ở đây thì request khác không phải chờ. Luồng chính không
// import `@huggingface/transformers` nữa: chỉ `EmbeddingWorkerClient` gửi việc sang.
//
// File chạy ở hai dạng: `.ts` khi `tsx watch` (worker thừa hưởng loader của tsx qua
// execArgv) và `.js` trong `dist/` khi `node dist/main.js`. Client chọn theo phần mở rộng
// của chính nó.

export interface EmbeddingWorkerData {
  modelId: string;
  cacheDir: string | null;
}

export interface EmbeddingWorkerRequest {
  id: number;
  text: string;
}

export type EmbeddingWorkerMessage =
  | { type: "ready" }
  | { type: "load-error"; message: string }
  | { type: "result"; id: number; vector: number[] }
  | { type: "result"; id: number; error: string };

type FeatureExtractor = (
  text: string,
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: ArrayLike<number> }>;

function describe(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

const port = parentPort;
if (port) {
  const { modelId, cacheDir } = workerData as EmbeddingWorkerData;

  // Phải cấu hình trên chính `env` của module vừa import() ra, trước lần gọi pipeline()
  // đầu tiên: import tĩnh gói này ở nơi khác sẽ nạp bản CJS, còn import() động có thể
  // nạp bản ESM, thành hai instance module riêng biệt (đã kiểm chứng).
  const extractorPromise = import("@huggingface/transformers").then((module) => {
    if (cacheDir) module.env.cacheDir = cacheDir;
    return module.pipeline("feature-extraction", modelId) as unknown as Promise<FeatureExtractor>;
  });

  extractorPromise.then(
    () => port.postMessage({ type: "ready" } satisfies EmbeddingWorkerMessage),
    (error: unknown) => port.postMessage({ type: "load-error", message: describe(error) } satisfies EmbeddingWorkerMessage),
  );

  // Client chỉ gửi một việc mỗi lần (chờ kết quả rồi mới gửi việc sau), nên ở đây xử lý
  // tuần tự mà không cần hàng đợi riêng.
  port.on("message", async ({ id, text }: EmbeddingWorkerRequest) => {
    let reply: EmbeddingWorkerMessage;
    try {
      const extractor = await extractorPromise;
      const output = await extractor(text, { pooling: "mean", normalize: true });
      reply = { type: "result", id, vector: Array.from(output.data) };
    } catch (error) {
      reply = { type: "result", id, error: describe(error) };
    }
    port.postMessage(reply);
  });
}
