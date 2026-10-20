// Bộ eval bậc 2 của chatbot hỗ trợ (đợt B trong docs/06-backend/support-chatbot/PLAN.md).
//
//   npm run support-chat:eval -w apps/server
//
// Embed từng câu trong eval/questions.json bằng đúng EmbeddingProvider và FaqKnowledgeBase
// của server, quét lưới ngưỡng DIRECT / OUT_OF_SCOPE / DIRECT_WITH_HISTORY, so các cách chọn
// đoạn FAQ đưa vào prompt bậc 4, rồi ghi eval/eval-results.md. Không gọi LLM, không chạm DB.
//
// Script không sửa config: đổi ngưỡng trong support-chat.config.ts là việc làm tay sau khi
// đọc kết quả; chạy lại để phần "Ngưỡng đang dùng" phản ánh giá trị mới.
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../src/shared/config/env";
import { logger } from "../src/shared/logger";
import { SkillEmbeddingService } from "../src/modules/skills/skill-embedding.service";
import { SkillEmbeddingProvider } from "../src/infrastructure/skill-embedding-provider";
import { stripVietnameseMarks } from "../src/modules/applications/applications.repository";
import {
  FaqKnowledgeBase,
  contextRankOf,
  isAccentFree,
  isFaqVisibleTo,
  type FaqScore,
  type FaqViewer,
} from "../src/modules/support-chat/faq-knowledge-base";
import {
  DIRECT_THRESHOLD,
  DIRECT_THRESHOLD_WITH_HISTORY,
  OUT_OF_SCOPE_THRESHOLD,
  RAG_TOP_K,
} from "../src/modules/support-chat/support-chat.config";

const EVAL_DIR = path.resolve(__dirname, "../../../docs/06-backend/support-chatbot/eval");
const QUESTIONS_PATH = path.join(EVAL_DIR, "questions.json");
const RESULTS_PATH = path.join(EVAL_DIR, "eval-results.md");

/** Quy tắc chọn ngưỡng (PLAN): trả thẳng sai còn tệ hơn gọi LLM. */
const MIN_DIRECT_PRECISION = 0.95;
/**
 * Ngưỡng gợi ý phải cách câu sẽ bị trả thẳng sai gần nhất ít nhất chừng này — không để ngưỡng
 * nằm sát một câu sai (lệch 0,001 do đổi thư viện/phần cứng là thành trả thẳng sai).
 */
const MIN_DIRECT_BUFFER = 0.01;

const DIRECT_GRID = range(0.6, 0.95, 0.025);
const OUT_OF_SCOPE_GRID = range(0.2, 0.6, 0.025);
const HISTORY_GRID = range(0.8, 0.975, 0.025);
/** Phương án thử: chỉ trả thẳng khi mục cao nhất còn cách mục thứ hai ít nhất `margin`. */
const MARGIN_GRID = [0, 0.02, 0.04, 0.06, 0.08, 0.1];

interface EvalQuestion {
  id: string;
  audience: FaqViewer;
  question: string;
  history?: Array<{ role: "user" | "model"; text: string }>;
  expect: "faq" | "out_of_scope" | "llm";
  faqId?: string;
  note?: string;
}

interface Scored {
  q: EvalQuestion;
  /** Câu gõ không dấu: so với câu hỏi mẫu bỏ dấu và không bị chặn "ngoài phạm vi" ở bậc 2. */
  accentFree: boolean;
  /** Điểm theo câu hỏi hiện tại — đúng thứ bậc 2 của pipeline nhìn thấy. */
  scores: FaqScore[];
  /** Câu nối tiếp: điểm khi embed "tin user gần nhất + câu hỏi" (chỉ để so cách chọn đoạn ở bậc 4). */
  scoresWithContext?: FaqScore[] | undefined;
  /** Đối chứng: điểm khi không dùng câu hỏi mẫu bỏ dấu (câu không dấu cũng so với câu mẫu gốc). */
  scoresAccented: FaqScore[];
}

/** Câu có dấu của bộ eval bị bỏ dấu nhân tạo — bộ eval chỉ có ít câu gõ không dấu thật. */
interface SyntheticScored {
  q: EvalQuestion;
  /** So với câu hỏi mẫu gốc. */
  accented: FaqScore[];
  /** So với bản bỏ dấu của câu hỏi mẫu. */
  stripped: FaqScore[];
}

type ContextStrategy = { name: string; description: string; rank: (score: FaqScore) => number };

const CONTEXT_STRATEGIES: ContextStrategy[] = [
  { name: "question", description: "score câu hỏi mẫu cao nhất", rank: (s) => s.questionScore },
  { name: "content", description: "score với `title + nội dung`", rank: (s) => s.contentScore },
  { name: "max", description: "max(câu hỏi mẫu, nội dung)", rank: (s) => Math.max(s.questionScore, s.contentScore) },
  { name: "mean", description: "trung bình (câu hỏi mẫu, nội dung)", rank: (s) => (s.questionScore + s.contentScore) / 2 },
  { name: "server", description: "◀ `contextRankOf` server đang dùng", rank: contextRankOf },
];

const prisma = new PrismaClient();

async function main() {
  const provider = new SkillEmbeddingProvider({
    skillEmbeddingService: new SkillEmbeddingService({ prisma, logger }),
    config,
  });
  const knowledgeBase = new FaqKnowledgeBase({ embeddingProvider: provider, logger });
  const questions = JSON.parse(readFileSync(QUESTIONS_PATH, "utf8")) as EvalQuestion[];
  validateQuestions(questions, knowledgeBase);

  // Làm nóng: lần embed đầu nạp model, không tính vào thời gian đo.
  await provider.embed("khởi động");
  const scored: Scored[] = [];
  const embedMs: number[] = [];
  for (const q of questions) {
    const startedAt = performance.now();
    const vector = await provider.embed(q.question);
    embedMs.push(performance.now() - startedAt);
    if (!vector) throw new Error("Embedding model unavailable");
    const accentFree = isAccentFree(q.question);
    const scores = await knowledgeBase.score(vector, q.audience, { accentFree });
    const scoresAccented = accentFree ? await knowledgeBase.score(vector, q.audience) : scores;
    if (!scores || !scoresAccented) throw new Error("FAQ index unavailable");
    if (scores.length < 2) throw new Error(`${q.id}: fewer than 2 FAQ items visible to ${q.audience}`);

    let scoresWithContext: FaqScore[] | undefined;
    const lastUser = q.history?.filter((item) => item.role === "user").at(-1);
    if (lastUser) {
      const joined = `${lastUser.text}\n${q.question}`;
      const contextVector = await provider.embed(joined);
      scoresWithContext =
        (contextVector && (await knowledgeBase.score(contextVector, q.audience, { accentFree: isAccentFree(joined) }))) ||
        undefined;
    }
    scored.push({ q, accentFree, scores, scoresWithContext, scoresAccented });
  }

  const synthetic: SyntheticScored[] = [];
  for (const s of scored) {
    if (s.accentFree || s.q.history?.length) continue;
    const vector = await provider.embed(stripVietnameseMarks(s.q.question));
    if (!vector) throw new Error("Embedding model unavailable");
    const accented = await knowledgeBase.score(vector, s.q.audience);
    const stripped = await knowledgeBase.score(vector, s.q.audience, { accentFree: true });
    if (!accented || !stripped) throw new Error("FAQ index unavailable");
    synthetic.push({ q: s.q, accented, stripped });
  }

  const report = buildReport(scored, synthetic, provider.modelId, knowledgeBase.version, embedMs);
  writeFileSync(RESULTS_PATH, report, "utf8");
  console.log(`Wrote ${RESULTS_PATH}`);
}

function validateQuestions(questions: EvalQuestion[], knowledgeBase: FaqKnowledgeBase): void {
  const ids = new Set<string>();
  for (const q of questions) {
    if (ids.has(q.id)) throw new Error(`Duplicate eval id ${q.id}`);
    ids.add(q.id);
    if (q.expect === "faq" && !q.faqId) throw new Error(`${q.id}: expect=faq needs faqId`);
    if (!q.faqId) continue;
    const item = knowledgeBase.getById(q.faqId);
    if (!item) throw new Error(`${q.id}: unknown faqId ${q.faqId}`);
    if (!isFaqVisibleTo(item, q.audience)) throw new Error(`${q.id}: ${q.faqId} is not visible to ${q.audience}`);
  }
}

// ---------------------------------------------------------------------------
// Đo

interface DirectRow {
  threshold: number;
  margin: number;
  answered: number;
  correct: number;
  wrongItem: number;
  llmAnswered: number;
  outOfScopeAnswered: number;
  coverage: number;
}

/** Mục điểm cao nhất — main() đã bảo đảm mọi danh sách điểm đều khác rỗng. */
function first(scores: FaqScore[]): FaqScore {
  return scores[0]!;
}

/** Khoảng cách giữa mục cao nhất và mục thứ hai (scores đã xếp giảm dần, mỗi mục một dòng). */
function marginOf(scores: FaqScore[]): number {
  return first(scores).questionScore - (scores[1]?.questionScore ?? -Infinity);
}

/** Bậc 2 trả thẳng câu hỏi mới — câu gõ không dấu không bao giờ được trả thẳng. */
function answersDirectly(s: Scored, threshold: number, margin: number): boolean {
  return !s.accentFree && first(s.scores).questionScore >= threshold && marginOf(s.scores) >= margin;
}

function directRow(fresh: Scored[], threshold: number, margin = 0): DirectRow {
  const answered = fresh.filter((s) => answersDirectly(s, threshold, margin));
  const isCorrect = (s: Scored) => s.q.expect === "faq" && first(s.scores).faqId === s.q.faqId;
  const faqTotal = fresh.filter((s) => s.q.expect === "faq").length;
  const correct = answered.filter(isCorrect).length;
  return {
    threshold,
    margin,
    answered: answered.length,
    correct,
    wrongItem: answered.filter((s) => s.q.expect === "faq" && !isCorrect(s)).length,
    llmAnswered: answered.filter((s) => s.q.expect === "llm").length,
    outOfScopeAnswered: answered.filter((s) => s.q.expect === "out_of_scope").length,
    coverage: correct / faqTotal,
  };
}

function precision(row: DirectRow): number {
  return row.answered === 0 ? 1 : row.correct / row.answered;
}

interface OutOfScopeRow {
  threshold: number;
  blockedOutOfScope: number;
  outOfScopeTotal: number;
  blockedInScope: number;
  inScopeTotal: number;
}

/** Câu bị chặn "ngoài phạm vi" ở bậc 2 — câu gõ không dấu không bao giờ bị chặn. */
function isBlocked(s: Scored, threshold: number): boolean {
  return !s.accentFree && first(s.scores).questionScore < threshold;
}

function outOfScopeRow(fresh: Scored[], threshold: number): OutOfScopeRow {
  const blocked = (s: Scored) => isBlocked(s, threshold);
  const outOfScope = fresh.filter((s) => s.q.expect === "out_of_scope");
  const inScope = fresh.filter((s) => s.q.expect !== "out_of_scope");
  return {
    threshold,
    blockedOutOfScope: outOfScope.filter(blocked).length,
    outOfScopeTotal: outOfScope.length,
    blockedInScope: inScope.filter(blocked).length,
    inScopeTotal: inScope.length,
  };
}

/** Câu nối tiếp được trả thẳng: đúng mục thì chấp nhận được, sai mục là lỗi. */
function historyRow(followUps: Scored[], threshold: number) {
  const answered = followUps.filter((s) => answersDirectly(s, threshold, 0));
  return {
    threshold,
    answered: answered.length,
    wrong: answered.filter((s) => first(s.scores).faqId !== s.q.faqId).length,
  };
}

/**
 * Ngưỡng nhỏ nhất mà nó và mọi ngưỡng lớn hơn trong lưới đều đạt độ chính xác tối thiểu, rồi
 * nâng dần theo lưới tới khi cách câu sai gần nhất (dưới ngưỡng) ít nhất MIN_DIRECT_BUFFER.
 */
function recommendDirect(rows: DirectRow[], fresh: Scored[], margin = 0): number | null {
  let recommended: number | null = null;
  for (const row of [...rows].reverse()) {
    if (precision(row) < MIN_DIRECT_PRECISION) break;
    if (row.answered > 0) recommended = row.threshold;
  }
  if (recommended === null) return null;
  for (const row of rows) {
    if (row.threshold < recommended || row.answered === 0) continue;
    const wrong = nearestWrongBelow(fresh, row.threshold, margin);
    if (!wrong || row.threshold - first(wrong.scores).questionScore >= MIN_DIRECT_BUFFER) return row.threshold;
  }
  return null;
}

/** Câu sẽ bị trả thẳng sai có score cao nhất nhưng vẫn dưới `threshold`. */
function nearestWrongBelow(fresh: Scored[], threshold: number, margin = 0): Scored | undefined {
  return fresh
    .filter((s) => !s.accentFree && !(s.q.expect === "faq" && first(s.scores).faqId === s.q.faqId))
    .filter((s) => first(s.scores).questionScore < threshold && marginOf(s.scores) >= margin)
    .sort((a, b) => first(b.scores).questionScore - first(a.scores).questionScore)[0];
}

/**
 * Không chặn nhầm câu nào trong phạm vi (chặn nhầm = người dùng bị từ chối oan). Trong các
 * ngưỡng an toàn, lấy ngưỡng NHỎ nhất vẫn chặn được nhiều như ngưỡng an toàn lớn nhất — cùng
 * kết quả trên bộ eval nhưng chừa biên xa hơn tới câu trong phạm vi có score thấp nhất.
 */
function recommendOutOfScope(rows: OutOfScopeRow[]): number | null {
  const safe = rows.filter((row) => row.blockedInScope === 0);
  if (safe.length === 0) return null;
  const best = safe[safe.length - 1]!.blockedOutOfScope;
  return safe.find((row) => row.blockedOutOfScope === best)?.threshold ?? null;
}

function tierOf(s: Scored, direct: number, outOfScope: number, margin = 0): "faq" | "out_of_scope" | "llm" {
  if (answersDirectly(s, direct, margin)) return "faq";
  if (isBlocked(s, outOfScope)) return "out_of_scope";
  return "llm";
}

/** Các mục đưa vào prompt bậc 4, theo đúng cách server chọn (contextRankOf). */
function contextTopK(scores: FaqScore[]): string[] {
  return [...scores]
    .sort((a, b) => contextRankOf(b) - contextRankOf(a))
    .slice(0, RAG_TOP_K)
    .map((score) => score.faqId);
}

function contextHits(items: Array<{ faqId: string; scores: FaqScore[] }>, strategy: ContextStrategy) {
  let top1 = 0;
  let topK = 0;
  const misses: Array<{ faqId: string; got: string[] }> = [];
  for (const item of items) {
    const ranked = [...item.scores].sort((a, b) => strategy.rank(b) - strategy.rank(a)).slice(0, RAG_TOP_K);
    if (ranked[0]?.faqId === item.faqId) top1++;
    if (ranked.some((score) => score.faqId === item.faqId)) topK++;
    else misses.push({ faqId: item.faqId, got: ranked.map((score) => score.faqId) });
  }
  return { top1, topK, total: items.length, misses };
}

// ---------------------------------------------------------------------------
// Báo cáo

function buildReport(
  scored: Scored[],
  synthetic: SyntheticScored[],
  modelId: string,
  faqVersion: string,
  embedMs: number[],
): string {
  const fresh = scored.filter((s) => !s.q.history?.length);
  const followUps = scored.filter((s) => s.q.history?.length);
  const count = (expect: EvalQuestion["expect"]) => fresh.filter((s) => s.q.expect === expect).length;

  const directRows = DIRECT_GRID.map((threshold) => directRow(fresh, threshold));
  const outOfScopeRows = OUT_OF_SCOPE_GRID.map((threshold) => outOfScopeRow(fresh, threshold));
  const historyRows = HISTORY_GRID.map((threshold) => historyRow(followUps, threshold));
  const recommendedDirect = recommendDirect(directRows, fresh);
  const recommendedOutOfScope = recommendOutOfScope(outOfScopeRows);

  const lines: string[] = [];
  const push = (...items: string[]) => lines.push(...items);

  push(
    "# Kết quả eval chatbot hỗ trợ — bậc 2 (so khớp FAQ)",
    "",
    `> Sinh tự động bởi \`apps/server/scripts/support-chat-eval.ts\` lúc ${new Date().toISOString()} — không sửa tay; chạy lại script để cập nhật. Phương pháp: \`../PLAN.md\` mục "Bộ eval" và "Pipeline xử lý một câu hỏi".`,
    "",
    `Model embedding \`${modelId}\`, phiên bản FAQ \`${faqVersion.slice(0, 12)}\`. Bộ câu hỏi do người soạn, cỡ nhỏ: con số chỉ mang tính chỉ báo. Score là cosine giữa câu hỏi và **câu hỏi mẫu gần nhất** của mỗi mục FAQ người hỏi được thấy.`,
    "",
    "## Dữ liệu",
    "",
    `- ${scored.length} câu: ${fresh.length} câu hỏi mới (faq ${count("faq")} · llm ${count("llm")} · out_of_scope ${count("out_of_scope")}) và ${followUps.length} câu nối tiếp (có \`history\`). ${fresh.filter((s) => s.accentFree).length} câu hỏi mới gõ không dấu — không trả thẳng, không chặn, luôn xuống bậc 3–4 (chọn đoạn bằng bản bỏ dấu của câu hỏi mẫu).`,
    `- Thời gian embed một câu (đã làm nóng model): trung vị ${fmt(median(embedMs), 1)} ms, lớn nhất ${fmt(Math.max(...embedMs), 1)} ms.`,
    "",
    "## Ngưỡng đang dùng (`support-chat.config.ts`)",
    "",
    `\`DIRECT_THRESHOLD\` ${fmt(DIRECT_THRESHOLD)} · \`OUT_OF_SCOPE_THRESHOLD\` ${fmt(OUT_OF_SCOPE_THRESHOLD)} · \`DIRECT_THRESHOLD_WITH_HISTORY\` ${fmt(DIRECT_THRESHOLD_WITH_HISTORY)} · \`RAG_TOP_K\` ${RAG_TOP_K}`,
    "",
  );

  const current = directRow(fresh, DIRECT_THRESHOLD);
  const currentOutOfScope = outOfScopeRow(fresh, OUT_OF_SCOPE_THRESHOLD);
  const currentHistory = historyRow(followUps, DIRECT_THRESHOLD_WITH_HISTORY);
  const tiers = countBy(fresh, (s) => tierOf(s, DIRECT_THRESHOLD, OUT_OF_SCOPE_THRESHOLD));
  push(
    "| Chỉ số (câu hỏi mới) | Giá trị |",
    "| --- | --- |",
    `| Trả thẳng FAQ | ${current.answered}/${fresh.length} (${pct(current.answered / fresh.length)}) |`,
    `| Độ chính xác trả thẳng | ${pct(precision(current))} (${current.correct}/${current.answered}) |`,
    `| Câu \`faq\` được trả thẳng đúng | ${current.correct}/${count("faq")} (${pct(current.coverage)}) |`,
    `| Câu ngoài phạm vi bị chặn | ${currentOutOfScope.blockedOutOfScope}/${currentOutOfScope.outOfScopeTotal} (${pct(currentOutOfScope.blockedOutOfScope / currentOutOfScope.outOfScopeTotal)}) |`,
    `| Câu trong phạm vi bị chặn nhầm | ${currentOutOfScope.blockedInScope}/${currentOutOfScope.inScopeTotal} |`,
    `| Rơi xuống bậc 3–4 (cache/LLM) | ${tiers.get("llm") ?? 0}/${fresh.length} (${pct((tiers.get("llm") ?? 0) / fresh.length)}) |`,
    "",
    `Câu nối tiếp: ${currentHistory.answered}/${followUps.length} bị trả thẳng, ${currentHistory.wrong} sai mục; không câu nào bị chặn (câu nối tiếp không qua ngưỡng ngoài phạm vi).`,
    "",
    "Phân bố bậc trên câu hỏi mới, theo nhãn mong đợi:",
    "",
    "| Nhãn mong đợi | → trả thẳng FAQ | → ngoài phạm vi | → bậc 3–4 |",
    "| --- | --- | --- | --- |",
  );
  for (const expect of ["faq", "llm", "out_of_scope"] as const) {
    const group = fresh.filter((s) => s.q.expect === expect);
    const byTier = countBy(group, (s) => tierOf(s, DIRECT_THRESHOLD, OUT_OF_SCOPE_THRESHOLD));
    push(`| ${expect} (${group.length}) | ${byTier.get("faq") ?? 0} | ${byTier.get("out_of_scope") ?? 0} | ${byTier.get("llm") ?? 0} |`);
  }
  push("");

  push(
    "## Phân bố score cao nhất theo nhãn",
    "",
    "Hai nhóm càng tách nhau thì ngưỡng càng dễ chọn.",
    "",
    "| Nhãn | n | Nhỏ nhất | P25 | Trung vị | P75 | Lớn nhất |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const expect of ["faq", "llm", "out_of_scope"] as const) {
    const values = fresh.filter((s) => s.q.expect === expect).map((s) => first(s.scores).questionScore);
    push(
      `| ${expect} | ${values.length} | ${fmt(Math.min(...values))} | ${fmt(quantile(values, 0.25))} | ${fmt(median(values))} | ${fmt(quantile(values, 0.75))} | ${fmt(Math.max(...values))} |`,
    );
  }
  const followUpValues = followUps.map((s) => first(s.scores).questionScore);
  push(
    `| nối tiếp | ${followUpValues.length} | ${fmt(Math.min(...followUpValues))} | ${fmt(quantile(followUpValues, 0.25))} | ${fmt(median(followUpValues))} | ${fmt(quantile(followUpValues, 0.75))} | ${fmt(Math.max(...followUpValues))} |`,
    "",
  );

  push(
    "## Lưới `DIRECT_THRESHOLD`",
    "",
    `Quy tắc: ngưỡng nhỏ nhất mà nó **và mọi ngưỡng lớn hơn** đều có độ chính xác trả thẳng ≥ ${pct(MIN_DIRECT_PRECISION)}, và cách câu sẽ bị trả thẳng sai gần nhất ít nhất ${fmt(MIN_DIRECT_BUFFER, 2)}. Trả thẳng câu \`llm\` hay câu ngoài phạm vi đều tính là sai. Gợi ý theo quy tắc: **${recommendedDirect === null ? "không có" : fmt(recommendedDirect)}**.`,
    "",
  );
  if (recommendedDirect !== null) {
    const nearestWrong = nearestWrongBelow(fresh, recommendedDirect);
    if (nearestWrong) {
      push(
        `Biên an toàn: câu sẽ bị trả thẳng sai có score cao nhất dưới ${fmt(recommendedDirect)} là ${nearestWrong.q.id} (${fmt(first(nearestWrong.scores).questionScore, 4)}, khớp nhầm \`${first(nearestWrong.scores).faqId}\`).`,
        "",
      );
    }
  }
  push(
    "| Ngưỡng | Trả thẳng | Đúng | Chính xác | Sai mục | Trả thẳng câu llm | Trả thẳng câu ngoài PV | Phủ câu faq |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const row of directRows) {
    const mark = row.threshold === DIRECT_THRESHOLD ? " ◀" : "";
    push(
      `| ${fmt(row.threshold)}${mark} | ${row.answered} | ${row.correct} | ${pct(precision(row))} | ${row.wrongItem} | ${row.llmAnswered} | ${row.outOfScopeAnswered} | ${pct(row.coverage)} |`,
    );
  }
  push("");

  push(
    "## Lưới `OUT_OF_SCOPE_THRESHOLD`",
    "",
    `Quy tắc: ngưỡng lớn nhất **không chặn nhầm** câu trong phạm vi nào — chặn nhầm thì người dùng bị từ chối oan, còn để lọt câu ngoài phạm vi chỉ tốn một lượt LLM (prompt bậc 4 vẫn từ chối). Câu gõ không dấu không bao giờ bị chặn nên không ảnh hưởng ngưỡng này. Gợi ý theo quy tắc: **${recommendedOutOfScope === null ? "không có" : fmt(recommendedOutOfScope)}**.`,
    "",
    "| Ngưỡng | Chặn đúng (ngoài PV) | Chặn nhầm (trong PV) |",
    "| --- | --- | --- |",
  );
  for (const row of outOfScopeRows) {
    const mark = row.threshold === OUT_OF_SCOPE_THRESHOLD ? " ◀" : "";
    push(
      `| ${fmt(row.threshold)}${mark} | ${row.blockedOutOfScope}/${row.outOfScopeTotal} (${pct(row.blockedOutOfScope / row.outOfScopeTotal)}) | ${row.blockedInScope}/${row.inScopeTotal} |`,
    );
  }
  push("");

  push(
    "## Lưới `DIRECT_THRESHOLD_WITH_HISTORY` (câu nối tiếp)",
    "",
    "Câu nối tiếp được trả thẳng đúng mục thì chấp nhận được; sai mục là lỗi. Câu không gắn `faqId` (thử prompt injection) bị trả thẳng cũng tính là sai.",
    "",
    "| Ngưỡng | Trả thẳng | Sai mục |",
    "| --- | --- | --- |",
  );
  for (const row of historyRows) {
    const mark = row.threshold === DIRECT_THRESHOLD_WITH_HISTORY ? " ◀" : "";
    push(`| ${fmt(row.threshold)}${mark} | ${row.answered}/${followUps.length} | ${row.wrong} |`);
  }
  push("");

  const contextItems = fresh
    .filter((s) => s.q.faqId && s.q.expect !== "out_of_scope")
    .map((s) => ({ faqId: s.q.faqId as string, scores: s.scores }));
  const llmContextItems = fresh
    .filter((s) => s.q.faqId && s.q.expect === "llm")
    .map((s) => ({ faqId: s.q.faqId as string, scores: s.scores }));
  push(
    `## Chọn đoạn FAQ cho prompt bậc 4 (top-${RAG_TOP_K})`,
    "",
    `Mục đúng (\`faqId\`) có nằm trong ${RAG_TOP_K} mục đưa vào prompt không. Cột "câu llm" là nhóm thật sự xuống bậc 4.`,
    "",
    `| Cách xếp hạng | Top-1 (mọi câu có faqId) | Top-${RAG_TOP_K} (mọi câu có faqId) | Top-1 (câu llm) | Top-${RAG_TOP_K} (câu llm) |`,
    "| --- | --- | --- | --- | --- |",
  );
  for (const strategy of CONTEXT_STRATEGIES) {
    const all = contextHits(contextItems, strategy);
    const llm = contextHits(llmContextItems, strategy);
    push(
      `| \`${strategy.name}\` — ${strategy.description} | ${all.top1}/${all.total} | ${all.topK}/${all.total} | ${llm.top1}/${llm.total} | ${llm.topK}/${llm.total} |`,
    );
  }
  push("");

  const followUpContextItems = followUps.filter((s) => s.q.faqId);
  if (followUpContextItems.length > 0) {
    push(
      "Câu nối tiếp — embed riêng câu hỏi hay ghép thêm tin user gần nhất trong lịch sử:",
      "",
      `| Cách xếp hạng | Chỉ câu hỏi: top-${RAG_TOP_K} | Ghép tin user trước: top-${RAG_TOP_K} |`,
      "| --- | --- | --- |",
    );
    for (const strategy of CONTEXT_STRATEGIES) {
      const alone = contextHits(followUpContextItems.map((s) => ({ faqId: s.q.faqId as string, scores: s.scores })), strategy);
      const joined = contextHits(
        followUpContextItems.map((s) => ({ faqId: s.q.faqId as string, scores: s.scoresWithContext ?? s.scores })),
        strategy,
      );
      push(`| \`${strategy.name}\` | ${alone.topK}/${alone.total} | ${joined.topK}/${joined.total} |`);
    }
    push("");
  }

  push(...compareVariants(fresh), ...accentFreeDetails(fresh), ...syntheticAccentFree(synthetic));

  push(
    "## Từng câu lệch ở ngưỡng đang dùng",
    "",
    "Câu bị xếp khác nhãn mong đợi. Với câu `llm` rơi đúng bậc 3–4 nhưng mục đúng không nằm trong top-3 (cách `question`), xem phần cuối.",
    "",
    "| id | Người hỏi | Câu hỏi | Mong đợi | Kết quả | Score | Mục gần nhất (câu mẫu khớp) |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  );
  let mismatches = 0;
  for (const s of fresh) {
    const tier = tierOf(s, DIRECT_THRESHOLD, OUT_OF_SCOPE_THRESHOLD);
    const top = first(s.scores);
    const ok = tier === s.q.expect && (tier !== "faq" || top.faqId === s.q.faqId);
    if (ok) continue;
    mismatches++;
    const expected = s.q.expect === "out_of_scope" ? "ngoài PV" : `${s.q.expect} ${s.q.faqId ?? ""}`.trim();
    push(
      `| ${s.q.id} | ${s.q.audience} | ${cell(s.q.question)} | ${expected} | ${tierLabel(tier)} | ${fmt(top.questionScore)} | ${top.faqId} (${cell(top.matchedQuestion)}) |`,
    );
  }
  for (const s of followUps) {
    const top = first(s.scores);
    if (!answersDirectly(s, DIRECT_THRESHOLD_WITH_HISTORY, 0) || top.faqId === s.q.faqId) continue;
    mismatches++;
    push(
      `| ${s.q.id} | ${s.q.audience} | ${cell(s.q.question)} (nối tiếp) | llm ${s.q.faqId ?? ""} | trả thẳng | ${fmt(top.questionScore)} | ${top.faqId} (${cell(top.matchedQuestion)}) |`,
    );
  }
  if (mismatches === 0) push("| — | | Không có câu lệch | | | | |");
  push("");

  const misses = fresh.filter((s) => {
    if (s.q.expect !== "llm" || !s.q.faqId) return false;
    return !s.scores.slice(0, RAG_TOP_K).some((score) => score.faqId === s.q.faqId);
  });
  push(`Câu \`llm\` mà mục đúng **không** nằm trong top-${RAG_TOP_K} (cách \`question\`): ${misses.length}.`, "");
  if (misses.length > 0) {
    push("| id | Câu hỏi | Mục đúng | Top-3 nhận được |", "| --- | --- | --- | --- |");
    for (const s of misses) {
      push(`| ${s.q.id} | ${cell(s.q.question)} | ${s.q.faqId} | ${s.scores.slice(0, RAG_TOP_K).map((score) => score.faqId).join(", ")} |`);
    }
    push("");
  }

  return `${lines.join("\n")}\n`;
}

/**
 * So cách xử lý câu gõ không dấu đang dùng với cách cũ (mọi câu so với câu hỏi mẫu gốc và
 * cùng ngưỡng chặn), kèm phương án thử chưa áp dụng: điều kiện khoảng cách giữa mục thứ
 * nhất và thứ hai. Mỗi dòng chọn DIRECT/OUT_OF_SCOPE theo đúng quy tắc của hai lưới ở trên.
 */
function compareVariants(fresh: Scored[]): string[] {
  const variants = [
    { name: "Hiện tại", rows: fresh },
    {
      name: "Câu không dấu như câu thường",
      rows: fresh.map((s) => ({ ...s, scores: s.scoresAccented, accentFree: false })),
    },
    { name: "Câu không dấu so với câu mẫu bỏ dấu, trả thẳng/chặn như thường", rows: fresh.map((s) => ({ ...s, accentFree: false })) },
  ];
  const faqTotal = fresh.filter((s) => s.q.expect === "faq").length;
  const lines = [
    "## So sánh phương án",
    "",
    "Mỗi dòng chọn ngưỡng theo đúng quy tắc của hai lưới trên. **Hiện tại**: câu gõ không dấu không trả thẳng, không chặn. **Câu không dấu như câu thường**: so với câu hỏi mẫu gốc, cùng ngưỡng với mọi câu (cách của đợt B lần đầu). **Khoảng cách** (phương án thử, chưa áp dụng) = score mục cao nhất − score mục thứ hai: chỉ trả thẳng khi mục cao nhất vượt hẳn.",
    "",
    "| Phương án | Khoảng cách | DIRECT | Trả thẳng đúng câu faq | Chính xác | OUT_OF_SCOPE | Chặn đúng ngoài PV | Xuống bậc 3–4 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const variant of variants) {
    const outOfScope = recommendOutOfScope(OUT_OF_SCOPE_GRID.map((threshold) => outOfScopeRow(variant.rows, threshold)));
    const outOfScopeStats = outOfScope === null ? null : outOfScopeRow(variant.rows, outOfScope);
    for (const margin of MARGIN_GRID) {
      const rows = DIRECT_GRID.map((threshold) => directRow(variant.rows, threshold, margin));
      const direct = recommendDirect(rows, variant.rows, margin);
      const row = rows.find((item) => item.threshold === direct);
      const fallThrough =
        direct === null || outOfScope === null
          ? null
          : variant.rows.filter((s) => tierOf(s, direct, outOfScope, margin) === "llm").length;
      lines.push(
        `| ${variant.name} | ${fmt(margin, 2)} | ${direct === null ? "—" : fmt(direct)} | ${row ? `${row.correct}/${faqTotal} (${pct(row.coverage)})` : "—"} | ${row ? pct(precision(row)) : "—"} | ${outOfScope === null ? "—" : fmt(outOfScope)} | ${outOfScopeStats ? `${outOfScopeStats.blockedOutOfScope}/${outOfScopeStats.outOfScopeTotal}` : "—"} | ${fallThrough === null ? "—" : `${fallThrough}/${variant.rows.length} (${pct(fallThrough / variant.rows.length)})`} |`,
      );
    }
  }
  lines.push("");
  return lines;
}

function accentFreeDetails(fresh: Scored[]): string[] {
  const noAccent = fresh.filter((s) => s.accentFree);
  if (noAccent.length === 0) return [];
  const lines = [
    `Câu hỏi gõ không dấu — score và mục cao nhất khi so với câu hỏi mẫu gốc và với bản bỏ dấu; top-${RAG_TOP_K} theo \`contextRankOf\`. ✗ = mục cao nhất không phải mục đúng.`,
    "",
    `| id | Câu hỏi | Mục đúng | So với câu mẫu gốc | So với câu mẫu bỏ dấu | Top-${RAG_TOP_K} có mục đúng (gốc → bỏ dấu) |`,
    "| --- | --- | --- | --- | --- | --- |",
  ];
  const label = (score: FaqScore, faqId: string | undefined) =>
    `${fmt(score.questionScore)} ${score.faqId}${faqId && score.faqId !== faqId ? " ✗" : ""}`;
  const inTopK = (scores: FaqScore[], faqId: string) => (contextTopK(scores).includes(faqId) ? "có" : "không");
  for (const s of noAccent) {
    const topK = s.q.faqId ? `${inTopK(s.scoresAccented, s.q.faqId)} → ${inTopK(s.scores, s.q.faqId)}` : "—";
    lines.push(
      `| ${s.q.id} | ${cell(s.q.question)} | ${s.q.faqId ?? "—"} | ${label(first(s.scoresAccented), s.q.faqId)} | ${label(first(s.scores), s.q.faqId)} | ${topK} |`,
    );
  }
  lines.push("");
  return lines;
}

/**
 * Đo trên câu có dấu bị bỏ dấu nhân tạo (cùng nhãn): chọn đoạn cho prompt tốt hơn bao nhiêu
 * khi so với câu mẫu bỏ dấu, và trả thẳng câu không dấu chính xác tới đâu ở từng ngưỡng —
 * căn cứ cho quy tắc "câu không dấu không trả thẳng, không chặn".
 */
function syntheticAccentFree(synthetic: SyntheticScored[]): string[] {
  if (synthetic.length === 0) return [];
  const labelled = synthetic.filter((s) => s.q.faqId && s.q.expect !== "out_of_scope");
  const hits = (pick: (s: SyntheticScored) => FaqScore[]) => ({
    top1: labelled.filter((s) => first(pick(s)).faqId === s.q.faqId).length,
    topK: labelled.filter((s) => contextTopK(pick(s)).includes(s.q.faqId as string)).length,
  });
  const accented = hits((s) => s.accented);
  const stripped = hits((s) => s.stripped);
  const spread = (values: number[]) => `${fmt(Math.min(...values))}–${fmt(Math.max(...values))}`;
  const inScope = synthetic.filter((s) => s.q.expect !== "out_of_scope").map((s) => first(s.stripped).questionScore);
  const outOfScope = synthetic.filter((s) => s.q.expect === "out_of_scope").map((s) => first(s.stripped).questionScore);
  const lines = [
    `Bỏ dấu nhân tạo ${synthetic.length} câu hỏi mới có dấu (giữ nhãn) để có cỡ mẫu lớn hơn ${labelled.length} câu có \`faqId\`:`,
    "",
    `| So với | Top-1 đúng mục | Top-${RAG_TOP_K} có mục đúng |`,
    "| --- | --- | --- |",
    `| Câu hỏi mẫu gốc | ${accented.top1}/${labelled.length} | ${accented.topK}/${labelled.length} |`,
    `| Bản bỏ dấu của câu hỏi mẫu ◀ | ${stripped.top1}/${labelled.length} | ${stripped.topK}/${labelled.length} |`,
    "",
    `Score cao nhất (so với bản bỏ dấu): câu trong phạm vi ${spread(inScope)}, câu ngoài phạm vi ${spread(outOfScope)} — hai nhóm chồng lên nhau gần hết nên không có ngưỡng chặn an toàn.`,
    "",
    "Nếu trả thẳng câu không dấu (so với bản bỏ dấu):",
    "",
    "| Ngưỡng | Trả thẳng | Đúng | Chính xác |",
    "| --- | --- | --- | --- |",
  ];
  for (const threshold of [0.85, 0.9, 0.925, 0.95]) {
    const answered = synthetic.filter((s) => first(s.stripped).questionScore >= threshold);
    const correct = answered.filter((s) => s.q.expect === "faq" && first(s.stripped).faqId === s.q.faqId).length;
    lines.push(
      `| ${fmt(threshold)} | ${answered.length} | ${correct} | ${answered.length === 0 ? "—" : pct(correct / answered.length)} |`,
    );
  }
  lines.push("");
  return lines;
}

function tierLabel(tier: "faq" | "out_of_scope" | "llm"): string {
  return tier === "faq" ? "trả thẳng" : tier === "out_of_scope" ? "chặn" : "bậc 3–4";
}

// ---------------------------------------------------------------------------
// Tiện ích

function range(from: number, to: number, step: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to + 1e-9; value += step) values.push(Math.round(value * 1000) / 1000);
  return values;
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

function median(values: number[]): number {
  return quantile(values, 0.5);
}

function fmt(value: number, digits = 3): string {
  return value.toFixed(digits).replace(".", ",");
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function countBy<T, K>(items: T[], key: (item: T) => K): Map<K, number> {
  const result = new Map<K, number>();
  for (const item of items) result.set(key(item), (result.get(key(item)) ?? 0) + 1);
  return result;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
