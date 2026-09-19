// Ranh giới AI cho việc đọc CV (chuẩn bị cho Phase 11 — AI Features Boundary),
// cùng tinh thần SkillMatchVerifier: pipeline chỉ biết interface này, không
// biết Gemini/OpenRouter. Đổi model hay thêm tầng dự phòng chỉ cần đổi
// registration trong cv.routes.ts.
import type { CvExtractionResult } from "@sip/shared-types";

export type { CvExtractionResult };

export type CvExtractionInput =
  | { kind: "text"; text: string }
  // PDF gốc khi text layer quá kém (PDF scan) — gửi thẳng cho model đọc được PDF.
  | { kind: "pdf"; buffer: Buffer }
  | { kind: "image"; buffer: Buffer; mimeType: string };

export interface CvExtractor {
  /**
   * Khác SkillMatchVerifier: ở đây ĐƯỢC ném lỗi khi không gọi được model
   * (thiếu key, timeout, JSON hỏng) — FallbackCvExtractor cần biết để chuyển
   * sang tầng kế tiếp. "Không phải CV" không phải lỗi: trả isValidCv=false.
   */
  extract(input: CvExtractionInput): Promise<CvExtractionResult>;
}
