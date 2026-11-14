import { config } from "../config/env";
import { logger } from "../logger";

/**
 * Model ONNX quantized nặng ~465MB. Mặc định @huggingface/transformers lưu vào
 * node_modules/@huggingface/transformers/.cache — nằm ngay trong thư mục dự án.
 * Trỏ cacheDir sang ổ đĩa khác (EMBEDDING_MODEL_CACHE_DIR, vd.
 * D:\ai-models-cache\smart-internship-platform) để dự án không phình dung lượng
 * và không phải tải lại model mỗi lần xoá node_modules.
 *
 * Trả thư mục cache để truyền cho worker embedding (worker đặt `env.cacheDir` trên chính
 * module nó import, xem `infrastructure/embedding-worker.ts`), và ghi log như trước.
 */
export function resolveEmbeddingCacheDir(): string | null {
  if (!config.EMBEDDING_MODEL_CACHE_DIR) {
    logger.warn("EMBEDDING_MODEL_CACHE_DIR is not set — embedding model will be cached inside node_modules");
    return null;
  }

  logger.info(`Embedding model cache directory: ${config.EMBEDDING_MODEL_CACHE_DIR}`);
  return config.EMBEDDING_MODEL_CACHE_DIR;
}
