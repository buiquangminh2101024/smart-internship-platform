// Hàm thuần của bộ đánh giá Job Matcher GĐ2 (bước 6 trong
// docs/06-backend/job-matcher-phase2/PLAN.md, mục "Bộ đánh giá"): đọc labels.json,
// chọn nhãn dùng để đo, và các chỉ số Spearman ρ / accuracy 3 lớp / NDCG@k / FP-FN / Cohen's κ.
// Không chạm DB hay model — script eval-job-matching.ts lo phần đó.

export const MATCH_LABELS = ["POOR_MATCH", "PARTIAL_MATCH", "GOOD_MATCH"] as const;
export type MatchLabel = (typeof MATCH_LABELS)[number];
export type Split = "dev" | "test";

/** Giá trị thứ bậc của nhãn — cũng là độ lợi trong NDCG. */
export const LABEL_VALUE: Record<MatchLabel, 0 | 1 | 2> = { POOR_MATCH: 0, PARTIAL_MATCH: 1, GOOD_MATCH: 2 };

export interface LabeledPair {
  id: string;
  candidateRef: string;
  jobRef: string;
  label: MatchLabel | null;
  ratings: { rater1: MatchLabel | null; rater2: MatchLabel | null };
  split: Split;
  category: string;
  note: string;
}

// ─── Đọc labels.json ─────────────────────────────────────────────────────────

/** Kiểm từng cặp và chỉ đích danh id có giá trị sai — người gán sửa tay trong file JSON. */
export function parseLabelsFile(raw: unknown): { pairs: LabeledPair[]; errors: string[] } {
  const errors: string[] = [];
  const list = isRecord(raw) ? raw.pairs : undefined;
  if (!Array.isArray(list)) return { pairs: [], errors: ['Thiếu mảng "pairs" ở gốc file.'] };

  const pairs: LabeledPair[] = [];
  const seenIds = new Set<string>();
  const seenPairs = new Set<string>();
  list.forEach((item, index) => {
    const where = isRecord(item) && typeof item.id === "string" ? item.id : `pairs[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${where}: không phải object.`);
      return;
    }
    const pairErrors: string[] = [];
    const text = (key: string) => {
      const value = item[key];
      if (typeof value !== "string" || value.trim() === "") pairErrors.push(`"${key}" phải là chuỗi khác rỗng.`);
      return typeof value === "string" ? value : "";
    };
    const label = (value: unknown, field: string): MatchLabel | null => {
      if (value === null || value === undefined) return null;
      if (typeof value === "string" && (MATCH_LABELS as readonly string[]).includes(value)) return value as MatchLabel;
      pairErrors.push(`${field} = ${JSON.stringify(value)} không hợp lệ — dùng "GOOD_MATCH", "PARTIAL_MATCH", "POOR_MATCH" hoặc null.`);
      return null;
    };

    const id = text("id");
    const candidateRef = text("candidateRef");
    const jobRef = text("jobRef");
    const split = item.split;
    if (split !== "dev" && split !== "test") pairErrors.push(`split = ${JSON.stringify(split)} phải là "dev" hoặc "test".`);
    // Readme cho phép xoá hẳn rater2 khi chỉ có một người gán.
    const ratings = item.ratings === undefined ? {} : item.ratings;
    if (!isRecord(ratings)) pairErrors.push('"ratings" phải là object { rater1, rater2 }.');
    const r = isRecord(ratings) ? ratings : {};
    const parsed: LabeledPair = {
      id,
      candidateRef,
      jobRef,
      label: label(item.label, "label"),
      ratings: { rater1: label(r.rater1, "ratings.rater1"), rater2: label(r.rater2, "ratings.rater2") },
      split: split === "test" ? "test" : "dev",
      category: typeof item.category === "string" ? item.category : "",
      note: typeof item.note === "string" ? item.note : "",
    };

    if (id !== "") {
      if (seenIds.has(id)) pairErrors.push(`id "${id}" bị lặp.`);
      seenIds.add(id);
    }
    const key = `${candidateRef}\u0000${jobRef}`;
    if (candidateRef !== "" && jobRef !== "") {
      if (seenPairs.has(key)) pairErrors.push(`cặp (${candidateRef}, ${jobRef}) bị lặp.`);
      seenPairs.add(key);
    }

    if (pairErrors.length > 0) errors.push(...pairErrors.map((message) => `${where}: ${message}`));
    else pairs.push(parsed);
  });
  return { pairs, errors };
}

// ─── Chọn nhãn dùng để đo ────────────────────────────────────────────────────

export type LabelSource = "final" | "agreed" | "single-rater";
export type ResolvedLabel =
  | { status: "used"; label: MatchLabel; source: LabelSource }
  | { status: "excluded"; reason: "disagreement" | "unlabeled" };

/**
 * Quy tắc ở eval/labeling-guide.md: `label` nếu có → nhãn chung khi hai người
 * giống nhau → nhãn của người duy nhất đã gán (tạm) → bất đồng chưa thống nhất bị loại.
 */
export function resolveLabel(pair: Pick<LabeledPair, "label" | "ratings">): ResolvedLabel {
  if (pair.label) return { status: "used", label: pair.label, source: "final" };
  const { rater1, rater2 } = pair.ratings;
  if (rater1 && rater2) {
    return rater1 === rater2
      ? { status: "used", label: rater1, source: "agreed" }
      : { status: "excluded", reason: "disagreement" };
  }
  const only = rater1 ?? rater2;
  return only ? { status: "used", label: only, source: "single-rater" } : { status: "excluded", reason: "unlabeled" };
}

// ─── Thống kê cơ bản ────────────────────────────────────────────────────────

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Hạng bắt đầu từ 1; các giá trị bằng nhau nhận hạng trung bình. */
export function averageRanks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length);
  for (let start = 0; start < order.length; ) {
    let end = start;
    while (end + 1 < order.length && order[end + 1]!.value === order[start]!.value) end++;
    const rank = (start + end) / 2 + 1;
    for (let k = start; k <= end; k++) ranks[order[k]!.index] = rank;
    start = end + 1;
  }
  return ranks;
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

/** Spearman ρ có xử lý hạng đồng (Pearson trên hạng trung bình); null nếu < 2 điểm hoặc một bên không đổi. */
export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length) throw new Error("spearman: hai dãy khác độ dài");
  if (xs.length < 2) return null;
  return pearson(averageRanks(xs), averageRanks(ys));
}

// ─── Phân lớp theo ngưỡng ────────────────────────────────────────────────────

/** score ≥ good ⇒ GOOD; ≥ partial ⇒ PARTIAL; còn lại POOR. */
export interface Thresholds {
  good: number;
  partial: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { good: 70, partial: 40 };

export function classify(score: number, thresholds: Thresholds): MatchLabel {
  if (score >= thresholds.good) return "GOOD_MATCH";
  if (score >= thresholds.partial) return "PARTIAL_MATCH";
  return "POOR_MATCH";
}

export interface ScoredPair {
  score: number;
  label: MatchLabel;
}

export function accuracy(items: ScoredPair[], thresholds: Thresholds): number | null {
  if (items.length === 0) return null;
  return items.filter((item) => classify(item.score, thresholds) === item.label).length / items.length;
}

/** FP: POOR mà điểm ≥ ngưỡng GOOD. FN: GOOD mà điểm < ngưỡng PARTIAL (PLAN, bảng chỉ số). */
export function isFalsePositive(item: ScoredPair, thresholds: Thresholds): boolean {
  return item.label === "POOR_MATCH" && item.score >= thresholds.good;
}

export function isFalseNegative(item: ScoredPair, thresholds: Thresholds): boolean {
  return item.label === "GOOD_MATCH" && item.score < thresholds.partial;
}

/**
 * Chọn 2 ngưỡng (bội số của `step`) cho accuracy cao nhất; hoà thì chọn cặp gần
 * ngưỡng mặc định nhất để không "nhảy" vì một cặp. Chỉ gọi trên tập dev.
 */
export function tuneThresholds(items: ScoredPair[], step = 5, anchor: Thresholds = DEFAULT_THRESHOLDS): Thresholds {
  let best = anchor;
  let bestAccuracy = accuracy(items, anchor) ?? 0;
  let bestDistance = 0;
  for (let partial = 0; partial <= 100; partial += step) {
    for (let good = partial + step; good <= 100; good += step) {
      const candidate = { good, partial };
      const value = accuracy(items, candidate) ?? 0;
      const distance = Math.abs(good - anchor.good) + Math.abs(partial - anchor.partial);
      if (value > bestAccuracy + 1e-12 || (Math.abs(value - bestAccuracy) <= 1e-12 && distance < bestDistance)) {
        best = candidate;
        bestAccuracy = value;
        bestDistance = distance;
      }
    }
  }
  return best;
}

// ─── NDCG ────────────────────────────────────────────────────────────────────

/**
 * NDCG@k với độ lợi = giá trị nhãn (0/1/2), chiết khấu log2(vị trí + 1).
 * Điểm bằng nhau: mỗi vị trí trong nhóm hoà nhận độ lợi trung bình của nhóm
 * (kỳ vọng trên mọi thứ tự hoà — McSherry & Najork 2008), để kết quả không phụ
 * thuộc thứ tự dữ liệu. null nếu IDCG = 0 (mọi cặp đều POOR — không có gì để xếp).
 */
export function ndcgAtK(items: ScoredPair[], k: number): number | null {
  const gains = [...items].sort((a, b) => b.score - a.score);
  const discount = (position: number) => 1 / Math.log2(position + 2);

  let dcg = 0;
  for (let start = 0; start < gains.length && start < k; ) {
    let end = start;
    while (end + 1 < gains.length && gains[end + 1]!.score === gains[start]!.score) end++;
    let groupGain = 0;
    for (let i = start; i <= end; i++) groupGain += LABEL_VALUE[gains[i]!.label];
    const meanGain = groupGain / (end - start + 1);
    for (let position = start; position <= end && position < k; position++) dcg += meanGain * discount(position);
    start = end + 1;
  }

  const ideal = items.map((item) => LABEL_VALUE[item.label]).sort((a, b) => b - a);
  let idcg = 0;
  for (let position = 0; position < Math.min(k, ideal.length); position++) idcg += ideal[position]! * discount(position);
  return idcg === 0 ? null : dcg / idcg;
}

/** NDCG@k trung bình theo tin; chỉ tính tin có ≥ minPerJob cặp và có ít nhất một cặp không POOR. */
export function meanNdcgByJob(
  items: (ScoredPair & { jobRef: string })[],
  k = 3,
  minPerJob = 3,
): { mean: number | null; jobs: number; skipped: string[] } {
  const byJob = new Map<string, ScoredPair[]>();
  for (const item of items) byJob.set(item.jobRef, [...(byJob.get(item.jobRef) ?? []), item]);
  const values: number[] = [];
  const skipped: string[] = [];
  for (const [jobRef, group] of byJob) {
    const value = group.length >= minPerJob ? ndcgAtK(group, k) : null;
    if (value === null) skipped.push(jobRef);
    else values.push(value);
  }
  return {
    mean: values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length,
    jobs: values.length,
    skipped,
  };
}

// ─── Độ tin cậy của nhãn ────────────────────────────────────────────────────

/** Cohen's κ (không trọng số) trên các cặp mà cả hai người đều đã gán. */
export function cohenKappa(pairs: { a: MatchLabel; b: MatchLabel }[]): { kappa: number | null; agreement: number | null; n: number } {
  const n = pairs.length;
  if (n === 0) return { kappa: null, agreement: null, n };
  const observed = pairs.filter((pair) => pair.a === pair.b).length / n;
  let expected = 0;
  for (const label of MATCH_LABELS) {
    const pa = pairs.filter((pair) => pair.a === label).length / n;
    const pb = pairs.filter((pair) => pair.b === label).length / n;
    expected += pa * pb;
  }
  // Cả hai người chỉ dùng đúng một nhãn giống nhau: κ không xác định.
  return { kappa: expected === 1 ? null : (observed - expected) / (1 - expected), agreement: observed, n };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
