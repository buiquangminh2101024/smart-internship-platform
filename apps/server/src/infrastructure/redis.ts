import Redis from "ioredis";
import { config } from "../shared/config/env";
import { logger } from "../shared/logger";

// AD-31 D2: lỗi nhanh thay vì treo khi kết nối Redis Cloud chết ngầm.
// - commandTimeout: một lệnh quá 3 s thì báo lỗi (không có lệnh chờ lâu như BLPOP / subscribe).
// - keepAlive: giữ kết nối TCP, phát hiện kết nối chết sớm hơn.
// - maxRetriesPerRequest: lệnh chờ kết nối lại tối đa 3 lần (mặc định 20) rồi báo lỗi.
export const redis = new Redis(config.REDIS_URL, {
  commandTimeout: 3000,
  keepAlive: 30000,
  maxRetriesPerRequest: 3,
});

redis.on("connect", () => {
  logger.info("Connected to Redis successfully");
});

redis.on("error", (err) => {
  logger.error("Redis connection error:", { message: err?.message });
});
