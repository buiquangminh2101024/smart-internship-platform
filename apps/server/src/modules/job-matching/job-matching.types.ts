import type { MatchComponentKey } from "@sip/shared-types";

/** Bảng trọng số của một cấu hình chấm điểm; tổng không bắt buộc bằng 1 (được chia lại). */
export interface MatchWeights {
  version: string;
  weights: Record<MatchComponentKey, number>;
}
