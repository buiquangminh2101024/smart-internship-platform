import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import type {
  ConfirmRequirementsRequest,
  ExtractedJobRequirements,
  JobPost as JobPostDto,
} from "@sip/shared-types";
import { AppError } from "../../shared/errors/AppError";
import type { Logger } from "../../shared/logger";
import type { RawJobRequirements, RequirementExtractor } from "../../shared/ports/RequirementExtractor";
import type { EmployerRepository } from "../employers/employer.repository";
import type { MajorDedupeService } from "../education-catalog/major-dedupe.service";
import type { SkillDedupeService } from "../skills/skill-dedupe.service";
import { toJobPostDto } from "./job-post.mapper";
import type { JobPostRepository, JobPostWithRelations } from "./job-post.repository";
import type { RequirementExtractionRateLimitService } from "./requirement-extraction-rate-limit.service";

// Tăng khi đổi prompt/bộ làm sạch ⇒ cache cũ tự hết hiệu lực (khoá đổi).
const EXTRACTION_CACHE_VERSION = 2;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
// Lâu hơn tổng timeout của mọi tầng model (30 s × 2 Gemini + 60 s OpenRouter).
// Hết hạn thì khoá tự nhả, kể cả khi server chết giữa chừng.
const LOCK_TTL_SECONDS = 180;

/**
 * "Phân tích yêu cầu bằng AI" + "Áp dụng" (docs/06-backend/job-matcher-phase3/PLAN.md
 * mục API). AI chỉ gợi ý — `extract` không ghi DB; chỉ `confirm` (Employer đã
 * xem/sửa) mới ghi. Tách khỏi JobPostsService vì có bộ phụ thuộc riêng (LLM,
 * Redis, catalog) mà các luồng tin khác không cần.
 */
export class JobPostRequirementsService {
  private readonly prisma: PrismaClient;
  private readonly redis: Redis;
  private readonly logger: Logger;
  private readonly jobPostRepository: JobPostRepository;
  private readonly employerRepository: EmployerRepository;
  private readonly requirementExtractor: RequirementExtractor;
  private readonly requirementExtractionRateLimitService: RequirementExtractionRateLimitService;
  private readonly skillDedupeService: SkillDedupeService;
  private readonly majorDedupeService: MajorDedupeService;

  constructor(deps: {
    prisma: PrismaClient;
    redis: Redis;
    logger: Logger;
    jobPostRepository: JobPostRepository;
    employerRepository: EmployerRepository;
    requirementExtractor: RequirementExtractor;
    requirementExtractionRateLimitService: RequirementExtractionRateLimitService;
    skillDedupeService: SkillDedupeService;
    majorDedupeService: MajorDedupeService;
  }) {
    this.prisma = deps.prisma;
    this.redis = deps.redis;
    this.logger = deps.logger;
    this.jobPostRepository = deps.jobPostRepository;
    this.employerRepository = deps.employerRepository;
    this.requirementExtractor = deps.requirementExtractor;
    this.requirementExtractionRateLimitService = deps.requirementExtractionRateLimitService;
    this.skillDedupeService = deps.skillDedupeService;
    this.majorDedupeService = deps.majorDedupeService;
  }

  async extract(userId: string, id: string): Promise<ExtractedJobRequirements> {
    const jobPost = await this.requireOwnedDraft(userId, id);
    const input = {
      title: jobPost.title,
      description: jobPost.description,
      requirements: jobPost.requirements,
    };

    // Cache bản thô của model, không cache bản đã khớp catalog: catalog đổi
    // (Admin duyệt thêm skill) thì lần sau khớp lại được ngay, mà tra DB rất rẻ.
    const cacheKey = `requirement-extract:cache:v${EXTRACTION_CACHE_VERSION}:${hashInput(input)}`;
    const cached = await this.readCache(cacheKey);
    if (cached) return this.resolveCatalog(cached);

    await this.requirementExtractionRateLimitService.assertWithinQuota(userId);

    // Chống bấm đúp: lượt thứ hai trong lúc lượt đầu đang chờ model sẽ tốn thêm quota vô ích.
    const lockKey = `requirement-extract:lock:${id}`;
    const acquired = await this.redis.set(lockKey, "1", "EX", LOCK_TTL_SECONDS, "NX");
    if (!acquired) {
      throw new AppError(409, "Tin này đang được phân tích, vui lòng đợi trong giây lát");
    }

    try {
      await this.requirementExtractionRateLimitService.recordUsage(userId);
      let raw: RawJobRequirements;
      try {
        raw = await this.requirementExtractor.extract(input);
      } catch (error) {
        this.logger.error("Requirement extraction failed", {
          jobPostId: id,
          error: error instanceof Error ? error.message : error,
        });
        throw new AppError(
          502,
          "Không phân tích được yêu cầu lúc này, vui lòng thử lại sau. Bạn vẫn có thể nhập kỹ năng, số năm và ngành học bằng tay.",
        );
      }
      await this.redis.set(cacheKey, JSON.stringify(raw), "EX", CACHE_TTL_SECONDS);
      return await this.resolveCatalog(raw);
    } finally {
      await this.redis.del(lockKey);
    }
  }

  /**
   * Ghi bản Employer đã xác nhận trong MỘT transaction. Không đổi
   * title/description/requirements nên không lách được kiểm duyệt — Employer
   * vẫn phải gửi duyệt như luồng hiện có.
   */
  async confirm(userId: string, id: string, dto: ConfirmRequirementsRequest): Promise<JobPostDto> {
    await this.requireOwnedDraft(userId, id);

    const [skillIds, majorIds] = await Promise.all([
      this.jobPostRepository.findExistingSkillIds(dto.skills.map((skill) => skill.skillId)),
      this.jobPostRepository.findExistingMajorIds(dto.majors.map((major) => major.majorId)),
    ]);
    if (skillIds.size !== dto.skills.length) {
      throw new AppError(400, "One or more skills do not exist");
    }
    if (majorIds.size !== dto.majors.length) {
      throw new AppError(400, "One or more majors do not exist");
    }

    const requirementsExtra = {
      languages: dto.languages.map((entry) => ({
        language: entry.language,
        level: entry.level || null,
        importance: entry.importance,
      })),
      other: dto.other,
    } satisfies Prisma.InputJsonValue;

    await this.prisma.$transaction(async (tx) => {
      await this.jobPostRepository.setSkills(
        id,
        // 0 và null cùng nghĩa "không yêu cầu" — lưu null (giống minExperienceYears).
        dto.skills.map((skill) => ({ skillId: skill.skillId, importance: skill.importance, minYears: skill.minYears || null })),
        tx,
      );
      await this.jobPostRepository.setMajors(id, dto.majors, tx);
      await this.jobPostRepository.update(
        id,
        {
          minExperienceYears: dto.minExperienceYears || null,
          requirementsExtra,
          requirementsConfirmedAt: new Date(),
        },
        tx,
      );
    });

    const updated = await this.jobPostRepository.findById(id);
    return toJobPostDto(updated!);
  }

  /** Tên thô → mục APPROVED trong catalog (chỉ tra cứu, không tạo mới — PLAN mục "Map catalog"). */
  private async resolveCatalog(raw: RawJobRequirements): Promise<ExtractedJobRequirements> {
    const [skillMatches, majorMatches] = await Promise.all([
      Promise.all(raw.skills.map((skill) => this.skillDedupeService.findBestApproved(skill.rawName))),
      Promise.all(raw.majors.map((major) => this.majorDedupeService.findBestApproved(major.rawName))),
    ]);

    // Hai tên thô khớp cùng một mục (vd. "ReactJS" và "React.js") thì gộp: bảng
    // xem trước không hiện hai dòng cùng một kỹ năng, Employer chỉ phải xác nhận một lần.
    const seenSkills = new Map<string, ExtractedJobRequirements["skills"][number]>();
    const skills: ExtractedJobRequirements["skills"] = [];
    raw.skills.forEach((skill, index) => {
      const match = skillMatches[index] ?? null;
      const resolved = match ? { skillId: match.id, name: match.name, matchType: match.matchType } : null;
      const previous = resolved ? seenSkills.get(resolved.skillId) : undefined;
      if (previous) {
        if (skill.importance === "REQUIRED") previous.importance = "REQUIRED";
        previous.minYears = maxYears(previous.minYears, skill.minYears);
        return;
      }
      const entry = { ...skill, resolved };
      if (resolved) seenSkills.set(resolved.skillId, entry);
      skills.push(entry);
    });

    const seenMajors = new Map<string, ExtractedJobRequirements["majors"][number]>();
    const majors: ExtractedJobRequirements["majors"] = [];
    raw.majors.forEach((major, index) => {
      const match = majorMatches[index] ?? null;
      const resolved = match ? { majorId: match.id, name: match.name, matchType: match.matchType } : null;
      const previous = resolved ? seenMajors.get(resolved.majorId) : undefined;
      if (previous) {
        if (major.relevance === "PRIMARY") previous.relevance = "PRIMARY";
        return;
      }
      const entry = { ...major, resolved };
      if (resolved) seenMajors.set(resolved.majorId, entry);
      majors.push(entry);
    });

    return { ...raw, skills, majors };
  }

  private async readCache(key: string): Promise<RawJobRequirements | null> {
    const value = await this.redis.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as RawJobRequirements;
    } catch {
      return null;
    }
  }

  /** Chỉ tin DRAFT của công ty mình — giống điều kiện sửa tin (updateDraft). */
  private async requireOwnedDraft(userId: string, id: string): Promise<JobPostWithRelations> {
    const employer = await this.employerRepository.findByUserId(userId);
    if (!employer) {
      throw new AppError(404, "Employer profile not found");
    }
    const jobPost = await this.jobPostRepository.findById(id);
    if (!jobPost || jobPost.companyId !== employer.companyId) {
      throw new AppError(404, "Job post not found");
    }
    if (jobPost.status !== "DRAFT") {
      throw new AppError(409, "Only a draft job post can be edited");
    }
    return jobPost;
  }
}

function hashInput(input: { title: string; description: string; requirements: string | null }): string {
  // JSON thay vì nối chuỗi bằng dấu phân cách: không có hai bộ (title, description,
  // requirements) khác nhau nào ra cùng một chuỗi.
  return createHash("sha256")
    .update(JSON.stringify([input.title, input.description, input.requirements ?? ""]))
    .digest("hex");
}

function maxYears(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}
