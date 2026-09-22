import type { MatchWeights, SemanticCalibration } from "./job-matching.types";

// Trọng số đặt trong code (không ở env) để có version và đi cùng code được
// review. 0.60/0.15/0.25 là đề xuất ban đầu, CHƯA có căn cứ thực nghiệm — GĐ2
// hiệu chỉnh trên tập dev của bộ đánh giá (docs/06-backend/job-matcher-phase2/PLAN.md).
export const RULE_WEIGHTS_V1: MatchWeights = {
  version: "rule-v1",
  weights: { requiredSkills: 0.6, preferredSkills: 0.15, experience: 0.25, education: 0, semantic: 0 },
};

// GĐ2 — chỉ dùng trong bộ đánh giá để so sánh, service không chạy cấu hình này.
export const EMBEDDING_ONLY_WEIGHTS_V1: MatchWeights = {
  version: "embedding-only-v1",
  weights: { requiredSkills: 0, preferredSkills: 0, experience: 0, education: 0, semantic: 1 },
};

// GĐ2 — semantic để thấp (0.30) vì văn bản embed đã chứa tên kỹ năng (tính hai lần).
// education chưa có nguồn nên luôn bị chia lại cho tới GĐ3.
// Đề xuất ban đầu, KHÔNG dùng cho service nữa — giữ lại làm mốc so sánh "trước hiệu
// chỉnh" trong bộ đánh giá (eval-job-matching.ts). Xem HYBRID_WEIGHTS_V2.
export const HYBRID_WEIGHTS_V1: MatchWeights = {
  version: "hybrid-v1",
  weights: { requiredSkills: 0.4, preferredSkills: 0.1, experience: 0.15, education: 0.05, semantic: 0.3 },
};

// Bước 6 (PLAN GĐ2): chọn trên tập dev bằng nhãn cuối cùng (64/64 cặp, hai người gán +
// label cho cặp bất đồng) — lưới semantic {0.2, 0.3, 0.4}, chọn theo ρ rồi NDCG@3 rồi ít
// FP hơn ⇒ semantic = 0.4 thắng ở cả ba. Phần còn lại chia theo đúng tỉ lệ của
// HYBRID_WEIGHTS_V1 (0.4:0.1:0.15:0.05), co lại theo (1-0.4)/(1-0.3). Quy tắc quyết định
// (chốt trước) ĐẠT trên dev: ρ 0.789 > 0.671, NDCG@3 0.965 > 0.904, FP 0 = 0 so với RULE.
// Kết quả đầy đủ: docs/06-backend/job-matcher-phase2/eval/eval-results.md.
export const HYBRID_WEIGHTS_V2: MatchWeights = {
  version: "hybrid-v2",
  weights: { requiredSkills: 0.3429, preferredSkills: 0.0857, experience: 0.1286, education: 0.0429, semantic: 0.4 },
};

// Hiệu chỉnh trên tập dev ở bước 6, nhãn cuối cùng (không còn tạm): lo = trung vị cosine
// cặp POOR_MATCH, hi = trung vị cặp GOOD_MATCH. Đổi mẫu văn bản (MATCH_EMBEDDING_TEMPLATE_VERSION)
// hoặc đổi model thì phải hiệu chỉnh lại — giá trị này gắn với đúng model+mẫu hiện tại.
export const SEMANTIC_CALIBRATION: SemanticCalibration = { lo: 0.4442, hi: 0.7277 };

// Số vector hồ sơ mới tính tối đa trong một request danh sách đơn; phần vượt trả
// rule-v1 + semanticStatus PENDING và đầy dần ở các lần tải sau. Tạm theo số đo bước 1–2.
export const MAX_NEW_EMBEDDINGS_PER_REQUEST = 30;

/** Tỉ lệ số năm tối thiểu để kinh nghiệm được xếp PARTIAL thay vì BELOW. */
export const EXPERIENCE_PARTIAL_RATIO = 0.5;

// GĐ3: điểm education khi ứng viên học ngành Employer xác nhận là "liên quan"
// (RELATED) — giữa "khác ngành" (0) và "đúng ngành" (1). Bước 7 của
// docs/06-backend/job-matcher-phase3/PLAN.md quét lưới {0.3, 0.5, 0.65, 0.8} trên
// dev (7 cặp RELATED): 0.65 có ρ cao nhất nhưng cả lưới chỉ chênh 0.006, NDCG@3/FP
// không đổi ⇒ giá trị không bị dữ liệu bác bỏ, chưa đủ căn cứ nói tốt hơn giá trị
// lân cận. Kết quả: docs/06-backend/job-matcher-phase3/eval/eval-results.md.
export const RELATED_MAJOR_SCORE = 0.65;
