// Chạy: node --import tsx --test tests/unit/match-embedding-service.test.ts (từ apps/server)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { EmbeddingProvider } from "../../src/shared/ports/EmbeddingProvider";
import {
  computeContentHash,
  MatchEmbeddingService,
  type EmbeddingTarget,
} from "../../src/modules/job-matching/match-embedding.service";
import type {
  EmbeddingKind,
  EmbeddingRecord,
  MatchEmbeddingRepository,
} from "../../src/modules/job-matching/match-embedding.repository";

// --- Fake: repository giữ vector trong bộ nhớ, cosine = tích vô hướng như pgvector với vector đã chuẩn hoá ---
class FakeRepository {
  readonly stored: Record<EmbeddingKind, Map<string, EmbeddingRecord>> = { candidate: new Map(), job: new Map() };
  upsertCalls = 0;
  failOnUpsert = false;

  async findHashes(kind: EmbeddingKind, ids: string[]) {
    return new Map(ids.filter((id) => this.stored[kind].has(id)).map((id) => [id, this.stored[kind].get(id)!.contentHash]));
  }

  async upsertMany(kind: EmbeddingKind, records: EmbeddingRecord[]) {
    if (records.length === 0) return;
    this.upsertCalls++;
    if (this.failOnUpsert) throw new Error("db down");
    for (const record of records) this.stored[kind].set(record.id, record);
  }

  async cosinesForJob(jobPostId: string, candidateIds: string[]) {
    const job = this.stored.job.get(jobPostId);
    const result = new Map<string, number>();
    if (!job) return result;
    for (const id of candidateIds) {
      const candidate = this.stored.candidate.get(id);
      if (candidate) result.set(id, candidate.vector.reduce((sum, value, index) => sum + value * job.vector[index]!, 0));
    }
    return result;
  }
}

class FakeProvider implements EmbeddingProvider {
  modelId = "model-a";
  calls: string[] = [];
  available = true;
  /** Vector trả về theo văn bản; mặc định [1, 0]. */
  vectors = new Map<string, number[]>();

  async embed(text: string) {
    this.calls.push(text);
    return this.available ? (this.vectors.get(text) ?? [1, 0]) : null;
  }
}

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

function setup(templateVersion = 1) {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  const build = () =>
    new MatchEmbeddingService({
      matchEmbeddingRepository: repository as unknown as MatchEmbeddingRepository,
      embeddingProvider: provider,
      config: { MATCH_EMBEDDING_TEMPLATE_VERSION: templateVersion },
      logger: silentLogger,
    });
  return { repository, provider, service: build(), build };
}

const job: EmbeddingTarget = { id: "job-1", text: "Vị trí: Frontend" };
const cand = (id: string, text = `Chức danh: ${id}`): EmbeddingTarget => ({ id, text });

test("Lần đầu: embed cả hai phía, lưu vector và trả cosine", async () => {
  const { service, provider, repository } = setup();
  provider.vectors.set(job.text, [1, 0]);
  provider.vectors.set("Chức danh: c1", [0.6, 0.8]);

  const cosine = await service.similarity(cand("c1"), job);

  assert.ok(cosine !== null && Math.abs(cosine - 0.6) < 1e-9);
  assert.equal(provider.calls.length, 2);
  assert.equal(repository.stored.candidate.size, 1);
  assert.equal(repository.stored.job.size, 1);
});

test("Văn bản không đổi: lần sau dùng vector đã lưu, không embed lại", async () => {
  const { service, provider } = setup();
  await service.similarity(cand("c1"), job);
  provider.calls.length = 0;

  const cosine = await service.similarity(cand("c1"), job);

  assert.notEqual(cosine, null);
  assert.equal(provider.calls.length, 0);
});

test("Văn bản đổi (sửa headline) ⇒ hash đổi ⇒ embed lại đúng phía đó", async () => {
  const { service, provider, repository } = setup();
  await service.similarity(cand("c1"), job);
  const oldHash = repository.stored.candidate.get("c1")!.contentHash;
  provider.calls.length = 0;

  await service.similarity(cand("c1", "Chức danh: Backend"), job);

  assert.deepEqual(provider.calls, ["Chức danh: Backend"]);
  assert.notEqual(repository.stored.candidate.get("c1")!.contentHash, oldHash);
});

test("Đổi phần không nằm trong văn bản (vd. số điện thoại) ⇒ văn bản y hệt ⇒ không tốn gì", async () => {
  const { service, provider } = setup();
  await service.similarity(cand("c1", "Chức danh: Dev"), job);
  provider.calls.length = 0;

  await service.similarity(cand("c1", "Chức danh: Dev"), job);

  assert.equal(provider.calls.length, 0);
});

test("Đổi templateVersion hoặc modelId ⇒ vector cũ hết hiệu lực", async () => {
  const { service, provider, repository, build } = setup(1);
  await service.similarity(cand("c1"), job);

  // cùng repository, template mới
  const v2 = new MatchEmbeddingService({
    matchEmbeddingRepository: repository as unknown as MatchEmbeddingRepository,
    embeddingProvider: provider,
    config: { MATCH_EMBEDDING_TEMPLATE_VERSION: 2 },
    logger: silentLogger,
  });
  provider.calls.length = 0;
  await v2.similarity(cand("c1"), job);
  assert.equal(provider.calls.length, 2);

  // cùng template, model mới
  provider.modelId = "model-b";
  provider.calls.length = 0;
  await build().similarity(cand("c1"), job);
  assert.equal(provider.calls.length, 2);
  assert.equal(repository.stored.candidate.get("c1")!.model, "model-b");
});

test("computeContentHash: khác từng thành phần thì khác hash, cùng thì trùng", () => {
  const base = { templateVersion: 1, modelId: "m", text: "t" };
  const hash = computeContentHash(base);
  assert.equal(hash, computeContentHash({ ...base }));
  assert.notEqual(hash, computeContentHash({ ...base, templateVersion: 2 }));
  assert.notEqual(hash, computeContentHash({ ...base, modelId: "n" }));
  assert.notEqual(hash, computeContentHash({ ...base, text: "u" }));
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("Model lỗi (embed trả null) ⇒ cosine null, không lưu gì, không throw", async () => {
  const { service, provider, repository } = setup();
  provider.available = false;

  assert.equal(await service.similarity(cand("c1"), job), null);
  assert.equal(repository.upsertCalls, 0);
  assert.equal(repository.stored.candidate.size + repository.stored.job.size, 0);
});

test("Model lỗi ở phía tin ⇒ không tốn công embed hồ sơ", async () => {
  const { service, provider } = setup();
  provider.available = false;

  await service.similarityForCandidates(job, [cand("c1"), cand("c2")], 10);

  assert.equal(provider.calls.length, 1);
});

test("Lỗi DB khi lưu ⇒ rơi về null cho mọi hồ sơ, không throw", async () => {
  const { service, repository } = setup();
  repository.failOnUpsert = true;

  const result = await service.similarityForCandidates(job, [cand("c1"), cand("c2")], 10);

  assert.deepEqual([...result], [["c1", null], ["c2", null]]);
});

test("Văn bản rỗng ⇒ không embed, cosine null", async () => {
  const { service, provider } = setup();

  assert.equal(await service.similarity(cand("c1", "  "), job), null);
  assert.equal(await service.similarity(cand("c1"), { id: "job-x", text: "" }), null);
  // Lần 1 embed tin rồi dừng vì hồ sơ rỗng; lần 2 tin rỗng nên không chạm model nữa.
  assert.equal(provider.calls.length, 1);
});

test("Danh sách: chỉ embed tối đa maxNewCandidates hồ sơ mới; phần vượt là null (PENDING)", async () => {
  const { service, provider, repository } = setup();
  const candidates = ["c1", "c2", "c3", "c4", "c5"].map((id) => cand(id));

  const result = await service.similarityForCandidates(job, candidates, 2);

  assert.equal(provider.calls.length, 1 + 2); // 1 tin + 2 hồ sơ
  assert.equal(repository.upsertCalls, 2); // một lượt cho tin, một lượt gộp cho 2 hồ sơ
  const available = [...result].filter(([, cosine]) => cosine !== null).map(([id]) => id);
  assert.deepEqual(available, ["c1", "c2"]);
  assert.equal(result.size, 5); // mọi id đều có mặt trong Map

  // Lần tải sau: hai hồ sơ cũ dùng lại, ngân sách dành cho 2 hồ sơ kế tiếp
  provider.calls.length = 0;
  const second = await service.similarityForCandidates(job, candidates, 2);
  assert.equal(provider.calls.length, 2);
  assert.deepEqual([...second].filter(([, cosine]) => cosine !== null).map(([id]) => id), ["c1", "c2", "c3", "c4"]);
});

test("Danh sách: hồ sơ trùng id chỉ embed một lần", async () => {
  const { service, provider } = setup();

  const result = await service.similarityForCandidates(job, [cand("c1"), cand("c1")], 10);

  assert.equal(provider.calls.length, 2); // tin + một hồ sơ
  assert.equal(result.size, 1);
  assert.notEqual(result.get("c1"), null);
});

test("Danh sách rỗng: không chạm model cho hồ sơ, vẫn trả Map rỗng", async () => {
  const { service } = setup();
  assert.equal((await service.similarityForCandidates(job, [], 10)).size, 0);
});
