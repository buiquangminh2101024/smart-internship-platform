import Redis from "ioredis";
import { config } from "../shared/config/env";

export const redis = new Redis(config.REDIS_URL);
