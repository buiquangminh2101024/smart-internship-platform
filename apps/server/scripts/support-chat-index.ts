// Sinh content/support-faq/faq-index.json cho chatbot hỗ trợ (đợt B trong
// docs/06-backend/support-chatbot/PLAN.md).
//
//   npm run support-chat:index -w apps/server
//
// Chạy lại mỗi khi sửa file FAQ .md rồi commit faq-index.json cùng lúc. Không truy vấn DB:
// chỉ cần model embedding local (lần đầu tải về EMBEDDING_MODEL_CACHE_DIR).
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../src/shared/config/env";
import { logger } from "../src/shared/logger";
import { SkillEmbeddingService } from "../src/modules/skills/skill-embedding.service";
import { SkillEmbeddingProvider } from "../src/infrastructure/skill-embedding-provider";
import {
  FAQ_CONTENT_DIR,
  FAQ_INDEX_FILE,
  buildFaqIndex,
  loadFaqItems,
} from "../src/modules/support-chat/faq-knowledge-base";

// SkillEmbeddingService nhận prisma nhưng embed() không dùng tới; PrismaClient chỉ kết
// nối ở truy vấn đầu tiên nên script này không chạm DB.
const prisma = new PrismaClient();

async function main() {
  const provider = new SkillEmbeddingProvider({
    skillEmbeddingService: new SkillEmbeddingService({ prisma, logger }),
    config,
  });

  const { items, contentHash } = loadFaqItems();
  const questionCount = items.reduce((sum, item) => sum + item.questions.length, 0);
  console.log(`Embedding ${items.length} FAQ items (${questionCount} questions) with ${provider.modelId}…`);

  const startedAt = Date.now();
  const index = await buildFaqIndex(items, contentHash, provider);
  if (!index) throw new Error("Embedding model unavailable — index not written");

  const indexPath = path.join(FAQ_CONTENT_DIR, FAQ_INDEX_FILE);
  writeFileSync(indexPath, `${JSON.stringify(index, null, 1)}\n`, "utf8");
  console.log(`Wrote ${indexPath} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (contentHash ${contentHash.slice(0, 12)})`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
