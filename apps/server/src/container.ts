import { asValue, createContainer, type AwilixContainer } from "awilix";
import { prisma } from "./infrastructure/prisma";
import { logger, type Logger } from "./shared/logger";
import type { PrismaClient } from "@prisma/client";

// Cradle gốc — mỗi module nghiệp vụ mở rộng type này khi đăng ký thêm
// controller/service/repository của mình (asClass), theo pattern demo ở
// modules/health.
export interface Cradle {
  prisma: PrismaClient;
  logger: Logger;
}

export function buildContainer(): AwilixContainer<Cradle> {
  const container = createContainer<Cradle>();

  container.register({
    prisma: asValue(prisma),
    logger: asValue(logger),
  });

  return container;
}
