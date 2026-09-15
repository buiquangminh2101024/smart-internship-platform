// Ranh giới AI cho việc gộp trùng skill (chuẩn bị cho Phase 11 — AI Features
// Boundary): pipeline dedupe chỉ biết interface này, không biết Gemini. Đổi sang
// model khác, hoặc tắt hẳn AI, chỉ cần đổi registration trong container.ts.

export interface SkillMatchCandidate {
  skillId: string;
  name: string;
}

export type SkillMatchDecision =
  | { decision: "MATCH"; matchedSkillId: string }
  // UNSURE tách khỏi NEW có chủ đích: NEW = AI khẳng định đây là skill khác,
  // UNSURE = AI không kết luận được / gọi lỗi. Cả hai đều đẩy về Admin duyệt
  // tay, nhưng phân biệt được để log và đánh giá chất lượng model sau này.
  | { decision: "NEW" }
  | { decision: "UNSURE" };

export interface SkillMatchVerifier {
  /**
   * Tên mới có thật sự trùng nghĩa với một trong các ứng viên gần nhất không.
   * Không bao giờ ném lỗi: mọi sự cố (thiếu API key, hết quota, JSON hỏng) đều
   * quy về UNSURE để cron không chết và skill vẫn nằm chờ Admin.
   */
  verify(newName: string, candidates: SkillMatchCandidate[]): Promise<SkillMatchDecision>;
}
