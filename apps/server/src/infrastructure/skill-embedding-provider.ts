import type { EmbeddingProvider } from "../shared/ports/EmbeddingProvider";
import type { SkillEmbeddingService } from "../modules/skills/skill-embedding.service";

// Job Matcher dùng chung model với dedupe skill: SkillEmbeddingService giữ model
// (~0,8GB RAM) nên nạp lần hai bằng một service khác là lãng phí. Adapter này chỉ
// uỷ quyền — không sửa module skills.
export class SkillEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string;
  private readonly skillEmbeddingService: SkillEmbeddingService;

  constructor({
    skillEmbeddingService,
    config,
  }: {
    skillEmbeddingService: SkillEmbeddingService;
    config: { EMBEDDING_MODEL_ID: string };
  }) {
    this.skillEmbeddingService = skillEmbeddingService;
    this.modelId = config.EMBEDDING_MODEL_ID;
  }

  embed(text: string): Promise<number[] | null> {
    return this.skillEmbeddingService.embed(text);
  }
}
