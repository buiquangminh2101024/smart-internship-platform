import type { SuggestSkillResponse } from "@sip/shared-types";
import { apiFetch } from "./api-client";
import type { AuthArea } from "./auth-area";

/**
 * Đề xuất một kỹ năng chưa có trong catalog. Backend tự khử trùng lặp: có thể
 * trả về skill đã tồn tại (matchType ALIAS/AUTO) thay vì tạo mới, hoặc trả
 * PENDING_REVIEW kèm skill mới đang chờ Admin duyệt.
 *
 * Dùng chung cho cả Candidate và Employer — chỉ khác `area` (mỗi khu vực có
 * session token riêng, xem AD-4).
 */
export function suggestSkill(area: AuthArea, name: string): Promise<SuggestSkillResponse> {
  return apiFetch<SuggestSkillResponse>(area, "/skills/suggest", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
