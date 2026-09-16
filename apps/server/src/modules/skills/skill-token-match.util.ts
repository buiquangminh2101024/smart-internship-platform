import { normalizeSkillName, tokenizeSkillName } from "./skill-normalize.util";

// Bậc 1 của pipeline dedupe: so khớp rẻ tiền, chạy hoàn toàn trong process,
// không đụng model embedding lẫn LLM. Chỉ những cặp tên mà bậc này không kết
// luận nổi mới đi tiếp xuống embedding/Gemini.

export interface SkillSimilarity {
  skillId: string;
  name: string;
  score: number;
}

/**
 * Điểm tương đồng trong [0, 1] giữa hai tên skill, lấy giá trị lớn nhất của:
 *  - Jaccard trên tập từ ("lập trình web" vs "lập trình website" → 0.5);
 *  - Similarity ký tự trên chuỗi đã chuẩn hoá bỏ hết khoảng trắng ("React.js"
 *    vs "reactjs" → ~1.0) — Jaccard một mình không bắt được cặp này vì hai bên
 *    chỉ có đúng 1 token và token đó khác nhau.
 */
export function skillSimilarity(a: string, b: string): number {
  return Math.max(jaccardSimilarity(a, b), characterSimilarity(a, b));
}

function jaccardSimilarity(a: string, b: string): number {
  const left = tokenizeSkillName(a);
  const right = tokenizeSkillName(b);
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

/** Dice coefficient trên bigram ký tự — rẻ, không cần ma trận như Levenshtein. */
function characterSimilarity(a: string, b: string): number {
  const left = bigrams(normalizeSkillName(a).replace(/\s/g, ""));
  const right = bigrams(normalizeSkillName(b).replace(/\s/g, ""));
  if (left.length === 0 || right.length === 0) return 0;

  // Đếm theo multiset: mỗi bigram bên phải chỉ được ghép đúng một lần, nếu
  // không "aaaa" sẽ khớp 100% với "aa".
  const pool = [...right];
  let matches = 0;
  for (const gram of left) {
    const index = pool.indexOf(gram);
    if (index >= 0) {
      pool.splice(index, 1);
      matches += 1;
    }
  }
  return (2 * matches) / (left.length + right.length);
}

function bigrams(value: string): string[] {
  if (value.length < 2) return value ? [value] : [];
  const result: string[] = [];
  for (let i = 0; i < value.length - 1; i += 1) {
    result.push(value.slice(i, i + 2));
  }
  return result;
}

/** Skill giống nhất trong danh sách (đã sắp giảm dần), tối đa `limit` phần tử. */
export function rankSkillsByName(
  name: string,
  skills: Array<{ id: string; name: string }>,
  limit = 5,
): SkillSimilarity[] {
  return skills
    .map((skill) => ({ skillId: skill.id, name: skill.name, score: skillSimilarity(name, skill.name) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
