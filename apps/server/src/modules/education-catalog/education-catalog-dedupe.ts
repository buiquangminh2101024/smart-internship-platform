import { Prisma } from "@prisma/client";
import type { SuggestCatalogEntryResponse } from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { CatalogRateLimitService } from "../shared/catalog-rate-limit.service";
import { AUTO_MATCH_THRESHOLD, GRAY_ZONE_THRESHOLD, type ApprovedCatalogMatch } from "../skills/skill-dedupe.service";
import { rankSkillsByName } from "../skills/skill-token-match.util";
import type { EducationCatalogDomain, EducationCatalogRepository } from "./education-catalog.types";

// Tên chung chung ("Đại học Bách khoa", "Đại học Công nghiệp") khớp gần ngang
// nhau với nhiều cơ sở/trường khác nhau. Hai ứng viên đầu cách nhau ít hơn mức
// này thì KHÔNG tự chọn, đẩy sang vùng xám: gắn nhầm trường thì không ai phát
// hiện, còn PENDING thì Gemini/Admin sửa được.
const AMBIGUITY_MARGIN = 0.1;

export interface CatalogDedupeDeps {
  domain: EducationCatalogDomain;
  repository: EducationCatalogRepository;
  catalogRateLimitService: CatalogRateLimitService;
  normalize: (raw: string) => string;
}

/**
 * Pipeline 4 bậc cho University/Major, chạy đồng bộ trong request — theo khuôn
 * skill-dedupe.service.ts nhưng BỎ bậc embedding
 * (docs/06-backend/cv-ai-extraction-phase2/PLAN.md Quyết định #2):
 *
 *   bậc 0  alias exact match             → ALIAS
 *   (trùng tên sau chuẩn hoá, kể cả mục PENDING người khác vừa gõ → trả luôn)
 *   bậc 1  token/bigram ≥ 0.85           → AUTO (trừ khi mơ hồ, xem AMBIGUITY_MARGIN)
 *   vùng xám 0.6-0.85                    → PENDING_REVIEW + gắn pendingMatch cho cron hỏi Gemini
 *   < 0.6                                → PENDING_REVIEW (chắc chắn là mục mới, không tốn LLM)
 *
 * Viết thành hàm dùng chung thay vì copy nguyên văn vào university-dedupe và
 * major-dedupe: hai bên chỉ khác repository + hàm chuẩn hoá.
 */
export async function suggestCatalogEntry(
  deps: CatalogDedupeDeps,
  userId: string,
  rawName: string,
): Promise<SuggestCatalogEntryResponse> {
  const { domain, repository, catalogRateLimitService, normalize } = deps;
  const name = rawName.trim().replace(/\s+/g, " ");
  const key = normalize(name);
  if (!key) {
    throw new AppError(400, "Tên không hợp lệ");
  }

  const aliased = await repository.findByAlias(key);
  if (aliased) {
    return { id: aliased.id, name: aliased.name, status: aliased.status, matchType: "ALIAS" };
  }

  // Catalog vài nghìn dòng — load hết rồi so trong RAM, giống listApproved() của Skill.
  const entries = await repository.listForMatching();

  const same = entries.find((entry) => normalize(entry.name) === key);
  if (same) {
    return {
      id: same.id,
      name: same.name,
      status: same.status,
      matchType: same.status === "APPROVED" ? "AUTO" : "PENDING_REVIEW",
    };
  }

  // So trên tên ĐÃ chuẩn hoá để phần "Trường ..."/"(CLC)" không kéo điểm xuống.
  const approved = entries
    .filter((entry) => entry.status === "APPROVED")
    .map((entry) => ({ id: entry.id, name: normalize(entry.name) }));
  const [best = null, runnerUp] = rankSkillsByName(key, approved, 2);
  const ambiguous = best !== null && runnerUp !== undefined && best.score - runnerUp.score < AMBIGUITY_MARGIN;

  if (best && best.score >= AUTO_MATCH_THRESHOLD && !ambiguous) {
    const matched = entries.find((entry) => entry.id === best.skillId)!;
    return { id: matched.id, name: matched.name, status: "APPROVED", matchType: "AUTO" };
  }

  // Chỉ tới đây mới thật sự tạo dữ liệu mới → mới kiểm tra quota. Khác Skill
  // (kiểm tra từ đầu để đỡ tải embedding): ở đây không có bước tốn kém nào phía
  // trên, và người đã hết lượt vẫn chọn được trường/ngành có sẵn.
  await catalogRateLimitService.assertWithinQuota(domain, userId);

  const inGrayZone = best !== null && best.score >= GRAY_ZONE_THRESHOLD;
  let created;
  try {
    created = await repository.createPending({
      name,
      createdByUserId: userId,
      pendingMatchId: inGrayZone ? best.skillId : null,
    });
  } catch (error) {
    // Hai người gõ cùng một tên mới cùng lúc: người sau vấp unique trên `name`
    // → dùng luôn bản ghi người trước vừa tạo.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await repository.findByNameInsensitive(name);
      if (existing) {
        return { id: existing.id, name: existing.name, status: existing.status, matchType: "PENDING_REVIEW" };
      }
    }
    throw error;
  }

  await catalogRateLimitService.recordCreation(domain, userId);
  return { id: created.id, name: created.name, status: "PENDING", matchType: "PENDING_REVIEW" };
}

/**
 * Phần chỉ-đọc của pipeline trên, giới hạn mục APPROVED: bậc 0 alias → trùng tên
 * sau chuẩn hoá → bậc 1 token ≥ 0.85 không mơ hồ. Không kiểm quota, không tạo
 * PENDING — dùng cho tên do AI đọc từ tin tuyển dụng (Job Matcher GĐ3).
 */
export async function findApprovedCatalogEntry(
  deps: Pick<CatalogDedupeDeps, "repository" | "normalize">,
  rawName: string,
): Promise<ApprovedCatalogMatch | null> {
  const { repository, normalize } = deps;
  const key = normalize(rawName.trim().replace(/\s+/g, " "));
  if (!key) return null;

  const aliased = await repository.findByAlias(key);
  if (aliased?.status === "APPROVED") return { id: aliased.id, name: aliased.name, matchType: "ALIAS" };

  const approved = (await repository.listForMatching()).filter((entry) => entry.status === "APPROVED");

  const same = approved.find((entry) => normalize(entry.name) === key);
  if (same) return { id: same.id, name: same.name, matchType: "EXACT" };

  const candidates = approved.map((entry) => ({ id: entry.id, name: normalize(entry.name) }));
  const [best, runnerUp] = rankSkillsByName(key, candidates, 2);
  if (!best || best.score < AUTO_MATCH_THRESHOLD) return null;
  if (runnerUp !== undefined && best.score - runnerUp.score < AMBIGUITY_MARGIN) return null;

  const matched = approved.find((entry) => entry.id === best.skillId)!;
  return { id: matched.id, name: matched.name, matchType: "TOKEN" };
}
