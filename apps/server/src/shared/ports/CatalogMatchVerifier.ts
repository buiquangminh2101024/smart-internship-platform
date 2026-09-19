// Ranh giới AI cho việc gộp trùng mục catalog do người dùng tự gõ (chuẩn bị cho
// Phase 11 — AI Features Boundary): pipeline dedupe chỉ biết interface này,
// không biết Gemini. Đổi sang model khác, hoặc tắt hẳn AI, chỉ cần đổi
// registration trong container.
//
// Dùng chung cho Skill/University/Major thay vì 3 port gần như giống hệt nhau
// (docs/06-backend/cv-ai-extraction-phase2/PLAN.md Quyết định #3) — `domain`
// chỉ đổi nội dung prompt, không đổi luồng xử lý.

export type CatalogDomain = "skill" | "university" | "major";

export interface CatalogMatchCandidate {
  id: string;
  name: string;
}

export type CatalogMatchDecision =
  | { decision: "MATCH"; matchedId: string }
  // UNSURE tách khỏi NEW có chủ đích: NEW = AI khẳng định đây là mục khác,
  // UNSURE = AI không kết luận được / gọi lỗi. Cả hai đều đẩy về Admin duyệt
  // tay, nhưng phân biệt được để log và đánh giá chất lượng model sau này.
  | { decision: "NEW" }
  | { decision: "UNSURE" };

export interface CatalogMatchVerifier {
  /**
   * Tên mới có thật sự trùng nghĩa với một trong các ứng viên gần nhất không.
   * Không bao giờ ném lỗi: mọi sự cố (thiếu API key, hết quota, JSON hỏng) đều
   * quy về UNSURE để cron không chết và mục vẫn nằm chờ Admin.
   */
  verify(domain: CatalogDomain, newName: string, candidates: CatalogMatchCandidate[]): Promise<CatalogMatchDecision>;
}
