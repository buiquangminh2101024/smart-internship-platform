import { mkdir } from "node:fs/promises";
import { config } from "../../shared/config/env";
import { logger } from "../../shared/logger";

/**
 * OCR offline cho ảnh CV — tầng cuối cùng khi cả Gemini lẫn OpenRouter đều lỗi
 * (PLAN Quyết định #3). Không có LLM để cấu trúc hoá nên chỉ trả text thô.
 *
 * Lần chạy đầu tesseract.js tải traineddata vie+eng (~30MB) rồi cache vào
 * `cachePath`. Trỏ ra TESSERACT_CACHE_DIR (ổ ngoài dự án, cạnh cache model
 * embedding) để không phải tải lại và không làm phình thư mục dự án (Quyết
 * định #7). Core WASM ở Node được nạp thẳng từ gói tesseract.js-core trong
 * node_modules nên không cần/không thể trỏ corePath ra ngoài.
 */
export async function ocrImage(buffer: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");

  if (config.TESSERACT_CACHE_DIR) {
    // tesseract.js ghi cache bằng fs.writeFile và nuốt lỗi nếu thư mục chưa có
    // — không tự tạo thì mỗi lần chạy lại tải lại ~30MB mà không báo gì.
    await mkdir(config.TESSERACT_CACHE_DIR, { recursive: true });
  } else {
    logger.warn("TESSERACT_CACHE_DIR is not set — traineddata will be cached in the working directory");
  }

  const worker = await createWorker(["vie", "eng"], undefined, {
    ...(config.TESSERACT_CACHE_DIR ? { cachePath: config.TESSERACT_CACHE_DIR } : {}),
  });
  try {
    const { data } = await worker.recognize(buffer);
    return data.text.trim();
  } finally {
    await worker.terminate();
  }
}
