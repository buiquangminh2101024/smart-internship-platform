import { config } from "./shared/config/env";
import express from "express";
import cors from "cors";
import { buildContainer } from "./container";
import { healthRouter } from "./modules/health/health.routes";
import { errorHandler } from "./shared/middleware/errorHandler";
import { logger } from "./shared/logger";

const container = buildContainer();

const app = express();

app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json());

app.use("/api", healthRouter(container));

app.use(errorHandler);

app.listen(config.PORT, () => {
  logger.info(`Server listening on port ${config.PORT}`);
});
