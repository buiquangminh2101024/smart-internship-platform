/**
 * AD-29 bước 9 — `JobPost` DTO thêm `submittedAt` và `quality`. Chỉ API của Admin điền
 * `quality`; API công khai và của employer luôn `null` (Q1). API công khai không có `submittedAt`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { toJobPostDto } from "../../../src/modules/job-posts/job-post.mapper";
import type { JobPostWithRelations } from "../../../src/modules/job-posts/job-post.repository";
import { JobPostsService } from "../../../src/modules/job-posts/job-posts.service";
import { QUALITY_SCORE_VERSION } from "../../../src/modules/job-posts/job-quality.config";

const SUBMITTED_AT = new Date("2026-11-20T03:00:00.000Z");
const SCORED_AT = new Date("2026-11-20T03:00:01.000Z");

function row(overrides: Record<string, unknown> = {}): JobPostWithRelations {
  return {
    id: "job-1",
    companyId: "co-1",
    company: {
      id: "co-1",
      name: "Công ty A",
      isVerified: true,
      logoUrl: null,
      website: null,
      industryId: null,
      cityId: null,
      address: null,
      taxCode: null,
      description: null,
    },
    title: "Thực tập sinh Backend",
    description: "Mô tả",
    jobType: "INTERNSHIP",
    status: "PENDING",
    salaryMin: null,
    salaryMax: null,
    isNegotiable: true,
    requirements: null,
    benefits: null,
    cityId: null,
    city: null,
    address: null,
    industryId: null,
    industry: null,
    publishedAt: null,
    expiresAt: null,
    closedAt: null,
    viewCount: 0,
    minExperienceYears: null,
    requirementsExtra: null,
    requirementsConfirmedAt: null,
    submittedAt: SUBMITTED_AT,
    qualityScore: 72,
    qualityBand: "NEEDS_REVIEW",
    qualityVersion: QUALITY_SCORE_VERSION,
    qualityScoredAt: SCORED_AT,
    qualityBreakdown: {
      criteria: [
        {
          key: "content",
          label: "Chất lượng nội dung",
          weight: 0.2,
          score: 65,
          issues: [{ code: "DESCRIPTION_TOO_SHORT", penalty: 35, message: "Mô tả công việc quá ngắn (90/150 ký tự)." }],
        },
      ],
      flags: [],
      reason: "SUBMITTED",
    },
    moderationActions: [],
    skills: [],
    majors: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as JobPostWithRelations;
}

test("mapper: withQuality ⇒ có quality + submittedAt; mặc định ⇒ quality null, vẫn có submittedAt", () => {
  const admin = toJobPostDto(row(), { withQuality: true });
  assert.equal(admin.submittedAt, SUBMITTED_AT.toISOString());
  assert.deepEqual(admin.quality, {
    score: 72,
    band: "NEEDS_REVIEW",
    version: QUALITY_SCORE_VERSION,
    scoredAt: SCORED_AT.toISOString(),
    scoredReason: "SUBMITTED",
    criteria: [
      {
        key: "content",
        label: "Chất lượng nội dung",
        score: 65,
        weight: 0.2,
        issues: [{ code: "DESCRIPTION_TOO_SHORT", message: "Mô tả công việc quá ngắn (90/150 ký tự).", penalty: 35 }],
      },
    ],
    flags: [],
    suggestedRejectReason: "Thiếu thông tin. Mô tả công việc quá ngắn (90/150 ký tự).",
    outdated: false,
  });

  const employer = toJobPostDto(row());
  assert.equal(employer.quality, null);
  assert.equal(employer.submittedAt, SUBMITTED_AT.toISOString());
});

test("mapper: API công khai ⇒ không quality, không submittedAt (kể cả khi lỡ truyền withQuality)", () => {
  const dto = toJobPostDto(row({ status: "PUBLISHED" }), { publicOnly: true, withQuality: true });
  assert.equal(dto.quality, null);
  assert.equal(dto.submittedAt, null);
});

test("mapper: tin chưa chấm ⇒ quality null; chưa gửi duyệt ⇒ submittedAt null; version cũ ⇒ outdated", () => {
  const unscored = toJobPostDto(
    row({ qualityScore: null, qualityBand: null, qualityVersion: null, qualityScoredAt: null, qualityBreakdown: null, submittedAt: null }),
    { withQuality: true },
  );
  assert.equal(unscored.quality, null);
  assert.equal(unscored.submittedAt, null);

  const old = toJobPostDto(row({ qualityVersion: QUALITY_SCORE_VERSION - 1 }), { withQuality: true });
  assert.equal(old.quality?.outdated, true);
});

test("service: hàng đợi và chi tiết của Admin kèm quality", async () => {
  const current = row();
  const service = new JobPostsService({
    jobPostRepository: {
      findById: async () => current,
      findModerationQueue: async () => ({ items: [current], hasMore: false, total: 1 }),
    },
  } as unknown as ConstructorParameters<typeof JobPostsService>[0]);

  assert.equal((await service.getForModeration("job-1")).quality?.score, 72);
  const queue = await service.listForModeration({}, undefined);
  assert.equal(queue.items[0]?.quality?.band, "NEEDS_REVIEW");
  assert.equal(queue.total, 1);
});
