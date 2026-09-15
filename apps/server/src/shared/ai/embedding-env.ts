import { config } from "../config/env";
import { logger } from "../logger";

// Chỉ phần env cần đụng tới — cố ý KHÔNG import type từ
// @huggingface/transformers: import tĩnh gói đó ở đây sẽ nạp bản CJS, trong khi
// service nạp bản ESM qua import() động, thành hai instance module riêng biệt và
// cấu hình đặt ở bản này không có tác dụng với bản kia (đã kiểm chứng).
export interface TransformersEnv {
  // `| null` khớp kiểu thật của thư viện (chưa cấu hình ở môi trường browser).
  cacheDir: string | null;
}

/**
 * Model ONNX quantized nặng ~465MB. Mặc định @huggingface/transformers lưu vào
 * node_modules/@huggingface/transformers/.cache — nằm ngay trong thư mục dự án.
 * Trỏ cacheDir sang ổ đĩa khác (EMBEDDING_MODEL_CACHE_DIR, vd.
 * D:\ai-models-cache\smart-internship-platform) để dự án không phình dung lượng
 * và không phải tải lại model mỗi lần xoá node_modules.
 *
 * BẮT BUỘC gọi với chính `env` của module vừa import() ra, và trước lần gọi
 * pipeline() đầu tiên.
 */
export function applyEmbeddingEnv(env: TransformersEnv): void {
  if (!config.EMBEDDING_MODEL_CACHE_DIR) {
    logger.warn("EMBEDDING_MODEL_CACHE_DIR is not set — embedding model will be cached inside node_modules");
    return;
  }

  env.cacheDir = config.EMBEDDING_MODEL_CACHE_DIR;
  logger.info(`Embedding model cache directory: ${config.EMBEDDING_MODEL_CACHE_DIR}`);
}
