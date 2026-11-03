import Redis from "ioredis";
import { config } from "../shared/config/env";
import { logger } from "../shared/logger";

export const redis = new Redis(config.REDIS_URL);

redis.on("connect", () => {
  logger.info("Connected to Redis successfully");
});

redis.on("error", (err) => {
  logger.error("Redis connection error:", { message: err?.message });
});
