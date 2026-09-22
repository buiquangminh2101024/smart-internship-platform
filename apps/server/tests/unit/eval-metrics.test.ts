// Chạy: node --import tsx --test tests/unit/eval-metrics.test.ts (từ apps/server)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accuracy,
  averageRanks,
  classify,
  cohenKappa,
  isFalseNegative,
  isFalsePositive,
  meanNdcgByJob,
  median,
  ndcgAtK,
  parseLabelsFile,
  resolveLabel,
  spearman,
  tuneThresholds,
  type MatchLabel,
  type ScoredPair,
} from "../../scripts/lib/eval-metrics";

const close = (actual: number | null, expected: number, epsilon = 1e-9) => {
  assert.notEqual(actual, null);
  assert.ok(Math.abs(actual! - expected) < epsilon, `${actual} ≠ ${expected}`);
};

const pair = (overrides: Record<string, unknown> = {}) => ({
  id: "p01",
  candidateRef: "fe-01",
  jobRef: "Thực tập sinh Frontend",
  label: null,
  ratings: { rater1: "GOOD_MATCH", rater2: null },
  split: "dev",
  category: "same-domain",
  note: "",
  ...overrides,
});

test("parseLabelsFile: file hợp lệ; rater2 bị xoá hẳn vẫn đọc được", () => {
  const { pairs, errors } = parseLabelsFile({
    pairs: [pair(), pair({ id: "p02", candidateRef: "be-01", ratings: { rater1: "POOR_MATCH" } })],
  });
  assert.deepEqual(errors, []);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[1]!.ratings.rater2, null);
});

test("parseLabelsFile: chỉ đích danh id có nhãn sai chính tả, split sai, cặp lặp", () => {
  const { pairs, errors } = parseLabelsFile({
    pairs: [
      pair({ id: "p15", candidateRef: "v", ratings: { rater1: "Thực tập sinh QA Automation", rater2: null } }),
      pair({ id: "p16", candidateRef: "x", label: "good_match" }),
      pair({ id: "p17", candidateRef: "y", split: "train" }),
      pair({ id: "p18" }),
      pair({ id: "p18", candidateRef: "z" }),
      pair({ id: "p19", candidateRef: "w", ratings: { rater1: "", rater2: null } }),
      pair({ id: "p20" }),
    ],
  });
  const text = errors.join("\n");
  assert.match(text, /p15: ratings\.rater1 = "Thực tập sinh QA Automation" không hợp lệ/);
  assert.match(text, /p16: label = "good_match" không hợp lệ/);
  assert.match(text, /p17: split = "train"/);
  assert.match(text, /p20: cặp \(fe-01, Thực tập sinh Frontend\) bị lặp/);
  assert.match(text, /p18: id "p18" bị lặp/);
  assert.match(text, /p19: ratings\.rater1 = "" không hợp lệ/);
  assert.equal(pairs.length, 1); // chỉ cặp p18 đầu tiên sạch
  assert.match(parseLabelsFile([]).errors.join(), /Thiếu mảng "pairs"/);
});

test("resolveLabel: label > nhãn chung > một người (tạm); bất đồng hoặc trống bị loại", () => {
  const r = (label: MatchLabel | null, rater1: MatchLabel | null, rater2: MatchLabel | null) =>
    resolveLabel({ label, ratings: { rater1, rater2 } });
  assert.deepEqual(r("POOR_MATCH", "GOOD_MATCH", "PARTIAL_MATCH"), { status: "used", label: "POOR_MATCH", source: "final" });
  assert.deepEqual(r(null, "GOOD_MATCH", "GOOD_MATCH"), { status: "used", label: "GOOD_MATCH", source: "agreed" });
  assert.deepEqual(r(null, "GOOD_MATCH", "PARTIAL_MATCH"), { status: "excluded", reason: "disagreement" });
  assert.deepEqual(r(null, "PARTIAL_MATCH", null), { status: "used", label: "PARTIAL_MATCH", source: "single-rater" });
  assert.deepEqual(r(null, null, "POOR_MATCH"), { status: "used", label: "POOR_MATCH", source: "single-rater" });
  assert.deepEqual(r(null, null, null), { status: "excluded", reason: "unlabeled" });
});

test("median và hạng trung bình khi có hạng đồng", () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.deepEqual(averageRanks([10, 20, 20, 5]), [2, 3.5, 3.5, 1]);
});

test("spearman: đơn điệu = 1, ngược = −1, xử lý hạng đồng, suy biến ⇒ null", () => {
  close(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  close(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
  // Nhãn 0/1/2 nhiều hạng đồng: tính tay bằng Pearson trên hạng trung bình.
  // x = [10,20,30,40,50] → hạng 1..5; y = [0,0,1,2,2] → hạng [1.5,1.5,3,4.5,4.5]
  // cov = Σ(dx·dy) = (-2)(-1.5)+(-1)(-1.5)+0+1(1.5)+2(1.5) = 9; varX = 10; varY = 9
  close(spearman([10, 20, 30, 40, 50], [0, 0, 1, 2, 2]), 9 / Math.sqrt(10 * 9));
  assert.equal(spearman([1, 2, 3], [1, 1, 1]), null);
  assert.equal(spearman([1], [1]), null);
  assert.throws(() => spearman([1, 2], [1]));
});

test("classify, accuracy, FP/FN theo ngưỡng", () => {
  const t = { good: 70, partial: 40 };
  assert.equal(classify(70, t), "GOOD_MATCH");
  assert.equal(classify(69, t), "PARTIAL_MATCH");
  assert.equal(classify(40, t), "PARTIAL_MATCH");
  assert.equal(classify(39, t), "POOR_MATCH");
  const items: ScoredPair[] = [
    { score: 90, label: "GOOD_MATCH" },
    { score: 50, label: "PARTIAL_MATCH" },
    { score: 80, label: "POOR_MATCH" }, // FP
    { score: 10, label: "GOOD_MATCH" }, // FN
  ];
  assert.equal(accuracy(items, t), 0.5);
  assert.equal(accuracy([], t), null);
  assert.deepEqual(items.map((item) => isFalsePositive(item, t)), [false, false, true, false]);
  assert.deepEqual(items.map((item) => isFalseNegative(item, t)), [false, false, false, true]);
});

test("tuneThresholds: chọn ngưỡng tách đúng; hoà thì giữ gần mặc định", () => {
  const items: ScoredPair[] = [
    { score: 95, label: "GOOD_MATCH" },
    { score: 85, label: "GOOD_MATCH" },
    { score: 65, label: "PARTIAL_MATCH" },
    { score: 60, label: "PARTIAL_MATCH" },
    { score: 30, label: "POOR_MATCH" },
  ];
  // Mặc định 70/40 đã đúng hết ⇒ không đổi.
  assert.deepEqual(tuneThresholds(items), { good: 70, partial: 40 });
  // Mọi điểm dịch lên 20: cần ngưỡng cao hơn.
  const shifted = items.map((item) => ({ ...item, score: Math.min(100, item.score + 20) }));
  const tuned = tuneThresholds(shifted);
  assert.equal(accuracy(shifted, tuned), 1);
  assert.ok(tuned.good > 70 && tuned.partial > 40);
});

test("ndcgAtK: thứ tự lý tưởng = 1, ngược < 1, hoà lấy độ lợi trung bình, toàn POOR ⇒ null", () => {
  const ideal: ScoredPair[] = [
    { score: 90, label: "GOOD_MATCH" },
    { score: 60, label: "PARTIAL_MATCH" },
    { score: 20, label: "POOR_MATCH" },
  ];
  close(ndcgAtK(ideal, 3), 1);

  const reversed = ideal.map((item, i) => ({ ...item, score: 10 * (i + 1) }));
  // DCG = 0/1 + 1/log2(3) + 2/log2(4) ; IDCG = 2 + 1/log2(3)
  close(ndcgAtK(reversed, 3), (1 / Math.log2(3) + 1) / (2 + 1 / Math.log2(3)));

  // Cả ba hoà điểm: mỗi vị trí nhận độ lợi trung bình 1 ⇒ DCG = 1 + 1/log2(3) + 1/2.
  const tied = ideal.map((item) => ({ ...item, score: 50 }));
  close(ndcgAtK(tied, 3), (1 + 1 / Math.log2(3) + 0.5) / (2 + 1 / Math.log2(3)));
  // Kết quả không phụ thuộc thứ tự đầu vào khi hoà.
  close(ndcgAtK([...tied].reverse(), 3), ndcgAtK(tied, 3)!);

  assert.equal(ndcgAtK([{ score: 1, label: "POOR_MATCH" }, { score: 2, label: "POOR_MATCH" }], 3), null);
  // k cắt bớt: chỉ tính 1 vị trí đầu.
  close(ndcgAtK(reversed, 1), 0);
});

test("meanNdcgByJob: bỏ tin ít hơn 3 cặp hoặc toàn POOR, trung bình phần còn lại", () => {
  const items = [
    { jobRef: "A", score: 90, label: "GOOD_MATCH" as const },
    { jobRef: "A", score: 50, label: "PARTIAL_MATCH" as const },
    { jobRef: "A", score: 10, label: "POOR_MATCH" as const },
    { jobRef: "B", score: 90, label: "GOOD_MATCH" as const },
    { jobRef: "B", score: 50, label: "POOR_MATCH" as const },
    { jobRef: "C", score: 90, label: "POOR_MATCH" as const },
    { jobRef: "C", score: 50, label: "POOR_MATCH" as const },
    { jobRef: "C", score: 10, label: "POOR_MATCH" as const },
  ];
  const result = meanNdcgByJob(items);
  close(result.mean, 1);
  assert.equal(result.jobs, 1);
  assert.deepEqual(result.skipped.sort(), ["B", "C"]);
});

test("cohenKappa: đồng ý hoàn toàn = 1, theo công thức khi lệch, suy biến ⇒ null", () => {
  const same = (["GOOD_MATCH", "POOR_MATCH", "PARTIAL_MATCH"] as MatchLabel[]).map((a) => ({ a, b: a }));
  close(cohenKappa(same).kappa, 1);
  // 4 cặp: GG, GG, PP(POOR), GP(POOR) ⇒ po = 0.75; pA(G)=0.75, pB(G)=0.5, pA(P)=0.25, pB(P)=0.5 ⇒ pe = 0.5 ⇒ κ = 0.5
  const mixed = [
    { a: "GOOD_MATCH", b: "GOOD_MATCH" },
    { a: "GOOD_MATCH", b: "GOOD_MATCH" },
    { a: "POOR_MATCH", b: "POOR_MATCH" },
    { a: "GOOD_MATCH", b: "POOR_MATCH" },
  ] as { a: MatchLabel; b: MatchLabel }[];
  const result = cohenKappa(mixed);
  close(result.kappa, 0.5);
  assert.equal(result.agreement, 0.75);
  assert.equal(result.n, 4);
  assert.equal(cohenKappa([{ a: "GOOD_MATCH", b: "GOOD_MATCH" }]).kappa, null);
  assert.deepEqual(cohenKappa([]), { kappa: null, agreement: null, n: 0 });
});
