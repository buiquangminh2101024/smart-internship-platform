import type { MatchComponentKey } from "@sip/shared-types";

/** Bảng trọng số của một cấu hình chấm điểm; tổng không bắt buộc bằng 1 (được chia lại). */
export interface MatchWeights {
  version: string;
  weights: Record<MatchComponentKey, number>;
}

/** Khoảng cosine được kéo giãn về 0..1 cho thành phần semantic; cần hi > lo. */
export interface SemanticCalibration {
  lo: number;
  hi: number;
}
